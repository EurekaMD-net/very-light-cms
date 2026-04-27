import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { authRouter } from "../../src/api/auth.js";
import { admin } from "../../src/admin/router.js";
import { apiAuthGuard } from "../../src/admin/middleware.js";
import { pagesWrite } from "../../src/api/pages-write.js";
import { getDatabase, closeDatabase } from "../../src/db/database.js";
import { hashPassword } from "../../src/lib/auth.js";
import { __resetRateLimitForTests } from "../../src/lib/rate-limit.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// Use in-memory DB + temp content dir for isolation
process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret-for-vitest";
const testContentDir = "/tmp/vlcms-auth-test-content";
process.env.CONTENT_DIR = testContentDir;

function buildApp() {
  const app = new Hono();
  app.route("/api/auth", authRouter);
  app.use("/api/pages", apiAuthGuard);
  app.route("/api/pages", pagesWrite);
  return app;
}

async function seedUser(email: string, password: string, role = "admin") {
  const db = getDatabase();
  const hash = await hashPassword(password);
  db.prepare(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
  ).run(email, hash, role);
}

// Reset the rate limiter between every test in this file so that login
// attempts in one test don't carry over and trip the limit in the next.
beforeEach(() => __resetRateLimitForTests());

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("returns 200 + sets cookie + token in body on valid credentials", async () => {
    await seedUser("admin@test.com", "secret123");
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "secret123" }),
    });
    expect(res.status).toBe(200);
    // Cookie still set (Admin UI uses it)
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    // Token also in JSON body (CLI uses it)
    const body = (await res.json()) as {
      data: { token: string; userId: string; role: string };
    };
    expect(typeof body.data.token).toBe("string");
    expect(body.data.token.length).toBeGreaterThan(0);
    expect(body.data.userId).toBeTruthy();
    expect(body.data.role).toBe("admin");
  });

  it("login response token is a valid JWT", async () => {
    await seedUser("jwt@test.com", "secret123", "editor");
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "jwt@test.com", password: "secret123" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { token: string; role: string };
    };
    // JWT has 3 dot-separated parts
    expect(body.data.token.split(".").length).toBe(3);
    expect(body.data.role).toBe("editor");
  });

  it("returns 401 on wrong password", async () => {
    await seedUser("admin@test.com", "secret123");
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "wrongpass" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it("returns 401 on unknown email", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.com", password: "secret123" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing fields", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid email format", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "secret123" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the token cookie", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    // Cookie cleared: max-age=0 or expires in the past, or token=""
    expect(cookie.toLowerCase()).toMatch(/token=|max-age=0/);
  });
});

describe("POST /api/auth/login — rate limit", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => closeDatabase());

  it("returns 429 + Retry-After after 5 failed attempts in 15min window", async () => {
    await seedUser("admin@test.com", "secret123");
    const app = buildApp();

    // Use a fixed XFF so the rate-limit key is stable across attempts
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.0.2.99",
    };
    const body = JSON.stringify({ email: "admin@test.com", password: "wrong" });

    // 5 failed attempts → all return 401
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers,
        body,
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt → 429
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const json = await res.json();
    expect(json.code).toBe("TOO_MANY_REQUESTS");
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
  });

  it("returns 401 when no cookie", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns userId + role with valid cookie", async () => {
    await seedUser("me@test.com", "pass123", "editor");
    const app = buildApp();

    // Login to get the cookie
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@test.com", password: "pass123" }),
    });
    const cookie = loginRes.headers.get("set-cookie") ?? "";
    const tokenMatch = cookie.match(/token=([^;]+)/);
    const token = tokenMatch?.[1] ?? "";

    const meRes = await app.request("/api/auth/me", {
      headers: { Cookie: `token=${token}` },
    });
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as {
      data: { userId: string; role: string };
    };
    expect(body.data.role).toBe("editor");
    expect(typeof body.data.userId).toBe("string");
  });

  it("returns userId + role with valid Bearer token", async () => {
    await seedUser("bearer@test.com", "pass123", "admin");
    const app = buildApp();

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bearer@test.com", password: "pass123" }),
    });
    const cookie = loginRes.headers.get("set-cookie") ?? "";
    const tokenMatch = cookie.match(/token=([^;]+)/);
    const bearerToken = tokenMatch?.[1] ?? "";

    const meRes = await app.request("/api/auth/me", {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as {
      data: { userId: string; role: string };
    };
    expect(body.data.role).toBe("admin");
    expect(typeof body.data.userId).toBe("string");
  });

  it("returns 401 for Bearer with invalid token", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/me", {
      headers: { Authorization: "Bearer invalidtoken" },
    });
    expect(res.status).toBe(401);
  });
});

describe("API write routes — auth guard", () => {
  beforeEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
    mkdirSync(testContentDir, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testContentDir)) rmSync(testContentDir, { recursive: true });
  });

  it("returns 401 on POST /api/pages without token", async () => {
    const app = buildApp();
    const res = await app.request("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", body: "hello" }),
    });
    expect(res.status).toBe(401);
  });

  it("allows POST /api/pages with valid Bearer token", async () => {
    await seedUser("writer@test.com", "pass123", "editor");
    const app = buildApp();

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "writer@test.com", password: "pass123" }),
    });
    const cookie = loginRes.headers.get("set-cookie") ?? "";
    const tokenMatch = cookie.match(/token=([^;]+)/);
    const bearerToken = tokenMatch?.[1] ?? "";

    const createRes = await app.request("/api/pages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ title: "Guarded Page", body: "content here" }),
    });
    expect(createRes.status).toBe(201);
  });
});
