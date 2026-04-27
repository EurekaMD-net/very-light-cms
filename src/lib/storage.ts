import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Storage abstraction — swap local filesystem / S3 without touching upload logic.
 * LocalDriver: Phase 5. S3Driver: natural extension for Phase 6+.
 */
export interface StorageDriver {
  write(filename: string, data: Buffer, mime: string): Promise<string>;
  read(filename: string): Promise<Buffer>;
  delete(filename: string): Promise<void>;
  url(filename: string): string;
}

export class LocalDriver implements StorageDriver {
  constructor(private readonly uploadDir: string) {}

  async write(filename: string, data: Buffer, _mime: string): Promise<string> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
    const safe = sanitizeFilename(filename);
    const stored = Date.now() + "-" + safe;
    await writeFile(join(this.uploadDir, stored), data);
    return stored;
  }

  async read(filename: string): Promise<Buffer> {
    // Containment check: resolve the full path and verify it stays inside uploadDir.
    // Without this, URL-decoded traversal sequences (e.g. ../../etc/passwd) escape the dir.
    const { resolve } = await import("node:path");
    const root = resolve(this.uploadDir);
    const target = resolve(root, filename);
    if (!target.startsWith(root + "/") && target !== root) {
      throw Object.assign(new Error("Path traversal denied"), { code: "ENOENT" });
    }
    return readFile(target);
  }

  async delete(filename: string): Promise<void> {
    try {
      await unlink(join(this.uploadDir, filename));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  url(filename: string): string {
    return "/media/" + encodeURIComponent(filename);
  }
}

/**
 * Sanitize a filename for safe filesystem storage.
 * - Strips path traversal characters (/, \)
 * - Collapses unsafe chars to underscores
 * - Preserves extension, truncates name to 80 chars
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal sequences (..) before other substitutions
  const base = filename.replace(/[/\\]/g, "_").replace(/\.{2,}/g, "_");
  const lastDot = base.lastIndexOf(".");
  const name = lastDot >= 0 ? base.slice(0, lastDot) : base;
  const ext  = lastDot >= 0 ? base.slice(lastDot)  : "";
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const safeExt  = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
  return (safeName + safeExt) || "upload";
}

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;