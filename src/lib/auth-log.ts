import type { Context } from "hono";
import { getDatabase } from "../db/database.js";

export type AuthLogReason =
  | "ok"
  | "invalid_credentials"
  | "rate_limited"
  | "validation";

/** Best-effort client-IP extraction. Mirrors the rate-limit keyFn. */
function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } };
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

/**
 * Insert one row into auth_log. Best-effort: any DB error is swallowed and
 * logged to stderr, never propagated to the response. Authentication must
 * not fail because logging failed.
 */
export function recordAuthAttempt(
  c: Context,
  params: { email: string | null; success: boolean; reason: AuthLogReason },
): void {
  try {
    const db = getDatabase();
    db.prepare(
      "INSERT INTO auth_log (email, ip, success, reason) VALUES (?, ?, ?, ?)",
    ).run(params.email, clientIp(c), params.success ? 1 : 0, params.reason);
  } catch (err) {
    console.error("[auth-log] failed to record attempt:", err);
  }
}
