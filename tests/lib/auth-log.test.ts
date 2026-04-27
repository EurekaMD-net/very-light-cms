/**
 * tests/lib/auth-log.test.ts — auth_log writes happen on each branch.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

process.env.JWT_SECRET = "auth-log-test-secret";
process.env.DB_PATH = ":memory:";
process.env.CONTENT_DIR = "/tmp/vlcms-auth-log-test";
// XFF parsing is gated on TRUST_PROXY in the audited build. Tests rely on
// XFF for synthetic IP attribution, so opt in.
process.env.TRUST_PROXY = "true";

import { authRouter } from "../../src/api/auth.js";
import { getDatabase, closeDatabase } from "../../src/db/database.js";
import { hashPassword } from "../../src/lib/auth.js";
import { __resetRateLimitForTests } from "../../src/lib/rate-limit.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const contentDir = "/tmp/vlcms-auth-log-test";

function buildApp() {
  const app = new Hono();
  app.route("/api/auth", authRouter);
  return app;
}

beforeEach(async () => {
  __resetRateLimitForTests();
  closeDatabase();
  if (existsSync(contentDir)) rmSync(contentDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  // Initialize schema by touching the DB
  const db = getDatabase();
  const hash = await hashPassword("secret123");
  db.prepare(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
  ).run("admin@test.com", hash, "admin");
});

afterEach(() => {
  closeDatabase();
  if (existsSync(contentDir)) rmSync(contentDir, { recursive: true });
});

function rows() {
  return getDatabase()
    .prepare("SELECT email, ip, success, reason FROM auth_log ORDER BY id")
    .all() as Array<{
    email: string | null;
    ip: string | null;
    success: number;
    reason: string;
  }>;
}

describe("auth_log writes via /api/auth/login", () => {
  it("logs success on valid credentials", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({ email: "admin@test.com", password: "secret123" }),
    });
    expect(res.status).toBe(200);

    const log = rows();
    expect(log).toHaveLength(1);
    expect(log[0]?.success).toBe(1);
    expect(log[0]?.reason).toBe("ok");
    expect(log[0]?.email).toBe("admin@test.com");
    expect(log[0]?.ip).toBe("1.2.3.4");
  });

  it("logs invalid_credentials on wrong password", async () => {
    const app = buildApp();
    await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "9.9.9.9",
      },
      body: JSON.stringify({ email: "admin@test.com", password: "wrong" }),
    });
    const log = rows();
    expect(log).toHaveLength(1);
    expect(log[0]?.success).toBe(0);
    expect(log[0]?.reason).toBe("invalid_credentials");
    expect(log[0]?.email).toBe("admin@test.com");
  });

  it("logs invalid_credentials when user does not exist", async () => {
    const app = buildApp();
    await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.com", password: "x" }),
    });
    const log = rows();
    expect(log).toHaveLength(1);
    expect(log[0]?.success).toBe(0);
    expect(log[0]?.reason).toBe("invalid_credentials");
  });

  it("logs validation on malformed body", async () => {
    const app = buildApp();
    await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "x" }),
    });
    const log = rows();
    expect(log).toHaveLength(1);
    expect(log[0]?.success).toBe(0);
    expect(log[0]?.reason).toBe("validation");
    expect(log[0]?.email).toBeNull();
  });

  it("logs rate_limited when limiter fires", async () => {
    const app = buildApp();
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "5.5.5.5",
    };
    const body = JSON.stringify({
      email: "admin@test.com",
      password: "wrong",
    });
    for (let i = 0; i < 5; i++) {
      await app.request("/api/auth/login", { method: "POST", headers, body });
    }
    const trip = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body,
    });
    expect(trip.status).toBe(429);

    const log = rows();
    // 5 failed credential attempts + 1 rate-limited
    expect(log.length).toBeGreaterThanOrEqual(6);
    const lastReason = log[log.length - 1]?.reason;
    expect(lastReason).toBe("rate_limited");
  });
});
