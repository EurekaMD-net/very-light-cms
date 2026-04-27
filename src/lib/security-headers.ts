import type { Context, Next } from "hono";

/**
 * Security headers applied to every response.
 *
 * CSP notes:
 * - script-src 'self' 'unsafe-inline': admin views use inline onsubmit confirms.
 *   Future tightening: replace with hashed scripts and remove 'unsafe-inline'.
 * - style-src 'self' 'unsafe-inline': themes inline a single <style> block.
 * - img-src 'self' data:: allows inline data: URIs (e.g. embedded SVG previews
 *   are blocked elsewhere by the MIME allowlist; data: is for small inline images).
 * - script-src does NOT include 'unsafe-eval': blocks eval / new Function.
 * - frame-ancestors 'none': clickjacking defense (also enforced by X-Frame-Options
 *   for older browsers).
 * - object-src 'none': blocks <object>/<embed>.
 * - base-uri 'self': prevents <base> tag injection redirecting relative URLs.
 */
const HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

export async function securityHeaders(c: Context, next: Next): Promise<void> {
  await next();
  for (const [key, val] of Object.entries(HEADERS)) {
    c.res.headers.set(key, val);
  }
}
