import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Env isolation (must be before all imports that read process.env) ──────────
process.env.JWT_SECRET = "test-secret-media";

// ── Test DB + dirs ─────────────────────────────────────────────────────────────

let testDb: ReturnType<typeof Database>;
let testUploadDir: string;

vi.mock("../../src/db/database.js", () => ({
  getDatabase: () => testDb,
}));

vi.mock("../../src/config.js", () => ({
  config: {
    port: 3000,
    dbPath: ":memory:",
    get contentDir() { return "/tmp/vlcms-media-content"; },
    get jwtSecret() { return "test-secret-media"; },
    jwtExpiresIn: "1h",
    get uploadDir() { return testUploadDir; },
  },
}));

// ── App under test (import AFTER mocks) ───────────────────────────────────────
import { media } from "../../src/api/media.js";
import { signToken } from "../../src/lib/auth.js";

function buildApp() {
  const app = new Hono();
  app.route("/api/media", media);
  return app;
}

function authHeader(): { Authorization: string } {
  const token = signToken("1", "admin");
  return { Authorization: `Bearer ${token}` };
}

// ── Schema ─────────────────────────────────────────────────────────────────────
function applySchema(db: ReturnType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT    NOT NULL UNIQUE,
      mime_type   TEXT    NOT NULL,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      alt_text    TEXT,
      uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

// ── Setup / teardown ───────────────────────────────────────────────────────────
beforeEach(() => {
  testDb = new Database(":memory:");
  applySchema(testDb);
  testUploadDir = join(tmpdir(), `vlcms-media-test-${Date.now()}`);
  mkdirSync(testUploadDir, { recursive: true });
});

afterEach(() => {
  testDb.close();
  if (existsSync(testUploadDir)) {
    rmSync(testUploadDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type });
}

async function uploadFile(app: Hono, file: File, altText?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (altText) fd.append("alt_text", altText);
  return app.request("/api/media/upload", {
    method: "POST",
    headers: authHeader(),
    body: fd,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("GET /api/media", () => {
  it("returns empty list when no media", async () => {
    const res = await buildApp().request("/api/media", { headers: authHeader() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await buildApp().request("/api/media");
    expect(res.status).toBe(401);
  });

  it("returns uploaded files with url", async () => {
    testDb.prepare("INSERT INTO media (filename, mime_type, size_bytes) VALUES (?, ?, ?)").run("photo.jpg", "image/jpeg", 1024);
    const res = await buildApp().request("/api/media", { headers: authHeader() });
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].url).toBe("/media/photo.jpg");
  });
});

describe("POST /api/media/upload", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp();
    const fd = new FormData();
    fd.append("file", makeFile("test.png", "data", "image/png"));
    const res = await app.request("/api/media/upload", { method: "POST", body: fd });
    expect(res.status).toBe(401);
  });

  it("returns 400 when file field missing", async () => {
    const fd = new FormData();
    const res = await buildApp().request("/api/media/upload", {
      method: "POST",
      headers: authHeader(),
      body: fd,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing file/i);
  });

  it("returns 400 for disallowed mime type", async () => {
    const res = await uploadFile(buildApp(), makeFile("script.js", "alert(1)", "text/javascript"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unsupported file type/i);
  });

  it("uploads image and returns 201 with url", async () => {
    const res = await uploadFile(buildApp(), makeFile("hero.png", "PNG_DATA", "image/png"), "Hero image");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.mime_type).toBe("image/png");
    expect(body.data.alt_text).toBe("Hero image");
    expect(body.data.url).toMatch(/^\/media\//);
    // File should exist on disk
    expect(existsSync(join(testUploadDir, body.data.filename))).toBe(true);
  });

  it("persists media row in DB", async () => {
    await uploadFile(buildApp(), makeFile("doc.pdf", "%PDF-data", "application/pdf"));
    const row = testDb.prepare("SELECT * FROM media").get() as { mime_type: string };
    expect(row.mime_type).toBe("application/pdf");
  });

  it("sanitizes filename (removes path traversal)", async () => {
    const res = await uploadFile(buildApp(), makeFile("../../evil.png", "data", "image/png"));
    expect(res.status).toBe(201);
    const body = await res.json();
    // Stored filename must not contain ..
    expect(body.data.filename).not.toContain("..");
    expect(body.data.filename).not.toContain("/");
  });
});

describe("DELETE /api/media/:id", () => {
  it("returns 401 without auth", async () => {
    testDb.prepare("INSERT INTO media (filename, mime_type, size_bytes) VALUES (?, ?, ?)").run("f.png", "image/png", 100);
    const res = await buildApp().request("/api/media/1", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown id", async () => {
    const res = await buildApp().request("/api/media/999", {
      method: "DELETE",
      headers: authHeader(),
    });
    expect(res.status).toBe(404);
  });

  it("deletes file from disk and DB", async () => {
    // Upload first to get a real file
    const uploadRes = await uploadFile(buildApp(), makeFile("todelete.png", "data", "image/png"));
    const uploaded = await uploadRes.json();
    const id = uploaded.data.id;
    const filename = uploaded.data.filename;

    expect(existsSync(join(testUploadDir, filename))).toBe(true);

    const delRes = await buildApp().request(`/api/media/${id}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    expect(delRes.status).toBe(200);
    const body = await delRes.json();
    expect(body.data.deleted).toBe(true);

    // File gone from disk
    expect(existsSync(join(testUploadDir, filename))).toBe(false);
    // Row gone from DB
    const row = testDb.prepare("SELECT id FROM media WHERE id = ?").get(id);
    expect(row).toBeUndefined();
  });
});

describe("LocalDriver read — path traversal containment", () => {
  it("throws (not serve) when filename escapes uploadDir via ../", async () => {
    const { LocalDriver } = await import("../../src/lib/storage.js");
    const driver = new LocalDriver(testUploadDir);
    // URL-decoded traversal — must throw, never serve the file
    await expect(driver.read("../../etc/passwd")).rejects.toThrow();
  });

  it("throws for absolute path used as filename", async () => {
    const { LocalDriver } = await import("../../src/lib/storage.js");
    const driver = new LocalDriver(testUploadDir);
    await expect(driver.read("/etc/passwd")).rejects.toThrow();
  });
});
