import { Hono } from "hono";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { getDatabase } from "../db/database.js";
import { config } from "../config.js";
import { slugify } from "../lib/slugify.js";
import { ok, fail } from "../lib/response.js";
import { z } from "zod";

export const pagesWrite = new Hono();

// ── POST /api/pages ─────────────────────────────────────────────────────────────
// Create a new page. Writes a .md file to CONTENT_DIR and indexes it in the DB.
// Body: { title, slug?, description?, tags?, draft?, body }
// - slug is derived from title if not provided
// - draft defaults to true (safe default — must be explicitly published)
// - Responds 409 if slug already exists
const CreateSchema = z.object({
  title: z.string().min(1, "title is required"),
  slug: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional().default(true),
  body: z.string().optional().default(""),
});

pagesWrite.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "Request body must be valid JSON", 400);
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const input = parsed.data;
  const slug = input.slug ? slugify(input.slug) : slugify(input.title);

  const db = getDatabase();

  // Conflict check
  const existing = db.prepare(`SELECT id FROM pages WHERE slug = ?`).get(slug);
  if (existing) {
    return fail(c, `Slug already exists: ${slug}`, 409);
  }

  // Build .md file content with frontmatter
  const frontmatter = buildFrontmatter({
    title: input.title,
    slug,
    description: input.description,
    tags: input.tags,
    draft: input.draft,
  });
  const fileContent = `${frontmatter}\n${input.body}`;

  // Write file to CONTENT_DIR
  const filePath = join(resolve(config.contentDir), `${slug}.md`);
  try {
    writeFileSync(filePath, fileContent, "utf-8");
  } catch {
    return fail(c, "Failed to write content file", 500);
  }

  // Index in DB
  const tagsJson = input.tags ? JSON.stringify(input.tags) : null;
  const draftInt = input.draft ? 1 : 0;

  try {
    db.prepare(
      `INSERT INTO pages (slug, title, description, tags, draft)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(slug, input.title, input.description ?? null, tagsJson, draftInt);
  } catch {
    // Roll back file write on DB failure
    try {
      unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    return fail(c, "Failed to save page to database", 500);
  }

  const row = db.prepare(`SELECT * FROM pages WHERE slug = ?`).get(slug) as {
    slug: string;
    title: string;
    description: string | null;
    tags: string | null;
    draft: number;
    created_at: number;
    updated_at: number;
  };

  return ok(c, {
    slug: row.slug,
    title: row.title,
    description: row.description,
    tags: parseTagsFromJson(row.tags),
    draft: row.draft === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }, 201);
});

// ── PUT /api/pages/:slug ────────────────────────────────────────────────────────
// Update an existing page (title, description, tags, draft, body).
// Slug is immutable — it is not updated even if title changes.
// Rewrites the .md file and updates DB metadata.
const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  body: z.string().optional(),
});

pagesWrite.put("/:slug", async (c) => {
  const slug = c.req.param("slug");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "Request body must be valid JSON", 400);
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const input = parsed.data;
  const db = getDatabase();

  const existing = db.prepare(`SELECT * FROM pages WHERE slug = ?`).get(slug) as {
    slug: string;
    title: string;
    description: string | null;
    tags: string | null;
    draft: number;
    created_at: number;
  } | undefined;

  if (!existing) {
    return fail(c, `Page not found: ${slug}`, 404);
  }

  // Merge incoming changes with existing values
  const newTitle = input.title ?? existing.title;
  const newDescription = input.description !== undefined ? input.description : existing.description;
  const newTags = input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags;
  const newDraft = input.draft !== undefined ? (input.draft ? 1 : 0) : existing.draft;

  // Rewrite .md file
  const filePath = join(resolve(config.contentDir), `${slug}.md`);
  if (input.body !== undefined || input.title !== undefined) {
    // Read current body if body not being replaced
    let bodyContent = input.body ?? "";
    if (input.body === undefined && existsSync(filePath)) {
      const { readFileSync } = await import("node:fs");
      const raw = readFileSync(filePath, "utf-8");
      // Strip existing frontmatter — everything after the closing ---
      const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      bodyContent = match ? match[1] : raw;
    }

    const frontmatter = buildFrontmatter({
      title: newTitle,
      slug,
      description: newDescription ?? undefined,
      tags: input.tags ?? parseTagsFromJson(existing.tags),
      draft: newDraft === 1,
    });

    try {
      writeFileSync(filePath, `${frontmatter}\n${bodyContent}`, "utf-8");
    } catch {
      return fail(c, "Failed to update content file", 500);
    }
  }

  // Update DB
  db.prepare(
    `UPDATE pages
     SET title = ?, description = ?, tags = ?, draft = ?, updated_at = unixepoch()
     WHERE slug = ?`,
  ).run(newTitle, newDescription ?? null, newTags, newDraft, slug);

  const updated = db.prepare(`SELECT * FROM pages WHERE slug = ?`).get(slug) as {
    slug: string;
    title: string;
    description: string | null;
    tags: string | null;
    draft: number;
    created_at: number;
    updated_at: number;
  };

  return ok(c, {
    slug: updated.slug,
    title: updated.title,
    description: updated.description,
    tags: parseTagsFromJson(updated.tags),
    draft: updated.draft === 1,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  });
});

// ── DELETE /api/pages/:slug ─────────────────────────────────────────────────────
// Soft delete (draft=1) by default.
// Hard delete (removes file + DB row) with ?permanent=true.
pagesWrite.delete("/:slug", (c) => {
  const slug = c.req.param("slug");
  const permanent = c.req.query("permanent") === "true";
  const db = getDatabase();

  const existing = db.prepare(`SELECT id FROM pages WHERE slug = ?`).get(slug);
  if (!existing) {
    return fail(c, `Page not found: ${slug}`, 404);
  }

  if (permanent) {
    // Hard delete: remove file + DB row
    const filePath = join(resolve(config.contentDir), `${slug}.md`);
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch {
      return fail(c, "Failed to delete content file", 500);
    }
    db.prepare(`DELETE FROM pages WHERE slug = ?`).run(slug);
    return ok(c, { slug, deleted: true, permanent: true });
  }

  // Soft delete: set draft=1 (invisible in public API)
  db.prepare(
    `UPDATE pages SET draft = 1, updated_at = unixepoch() WHERE slug = ?`,
  ).run(slug);

  return ok(c, { slug, deleted: true, permanent: false });
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildFrontmatter(fields: {
  title: string;
  slug: string;
  description?: string;
  tags?: string[];
  draft?: boolean;
}): string {
  const lines = ["---", `title: "${fields.title}"`, `slug: "${fields.slug}"`];
  if (fields.description) lines.push(`description: "${fields.description}"`);
  if (fields.tags && fields.tags.length > 0) {
    lines.push(`tags: [${fields.tags.map((t) => `"${t}"`).join(", ")}]`);
  }
  lines.push(`draft: ${fields.draft ?? true}`);
  lines.push("---");
  return lines.join("\n");
}

function parseTagsFromJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
