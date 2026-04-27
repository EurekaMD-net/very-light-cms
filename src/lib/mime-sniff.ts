/**
 * mime-sniff.ts — verify file content against its declared MIME type.
 *
 * Defends against MIME spoofing during upload: an attacker can rename
 * `evil.exe` to `evil.png` and set the multipart Content-Type to image/png.
 * This module reads the first few bytes of the file and confirms the magic
 * signature actually matches the declared type. If not, the upload is rejected.
 *
 * Coverage: PNG, JPEG, GIF, WebP, PDF — i.e. the full ALLOWED_MIME_TYPES
 * minus image/svg+xml (which was deliberately removed for XSS reasons).
 *
 * No external dependency — magic byte lookups are short, well-known, and
 * carrying a third-party file-type detector would mean a much larger surface
 * for the same coverage.
 */

/** Length of the longest signature we look at (WebP needs 12 bytes). */
const MAX_SNIFF_BYTES = 12;

/**
 * Returns true if the buffer's leading bytes match the magic signature
 * for the given declared MIME type. Returns false on mismatch or on any
 * unrecognized type.
 */
export function detectMimeMatches(
  buffer: Buffer,
  declaredMime: string,
): boolean {
  if (buffer.length < 4) return false;
  const head = buffer.subarray(0, MAX_SNIFF_BYTES);

  switch (declaredMime) {
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        head[0] === 0x89 &&
        head[1] === 0x50 &&
        head[2] === 0x4e &&
        head[3] === 0x47 &&
        head[4] === 0x0d &&
        head[5] === 0x0a &&
        head[6] === 0x1a &&
        head[7] === 0x0a
      );

    case "image/jpeg":
      // FF D8 FF — JPEG SOI marker followed by an APP/COM marker. The fourth
      // byte must be a valid marker (>= 0xC0) — otherwise it's a malformed
      // file masquerading via the SOI prefix.
      return (
        head[0] === 0xff &&
        head[1] === 0xd8 &&
        head[2] === 0xff &&
        head[3] !== undefined &&
        head[3] >= 0xc0
      );

    case "image/gif":
      // "GIF87a" or "GIF89a"
      return (
        head[0] === 0x47 &&
        head[1] === 0x49 &&
        head[2] === 0x46 &&
        head[3] === 0x38 &&
        (head[4] === 0x37 || head[4] === 0x39) &&
        head[5] === 0x61
      );

    case "image/webp":
      // "RIFF....WEBP" — bytes 0-3 = RIFF, bytes 8-11 = WEBP
      if (head.length < 12) return false;
      return (
        head[0] === 0x52 && // R
        head[1] === 0x49 && // I
        head[2] === 0x46 && // F
        head[3] === 0x46 && // F
        head[8] === 0x57 && // W
        head[9] === 0x45 && // E
        head[10] === 0x42 && // B
        head[11] === 0x50 // P
      );

    case "application/pdf":
      // "%PDF" optionally with a leading BOM/whitespace; require the prefix
      // to land within the first 4 bytes (no leeway for stray content)
      return (
        head[0] === 0x25 && // %
        head[1] === 0x50 && // P
        head[2] === 0x44 && // D
        head[3] === 0x46 // F
      );

    default:
      return false;
  }
}
