import { resolve } from "node:path";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional("PORT", "3333"), 10),
  dbPath: (() => {
    const p = optional("DB_PATH", "./data/cms.db");
    return p === ":memory:" ? p : resolve(p);
  })(),
  get contentDir(): string {
    const p = optional("CONTENT_DIR", "./content/pages");
    return resolve(p);
  },
  get jwtSecret(): string {
    return required("JWT_SECRET");
  },
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "8h"),
  get uploadDir(): string {
    const p = optional("UPLOAD_DIR", "./uploads");
    return resolve(p);
  },
  /**
   * Default ON — auth cookie always carries Secure. Set COOKIE_SECURE=false
   * ONLY in local dev over plain HTTP. Inverts the prior NODE_ENV-derived
   * default (which silently downgraded if NODE_ENV was unset).
   */
  get cookieSecure(): boolean {
    return process.env["COOKIE_SECURE"] !== "false";
  },
  /**
   * Trust X-Forwarded-For for client-IP attribution (rate-limit + auth_log).
   * Default OFF — trusting XFF without an upstream proxy that strips/sets it
   * lets attackers spoof per-request IPs and bypass the rate limiter. Set
   * TRUST_PROXY=true ONLY when the CMS runs behind Caddy / nginx / similar
   * that overwrites the XFF header with the real connecting IP.
   */
  get trustProxy(): boolean {
    return process.env["TRUST_PROXY"] === "true";
  },
  adminEmail: optional("ADMIN_EMAIL", "admin@example.com"),
};

export type Config = typeof config;
