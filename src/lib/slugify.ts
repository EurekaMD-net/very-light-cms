/**
 * Convert any string to a URL-safe slug.
 * No external deps — pure string ops.
 *
 * Examples:
 *   "Hello World"     → "hello-world"
 *   "Año Nón 2026"   → "ano-non-2026"
 *   "  foo  bar  "   → "foo-bar"
 *   "foo--bar"        → "foo-bar"
 */
export function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFD")                        // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "")         // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")           // remove non-alphanumeric (keep spaces and hyphens)
    .replace(/[\s]+/g, "-")                  // spaces → hyphens
    .replace(/-{2,}/g, "-")                  // collapse multiple hyphens
    .replace(/^-|-$/g, "");                  // strip leading/trailing hyphens
}
