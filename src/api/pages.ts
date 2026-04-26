import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { getDatabase } from "../db/database.js";
import { resolveSlug } from "../content/resolver.js";
import { parse } from "../content/parser.js";
import { ok, fail } from "../lib/response.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export const pages = new Hono();

// ── GET /api/pages ─────────────────────────────────────────────────────────────
// Returns paginated list of published pages (draft=0 only).
// Query params:
//   limit  (default: 20, max: 100)
//   offset (default: 0)
pages.get("/", (c) => {
  const db = getDatabase();

  const rawLimit = parseInt(c.req.query("limit") ?? "20", 10);
  const rawOffset = parseInt(c.req.query("offset") ?? "0", 10);

  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  const rows = db
    .prepare(
      `SELECT slug, title, description, tags, created_at, updated_at
       FROM pages
       WHERE draft = 0
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as PageRow[];

  const total = (
    db
      .prepare(`SELECT COUNT(*) as count FROM pages WHERE draft = 0`)
      .get() as { count: number }
  ).count;

  return ok(c, {
    items: rows.map(normalizeRow),
    pagination: { limit, offset, total },
  });
});

// ── GET /api/pages/:slug ────────────────────────────────────────────────────────
// Returns a single published page: metadata + rendered HTML.
// Returns 404 for drafts (draft=1) — they are invisible to the public API.
pages.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  const db = getDatabase();

  // Verify page exists in DB and is published
  const row = db
    .prepare(`SELECT * FROM pages WHERE slug = ? AND draft = 0`)
    .get(slug) as PageRow | undefined;

  if (!row) {
    return fail(c, `Page not found: ${slug}`, 404);
  }

  // Resolve slug → file path → parse Markdown
  let node;
  try {
    const filePath = resolveSlug(slug);
    const raw = readFileSync(filePath, "utf-8");
    node = parse(raw, slug);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return fail(c, `Content file missing for: ${slug}`, 404);
    }
    if (err instanceof ValidationError) {
      return fail(c, err.message, 400);
    }
    return fail(c, "Failed to read content", 500);
  }

  return ok(c, {
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    html: node.html,
  });
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface PageRow {
  id?: number;
  slug: string;
  title: string;
  description?: string | null;
  tags?: string | null;
  draft?: number;
  created_at: number;
  updated_at: number;
}

function normalizeRow(row: PageRow) {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
