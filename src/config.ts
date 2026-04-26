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
  dbPath: (() => { const p = optional("DB_PATH", "./data/cms.db"); return p === ":memory:" ? p : resolve(p); })(),
  contentDir: resolve(optional("CONTENT_DIR", "./content/pages")),
  jwtSecret: optional("JWT_SECRET", "change-me-in-production"),
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "8h"),
  adminEmail: optional("ADMIN_EMAIL", "admin@example.com"),
} as const;

export type Config = typeof config;
