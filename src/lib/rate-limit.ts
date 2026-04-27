import type { Context, Next } from "hono";
import { fail } from "./response.js";
import { clientIp } from "./client-ip.js";

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
  /**
   * If supplied, called AFTER the handler runs. When it returns true the
   * attempt is uncounted (popped back off the bucket). Use case: only count
   * failed login attempts, not successful logins. The handler decides what
   * "success" means (typically c.res.status < 400).
   */
  skipOn?: (c: Context) => boolean;
}

/** Per-key timestamp arrays. Cleared as entries age out. */
const buckets = new Map<string, number[]>();

/** Reset all in-memory state — for tests only. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

/**
 * Periodic janitor: prunes keys whose attempt arrays are empty after aging out.
 * Bounds memory growth from one-off attackers spoofing IPs (or any natural
 * IP turnover). Runs at most once every PRUNE_INTERVAL_MS.
 */
const PRUNE_INTERVAL_MS = 60_000;
let lastPruneAt = 0;
function maybePrune(now: number, windowMs: number): void {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  const cutoff = now - windowMs;
  for (const [key, attempts] of buckets) {
    const fresh = attempts.filter((t) => t > cutoff);
    if (fresh.length === 0) buckets.delete(key);
    else if (fresh.length !== attempts.length) buckets.set(key, fresh);
  }
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowMs, keyFn = clientIp, onLimit, skipOn } = options;

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = keyFn(c);
    const now = Date.now();
    const cutoff = now - windowMs;

    maybePrune(now, windowMs);

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

    // Tentatively reserve a slot, then run the handler. If skipOn says this
    // attempt should NOT count (e.g. successful login), pop it back off.
    fresh.push(now);
    buckets.set(key, fresh);

    await next();

    if (skipOn && skipOn(c)) {
      const arr = buckets.get(key);
      if (arr) {
        const idx = arr.lastIndexOf(now);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) buckets.delete(key);
      }
    }
  };
}
