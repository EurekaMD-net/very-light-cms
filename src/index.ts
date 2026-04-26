import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";
import { pages } from "./api/pages.js";
import { pagesWrite } from "./api/pages-write.js";

const app = new Hono();

// ── Middleware ─────────────────────────────────────────────────────────────────
// Global JSON error handler — catches unhandled errors and returns consistent envelope
app.onError((err, c) => {
  console.error("[error]", err);
  return c.json({ error: "Internal server error", code: 500 }, 500);
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// ── API routes ────────────────────────────────────────────────────────────────
// Public read-only: GET /api/pages, GET /api/pages/:slug
app.route("/api/pages", pages);

// Write routes (no auth — Fase 3 adds JWT guard):
// POST /api/pages, PUT /api/pages/:slug, DELETE /api/pages/:slug
app.route("/api/pages", pagesWrite);

// ── Admin routes (stubs — Fase 3) ─────────────────────────────────────────────
// GET  /admin           → dashboard (server-rendered)
// POST /admin/login     → authenticate + issue JWT

// ── Boot ──────────────────────────────────────────────────────────────────────
// Initialize DB at startup — applies schema.sql (idempotent)
getDatabase();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Very Light CMS running on http://localhost:${info.port}`);
});
