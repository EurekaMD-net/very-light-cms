import { Hono } from "hono";
import { getDatabase } from "../db/database.js";
import { ok, fail } from "../lib/response.js";
import {
  LocalDriver,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "../lib/storage.js";
import { detectMimeMatches } from "../lib/mime-sniff.js";
import { config } from "../config.js";
import { apiAuthGuard } from "../admin/middleware.js";

export const media = new Hono();

// All media routes require authentication.
media.use("/*", apiAuthGuard);

// ── GET /api/media ────────────────────────────────────────────────────────────
// Returns list of all uploaded media, newest first.
media.get("/", (c) => {
  const db = getDatabase();
  const rows = db
    .prepare(
      "SELECT id, filename, mime_type, size_bytes, alt_text, uploaded_at FROM media ORDER BY uploaded_at DESC",
    )
    .all() as MediaRow[];

  const driver = new LocalDriver(config.uploadDir);
  const items = rows.map((r) => ({
    ...r,
    url: driver.url(r.filename),
  }));

  return ok(c, { items, total: items.length });
});

// ── POST /api/media/upload ────────────────────────────────────────────────────
// Accepts multipart/form-data with a single "file" field.
// Optional "alt_text" string field.
// Returns the created media row.
media.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  const altText =
    typeof body["alt_text"] === "string" ? body["alt_text"] : null;

  if (!(file instanceof File)) {
    return fail(c, "Missing file field", 400);
  }

  // MIME type validation
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return fail(
      c,
      "Unsupported file type: " +
        file.type +
        ". Allowed: " +
        [...ALLOWED_MIME_TYPES].join(", "),
      400,
    );
  }

  // Size validation
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(c, "File exceeds 10 MB limit", 400);
  }

  const data = Buffer.from(await file.arrayBuffer());

  // Magic-byte validation — protects against MIME spoofing where the client
  // declares image/png but uploads arbitrary bytes. Done after reading into
  // memory but before any disk write.
  if (!detectMimeMatches(data, file.type)) {
    return fail(
      c,
      "File content does not match declared type: " + file.type,
      400,
    );
  }

  const driver = new LocalDriver(config.uploadDir);
  const stored = await driver.write(file.name, data, file.type);

  // File is now on disk. If the DB insert fails (UNIQUE collision on the
  // millisecond-prefixed filename, schema constraint, etc.), the file would
  // be orphaned. Roll back by unlinking before propagating.
  const db = getDatabase();
  let result: MediaRow;
  try {
    result = db
      .prepare(
        "INSERT INTO media (filename, mime_type, size_bytes, alt_text) VALUES (?, ?, ?, ?) RETURNING id, filename, mime_type, size_bytes, alt_text, uploaded_at",
      )
      .get(stored, file.type, file.size, altText) as MediaRow;
  } catch (err) {
    await driver.delete(stored).catch(() => {
      /* best-effort — file is already orphaned, log but don't mask the original error */
    });
    return fail(
      c,
      "Failed to record upload: " +
        (err instanceof Error ? err.message : String(err)),
      500,
    );
  }

  return ok(c, { ...result, url: driver.url(result.filename) }, 201);
});

// ── DELETE /api/media/:id ─────────────────────────────────────────────────────
// Deletes the media file from storage and removes the DB row.
media.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return fail(c, "Invalid id", 400);

  const db = getDatabase();
  const row = db
    .prepare("SELECT id, filename FROM media WHERE id = ?")
    .get(id) as { id: number; filename: string } | undefined;

  if (!row) return fail(c, "Media not found", 404);

  // Delete file from storage first, then remove DB row
  const driver = new LocalDriver(config.uploadDir);
  await driver.delete(row.filename);
  db.prepare("DELETE FROM media WHERE id = ?").run(id);

  return ok(c, { deleted: true });
});

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MediaRow {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  alt_text: string | null;
  uploaded_at: number;
}
