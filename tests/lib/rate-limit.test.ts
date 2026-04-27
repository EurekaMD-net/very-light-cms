/**
 * tests/lib/rate-limit.test.ts
 * Sliding-window rate limiter contract tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  rateLimit,
  __resetRateLimitForTests,
} from "../../src/lib/rate-limit.js";

const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;
beforeEach(() => __resetRateLimitForTests());
afterEach(() => {
  if (ORIGINAL_TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
});

function buildApp(maxAttempts: number, windowMs: number) {
  const app = new Hono();
  app.use(
    "/login",
    rateLimit({
      max: maxAttempts,
      windowMs,
      keyFn: (c) => c.req.header("x-test-ip") ?? "default",
    }),
  );
  app.post("/login", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  it("allows requests up to the cap", async () => {
    const app = buildApp(3, 60_000);
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/login", {
        method: "POST",
        headers: { "x-test-ip": "1.2.3.4" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 + Retry-After once the cap is exceeded", async () => {
    const app = buildApp(2, 60_000);
    await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "1.2.3.4" },
    });
    await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "1.2.3.4" },
    });
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(parseInt(retryAfter!, 10)).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("buckets are per-key — separate IPs do not share", async () => {
    const app = buildApp(1, 60_000);
    const a = await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "10.0.0.1" },
    });
    expect(a.status).toBe(200);
    const a2 = await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "10.0.0.1" },
    });
    expect(a2.status).toBe(429);
    const b = await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "10.0.0.2" },
    });
    expect(b.status).toBe(200);
  });

  it("ignores x-forwarded-for when TRUST_PROXY is unset (anti-spoof default)", async () => {
    delete process.env.TRUST_PROXY;
    const app = new Hono();
    app.use("/x", rateLimit({ max: 1, windowMs: 60_000 }));
    app.get("/x", (c) => c.text("ok"));

    // Two requests with different XFF chains MUST share the same bucket
    // because XFF is ignored — they collapse onto the socket-IP fallback ("unknown").
    const a = await app.request("/x", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
    });
    expect(a.status).toBe(200);
    const a2 = await app.request("/x", {
      headers: { "x-forwarded-for": "203.0.113.99, 10.0.0.1" },
    });
    // Same bucket → 429 even with different XFF
    expect(a2.status).toBe(429);
  });

  it("honors x-forwarded-for when TRUST_PROXY=true (left-most IP wins)", async () => {
    process.env.TRUST_PROXY = "true";
    const app = new Hono();
    app.use("/x", rateLimit({ max: 1, windowMs: 60_000 }));
    app.get("/x", (c) => c.text("ok"));

    // Two requests with different XFF chains → different keys
    const a = await app.request("/x", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
    });
    expect(a.status).toBe(200);
    const a2 = await app.request("/x", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.99" },
    });
    expect(a2.status).toBe(429);
    const b = await app.request("/x", {
      headers: { "x-forwarded-for": "203.0.113.2, 10.0.0.1" },
    });
    expect(b.status).toBe(200);
  });

  it("invokes onLimit callback when supplied (HTML response path)", async () => {
    const app = new Hono();
    app.use(
      "/admin",
      rateLimit({
        max: 1,
        windowMs: 60_000,
        keyFn: () => "single",
        onLimit: (c, retry) => c.html(`<p>Try again in ${retry}s</p>`, 429),
      }),
    );
    app.post("/admin", (c) => c.text("ok"));

    await app.request("/admin", { method: "POST" });
    const res = await app.request("/admin", { method: "POST" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("Try again in");
  });

  it("skipOn — successful attempts are uncounted (login limiter pattern)", async () => {
    const app = new Hono();
    app.use(
      "/login",
      rateLimit({
        max: 2,
        windowMs: 60_000,
        keyFn: () => "fixed",
        skipOn: (c) => c.res.status >= 200 && c.res.status < 300,
      }),
    );
    let nextStatus = 200;
    app.post("/login", (c) => c.text("x", nextStatus as 200));

    // Three "successful" logins in a row should NOT trip the cap because
    // skipOn pops the slot back off after each handler.
    for (let i = 0; i < 3; i++) {
      const r = await app.request("/login", { method: "POST" });
      expect(r.status).toBe(200);
    }

    // Now flip to failing — first two add real entries, third should 429.
    nextStatus = 401;
    expect((await app.request("/login", { method: "POST" })).status).toBe(401);
    expect((await app.request("/login", { method: "POST" })).status).toBe(401);
    expect((await app.request("/login", { method: "POST" })).status).toBe(429);
  });

  it("aged-out attempts allow new requests through", async () => {
    // Use a short window to avoid timing flakiness — 1ms after the call
    // every attempt is already aged out.
    const app = buildApp(1, 1);
    await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "5.5.5.5" },
    });
    // Wait long enough for window to expire
    await new Promise((r) => setTimeout(r, 5));
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-test-ip": "5.5.5.5" },
    });
    expect(res.status).toBe(200);
  });
});
