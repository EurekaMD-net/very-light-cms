import { layout, escHtml } from "./layout.js";

export interface MediaViewRow {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  alt_text: string | null;
  uploaded_at: number;
  url: string;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function mediaListView(items: MediaViewRow[], flash?: string): string {
  const rows =
    items.length === 0
      ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#888">No media yet.</td></tr>'
      : items
          .map((m) => {
            const preview = isImage(m.mime_type)
              ? '<img src="' +
                escHtml(m.url) +
                '" alt="' +
                escHtml(m.alt_text ?? "") +
                '" style="max-height:48px;max-width:80px;object-fit:contain;">'
              : '<span style="font-size:1.5rem">[file]</span>';
            const deleteForm =
              '<form method="POST" action="/admin/media/' +
              m.id +
              '/delete" style="display:inline"' +
              ' onsubmit="return confirm(&quot;Delete " + escHtml(m.filename) + "?&quot;)">' +
              '<button type="submit" class="btn-danger">Delete</button></form>';
            return (
              "<tr>" +
              "<td>" +
              preview +
              "</td>" +
              '<td><a href="' +
              escHtml(m.url) +
              '" target="_blank">' +
              escHtml(m.filename) +
              "</a></td>" +
              "<td>" +
              escHtml(m.mime_type) +
              "</td>" +
              "<td>" +
              sizeLabel(m.size_bytes) +
              "</td>" +
              "<td>" +
              deleteForm +
              "</td>" +
              "</tr>"
            );
          })
          .join("");

  const body =
    '<div class="admin-header">' +
    "<h1>Media</h1>" +
    '<a href="/admin/media/upload" class="btn">Upload File</a>' +
    "</div>" +
    '<table class="pages-table">' +
    "<thead><tr><th>Preview</th><th>Filename</th><th>Type</th><th>Size</th><th>Actions</th></tr></thead>" +
    "<tbody>" +
    rows +
    "</tbody>" +
    "</table>";

  return layout("Media", body, flash);
}

export function mediaUploadView(flash?: string): string {
  const body =
    '<div class="admin-header">' +
    "<h1>Upload Media</h1>" +
    '<a href="/admin/media" class="btn-secondary">Back to Media</a>' +
    "</div>" +
    '<form method="POST" action="/admin/media/upload" enctype="multipart/form-data" class="edit-form">' +
    '<div class="form-group">' +
    '<label>File <span style="color:#e74c3c">*</span></label>' +
    '<input type="file" name="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" required>' +
    "<small>Allowed: JPEG, PNG, GIF, WebP, PDF. Max 10 MB. SVG blocked for security.</small>" +
    "</div>" +
    '<div class="form-group">' +
    "<label>Alt Text</label>" +
    '<input type="text" name="alt_text" placeholder="Describe the image for accessibility">' +
    "</div>" +
    '<div class="form-actions">' +
    '<button type="submit" class="btn">Upload</button>' +
    "</div>" +
    "</form>";

  return layout("Upload Media", body, flash);
}
