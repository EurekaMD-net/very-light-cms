import type { Context } from "hono";
import { getDatabase } from "../db/database.js";
import { clientIp } from "./client-ip.js";

export type AuthLogReason =
  | "ok"
  | "invalid_credentials"
  | "rate_limited"
  | "validation";

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
