import type { Context, Next } from "hono";
import { fail } from "./response.js";

/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks attempts per key (typically IP) within a window. When the cap is
 * exceeded, returns 429 with Retry-After header indicating seconds until
 * the oldest attempt ages out of the window.
 *
 * Process-local: counters reset on restart and don't share across replicas.
 * For a single-instance CMS this is sufficient. Multi-instance deployments
 * should swap to a Redis-backed driver (same interface).
 */

interface RateLimitOptions {
  /** Max attempts allowed within windowMs. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Function to derive the rate-limit key from the request. Defaults to client IP. */
  keyFn?: (c: Context) => string;
  /**
   * Custom response when the limit is exceeded. Defaults to a JSON 429 via fail().
   * Admin HTML routes pass a callback that re-renders the login view with a flash.
   * Retry-After header is set before this is invoked.
   */
  onLimit?: (c: Context, retryAfterSec: number) => Response | Promise<Response>;
}

/** Per-key timestamp arrays. Cleared as entries age out. */
const buckets = new Map<string, number[]>();

/** Reset all in-memory state — for tests only. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

function defaultKeyFn(c: Context): string {
  // x-forwarded-for honoring (left-most IP) when behind a reverse proxy,
  // falling back to Hono's connecting-IP. Hono's adapter shape for the
  // raw socket is not in the public type surface, so we read it via an
  // untyped traversal. The "unknown" fallback bucket is shared but rare.
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } };
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowMs, keyFn = defaultKeyFn, onLimit } = options;

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = keyFn(c);
    const now = Date.now();
    const cutoff = now - windowMs;

    const attempts = buckets.get(key) ?? [];
    // Drop attempts outside the window
    const fresh = attempts.filter((t) => t > cutoff);

    if (fresh.length >= max) {
      const oldest = fresh[0]!;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000),
      );
      c.header("Retry-After", String(retryAfterSec));
      if (onLimit) return onLimit(c, retryAfterSec);
      return fail(c, "Too many attempts. Try again later.", 429);
    }

    fresh.push(now);
    buckets.set(key, fresh);

    await next();
  };
}
