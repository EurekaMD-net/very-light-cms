import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { admin } from "../../src/admin/router.js";
import { getDatabase, closeDatabase } from "../../src/db/database.js";
import { hashPassword } from "../../src/lib/auth.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";

process.env.DB_PATH = ":memory:";
const testContentDir = "/tmp/vlcms-admin-test-content";
process.env.CONTENT_DIR = testContentDir;

function buildApp() {
  const app = new Hono();
  app.route("/admin", admin);
  return app;
}

async function seedUser(email: string, password: string, role = "admin") {
  const db = getDatabase();
  const hash = await hashPassword(password);
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(
    email,
    hash,
    role
  );
}

async function loginAndGetCookie(app: Hono, email: string, password: string): Promise<string> {
  const res = await app.request("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
  });
  const cookie = res.headers.get("set-cookie") ?? "";
  const match = cookie.match(/token=([^;]+)/);
  return match?.[1] ?? "";
}

describe("GET /admin/login", () => {
  it("returns 200 with login form", async () => {
    const app = buildApp();
    const res = await app.request("/admin/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("form");
    expect(html).toContain("email");
    expect(html).toContain("password");
  });
});

describe("POST /admin/login", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("redirects to /admin on successful login", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const res = await app.request("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "admin@test.com", password: "pass123" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/token=/);
  });

  it("returns 401 HTML on wrong password", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const res = await app.request("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "admin@test.com", password: "wrong" }).toString(),
    });
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("Invalid");
  });
});

describe("GET /admin (dashboard)", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("redirects to login when no cookie", async () => {
    const app = buildApp();
    const res = await app.request("/admin");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("returns 200 pages list with valid cookie", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const token = await loginAndGetCookie(app, "admin@test.com", "pass123");

    const res = await app.request("/admin", {
      headers: { Cookie: `token=${token}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Pages");
  });
});

describe("GET /admin/pages/new", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("requires auth — redirects without cookie", async () => {
    const app = buildApp();
    const res = await app.request("/admin/pages/new");
    expect(res.status).toBe(302);
  });

  it("returns 200 new page form with valid cookie", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const token = await loginAndGetCookie(app, "admin@test.com", "pass123");
    const res = await app.request("/admin/pages/new", {
      headers: { Cookie: `token=${token}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("New Page");
  });
});

describe("POST /admin/pages (create)", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("creates a page and redirects to /admin", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const token = await loginAndGetCookie(app, "admin@test.com", "pass123");

    const res = await app.request("/admin/pages", {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        title: "My New Page",
        slug: "",
        description: "",
        tags: "",
        body: "Hello world",
        draft: "1",
      }).toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");

    // Verify page exists in DB
    const db = getDatabase();
    const page = db.prepare("SELECT * FROM pages WHERE slug = ?").get("my-new-page") as { title: string } | undefined;
    expect(page?.title).toBe("My New Page");
  });

  it("returns 409 on duplicate slug", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const token = await loginAndGetCookie(app, "admin@test.com", "pass123");

    const form = new URLSearchParams({ title: "Dup Page", slug: "", description: "", tags: "", body: "x", draft: "1" }).toString();
    const headers = { Cookie: `token=${token}`, "Content-Type": "application/x-www-form-urlencoded" };

    await app.request("/admin/pages", { method: "POST", headers, body: form });
    const res2 = await app.request("/admin/pages", { method: "POST", headers, body: form });
    expect(res2.status).toBe(409);
  });
});

describe("POST /admin/pages/:slug/publish", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("sets draft=0 and redirects", async () => {
    await seedUser("admin@test.com", "pass123");
    const app = buildApp();
    const token = await loginAndGetCookie(app, "admin@test.com", "pass123");

    // Create a draft page first
    await app.request("/admin/pages", {
      method: "POST",
      headers: { Cookie: `token=${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title: "To Publish", slug: "to-publish", description: "", tags: "", body: "content", draft: "1" }).toString(),
    });

    const pubRes = await app.request("/admin/pages/to-publish/publish", {
      method: "POST",
      headers: { Cookie: `token=${token}` },
    });
    expect(pubRes.status).toBe(302);

    const db = getDatabase();
    const page = db.prepare("SELECT draft FROM pages WHERE slug = ?").get("to-publish") as { draft: number } | undefined;
    expect(page?.draft).toBe(0);
  });
});

describe("GET /admin/logout", () => {
  it("clears cookie and redirects to login", async () => {
    const app = buildApp();
    const res = await app.request("/admin/logout");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login");
  });
});
