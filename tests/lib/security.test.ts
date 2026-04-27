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

describe("config.trustProxy + clientIp anti-spoof", () => {
  it("ignores X-Forwarded-For by default (TRUST_PROXY unset)", async () => {
    delete process.env.TRUST_PROXY;
    const { Hono } = await import("hono");
    const { clientIp } = await import("../../src/lib/client-ip.js");

    const app = new Hono();
    app.get("/ip", (c) => c.text(clientIp(c)));
    const res = await app.request("/ip", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const ip = await res.text();
    expect(ip).not.toBe("1.2.3.4");
    expect(ip).toBe("unknown"); // no socket in test adapter
  });

  it("honors X-Forwarded-For when TRUST_PROXY=true", async () => {
    process.env.TRUST_PROXY = "true";
    const { Hono } = await import("hono");
    const { clientIp } = await import("../../src/lib/client-ip.js");

    const app = new Hono();
    app.get("/ip", (c) => c.text(clientIp(c)));
    const res = await app.request("/ip", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    const ip = await res.text();
    expect(ip).toBe("1.2.3.4");
    delete process.env.TRUST_PROXY;
  });
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

  it("Secure=true by default (no env override)", () => {
    delete process.env.NODE_ENV;
    expect(authCookieOptions().secure).toBe(true);
  });

  it("Secure=true in production", () => {
    process.env.NODE_ENV = "production";
    expect(authCookieOptions().secure).toBe(true);
  });

  it("Secure=true even in development (was a footgun before — must opt out explicitly)", () => {
    process.env.NODE_ENV = "development";
    expect(authCookieOptions().secure).toBe(true);
  });

  it("COOKIE_SECURE=false forces off (only escape hatch for local HTTP dev)", () => {
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
