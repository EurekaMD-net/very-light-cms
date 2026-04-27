/**
 * tests/lib/security.test.ts
 * Cookie + security-headers contract tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

process.env.JWT_SECRET = "security-test-secret";

import { authCookieOptions } from "../../src/lib/cookie.js";
import { securityHeaders } from "../../src/lib/security-headers.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_COOKIE_SECURE = process.env.COOKIE_SECURE;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_COOKIE_SECURE === undefined) {
    delete process.env.COOKIE_SECURE;
  } else {
    process.env.COOKIE_SECURE = ORIGINAL_COOKIE_SECURE;
  }
});

describe("authCookieOptions", () => {
  beforeEach(() => {
    delete process.env.COOKIE_SECURE;
  });

  it("returns httpOnly + Strict + path / + 8h maxAge", () => {
    const o = authCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("Strict");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(60 * 60 * 8);
  });

  it("Secure=false in development", () => {
    process.env.NODE_ENV = "development";
    expect(authCookieOptions().secure).toBe(false);
  });

  it("Secure=true in production", () => {
    process.env.NODE_ENV = "production";
    expect(authCookieOptions().secure).toBe(true);
  });

  it("COOKIE_SECURE=true forces on regardless of NODE_ENV", () => {
    process.env.NODE_ENV = "development";
    process.env.COOKIE_SECURE = "true";
    expect(authCookieOptions().secure).toBe(true);
  });

  it("COOKIE_SECURE=false forces off regardless of NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    process.env.COOKIE_SECURE = "false";
    expect(authCookieOptions().secure).toBe(false);
  });
});

describe("securityHeaders middleware", () => {
  function buildApp() {
    const app = new Hono();
    app.use("*", securityHeaders);
    app.get("/", (c) => c.text("ok"));
    return app;
  }

  it("sets X-Frame-Options: DENY", async () => {
    const res = await buildApp().request("/");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await buildApp().request("/");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Referrer-Policy", async () => {
    const res = await buildApp().request("/");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("sets Content-Security-Policy with frame-ancestors none", async () => {
    const res = await buildApp().request("/");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("sets Permissions-Policy disabling geolocation/microphone/camera", async () => {
    const res = await buildApp().request("/");
    const pp = res.headers.get("Permissions-Policy") ?? "";
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("camera=()");
  });
});
