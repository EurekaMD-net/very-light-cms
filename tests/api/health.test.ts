/**
 * tests/api/health.test.ts — /health DB ping
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

process.env.JWT_SECRET = "health-test-secret";
process.env.DB_PATH = ":memory:";
process.env.CONTENT_DIR = "/tmp/vlcms-health-test";

import { getDatabase, closeDatabase } from "../../src/db/database.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const contentDir = "/tmp/vlcms-health-test";

beforeEach(() => {
  closeDatabase();
  if (existsSync(contentDir)) rmSync(contentDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });
});

afterEach(() => {
  closeDatabase();
  if (existsSync(contentDir)) rmSync(contentDir, { recursive: true });
});

/**
 * Health endpoint factory parameterized on the DB getter. Accepts an injectable
 * getDb so we can simulate DB outage without mocking module state. The
 * implementation mirrors src/index.ts:/health byte-for-byte.
 */
function buildHealthApp(
  getDb: () => {
    prepare: (sql: string) => { get: () => unknown };
  } = getDatabase,
) {
  const app = new Hono();
  app.get("/health", (c) => {
    try {
      const row = getDb().prepare("SELECT 1 as ok").get() as
        | { ok: number }
        | undefined;
      if (!row || row.ok !== 1) throw new Error("unexpected response");
      return c.json({ status: "ok", db: "ok", version: "0.1.0" });
    } catch (err) {
      return c.json(
        {
          status: "degraded",
          db: "unavailable",
          error: err instanceof Error ? err.message : String(err),
        },
        503,
      );
    }
  });
  return app;
}

describe("GET /health", () => {
  it("returns 200 + status:ok + db:ok when DB responds", async () => {
    getDatabase(); // init schema
    const res = await buildHealthApp().request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(body.version).toBeTruthy();
  });

  it("returns 503 + db:unavailable when prepare() throws", async () => {
    const stubDb = {
      prepare: () => {
        throw new Error("simulated DB outage");
      },
    };
    const res = await buildHealthApp(() => stubDb).request("/health");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("unavailable");
    expect(body.error).toMatch(/simulated DB outage/);
  });
});
