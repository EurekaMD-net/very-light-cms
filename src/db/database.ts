import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let instance: Database.Database | null = null;

/**
 * Return the singleton SQLite database instance.
 *
 * On first call:
 * - Opens (or creates) the SQLite file at config.dbPath.
 * - Applies schema.sql (idempotent — all statements use IF NOT EXISTS).
 * - Enables WAL mode and foreign keys via PRAGMA (also in schema, but set
 *   here explicitly so they apply even if called before schema runs).
 *
 * Subsequent calls return the cached instance.
 */
export function getDatabase(): Database.Database {
  if (instance) return instance;

  const db = new Database(config.dbPath);

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
