import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";
import { pages } from "./api/pages.js";
import { pagesWrite } from "./api/pages-write.js";
import { authRouter } from "./api/auth.js";
import { admin } from "./admin/router.js";
import { apiAuthGuard } from "./admin/middleware.js";

const app = new Hono();

// ── Middleware ─────────────────────────────────────────────────────────────────
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

// ── Boot ──────────────────────────────────────────────────────────────────────
// Initialize DB at startup — applies schema.sql (idempotent)
getDatabase();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Very Light CMS running on http://localhost:${info.port}`);
});
