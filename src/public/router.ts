import { Hono } from "hono";
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { getDatabase } from "../db/database.js";
import { resolveSlug } from "../content/resolver.js";
import { parse } from "../content/parser.js";
import { NotFoundError } from "../lib/errors.js";
import { layout } from "./themes/minimal/layout.js";
import { pageView, notFoundView } from "./themes/minimal/page.js";
import { homeView } from "./themes/minimal/home.js";
import type { PageListItem } from "./themes/minimal/home.js";
import { config } from "../config.js";

export const publicRouter = new Hono();

// SITE_URL drives canonical/sitemap/llms.txt URLs. Falls back to localhost
// for dev. Production deployments must set SITE_URL in .env (e.g.
// `SITE_URL=https://thewilliamsradar.com`).
const SITE_URL = process.env["SITE_URL"] ?? "http://localhost:3344";

// ── SEO / GEO static files ─────────────────────────────────────────────────────

publicRouter.get("/robots.txt", (c) => {
  return c.text(
    `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: Amazonbot\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    200,
    { "Content-Type": "text/plain" },
  );
});

publicRouter.get("/sitemap.xml", (c) => {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT slug, updated_at FROM pages WHERE draft = 0 ORDER BY updated_at DESC`,
    )
    .all() as { slug: string; updated_at: number }[];

  const now = new Date().toISOString().split("T")[0];

  const urlEntries = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <lastmod>${now}</lastmod>\n  </url>`,
    ...rows.map((r) => {
      const date = new Date(r.updated_at * 1000).toISOString().split("T")[0];
      return `  <url>\n    <loc>${SITE_URL}/${r.slug}</loc>\n    <changefreq>never</changefreq>\n    <priority>0.7</priority>\n    <lastmod>${date}</lastmod>\n  </url>`;
    }),
  ].join("\n");

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`,
    200,
    { "Content-Type": "application/xml" },
  );
});

publicRouter.get("/llms.txt", (c) => {
  const siteTitle = process.env["SITE_TITLE"] ?? "Very Light CMS";
  return c.text(
    `# ${siteTitle}\n\n> Weekly quantitative scanner for Williams AO/AC buy signals across US equities.\n> Published every Friday after US market close.\n\n## What This Site Is\n\nThe Williams Radar is published by a group of traders and technologists with more than 50 years of accumulated market experience — long-time students of Bill Williams' work and builders of a tested, transparent trading system for the patient investor. The scanner sweeps 255 publicly traded US equities across 13 sector ETFs for Williams AO (Awesome Oscillator) and AC (Accelerator Oscillator) buy signals. Methodology is rooted in Bill Williams' trading system as described in "Trading Chaos" (1995) and "New Trading Dimensions" (1998).\n\n## What You'll Find Here\n\n- **Weekly journal entries** (W17, W18, W19…): full signal reports — Category A candidates, S2 confirmations when present, and a Ticker of the Week deep-dive.\n- **Methodology page** (/methodology): formulas, signal classification (S1, S2, S2-Degraded, Pre-Radar), and the universe definition.\n- **About page** (/about): editorial team, mission, disclaimers.\n\n## Signal Classification\n\n- **S1**: Williams AO crossed above zero with the AC turning positive. Early-momentum signal — watchlist category.\n- **S2**: Full two-bar confirmation — AO positive and AC positive sustained. Entry signal.\n- **S2-Degraded**: A ticker that completed S2 in recent weeks but the configuration has since expired without follow-through.\n- **Pre-Radar**: AO approaching zero from below with AC positive. Pre-signal monitoring only.\n\n## Universe\n\n255 tickers across 13 sector ETFs: XLU (Utilities), XLI (Industrials), XLY (Consumer Discretionary), XLV (Health Care), XLRE (Real Estate), XLK (Technology), XLF (Financials), XLC (Communication Services), XLB (Materials), IBB (Biotech — iShares), XLP (Consumer Staples), XBI (Biotech — SPDR), XLE (Energy). Reviewed quarterly.\n\n## Publication Schedule\n\nEvery Friday at 18:00 Mexico City time (UTC-6). Automated scan via a custom Node.js engine; results published to the journal and pushed to Telegram immediately.\n\n## Disclaimer\n\nEducational and informational purposes only. Not financial advice.\n\n## Links\n\n- Homepage: ${SITE_URL}\n- Methodology: ${SITE_URL}/methodology\n- About: ${SITE_URL}/about\n`,
    200,
    { "Content-Type": "text/plain" },
  );
});

// ── Static assets: GET /assets/:filename ───────────────────────────────────────
// Serves files from the {CONTENT_DIR}/../assets/ directory.
// Supports images used by the theme (logo, etc.). No auth required.
// Only allows safe filenames (no path traversal).
publicRouter.get("/assets/:filename", (c) => {
  const filename = basename(c.req.param("filename")); // strip any path traversal
  // Derive assets dir from CONTENT_DIR (e.g. /pages/../assets = /assets)
  const contentDir = config.contentDir;
  const assetsDir = join(contentDir, "..", "assets");
  const filePath = join(assetsDir, filename);

  if (!existsSync(filePath)) {
    return c.notFound();
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };

  const data = readFileSync(filePath);
  return c.body(new Uint8Array(data), 200, {
    "Content-Type": mime[ext] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=3600",
  });
});

// ── Homepage: GET / ────────────────────────────────────────────────────────────
// Lists all published pages (draft=0), ordered by created_at DESC.
publicRouter.get("/", (c) => {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT slug, title, description, tags, created_at
       FROM pages
       WHERE draft = 0
       ORDER BY created_at DESC`,
    )
    .all() as DbPageRow[];

  const pages: PageListItem[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description ?? null,
    date: r.created_at ? formatDate(r.created_at) : null,
    tags: parseTags(r.tags),
  }));

  // Split: journal entries (W##-YYYY) vs static pages (about, methodology, etc.)
  const journalEntries = pages.filter((p) => /^w\d/i.test(p.slug));
  const staticPages = pages.filter((p) => !/^w\d/i.test(p.slug));

  const homepageSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "The Williams Radar",
        description:
          "Weekly Williams AO/AC stock signal scanner. 255 tickers across 13 sector ETFs, published every Friday after US market close.",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "The Williams Radar",
        url: SITE_URL,
        logo: `${SITE_URL}/assets/logo.png`,
        description:
          "A group of traders and technologists with more than 50 years of accumulated market experience, long-time students of Bill Williams' work.",
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is the Williams Radar?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The Williams Radar is a weekly quantitative scanner that detects Williams AO (Awesome Oscillator) and AC (Accelerator Oscillator) buy signals across 255 US-listed equities in 13 sector ETFs. Published every Friday after US market close.",
            },
          },
          {
            "@type": "Question",
            name: "How are Williams AO/AC signals generated?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The scanner analyzes weekly OHLCV data for 255 tickers. An S1 signal occurs when the Williams AO crosses above zero with the AC turning positive — early-momentum watchlist. An S2 signal requires two consecutive bars of full confirmation with AO and AC both positive — entry signal.",
            },
          },
          {
            "@type": "Question",
            name: "When is the Williams Radar published?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Every Friday at 6:00 PM Mexico City time (UTC-6). The scan runs automatically across all 255 tickers after US market close.",
            },
          },
          {
            "@type": "Question",
            name: "Is this financial advice?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. The Williams Radar is an educational and informational tool. It does not constitute financial advice or investment recommendations. Always do your own research before making investment decisions.",
            },
          },
        ],
      },
    ],
  });

  const html = layout({
    title: "Weekly Stock Signal Scanner",
    body: homeView(journalEntries, staticPages),
    description:
      "Weekly Williams AO/AC signal scanner across 255 tickers and 13 sector ETFs. Published every Friday after US market close.",
    canonicalUrl: SITE_URL,
    schema: homepageSchema,
    ogType: "website",
  });

  return c.html(html, 200);
});

// ── Single page: GET /:slug ────────────────────────────────────────────────────
// Renders a published page by slug.
// Returns 404 for missing pages and for drafts (draft=1).
// Sets ETag header based on updated_at for conditional GET support.
publicRouter.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  const db = getDatabase();

  const row = db
    .prepare(
      `SELECT slug, title, description, tags, draft, updated_at
       FROM pages
       WHERE slug = ?`,
    )
    .get(slug) as DbPageRow | undefined;

  // 404 — not found or is a draft
  if (!row || row.draft !== 0) {
    const html = layout({
      title: "Not Found",
      body: notFoundView(),
    });
    return c.html(html, 404);
  }

  // ETag — conditional GET
  // RFC 7232 §4.1: server SHOULD echo ETag on 304 responses.
  const etag = `"${row.updated_at}"`;
  if (c.req.header("if-none-match") === etag) {
    return c.body(null, 304, { ETag: etag });
  }

  // Read + render markdown
  let html: string;
  try {
    const filePath = resolveSlug(slug);
    const raw = readFileSync(filePath, "utf-8");
    const node = parse(raw, slug);

    const pageUrl = `${SITE_URL}/${slug}`;
    const pubDate = row.updated_at
      ? new Date(row.updated_at * 1000).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const articleSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      description: row.description ?? undefined,
      datePublished: pubDate,
      dateModified: pubDate,
      author: {
        "@type": "Organization",
        name: "The Williams Radar",
        url: `${SITE_URL}/about`,
      },
      publisher: {
        "@type": "Organization",
        name: "The Williams Radar",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/assets/logo.png`,
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": pageUrl,
      },
    });

    const body = pageView({
      title: row.title,
      description: row.description ?? null,
      date: row.updated_at ? formatDate(row.updated_at) : null,
      tags: parseTags(row.tags),
      html: node.html,
    });

    html = layout({
      title: row.title,
      body,
      description: row.description ?? undefined,
      etag,
      canonicalUrl: pageUrl,
      schema: articleSchema,
      ogType: "article",
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      // DB row exists but .md file is missing — treat as 404
      const errHtml = layout({ title: "Not Found", body: notFoundView() });
      return c.html(errHtml, 404);
    }
    throw err;
  }

  return c.html(html, 200, { ETag: etag });
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface DbPageRow {
  slug: string;
  title: string;
  description: string | null;
  tags: string | null;
  draft: number;
  created_at: number;
  updated_at: number;
}

/** Format a Unix timestamp (seconds) as YYYY-MM-DD in America/Mexico_City timezone. */
function formatDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/Mexico_City",
  });
}

function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
