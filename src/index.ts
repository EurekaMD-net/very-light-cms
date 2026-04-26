import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";

const app = new Hono();

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// ── Public routes (stubs — Fase 2) ────────────────────────────────────────────
// GET /:slug  → resolve + parse + render page
// These are wired in Fase 2 (api/pages.ts). Kept as comments here to mark intent.

// ── Admin routes (stubs — Fase 3) ─────────────────────────────────────────────
// GET  /admin           → dashboard
// POST /admin/pages     → create page
// POST /admin/login     → authenticate

// ── Boot ──────────────────────────────────────────────────────────────────────
// Initialize DB at startup — applies schema.sql (idempotent)
getDatabase();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Very Light CMS running on http://localhost:${info.port}`);
});
