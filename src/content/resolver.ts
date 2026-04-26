import { existsSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { config } from "../config.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

/**
 * Resolve a slug to an absolute file path inside CONTENT_DIR.
 *
 * Security invariants:
 * - Path traversal is blocked: the resolved path must start with CONTENT_DIR.
 * - Only `.md` files are resolved.
 * - Returns absolute path or throws; never returns undefined.
 */
export function resolveSlug(slug: string): string {
  if (!slug || typeof slug !== "string") {
    throw new ValidationError("Slug must be a non-empty string");
  }

  // Strip leading slashes and normalize (collapses ../ sequences)
  const safeSlug = normalize(slug.replace(/^\/+/, ""));

  // Re-check after normalize — traversal attempt would leave a leading ".."
  if (safeSlug.startsWith("..")) {
    throw new ValidationError(`Invalid slug: path traversal detected (${slug})`);
  }

  const contentDir = resolve(config.contentDir);
  const candidate = join(contentDir, `${safeSlug}.md`);

  // Final guard: resolved candidate must be inside contentDir
  if (!candidate.startsWith(contentDir + "/") && candidate !== contentDir) {
    throw new ValidationError(`Invalid slug: resolved outside content directory (${slug})`);
  }

  if (!existsSync(candidate)) {
    throw new NotFoundError(`Content not found: ${slug}`);
  }

  return candidate;
}
