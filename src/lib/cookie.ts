import { config } from "../config.js";

/**
 * Auth cookie options applied to the JWT "token" cookie.
 *
 * - httpOnly: cookie is not exposed to JS (mitigates XSS-driven theft).
 * - sameSite: Strict — cookie is NOT sent on cross-site requests, including
 *   top-level GETs from external links. This is the strongest CSRF mitigation
 *   available without per-request tokens. The trade-off is that following an
 *   email link to /admin/* will require re-login; for an admin CMS this is
 *   acceptable.
 * - secure: only sent over HTTPS in production. In dev (NODE_ENV !== "production")
 *   this is off so localhost works on http://. Override with COOKIE_SECURE=true|false.
 * - path: "/" — cookie covers all routes (admin UI + API).
 * - maxAge: 8h — matches JWT expiry.
 */
export function authCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Strict" as const,
    secure: config.cookieSecure,
    maxAge: 60 * 60 * 8,
  };
}
