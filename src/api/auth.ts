import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { getDatabase } from "../db/database.js";
import { signToken, verifyToken, verifyPassword } from "../lib/auth.js";
import { ok, fail } from "../lib/response.js";

const authRouter = new Hono();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Sets httpOnly cookie "token" on success.
 */
authRouter.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, "Invalid request body", 400);
  }

  const { email, password } = parsed.data;
  const db = getDatabase();
  const user = db
    .prepare("SELECT id, role, password_hash FROM users WHERE email = ? LIMIT 1")
    .get(email) as { id: string; role: string; password_hash: string } | undefined;

  if (!user) {
    return fail(c, "Invalid credentials", 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return fail(c, "Invalid credentials", 401);
  }

  const token = signToken(user.id, user.role);

  setCookie(c, "token", token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return ok(c, { ok: true });
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
 * Returns the current user identity from the cookie.
 */
authRouter.get("/me", (c) => {
  const token = getCookie(c, "token");
  if (!token) return fail(c, "Not authenticated", 401);

  const payload = verifyToken(token);
  if (!payload) return fail(c, "Invalid or expired token", 401);

  return ok(c, { userId: payload.userId, role: payload.role });
});

export { authRouter };
