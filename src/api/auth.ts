import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { getDatabase } from "../db/database.js";
import { signToken, verifyPassword } from "../lib/auth.js";
import { ok, fail } from "../lib/response.js";
import { apiAuthGuard } from "../admin/middleware.js";
import { authCookieOptions } from "../lib/cookie.js";
import { rateLimit } from "../lib/rate-limit.js";
import { recordAuthAttempt } from "../lib/auth-log.js";

const authRouter = new Hono();

/** 5 login attempts per 15 minutes per IP. Applied to POST /api/auth/login. */
const loginRateLimit = rateLimit({
  max: 5,
  windowMs: 15 * 60 * 1000,
  onLimit: (c) => {
    recordAuthAttempt(c, {
      email: null,
      success: false,
      reason: "rate_limited",
    });
    return fail(c, "Too many attempts. Try again later.", 429);
  },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Sets httpOnly cookie "token" on success.
 */
authRouter.post("/login", loginRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    recordAuthAttempt(c, { email: null, success: false, reason: "validation" });
    return fail(c, "Invalid request body", 400);
  }

  const { email, password } = parsed.data;
  const db = getDatabase();
  const user = db
    .prepare(
      "SELECT id, role, password_hash FROM users WHERE email = ? LIMIT 1",
    )
    .get(email) as
    | { id: number; role: string; password_hash: string }
    | undefined;

  if (!user) {
    recordAuthAttempt(c, {
      email,
      success: false,
      reason: "invalid_credentials",
    });
    return fail(c, "Invalid credentials", 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    recordAuthAttempt(c, {
      email,
      success: false,
      reason: "invalid_credentials",
    });
    return fail(c, "Invalid credentials", 401);
  }

  const token = signToken(String(user.id), user.role);

  setCookie(c, "token", token, authCookieOptions());

  recordAuthAttempt(c, { email, success: true, reason: "ok" });
  return ok(c, { token, userId: String(user.id), role: user.role });
});

/**
 * POST /api/auth/logout
 * Clears the token cookie.
 */
authRouter.post("/logout", (c) => {
  deleteCookie(c, "token", { path: "/" });
  return ok(c, { ok: true });
});

/**
 * GET /api/auth/me
 * Returns the current user identity.
 * Accepts Bearer token (CLI) or httpOnly cookie (Admin UI).
 */
authRouter.get("/me", apiAuthGuard, (c) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = c as any;
  const userId = ctx.get("userId") as string;
  const role = ctx.get("role") as string;
  return ok(c, { userId, role });
});

export { authRouter };
