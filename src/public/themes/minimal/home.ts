/**
 * Homepage template — lists all published pages.
 * No pagination in Phase 4; Phase 5+ can add it.
 */

import { esc } from "../../../lib/escape.js";

export interface PageListItem {
  slug: string;
  title: string;
  description: string | null;
  date?: string | null;
  tags?: string[];
}

/**
 * Render the homepage body — a list of all published pages.
 * Returns an HTML string suitable for embedding inside layout().body.
 */
export function homeView(pages: PageListItem[]): string {
  if (pages.length === 0) {
    return `<h1>Welcome</h1>
<p class="empty-state">No published pages yet.</p>`;
  }

  const items = pages
    .map((p) => {
      const desc = p.description
        ? `<p class="page-list__description">${esc(p.description)}</p>`
        : "";
      const meta = p.date
        ? `<span class="page-list__meta"><time datetime="${esc(p.date)}">${esc(p.date)}</time></span>`
        : "";

      return `<li class="page-list__item">
    <h2 class="page-list__title"><a href="/${esc(p.slug)}">${esc(p.title)}</a></h2>
    ${desc}
    ${meta}
  </li>`;
    })
    .join("\n");

  return `<h1>Pages</h1>
<ul class="page-list">
  ${items}
</ul>`;
}
