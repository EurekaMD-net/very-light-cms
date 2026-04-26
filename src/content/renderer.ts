import type { ContentNode } from "./types.js";

/**
 * Render a ContentNode into a self-contained HTML fragment.
 *
 * Principles:
 * - No inline styles. No JavaScript. Semantic HTML only.
 * - The fragment is suitable for embedding inside a layout template.
 * - Caller is responsible for escaping the title if used in an <h1>.
 */
export function render(node: ContentNode): string {
  const { meta, html } = node;

  const titleHtml = meta.title ? escapeHtml(meta.title) : "Untitled";

  const metaLine = meta.date
    ? `<time datetime="${escapeHtml(meta.date)}">${escapeHtml(meta.date)}</time>`
    : "";

  const tagList =
    meta.tags && meta.tags.length > 0
      ? `<ul class="tags">${meta.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
      : "";

  return `<article>
  <header>
    <h1>${titleHtml}</h1>
    ${metaLine}
    ${tagList}
  </header>
  <section class="content">
    ${html}
  </section>
</article>`;
}

/**
 * Minimal HTML escaper for attribute values and text nodes.
 * Not a sanitizer — assumes `html` from parser is already trusted Markdown output.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
