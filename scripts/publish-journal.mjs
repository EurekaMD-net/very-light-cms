#!/usr/bin/env node
/**
 * publish-journal.mjs — one-step publisher for a journal page that already
 * exists on disk (e.g. after an analyst edits the editorial commentary into a
 * `pages/<slug>.md` file).
 *
 * WHY THIS EXISTS
 * ---------------
 * very-light-cms serves a page's BODY live from the `CONTENT_DIR` disk file,
 * but its TITLE / DESCRIPTION / DRAFT flag come from the `pages` row in the CMS
 * SQLite DB. Editing the `.md` alone makes the new body live immediately but
 * leaves a stale title in the listing/`<title>`. And the journal repo still
 * needs a git commit+push for the change to be persisted/version-controlled.
 *
 * Those two non-obvious steps (DB metadata sync + git push) are exactly what
 * tripped Jarvis on 2026-06-06 (task 5902: commentary written but unpublished).
 * This script encapsulates them so the publish flow is:
 *
 *     1. edit pages/<slug>.md  (write the commentary — file_edit)
 *     2. node scripts/publish-journal.mjs <slug> ["commit message"]
 *
 * WHAT IT DOES
 * -----------
 *   - Reads the page's YAML frontmatter (title/description/draft) from disk.
 *   - Upserts the CMS `pages` row (title/description/draft/updated_at) so the
 *     live title matches the file. Idempotent — re-running with no change is a
 *     no-op beyond touching updated_at.
 *   - Commits pages/<slug>.md in the journal repo and pushes (only if the file
 *     actually changed). Rebases onto the remote first so a concurrent publish
 *     (e.g. the scheduled weekly task) doesn't cause a non-fast-forward reject.
 *
 * USAGE
 * -----
 *   node scripts/publish-journal.mjs <slug> ["commit message"]
 *   node scripts/publish-journal.mjs w23-2026 "re-issue W23 with full universe"
 *   node scripts/publish-journal.mjs w23-2026 --no-push   # DB sync only
 *
 * Paths default to the thewilliamsradar.com deployment and are overridable:
 *   CMS_DB_PATH        (default: <repo>/data/cms.db)
 *   JOURNAL_CONTENT_DIR(default: /root/claude/thewilliamsradar-journal/pages)
 *   JOURNAL_REPO       (default: /root/claude/thewilliamsradar-journal)
 *
 * Git auth is ambient (HTTPS + gh token on this VPS). No secrets are read.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, ".."); // very-light-cms/

const CMS_DB_PATH = process.env.CMS_DB_PATH || join(REPO_ROOT, "data", "cms.db");
const CONTENT_DIR =
  process.env.JOURNAL_CONTENT_DIR ||
  "/root/claude/thewilliamsradar-journal/pages";
const JOURNAL_REPO =
  process.env.JOURNAL_REPO || "/root/claude/thewilliamsradar-journal";

function die(msg) {
  console.error(`publish-journal: ${msg}`);
  process.exit(1);
}

// ---- args -----------------------------------------------------------------
const rawArgs = process.argv.slice(2);
const noPush = rawArgs.includes("--no-push");
const positional = rawArgs.filter((a) => !a.startsWith("--"));
const slug = positional[0];
const commitMessage = positional[1];

if (!slug) {
  die('usage: node scripts/publish-journal.mjs <slug> ["commit message"] [--no-push]');
}
// Poka-yoke: slug is a filesystem + git path component. Reject traversal.
if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
  die(`invalid slug "${slug}" — expected [a-z0-9-] (e.g. w23-2026)`);
}

const mdPath = join(CONTENT_DIR, `${slug}.md`);
if (!existsSync(mdPath)) {
  die(`content file not found: ${mdPath} (write the page first, then publish)`);
}

// ---- parse frontmatter ----------------------------------------------------
const raw = readFileSync(mdPath, "utf-8");
const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fmMatch) {
  die(`no YAML frontmatter found at top of ${mdPath}`);
}
const fm = {};
for (const line of fmMatch[1].split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  // strip matching surrounding quotes
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  fm[m[1]] = val;
}

if (!fm.title) die(`frontmatter is missing a "title:" field in ${mdPath}`);
if (fm.slug && fm.slug !== slug) {
  die(
    `frontmatter slug "${fm.slug}" does not match requested slug "${slug}" — refusing to publish a mismatched page`,
  );
}
const title = fm.title;
const description = fm.description ?? null;
// draft semantics (CMS: 1 = hidden, 0 = published; public router 404s draft!=0).
// ONLY explicit publish tokens (false/0/no/published) publish; true/1/yes AND
// any unrecognized/garbage value fall through to draft=1 (hidden) so an
// ambiguous frontmatter value never publishes a page the author meant to hide
// (qa-W1 2026-06-06 — the inverse default is the dangerous one on the live path).
const draftRaw = (fm.draft ?? "false").trim().toLowerCase();
const draft = ["false", "0", "no", "published"].includes(draftRaw) ? 0 : 1;

// ---- sync CMS pages row ---------------------------------------------------
// fileMustExist + an explicit existsSync guard: better-sqlite3 would otherwise
// CREATE an empty DB at a wrong path and silently write there (qa-S1) — e.g. if
// vlcms's DB_PATH is set to an absolute path that diverges from this default.
if (!existsSync(CMS_DB_PATH)) {
  die(
    `CMS DB not found: ${CMS_DB_PATH}. Set CMS_DB_PATH to the file vlcms's DB_PATH resolves to, else the live title won't update.`,
  );
}
const db = new Database(CMS_DB_PATH, { fileMustExist: true });
db.pragma("busy_timeout = 5000");
const before = db.prepare("SELECT title FROM pages WHERE slug = ?").get(slug);
db.prepare(
  `INSERT INTO pages (slug, title, description, draft, tags, created_at, updated_at)
   VALUES (@slug, @title, @description, @draft, '[]', unixepoch(), unixepoch())
   ON CONFLICT(slug) DO UPDATE SET
     title       = excluded.title,
     description = excluded.description,
     draft       = excluded.draft,
     updated_at  = unixepoch()`,
).run({ slug, title, description, draft });
db.close();

const dbAction = before ? "updated" : "inserted";
console.log(`[cms] pages row ${dbAction}: ${slug}`);
console.log(`[cms]   title: ${title}`);
console.log(`[cms]   draft: ${draft === 1 ? "true (hidden)" : "false (published)"}`);

// ---- git commit + push ----------------------------------------------------
function git(...args) {
  return execFileSync("git", ["-C", JOURNAL_REPO, ...args], {
    encoding: "utf-8",
  }).trim();
}

if (noPush) {
  console.log("[git] --no-push: skipped commit/push (CMS DB synced only)");
  console.log(`\n✓ ${slug} synced to CMS. Body is live from disk; DB metadata updated.`);
  process.exit(0);
}

try {
  git("rev-parse", "--is-inside-work-tree");
} catch {
  die(`${JOURNAL_REPO} is not a git repository — cannot push`);
}

const relPath = `pages/${slug}.md`;
git("add", "--", relPath);

// Anything staged for this file?
let staged = "";
try {
  staged = execFileSync(
    "git",
    ["-C", JOURNAL_REPO, "diff", "--cached", "--name-only", "--", relPath],
    { encoding: "utf-8" },
  ).trim();
} catch {
  staged = "";
}

if (!staged) {
  console.log(`[git] no changes to ${relPath} — nothing to commit`);
} else {
  const msg =
    commitMessage ||
    `publish ${slug} — Williams Journal\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`;
  git("commit", "-m", msg, "--", relPath);
  const sha = git("rev-parse", "--short", "HEAD");
  console.log(`[git] committed ${relPath} (${sha})`);

  // Rebase onto remote so a concurrent publish doesn't cause a non-FF reject.
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  try {
    git("fetch", "origin", branch);
    git("rebase", "--autostash", `origin/${branch}`);
  } catch (err) {
    try {
      git("rebase", "--abort");
    } catch {
      /* ignore */
    }
    die(
      `rebase onto origin/${branch} failed (manual resolution needed): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  try {
    git("push", "origin", branch);
  } catch (err) {
    // qa-R3: fail loud and friendly — the WhatsApp-facing agent would otherwise
    // surface a raw stack trace. The commit (${sha}) is already saved locally.
    die(
      `git push rejected — commit ${sha} is saved locally. Resolve and retry: ` +
        `git -C ${JOURNAL_REPO} push origin ${branch}. (${
          err instanceof Error ? err.message : String(err)
        })`,
    );
  }
  console.log(`[git] pushed ${branch} → origin`);
}

console.log(`\n✓ ${slug} published. Live: body from disk, title/description from CMS, committed + pushed.`);
