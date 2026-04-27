import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDatabase } from "../db/database.js";
import { authGuard } from "./middleware.js";
import { verifyPassword, signToken } from "../lib/auth.js";
import { loginView } from "./views/login.js";
import { pagesListView } from "./views/pages-list.js";
import { pageEditView } from "./views/page-edit.js";
import { escHtml } from "./views/layout.js";
import { mediaListView, mediaUploadView } from "./views/media-list.js";
import {
  LocalDriver,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "../lib/storage.js";
import { authCookieOptions } from "../lib/cookie.js";
import { rateLimit } from "../lib/rate-limit.js";
import { detectMimeMatches } from "../lib/mime-sniff.js";
import { slugify } from "../lib/slugify.js";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

export const admin = new Hono();

/**
 * 5 login attempts per 15 minutes per IP. On limit, re-render the login
 * form with a flash message instead of returning JSON (admin is HTML-only).
 */
const adminLoginRateLimit = rateLimit({
  max: 5,
  windowMs: 15 * 60 * 1000,
  onLimit: (c, retryAfterSec) =>
    c.html(
      loginView({
        error: `Too many attempts. Try again in ${retryAfterSec}s.`,
      }),
      429,
    ),
});

// ── Auth ───────────────────────────────────────────────────────────────────────

admin.get("/login", (c) => {
  // Already logged in? Redirect to dashboard
  const token = getCookie(c, "token");
  if (token) return c.redirect("/admin");
  return c.html(loginView());
});

admin.post("/login", adminLoginRateLimit, async (c) => {
  const body = await c.req.parseBody();
  const email = String(body["email"] ?? "")
    .trim()
    .toLowerCase();
  const password = String(body["password"] ?? "");

  if (!email || !password) {
    return c.html(
      loginView({ error: "Email and password are required." }),
      400,
    );
  }

  const db = getDatabase();
  const user = db
    .prepare(
      "SELECT id, email, password_hash, role FROM users WHERE email = ? LIMIT 1",
    )
    .get(email) as
    | { id: number; email: string; password_hash: string; role: string }
    | undefined;

  const valid = user
    ? await verifyPassword(password, user.password_hash)
    : false;

  if (!valid) {
    return c.html(loginView({ error: "Invalid email or password." }), 401);
  }

  // Update last_login
  db.prepare("UPDATE users SET last_login = unixepoch() WHERE id = ?").run(
    user!.id,
  );

  const token = signToken(String(user!.id), user!.role);
  setCookie(c, "token", token, authCookieOptions());

  return c.redirect("/admin");
});

admin.get("/logout", (c) => {
  deleteCookie(c, "token", { path: "/" });
  return c.redirect("/admin/login");
});

// ── Dashboard (pages list) ─────────────────────────────────────────────────────

admin.get("/", authGuard, (c) => {
  const db = getDatabase();
  const pages = db
    .prepare(
      "SELECT id, slug, title, draft, created_at, updated_at FROM pages ORDER BY updated_at DESC",
    )
    .all() as {
    id: number;
    slug: string;
    title: string;
    draft: number;
    created_at: number;
    updated_at: number;
  }[];

  return c.html(pagesListView(pages));
});

// ── New page ───────────────────────────────────────────────────────────────────

admin.get("/pages/new", authGuard, (c) => {
  return c.html(pageEditView({ mode: "create" }));
});

admin.post("/pages", authGuard, async (c) => {
  const body = await c.req.parseBody();
  const title = String(body["title"] ?? "").trim();
  const rawSlug = String(body["slug"] ?? "").trim();
  const description = String(body["description"] ?? "").trim();
  const tags = String(body["tags"] ?? "").trim();
  const pageBody = String(body["body"] ?? "").trim();
  const draft = body["draft"] === "0" ? 0 : 1;

  if (!title) {
    return c.html(
      pageEditView({
        mode: "create",
        error: "Title is required.",
        data: { title, description, tags, body: pageBody },
      }),
      400,
    );
  }

  const slug = rawSlug || slugify(title);
  const db = getDatabase();

  // Check duplicate slug
  const existing = db.prepare("SELECT id FROM pages WHERE slug = ?").get(slug);
  if (existing) {
    return c.html(
      pageEditView({
        mode: "create",
        error: `Slug "${slug}" already exists. Choose a different title or slug.`,
        data: { title, slug, description, tags, body: pageBody },
      }),
      409,
    );
  }

  // Parse tags → JSON array
  const tagsJson = JSON.stringify(
    tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );

  // Build frontmatter + file
  const fileContent = buildMarkdown({
    title,
    description,
    tags: tagsJson,
    draft,
    body: pageBody,
  });
  const filePath = join(config.contentDir, `${slug}.md`);
  writeFileSync(filePath, fileContent, "utf-8");

  try {
    db.prepare(
      "INSERT INTO pages (slug, title, description, tags, draft) VALUES (?, ?, ?, ?, ?)",
    ).run(slug, title, description || null, tagsJson, draft);
  } catch (err) {
    // Rollback file
    if (existsSync(filePath)) unlinkSync(filePath);
    return c.html(
      pageEditView({
        mode: "create",
        error: "Database error — page not saved.",
        data: { title, slug, description, tags, body: pageBody },
      }),
      500,
    );
  }

  return c.redirect("/admin");
});

// ── Edit page ──────────────────────────────────────────────────────────────────

admin.get("/pages/:slug/edit", authGuard, (c) => {
  const slug = c.req.param("slug");
  const db = getDatabase();
  const row = db
    .prepare(
      "SELECT slug, title, description, tags, draft FROM pages WHERE slug = ?",
    )
    .get(slug) as
    | {
        slug: string;
        title: string;
        description: string | null;
        tags: string | null;
        draft: number;
      }
    | undefined;

  if (!row) return c.html(`<h1>404 — Page not found</h1>`, 404);

  // Read body from file
  const filePath = join(config.contentDir, `${slug}.md`);
  let pageBody = "";
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8");
    // Strip frontmatter — body is everything after second '---'
    const parts = raw.split(/^---\s*$/m);
    pageBody = parts.length >= 3 ? parts.slice(2).join("---").trim() : raw;
  }

  // tags JSON → comma-separated for form
  let tagsDisplay = "";
  try {
    const parsed = JSON.parse(row.tags ?? "[]") as string[];
    tagsDisplay = parsed.join(", ");
  } catch {
    tagsDisplay = "";
  }

  return c.html(
    pageEditView({
      mode: "edit",
      data: {
        slug: row.slug,
        title: row.title,
        description: row.description ?? "",
        tags: tagsDisplay,
        body: pageBody,
        draft: row.draft,
      },
    }),
  );
});

admin.post("/pages/:slug", authGuard, async (c) => {
  const slug = c.req.param("slug");
  const db = getDatabase();
  const existing = db.prepare("SELECT id FROM pages WHERE slug = ?").get(slug);
  if (!existing) return c.html(`<h1>404 — Page not found</h1>`, 404);

  const body = await c.req.parseBody();
  const title = String(body["title"] ?? "").trim();
  const description = String(body["description"] ?? "").trim();
  const tags = String(body["tags"] ?? "").trim();
  const pageBody = String(body["body"] ?? "").trim();
  const draft = body["draft"] === "0" ? 0 : 1;

  if (!title) {
    return c.html(
      pageEditView({
        mode: "edit",
        error: "Title is required.",
        data: { slug, title, description, tags, body: pageBody },
      }),
      400,
    );
  }

  const tagsJson = JSON.stringify(
    tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );

  db.prepare(
    "UPDATE pages SET title = ?, description = ?, tags = ?, draft = ?, updated_at = unixepoch() WHERE slug = ?",
  ).run(title, description || null, tagsJson, draft, slug);

  const fileContent = buildMarkdown({
    title,
    description,
    tags: tagsJson,
    draft,
    body: pageBody,
  });
  writeFileSync(join(config.contentDir, `${slug}.md`), fileContent, "utf-8");

  return c.redirect("/admin");
});

// ── Publish / Unpublish ────────────────────────────────────────────────────────

admin.post("/pages/:slug/publish", authGuard, (c) => {
  const slug = c.req.param("slug") ?? "";
  const db = getDatabase();
  const result = db
    .prepare(
      "UPDATE pages SET draft = 0, updated_at = unixepoch() WHERE slug = ?",
    )
    .run(slug);

  if (result.changes === 0) return c.html(`<h1>404 — Page not found</h1>`, 404);

  // Sync frontmatter in file
  syncDraftFlag(slug, 0);
  return c.redirect("/admin");
});

admin.post("/pages/:slug/unpublish", authGuard, (c) => {
  const slug = c.req.param("slug") ?? "";
  const db = getDatabase();
  const result = db
    .prepare(
      "UPDATE pages SET draft = 1, updated_at = unixepoch() WHERE slug = ?",
    )
    .run(slug);

  if (result.changes === 0) return c.html(`<h1>404 — Page not found</h1>`, 404);
  syncDraftFlag(slug, 1);
  return c.redirect("/admin");
});

// ── Delete ─────────────────────────────────────────────────────────────────────

admin.post("/pages/:slug/delete", authGuard, (c) => {
  const slug = c.req.param("slug");
  const db = getDatabase();

  // Soft delete — set draft=1 (invisible in public API)
  const result = db
    .prepare(
      "UPDATE pages SET draft = 1, updated_at = unixepoch() WHERE slug = ?",
    )
    .run(slug);

  if (result.changes === 0) return c.html(`<h1>404 — Page not found</h1>`, 404);
  return c.redirect("/admin");
});

// ── Media ─────────────────────────────────────────────────────────────────────

admin.get("/media", authGuard, (c) => {
  const db = getDatabase();
  const driver = new LocalDriver(config.uploadDir);
  const rows = db
    .prepare(
      "SELECT id, filename, mime_type, size_bytes, alt_text, uploaded_at FROM media ORDER BY uploaded_at DESC",
    )
    .all() as Array<{
    id: number;
    filename: string;
    mime_type: string;
    size_bytes: number;
    alt_text: string | null;
    uploaded_at: number;
  }>;
  const items = rows.map((r) => ({ ...r, url: driver.url(r.filename) }));
  return c.html(mediaListView(items, c.req.query("flash")));
});

admin.get("/media/upload", authGuard, (c) => {
  return c.html(mediaUploadView());
});

admin.post("/media/upload", authGuard, async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  const altText =
    typeof body["alt_text"] === "string" ? body["alt_text"] : null;

  if (!(file instanceof File)) {
    return c.html(mediaUploadView("Missing file"), 400);
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.html(mediaUploadView("Unsupported file type: " + file.type), 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.html(mediaUploadView("File exceeds 10 MB limit"), 400);
  }

  const data = Buffer.from(await file.arrayBuffer());

  // Magic-byte validation — declared MIME must match file content
  if (!detectMimeMatches(data, file.type)) {
    return c.html(
      mediaUploadView(
        "File content does not match declared type: " + file.type,
      ),
      400,
    );
  }

  const driver = new LocalDriver(config.uploadDir);
  const stored = await driver.write(file.name, data, file.type);

  const db = getDatabase();
  db.prepare(
    "INSERT INTO media (filename, mime_type, size_bytes, alt_text) VALUES (?, ?, ?, ?)",
  ).run(stored, file.type, file.size, altText);

  return c.redirect("/admin/media?flash=Uploaded+successfully");
});

admin.post("/media/:id/delete", authGuard, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const db = getDatabase();
  const row = db
    .prepare("SELECT id, filename FROM media WHERE id = ?")
    .get(id) as { id: number; filename: string } | undefined;
  if (!row) return c.redirect("/admin/media?flash=Not+found");

  const driver = new LocalDriver(config.uploadDir);
  await driver.delete(row.filename);
  db.prepare("DELETE FROM media WHERE id = ?").run(id);

  return c.redirect("/admin/media?flash=Deleted");
});
// ── Helpers ────────────────────────────────────────────────────────────────────

function buildMarkdown(opts: {
  title: string;
  description: string;
  tags: string;
  draft: number;
  body: string;
}): string {
  const tagsParsed = JSON.parse(opts.tags) as string[];
  return [
    "---",
    `title: ${opts.title}`,
    opts.description ? `description: ${opts.description}` : null,
    `tags: [${tagsParsed.join(", ")}]`,
    `draft: ${opts.draft === 1 ? "true" : "false"}`,
    "---",
    "",
    opts.body,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function syncDraftFlag(slug: string, draft: number): void {
  const filePath = join(config.contentDir, `${slug}.md`);
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf-8");
  const updated = raw.replace(
    /^draft:\s*(true|false)/m,
    `draft: ${draft === 0 ? "false" : "true"}`,
  );
  writeFileSync(filePath, updated, "utf-8");
}
