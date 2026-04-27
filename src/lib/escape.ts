/**
 * HTML-escape for attribute values and text nodes.
 * Single source of truth — do NOT redefine in theme files.
 *
 * Covers the four critical substitutions:
 *   & → &amp;   (must be first to avoid double-escaping)
 *   < → &lt;
 *   > → &gt;
 *   " → &quot;  (safe for attribute values)
 *
 * If single-quote escaping is ever needed (e.g. unquoted attributes), add it HERE only.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
