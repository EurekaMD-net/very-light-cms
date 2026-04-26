#!/usr/bin/env tsx
/**
 * seed-admin.ts — First-run admin user setup.
 *
 * Creates the admin user from ADMIN_EMAIL + ADMIN_PASSWORD env vars.
 * Safe to run multiple times — skips if user already exists.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=mysecret npm run seed:admin
 */

import { getDatabase, closeDatabase } from "../src/db/database.js";
import { hashPassword } from "../src/lib/auth.js";

async function main() {
  const email = process.env["ADMIN_EMAIL"];
  const password = process.env["ADMIN_PASSWORD"];

  if (!email || !password) {
    console.error("Error: ADMIN_EMAIL and ADMIN_PASSWORD env vars are required.");
    process.exit(1);
  }

  const db = getDatabase();

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    console.log(`Admin user '${email}' already exists. Skipping.`);
    closeDatabase();
    return;
  }

  const hash = await hashPassword(password);
  db.prepare(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')"
  ).run(email, hash);

  console.log(`Admin user '${email}' created successfully.`);
  closeDatabase();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
