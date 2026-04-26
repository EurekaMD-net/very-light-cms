import { layout, escHtml } from "./layout.js";

interface PageRow {
  id: number;
  slug: string;
  title: string;
  draft: number;
  created_at: number;
  updated_at: number;
}

function statusBadge(draft: number): string {
  return draft === 0
    ? `<span class="badge badge-published">published</span>`
    : `<span class="badge badge-draft">draft</span>`;
}

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function pagesListView(pages: PageRow[]): string {
  const rows =
    pages.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#888;">No pages yet. <a href="/admin/pages/new">Create one</a>.</td></tr>`
      : pages
          .map(
            (p) => `
      <tr>
        <td>${escHtml(p.title)}</td>
        <td><code>${escHtml(p.slug)}</code></td>
        <td>${statusBadge(p.draft)}</td>
        <td>${fmtDate(p.updated_at)}</td>
        <td class="actions">
          <a href="/admin/pages/${escHtml(p.slug)}/edit" class="btn btn-sm btn-outline">Edit</a>
          ${
            p.draft === 1
              ? `<form method="POST" action="/admin/pages/${escHtml(p.slug)}/publish">
                   <button class="btn btn-sm btn-primary">Publish</button>
                 </form>`
              : `<form method="POST" action="/admin/pages/${escHtml(p.slug)}/unpublish">
                   <button class="btn btn-sm btn-outline">Unpublish</button>
                 </form>`
          }
          <form method="POST" action="/admin/pages/${escHtml(p.slug)}/delete"
                onsubmit="return confirm('Delete ${escHtml(p.slug)}?')">
            <button class="btn btn-sm btn-danger">Delete</button>
          </form>
        </td>
      </tr>`
          )
          .join("");

  const body = `
    <div class="page-header">
      <h1>Pages</h1>
      <a href="/admin/pages/new" class="btn btn-primary">+ New page</a>
    </div>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Slug</th>
          <th>Status</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return layout("Pages", body);
}
