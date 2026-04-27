/**
 * tests/api/integration.test.ts
 *
 * End-to-end integration test that boots the full Hono app in-process
 * (no TCP port) and walks a complete workflow:
 *
 *   1. POST /api/auth/login           → JWT token
 *   2. POST /api/pages                → create page (draft)
 *   3. PUT  /api/pages/:slug          → publish page
 *   4. GET  /api/pages                → list returns { items, pagination }
 *   5. POST /api/media/upload         → upload image
 *   6. GET  /api/media                → list returns { items, total }
 *   7. DELETE /api/media/:id          → delete media
 *   8. GET  /api/media                → list is empty after delete
 *
 * This test was added to catch inner-shape bugs (e.g. CLI treating
 * { items, pagination } as a flat array) that unit tests with mocked
 * clients cannot detect.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";

// JWT secret must be set before any imports that read it
process.env.JWT_SECRET = "integration-test-secret";

// Isolate DB + config
let testDb: ReturnType<typeof Database>;
let testUploadDir: string;
let testContentDir: string;

vi.mock("../../src/db/database.js", () => ({
  getDatabase: () => testDb,
}));

vi.mock("../../src/config.js", () => ({
  config: {
    port: 3000,
    dbPath: ":memory:",
    get contentDir() { return testContentDir; },
    get jwtSecret() { return "integration-test-secret"; },
    jwtExpiresIn: "1h",
    get uploadDir() { return testUploadDir; },
    siteTitle: "Test CMS",
  },
}));

// Imports after mocks
import { pages } from "../../src/api/pages.js";
import { pagesWrite } from "../../src/api/pages-write.js";
import { authRouter } from "../../src/api/auth.js";
import { media } from "../../src/api/media.js";
import { apiAuthGuard } from "../../src/admin/middleware.js";

function buildApp() {
  const app = new Hono();
  app.route("/api/auth", authRouter);
  app.route("/api/pages", pages);
  app.route("/api/pages", pagesWrite);
  app.use("/api/media/*", apiAuthGuard);
  app.route("/api/media", media);
  return app;
}

function applySchema(db: ReturnType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT    NOT NULL UNIQUE,
      title       TEXT    NOT NULL,
      description TEXT,
      tags        TEXT,
      draft       INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS media (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT    NOT NULL UNIQUE,
      mime_type   TEXT    NOT NULL,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      alt_text    TEXT,
      uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'editor',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login    INTEGER
    );
  `);
}

beforeEach(() => {
  testDb = new Database(":memory:");
  applySchema(testDb);

  testUploadDir = join(tmpdir(), `vlcms-integration-${Date.now()}`);
  mkdirSync(testUploadDir, { recursive: true });

  testContentDir = join(tmpdir(), `vlcms-integration-content-${Date.now()}`);
  mkdirSync(testContentDir, { recursive: true });

  // Seed admin user
  const hash = bcrypt.hashSync("secret123", 4);
  testDb.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(
    "admin@test.com", hash, "admin"
  );
});

afterEach(() => {
  testDb.close();
  if (existsSync(testUploadDir)) rmSync(testUploadDir, { recursive: true });
  if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
});

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe("E2E: pages create -> list -> media upload -> list -> delete", () => {
  it("walks the full workflow and validates inner response shapes", async () => {
    const app = buildApp();

    // Step 1: Login -> JWT
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "secret123" }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = await json<{ data: { token: string; userId: string; role: string } }>(loginRes);
    const token = loginBody.data.token;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const auth = { Authorization: `Bearer ${token}` };

    // Step 2: Create page (draft)
    const createRes = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({
        title: "Integration Test Page",
        content: "# Hello\nThis is content.",
        status: "draft",
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await json<{ data: { slug: string; draft: boolean } }>(createRes);
    const slug = createBody.data.slug;
    expect(typeof slug).toBe("string");
    expect(createBody.data.draft).toBe(true);

    // Step 3: Publish page
    const updateRes = await app.request(`/api/pages/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ draft: false }),
    });
    expect(updateRes.status).toBe(200);
    const updateBody = await json<{ data: { draft: boolean } }>(updateRes);
    expect(updateBody.data.draft).toBe(false);

    // Step 4: List pages -- verify { items, pagination } shape
    // This assertion would have caught the CLI bug:
    // CLI was treating `data` as PageListItem[] directly -- but data is { items, pagination }
    const listPagesRes = await app.request("/api/pages");
    expect(listPagesRes.status).toBe(200);
    const listPagesBody = await json<{
      data: {
        items: Array<{ slug: string; title: string; createdAt: number }>;
        pagination: { limit: number; offset: number; total: number };
      };
    }>(listPagesRes);
    expect(Array.isArray(listPagesBody.data.items)).toBe(true);
    expect(listPagesBody.data.items).toHaveLength(1);
    expect(listPagesBody.data.items[0].slug).toBe(slug);
    expect(listPagesBody.data.pagination.total).toBe(1);

    // Step 5: Upload media
    const imgBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const form = new FormData();
    form.append("file", new Blob([imgBytes], { type: "image/png" }), "test.png");
    form.append("alt_text", "A test image");

    const uploadRes = await app.request("/api/media/upload", {
      method: "POST",
      headers: auth,
      body: form,
    });
    expect(uploadRes.status).toBe(201);
    const uploadBody = await json<{ data: { id: number; filename: string; url: string } }>(uploadRes);
    const mediaId = uploadBody.data.id;
    expect(typeof mediaId).toBe("number");
    expect(uploadBody.data.filename).toContain("test");

    // Step 6: List media -- verify { items, total } shape
    // Same category of bug: CLI was treating data as MediaItem[] directly
    const listMediaRes = await app.request("/api/media", { headers: auth });
    expect(listMediaRes.status).toBe(200);
    const listMediaBody = await json<{
      data: {
        items: Array<{ id: number; filename: string; mime_type: string }>;
        total: number;
      };
    }>(listMediaRes);
    expect(Array.isArray(listMediaBody.data.items)).toBe(true);
    expect(listMediaBody.data.items).toHaveLength(1);
    expect(listMediaBody.data.items[0].id).toBe(mediaId);
    expect(listMediaBody.data.total).toBe(1);

    // Step 7: Delete media
    const deleteRes = await app.request(`/api/media/${mediaId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleteRes.status).toBe(200);

    // Step 8: List media -- empty after delete
    const listAfterDeleteRes = await app.request("/api/media", { headers: auth });
    const listAfterBody = await json<{ data: { items: unknown[]; total: number } }>(listAfterDeleteRes);
    expect(listAfterBody.data.items).toHaveLength(0);
    expect(listAfterBody.data.total).toBe(0);
  });
});
