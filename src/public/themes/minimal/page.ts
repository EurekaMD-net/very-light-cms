/**
 * Single-page template for the minimal theme.
 * Receives a fully rendered ContentNode and wraps it in the article structure.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PageViewData {
  title: string;
  description?: string | null;
  date?: string | null;
  tags?: string[];
  /** Rendered HTML from markdown body — NOT escaped (trusted renderer output) */
  html: string;
}

/**
 * Render the <article> block for a single page.
 * Returns an HTML string suitable for embedding inside layout().body.
 */
export function pageView(data: PageViewData): string {
  const { title, description, date, tags, html } = data;

  const dateLine = date
    ? `<time datetime="${esc(date)}">${esc(date)}</time>`
    : "";

  const tagList =
    tags && tags.length > 0
      ? `<ul class="tags">${tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
      : "";

  const metaLine =
    dateLine || tagList
      ? `<div class="article-meta">${dateLine}${tagList}</div>`
      : "";

  const descriptionHtml = description
    ? `<p class="article-description">${esc(description)}</p>`
    : "";

  return `<article>
  <header class="article-header">
    <h1>${esc(title)}</h1>
    ${descriptionHtml}
    ${metaLine}
  </header>
  <section class="content">
    ${html}
  </section>
</article>`;
}

/**
 * Render a 404 page body — no article wrapper, just the error state.
 */
export function notFoundView(): string {
  return `<div class="error-page">
  <h1>404</h1>
  <p>Page not found.</p>
  <p><a href="/">← Back to home</a></p>
</div>`;
}
