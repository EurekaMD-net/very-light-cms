import type { Context } from "hono";
import { config } from "../config.js";

/**
 * Extract the client IP for rate-limiting / audit-log attribution.
 *
 * SECURITY: X-Forwarded-For is honored only when TRUST_PROXY=true is set.
 * Otherwise it's ignored entirely and we read the raw socket address. This
 * prevents an attacker from rotating XFF headers per request to bypass the
 * rate limiter. Set TRUST_PROXY=true ONLY when the CMS runs behind a proxy
 * (Caddy / nginx) that sets XFF to the real connecting IP.
 *
 * Falls back to "unknown" when the socket address is unavailable (rare —
 * indicates an unusual Hono adapter).
 */
export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } };
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}
