import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";

// ── Env setup — must happen before any module import that reads env vars ──────
process.env["DB_PATH"] = ":memory:";
process.env["JWT_SECRET"] = "test-secret-phase4";
process.env["CONTENT_DIR"] = "/tmp/vlcms-public-test-content";
process.env["SITE_TITLE"] = "Test Site";

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { getDatabase, closeDatabase } from "../../src/db/database.js";
import { publicRouter } from "../../src/public/router.js";

// ── Test app ──────────────────────────────────────────────────────────────────
const app = new Hono();
app.route("/", publicRouter);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const contentDir = "/tmp/vlcms-public-test-content";

function setupContent() {
  mkdirSync(contentDir, { recursive: true });

  writeFileSync(
    `${contentDir}/hello-world.md`,
    `---
title: Hello World
description: My first post
tags: ["intro"]
---
# Hello World

This is the content.`,
  );

  writeFileSync(
    `${contentDir}/draft-page.md`,
    `---
title: Draft Page
---
# Draft

Not published.`,
  );
}

function teardownContent() {
  rmSync(contentDir, { recursive: true, force: true });
}

function seedDb() {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO pages (slug, title, description, tags, draft, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "hello-world",
    "Hello World",
    "My first post",
    JSON.stringify(["intro"]),
    0, // published
    now - 100,
    now,
  );

  db.prepare(
    `INSERT INTO pages (slug, title, description, tags, draft, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "draft-page",
    "Draft Page",
    null,
    null,
    1, // draft
    now - 50,
    now - 50,
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(() => {
  setupContent();
  getDatabase(); // init schema
  seedDb();
});

afterAll(() => {
  closeDatabase();
  teardownContent();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET / — homepage", () => {
  it("returns 200 with HTML", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("lists published pages by title and link", async () => {
    const res = await app.request("/");
    const body = await res.text();
    expect(body).toContain("Hello World");
    expect(body).toContain('href="/hello-world"');
  });

  it("does NOT list draft pages", async () => {
    const res = await app.request("/");
    const body = await res.text();
    expect(body).not.toContain("Draft Page");
    expect(body).not.toContain("draft-page");
  });

  it("includes site title from SITE_TITLE env var", async () => {
    const res = await app.request("/");
    const body = await res.text();
    expect(body).toContain("Test Site");
  });
});

describe("GET /:slug — single page", () => {
  it("returns 200 for a published page", async () => {
    const res = await app.request("/hello-world");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("renders page title and content", async () => {
    const res = await app.request("/hello-world");
    const body = await res.text();
    expect(body).toContain("Hello World");
    expect(body).toContain("This is the content.");
  });

  it("sets ETag header", async () => {
    const res = await app.request("/hello-world");
    expect(res.headers.get("etag")).toBeTruthy();
  });

  it("returns 304 on conditional GET with matching ETag", async () => {
    const res1 = await app.request("/hello-world");
    const etag = res1.headers.get("etag") ?? "";
    expect(etag).toBeTruthy();

    const res2 = await app.request("/hello-world", {
      headers: { "if-none-match": etag },
    });
    expect(res2.status).toBe(304);
  });

  it("returns 404 HTML for draft pages", async () => {
    const res = await app.request("/draft-page");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("404");
  });

  it("returns 404 HTML for non-existent slug", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("404");
  });
});
