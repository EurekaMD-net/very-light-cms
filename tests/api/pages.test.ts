import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { pages } from "../../src/api/pages.js";
import { pagesWrite } from "../../src/api/pages-write.js";
import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Test DB + config isolation ─────────────────────────────────────────────────

let testDb: ReturnType<typeof Database>;
let testContentDir: string;

vi.mock("../../src/db/database.js", () => ({
  getDatabase: () => testDb,
}));

vi.mock("../../src/config.js", () => ({
  config: {
    port: 3000,
    dbPath: ":memory:",
    get contentDir() {
      return testContentDir;
    },
  },
}));

// ── App under test ─────────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono();
  app.route("/api/pages", pages);
  app.route("/api/pages", pagesWrite);
  return app;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function seedPage(
  slug: string,
  title: string,
  draft = 0,
  offset = 0,
): void {
  testDb.prepare(
    `INSERT INTO pages (slug, title, description, tags, draft, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, ?, unixepoch() + ?, unixepoch() + ?)`,
  ).run(slug, title, draft, offset, offset);
}

function writeFixture(slug: string, title: string, body = "Hello world.") {
  const md = `---\ntitle: "${title}"\nslug: "${slug}"\ndraft: false\n---\n${body}`;
  writeFileSync(join(testContentDir, `${slug}.md`), md, "utf-8");
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  // Fresh in-memory DB for each test
  testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");

  const schema = readFileSync(
    new URL("../../src/db/schema.sql", import.meta.url),
    "utf-8",
  );
  testDb.exec(schema);

  // Temp content dir
  testContentDir = join(tmpdir(), `vlcms-test-${Date.now()}`);
  mkdirSync(testContentDir, { recursive: true });
});

afterEach(() => {
  testDb.close();
  if (existsSync(testContentDir)) {
    rmSync(testContentDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

// ── GET /api/pages ─────────────────────────────────────────────────────────────

describe("GET /api/pages", () => {
  it("returns empty list when no pages exist", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages");
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { items: unknown[]; pagination: { total: number } } };
    expect(body.data.items).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
  });

  it("returns only published pages (draft=0)", async () => {
    seedPage("pub", "Published", 0, 0);
    seedPage("dft", "Draft", 1, 1);

    const app = buildApp();
    const res = await app.request("/api/pages");
    const body = await res.json() as { data: { items: Array<{ slug: string }>; pagination: { total: number } } };

    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]?.slug).toBe("pub");
    expect(body.data.pagination.total).toBe(1);
  });

  it("paginates with limit and offset", async () => {
    // Insert 5 pages with distinct offsets so ordering is deterministic
    for (let i = 0; i < 5; i++) {
      seedPage(`page-${i}`, `Page ${i}`, 0, i);
    }

    const app = buildApp();
    const res = await app.request("/api/pages?limit=2&offset=0");
    const body = await res.json() as { data: { items: unknown[]; pagination: { limit: number; offset: number; total: number } } };

    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination.limit).toBe(2);
    expect(body.data.pagination.offset).toBe(0);
    expect(body.data.pagination.total).toBe(5);
  });

  it("caps limit at 100", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages?limit=9999");
    const body = await res.json() as { data: { pagination: { limit: number } } };
    expect(body.data.pagination.limit).toBe(100);
  });

  it("returns pages in descending created_at order", async () => {
    seedPage("oldest", "Oldest", 0, 0);
    seedPage("newest", "Newest", 0, 10);

    const app = buildApp();
    const res = await app.request("/api/pages");
    const body = await res.json() as { data: { items: Array<{ slug: string }> } };

    expect(body.data.items[0]?.slug).toBe("newest");
    expect(body.data.items[1]?.slug).toBe("oldest");
  });
});

// ── GET /api/pages/:slug ───────────────────────────────────────────────────────

describe("GET /api/pages/:slug", () => {
  it("returns 404 for unknown slug", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 404 for draft pages", async () => {
    seedPage("secret", "Secret", 1);

    const app = buildApp();
    const res = await app.request("/api/pages/secret");
    expect(res.status).toBe(404);
  });

  it("returns rendered HTML for a published page with file", async () => {
    seedPage("about", "About", 0);

    // Write matching .md fixture
    const md = `---\ntitle: "About"\nslug: "about"\ndraft: false\n---\n# About\n\nWelcome.`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(testContentDir, "about.md"), md, "utf-8");

    const app = buildApp();
    const res = await app.request("/api/pages/about");
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { slug: string; html: string; title: string } };
    expect(body.data.slug).toBe("about");
    expect(body.data.title).toBe("About");
    expect(body.data.html).toContain("<h1");
    expect(body.data.html).toContain("Welcome");
  });

  it("returns 404 when DB row exists but file is missing", async () => {
    seedPage("orphan", "Orphan", 0);
    // No file written

    const app = buildApp();
    const res = await app.request("/api/pages/orphan");
    expect(res.status).toBe(404);
  });
});

// ── POST /api/pages ────────────────────────────────────────────────────────────

describe("POST /api/pages", () => {
  it("creates a page and returns 201", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hello World", body: "First post." }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { slug: string; title: string; draft: boolean } };
    expect(body.data.slug).toBe("hello-world");
    expect(body.data.title).toBe("Hello World");
    expect(body.data.draft).toBe(true); // safe default

    // File should exist on disk
    const filePath = join(testContentDir, "hello-world.md");
    expect(existsSync(filePath)).toBe(true);
  });

  it("uses provided slug (slugified)", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Any Title", slug: "My Custom Slug" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { slug: string } };
    expect(body.data.slug).toBe("my-custom-slug");
  });

  it("returns 409 on duplicate slug", async () => {
    seedPage("hello-world", "Hello World", 0);

    const app = buildApp();
    const res = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hello World" }),
    });

    expect(res.status).toBe(409);
  });

  it("returns 400 when title is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "No title here." }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });
});

// ── PUT /api/pages/:slug ───────────────────────────────────────────────────────

describe("PUT /api/pages/:slug", () => {
  it("updates title and body", async () => {
    seedPage("about", "About", 0);
    const md = `---\ntitle: "About"\nslug: "about"\ndraft: false\n---\nOld body.`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(testContentDir, "about.md"), md, "utf-8");

    const app = buildApp();
    const res = await app.request("/api/pages/about", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "About Us", body: "New body." }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { title: string } };
    expect(body.data.title).toBe("About Us");
  });

  it("returns 404 for unknown slug", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Ghost" }),
    });

    expect(res.status).toBe(404);
  });

  it("publishes a draft (draft: false)", async () => {
    seedPage("draft-post", "Draft Post", 1);

    const app = buildApp();
    const res = await app.request("/api/pages/draft-post", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: false }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { draft: boolean } };
    expect(body.data.draft).toBe(false);

    // Verify it now appears in GET list
    const listRes = await app.request("/api/pages");
    const listBody = await listRes.json() as { data: { items: Array<{ slug: string }> } };
    expect(listBody.data.items.some((p) => p.slug === "draft-post")).toBe(true);
  });
});

// ── DELETE /api/pages/:slug ────────────────────────────────────────────────────

describe("DELETE /api/pages/:slug", () => {
  it("soft-deletes by default (page becomes draft)", async () => {
    seedPage("to-hide", "To Hide", 0);

    const app = buildApp();
    const res = await app.request("/api/pages/to-hide", { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { permanent: boolean } };
    expect(body.data.permanent).toBe(false);

    // Page is now invisible in public list
    const listRes = await app.request("/api/pages");
    const listBody = await listRes.json() as { data: { items: Array<{ slug: string }> } };
    expect(listBody.data.items.some((p) => p.slug === "to-hide")).toBe(false);
  });

  it("hard-deletes with ?permanent=true", async () => {
    seedPage("to-delete", "To Delete", 0);
    const md = `---\ntitle: "To Delete"\nslug: "to-delete"\ndraft: false\n---\nGone.`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(testContentDir, "to-delete.md"), md, "utf-8");

    const app = buildApp();
    const res = await app.request("/api/pages/to-delete?permanent=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { permanent: boolean } };
    expect(body.data.permanent).toBe(true);

    // File should be gone
    expect(existsSync(join(testContentDir, "to-delete.md"))).toBe(false);

    // DB row should be gone — 404 on next GET
    const getRes = await app.request("/api/pages/to-delete");
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for unknown slug", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages/ghost", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
