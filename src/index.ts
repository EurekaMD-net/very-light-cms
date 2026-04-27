import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";
import { pages } from "./api/pages.js";
import { pagesWrite } from "./api/pages-write.js";
import { authRouter } from "./api/auth.js";
import { admin } from "./admin/router.js";
import { media } from "./api/media.js";
import { LocalDriver } from "./lib/storage.js";
import { apiAuthGuard } from "./admin/middleware.js";
import { publicRouter } from "./public/router.js";
import { securityHeaders } from "./lib/security-headers.js";

const app = new Hono();

// ── Middleware ─────────────────────────────────────────────────────────────────
// Security headers applied to every response (CSP, X-Frame-Options, etc.)
app.use("*", securityHeaders);

// Global JSON error handler — catches unhandled errors and returns consistent envelope
app.onError((err, c) => {
  console.error("[error]", err);
  return c.json({ error: "Internal server error", code: 500 }, 500);
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// ── Auth API ──────────────────────────────────────────────────────────────────
// POST /api/auth/login  → issue JWT cookie
// POST /api/auth/logout → clear cookie
// GET  /api/auth/me     → current user info
app.route("/api/auth", authRouter);

// ── Media API ─────────────────────────────────────────────────────────────────
// POST /api/media/upload  → upload file (Bearer required)
// GET  /api/media         → list media (Bearer required)
// DELETE /api/media/:id   → delete media (Bearer required)
// Auth guard is applied inside the router (media.use("/*", apiAuthGuard)).
app.route("/api/media", media);

// ── Serve uploaded files ──────────────────────────────────────────────────────
// GET /media/:filename — public access (no auth). Serves from UPLOAD_DIR.
app.get("/media/:filename", async (c) => {
  const filename = c.req.param("filename");
  const driver = new LocalDriver(config.uploadDir);
  try {
    const data = await driver.read(filename);
    // Derive content-type from extension — simple map, no dep needed
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mime: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
    };
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": mime[ext] ?? "application/octet-stream",
    });
  } catch {
    return c.notFound();
  }
});

// ── API routes ────────────────────────────────────────────────────────────────
// Public read-only: GET /api/pages, GET /api/pages/:slug
app.route("/api/pages", pages);

// Write routes — JWT required (Bearer header or cookie):
// POST /api/pages, PUT /api/pages/:slug, DELETE /api/pages/:slug
app.use("/api/pages", apiAuthGuard);
app.route("/api/pages", pagesWrite);

// ── Admin UI ──────────────────────────────────────────────────────────────────
// Server-rendered, no client JS. Auth via httpOnly cookie.
// GET  /admin           → pages list
// GET  /admin/login     → login form
// POST /admin/login     → authenticate
// GET  /admin/logout    → clear cookie
// GET  /admin/pages/new → new page form
// GET  /admin/pages/:slug/edit → edit form
// POST /admin/pages/:slug      → update
// POST /admin/pages/:slug/delete   → soft delete
// POST /admin/pages/:slug/publish  → publish
// POST /admin/pages/:slug/unpublish → unpublish
app.route("/admin", admin);

// ── Public site ───────────────────────────────────────────────────────────────
// Server-rendered public pages. Anonymous access. Drafts return 404.
// GET  /           → homepage (list of published pages)
// GET  /:slug      → single published page
// NOTE: Must be mounted LAST — it catches /* which would shadow all other routes.
app.route("/", publicRouter);

// ── Boot ──────────────────────────────────────────────────────────────────────
// Initialize DB at startup — applies schema.sql (idempotent)
getDatabase();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Very Light CMS running on http://localhost:${info.port}`);
});
