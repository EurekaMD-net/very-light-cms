/**
 * Escape HTML special characters to prevent XSS in server-rendered views.
 */
export function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Base HTML layout for all Admin UI pages.
 * @param title  - Page title (shown in <title> and <h1>)
 * @param body   - Inner HTML string for the <main> slot
 * @param flash  - Optional error/success message to display
 */
export function layout(title: string, body: string, flash?: string): string {
  const flashHtml = flash
    ? `<div class="flash">${escHtml(flash)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)} — VLCMS Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; font-size: 15px; color: #222; background: #f5f5f5; }
    nav { background: #1a1a2e; color: #eee; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1.5rem; }
    nav a { color: #ccc; text-decoration: none; font-size: 0.9rem; }
    nav a:hover { color: #fff; }
    nav .brand { font-weight: 700; font-size: 1rem; color: #fff; margin-right: auto; }
    main { max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; margin-bottom: 1.25rem; }
    h2 { font-size: 1.1rem; margin-bottom: 1rem; }
    .flash { background: #fde8e8; border: 1px solid #f5a5a5; color: #b00; padding: 0.6rem 1rem; border-radius: 4px; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    th, td { padding: 0.65rem 0.9rem; text-align: left; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    th { background: #f0f0f0; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .badge-published { background: #d1fae5; color: #065f46; }
    .badge-draft { background: #fef3c7; color: #92400e; }
    form { display: contents; }
    .btn { display: inline-block; padding: 0.4rem 0.85rem; border-radius: 4px; border: none; cursor: pointer; font-size: 0.85rem; text-decoration: none; }
    .btn-primary { background: #1a1a2e; color: #fff; }
    .btn-primary:hover { background: #2d2d4e; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.78rem; }
    .btn-outline { background: transparent; border: 1px solid #ccc; color: #444; }
    .btn-outline:hover { background: #eee; }
    .field { margin-bottom: 1rem; }
    .field label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.3rem; }
    .field input, .field textarea, .field select { width: 100%; padding: 0.5rem 0.7rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9rem; font-family: inherit; }
    .field textarea { min-height: 320px; font-family: monospace; resize: vertical; }
    .field input[readonly] { background: #f5f5f5; color: #777; }
    .card { background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 1.5rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">VLCMS</span>
    <a href="/admin">Pages</a>
    <form method="POST" action="/admin/logout">
      <button type="submit" class="btn btn-outline btn-sm">Logout</button>
    </form>
  </nav>
  <main>
    ${flashHtml}
    ${body}
  </main>
</body>
</html>`;
}
