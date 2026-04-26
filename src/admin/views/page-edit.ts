import { layout, escHtml } from "./layout.js";

interface EditPageData {
  slug?: string;
  title?: string;
  description?: string;
  tags?: string;   // comma-separated for the form
  body?: string;
  draft?: number;
}

export function pageEditView(opts: {
  mode: "create" | "edit";
  data?: EditPageData;
  error?: string;
}): string {
  const d = opts.data ?? {};
  const isEdit = opts.mode === "edit";
  const action = isEdit ? `/admin/pages/${d.slug ?? ""}` : "/admin/pages";
  const pageTitle = isEdit ? `Edit: ${d.title ?? d.slug ?? ""}` : "New Page";

  const body = `
    <div class="page-header">
      <h1>${escHtml(pageTitle)}</h1>
      <a href="/admin" class="btn btn-outline">← Back</a>
    </div>

    ${opts.error ? `<p class="flash">${escHtml(opts.error)}</p>` : ""}

    <form method="POST" action="${action}" style="display:flex;flex-direction:column;gap:1rem;">
      <div class="field">
        <label>Title <span style="color:red">*</span></label>
        <input type="text" name="title" required value="${escHtml(d.title ?? "")}" />
      </div>

      ${
        isEdit
          ? `<div class="field">
               <label>Slug <small style="font-weight:normal">(read-only — URLs are stable)</small></label>
               <input type="text" name="slug" readonly value="${escHtml(d.slug ?? "")}" />
             </div>`
          : `<div class="field">
               <label>Slug <small style="font-weight:normal">(auto-generated from title if blank)</small></label>
               <input type="text" name="slug" value="${escHtml(d.slug ?? "")}"
                 pattern="[a-z0-9-]+" title="lowercase letters, numbers, hyphens only" />
             </div>`
      }

      <div class="field">
        <label>Description</label>
        <textarea name="description" rows="2">${escHtml(d.description ?? "")}</textarea>
      </div>

      <div class="field">
        <label>Tags <small style="font-weight:normal">(comma-separated)</small></label>
        <input type="text" name="tags" value="${escHtml(d.tags ?? "")}" />
      </div>

      <div class="field">
        <label>Body (Markdown) <span style="color:red">*</span></label>
        <textarea name="body" rows="20" required>${escHtml(d.body ?? "")}</textarea>
      </div>

      <div class="actions">
        <button type="submit" name="draft" value="1" class="btn btn-outline">Save draft</button>
        <button type="submit" name="draft" value="0" class="btn btn-primary">Save &amp; publish</button>
      </div>
    </form>
  `;
  return layout(pageTitle, body);
}
