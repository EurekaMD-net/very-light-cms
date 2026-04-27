import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { getDatabase } from "../db/database.js";
import { resolveSlug } from "../content/resolver.js";
import { parse } from "../content/parser.js";
import { NotFoundError } from "../lib/errors.js";
import { layout } from "./themes/minimal/layout.js";
import { pageView, notFoundView } from "./themes/minimal/page.js";
import { homeView } from "./themes/minimal/home.js";
import type { PageListItem } from "./themes/minimal/home.js";

export const publicRouter = new Hono();

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

  const html = layout({
    title: "Home",
    body: homeView(pages),
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
  description?: string | null;
  tags?: string | null;
  draft?: number;
  created_at?: number;
  updated_at?: number;
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
