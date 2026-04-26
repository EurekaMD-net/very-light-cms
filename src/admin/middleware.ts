import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../lib/auth.js";
import { fail } from "../lib/response.js";

/**
 * authGuard — middleware for Admin UI routes.
 * Reads the httpOnly "token" cookie.
 * Redirects to /admin/login if missing or invalid.
 */
export async function authGuard(c: Context, next: Next) {
  const token = getCookie(c, "token");
  if (!token) return c.redirect("/admin/login");

  const payload = verifyToken(token);
  if (!payload) return c.redirect("/admin/login");

  // Attach to context for downstream handlers
  c.set("userId", payload.userId);
  c.set("role", payload.role);

  await next();
}

/**
 * apiAuthGuard — middleware for API write routes (/api/*).
 * Accepts Bearer token in Authorization header OR httpOnly cookie.
 * Returns 401 JSON (not a redirect) when unauthenticated.
 */
export async function apiAuthGuard(c: Context, next: Next) {
  let token: string | undefined;

  // 1. Check Authorization header (headless / programmatic clients)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  // 2. Fallback to cookie (Admin UI same-origin requests)
  if (!token) {
    token = getCookie(c, "token");
  }

  if (!token) return fail(c, "Not authenticated", 401);

  const payload = verifyToken(token);
  if (!payload) return fail(c, "Invalid or expired token", 401);

  c.set("userId", payload.userId);
  c.set("role", payload.role);

  await next();
}

/**
 * roleGuard(role) — factory middleware.
 * Must come AFTER authGuard / apiAuthGuard.
 * Returns 403 if the user's role does not match.
 */
export function roleGuard(requiredRole: string) {
  return async function (c: Context, next: Next) {
    const role = c.get("role") as string | undefined;
    if (role !== requiredRole) return fail(c, "Forbidden", 403);
    await next();
  };
}
