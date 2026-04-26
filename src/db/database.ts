import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let instance: Database.Database | null = null;

/**
 * Resolve the DB path at call time (not at import time) so that tests can
 * override DB_PATH via process.env before the first getDatabase() call.
 */
function resolveDbPath(): string {
  const raw = process.env["DB_PATH"] ?? "./data/cms.db";
  return raw === ":memory:" ? raw : resolve(raw);
}

/**
 * Return the singleton SQLite database instance.
 *
 * On first call:
 * - Opens (or creates) the SQLite file at DB_PATH env var (resolved lazily).
 * - Applies schema.sql (idempotent — all statements use IF NOT EXISTS).
 * - Enables WAL mode and foreign keys via PRAGMA (also in schema, but set
 *   here explicitly so they apply even if called before schema runs).
 *
 * Subsequent calls return the cached instance.
 */
export function getDatabase(): Database.Database {
  if (instance) return instance;

  const db = new Database(resolveDbPath());

  // Safety pragmas (redundant with schema.sql but explicit here for clarity)
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Apply schema — idempotent, safe on every boot
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  instance = db;
  return instance;
}

/**
 * Close the database and reset the singleton.
 * Intended for graceful shutdown and test teardown only.
 */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
