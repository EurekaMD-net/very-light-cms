#!/usr/bin/env node
/**
 * verify-commentary.mjs — automated fact-check for a Williams Radar Journal page.
 *
 * WHY THIS EXISTS
 * ---------------
 * The analyst commentary ("Number of the Week", "Ticker Deep Dive", "Manager
 * Note") is free prose written over the scan data. On 2026-06-06 the commentary
 * shipped with fabricated/misread facts that contradicted the page's own tables:
 * a ticker listed as "pre-radar / no signal" that was actually an active S1
 * signal (CAG), a ticker described as "flipped AC to positive" whose AC was red
 * (TMUS), and miscounts. A prose "be factual" instruction does NOT catch these —
 * the author waved them through. This script is the enforceable self-check pass.
 *
 * It cross-checks the prose against the ground-truth CSV (one row per scanned
 * ticker: sector, signalLevel, ac, acColor, pricePercentile) and reports
 * discrepancies. Exit code is non-zero if any HARD discrepancy is found, so the
 * publisher can gate on it.
 *
 * CHECKS
 *   1. Fabricated ticker  — an uppercase symbol named in the prose that is not
 *      in the scan CSV (and isn't a known sector/signal/acronym).
 *   2. Percentile mismatch — "TICKER … pNN%" where NN ≠ the CSV percentile.
 *   3. Signal/pre-radar contradiction — a ticker named in a "pre-radar / no
 *      active signal" sentence that actually HAS a signal (signalLevel≠none),
 *      or named in a "signal/candidate" sentence that has none.
 *   4. AC-direction contradiction — a ticker named in a sentence asserting "AC
 *      … positive/green" whose acColor≠green (or "AC … red/negative" ≠ red).
 *
 * USAGE
 *   node scripts/verify-commentary.mjs <slug>
 *   node scripts/verify-commentary.mjs w23-2026
 *   RADAR_RESULTS_DIR=/path JOURNAL_CONTENT_DIR=/path node scripts/verify-commentary.mjs w23-2026
 *
 * Defaults match the thewilliamsradar.com deployment. Read-only; no DB, no git.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CONTENT_DIR =
  process.env.JOURNAL_CONTENT_DIR ||
  "/root/claude/thewilliamsradar-journal/pages";
const RESULTS_DIR =
  process.env.RADAR_RESULTS_DIR || "/root/claude/williams-entry-radar/results";

// Tokens that look like tickers but aren't — sectors, signal codes, oscillator
// names, common acronyms used in the prose. Extend as needed.
const NON_TICKERS = new Set([
  "XLU", "XLI", "XLP", "XLE", "XLF", "XLV", "XLB", "XLY", "XLK", "XLC", "XLRE",
  "IBB", "XBI", "SPY", "ETF", "ETFS",
  "S1", "S2", "S2D", "AO", "AC", "S2P",
  "CSV", "DB", "SQL", "USA", "US", "GDP", "CEO", "CFO", "EPS", "ROE", "ROAS",
  "AI", "ML", "API", "URL", "OK", "MX", "UTC", "W22", "W23", "W24", "W21",
  "MODEL", "OUTPUT", "LIVE", "ANALYST", "COMMENTARY", "NOT", "NO", "AND",
]);

function die(msg) {
  console.error(`verify-commentary: ${msg}`);
  process.exit(2);
}

const slug = process.argv[2];
if (!slug) die("usage: node scripts/verify-commentary.mjs <slug>  (e.g. w23-2026)");
if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) die(`invalid slug "${slug}"`);

const mdPath = join(CONTENT_DIR, `${slug}.md`);
if (!existsSync(mdPath)) die(`content file not found: ${mdPath}`);

// ---- locate the matching CSV (radar_2026-W23.csv for slug w23-2026) ---------
const wkMatch = slug.match(/^w(\d{1,2})-(\d{4})$/i);
if (!wkMatch) die(`cannot derive a scan CSV from slug "${slug}" (expected wWW-YYYY)`);
const csvName = `radar_${wkMatch[2]}-W${wkMatch[1]}.csv`;
const csvPath = join(RESULTS_DIR, csvName);
if (!existsSync(csvPath)) die(`scan CSV not found: ${csvPath}`);

// ---- load ground truth ------------------------------------------------------
const csvLines = readFileSync(csvPath, "utf-8").trim().split(/\r?\n/);
const header = csvLines[0].split(",");
const col = (name) => header.indexOf(name);
const cTicker = col("ticker");
const cSector = col("sector");
const cSignal = col("signalLevel");
const cAcColor = col("acColor");
const cPct = col("pricePercentile");
if ([cTicker, cSector, cSignal, cAcColor, cPct].some((i) => i < 0)) {
  die(`CSV ${csvName} is missing expected columns (ticker/sector/signalLevel/acColor/pricePercentile)`);
}
const facts = new Map(); // ticker -> {sector, signal, acColor, pct}
for (const line of csvLines.slice(1)) {
  const f = line.split(",");
  facts.set(f[cTicker], {
    sector: f[cSector],
    signal: f[cSignal],
    acColor: f[cAcColor],
    pct: Number(f[cPct]),
  });
}

// ---- read prose: strip the auto-generated tables (only check the prose) -----
// Tables are model output regenerated from data and trusted; the risk is the
// analyst prose. We still scan everything except markdown table rows.
const rawMd = readFileSync(mdPath, "utf-8");
const proseLines = rawMd
  .split(/\r?\n/)
  .filter((l) => !/^\s*\|/.test(l)); // drop table rows
const prose = proseLines.join("\n");
// Sentence-ish segmentation for context checks.
const sentences = prose
  .replace(/\n+/g, " ")
  .split(/(?<=[.!?])\s+/);

const findings = []; // {sev, msg}
const hard = () => findings.some((f) => f.sev === "HARD");
const add = (sev, msg) => findings.push({ sev, msg });

const TICKER_RE = /\b([A-Z]{2,5}(?:\.[A-Z])?)\b/g;
const tickersIn = (s) => {
  const out = [];
  let m;
  TICKER_RE.lastIndex = 0;
  while ((m = TICKER_RE.exec(s)) !== null) {
    const t = m[1];
    if (!NON_TICKERS.has(t)) out.push(t);
  }
  return out;
};

// ---- Check 1: fabricated tickers (named in prose, not in scan) --------------
const mentioned = new Set();
for (const t of tickersIn(prose)) mentioned.add(t);
for (const t of mentioned) {
  if (!facts.has(t)) {
    add("HARD", `fabricated/unknown ticker "${t}" — named in the commentary but not in ${csvName}`);
  }
}

// ---- Check 2: percentile mismatches ("TICKER … pNN%") -----------------------
// Find each pNN occurrence and the nearest preceding in-CSV ticker within 40 chars.
const pctRe = /\bp(\d{1,3})\b%?/g;
let pm;
while ((pm = pctRe.exec(prose)) !== null) {
  const stated = Number(pm[1]);
  const before = prose.slice(Math.max(0, pm.index - 40), pm.index);
  const near = tickersIn(before).filter((t) => facts.has(t));
  const t = near[near.length - 1];
  if (t) {
    const real = facts.get(t).pct;
    if (real !== stated) {
      add("HARD", `percentile mismatch: prose says ${t} at p${stated}% — scan says p${real}%`);
    }
  }
}

// ---- Check 3: signal vs pre-radar contradiction (sentence context) ----------
// Only the high-confidence direction: a ticker asserted to have NO signal that
// actually HAS one is an unambiguous contradiction. The inverse (a none-ticker
// in a "signal" sentence) is intentionally NOT flagged — prose legitimately
// speculates about FUTURE activations of pre-radar names ("could see new S1
// activations in GIS, KMB…"), which would be false positives.
const PRERADAR_RE = /\b(pre-?radar|no active signal|no signal yet|no signal|sin se[ñn]al|approaching the (?:signal )?threshold|below p\d+ with no)\b/i;
for (const s of sentences) {
  const ts = tickersIn(s).filter((t) => facts.has(t));
  if (!ts.length || !PRERADAR_RE.test(s)) continue;
  for (const t of ts) {
    if (facts.get(t).signal !== "none") {
      add("HARD", `signal/pre-radar contradiction: "${t}" is described as pre-radar/no-signal but the scan has it as an ACTIVE ${facts.get(t).signal} signal (p${facts.get(t).pct}%)`);
    }
  }
}

// ---- Check 4: AC-direction contradiction (sentence context) -----------------
const AC_POS_RE = /\bAC\b[^.]{0,40}\b(positive|green|flipped\s+positive|to\s+positive)\b|\bflipped\s+(?:their\s+)?AC\b[^.]{0,20}\bpositive\b/i;
const AC_RED_RE = /\bAC\b[^.]{0,30}\b(red|negative|turned\s+red)\b/i;
for (const s of sentences) {
  const ts = tickersIn(s).filter((t) => facts.has(t));
  if (!ts.length) continue;
  if (AC_POS_RE.test(s)) {
    for (const t of ts) {
      if (facts.get(t).acColor !== "green") {
        add("HARD", `AC-direction contradiction: "${t}" is described as AC positive/green but the scan has acColor=${facts.get(t).acColor}`);
      }
    }
  }
  if (AC_RED_RE.test(s)) {
    for (const t of ts) {
      if (facts.get(t).acColor !== "red") {
        add("HARD", `AC-direction contradiction: "${t}" is described as AC red/negative but the scan has acColor=${facts.get(t).acColor}`);
      }
    }
  }
}

// ---- report -----------------------------------------------------------------
console.log(`verify-commentary: ${slug} vs ${csvName} (${facts.size} scanned tickers)`);
if (findings.length === 0) {
  console.log("✓ no discrepancies found in the analyst prose.");
  process.exit(0);
}
const hardN = findings.filter((f) => f.sev === "HARD").length;
const softN = findings.filter((f) => f.sev === "SOFT").length;
for (const f of findings) console.log(`  [${f.sev}] ${f.msg}`);
console.log(`\n${hardN} hard, ${softN} soft discrepanc${hardN + softN === 1 ? "y" : "ies"}.`);
process.exit(hard() ? 1 : 0);
