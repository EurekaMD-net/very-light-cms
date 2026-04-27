import { css } from "./styles.js";
import { esc } from "../../../lib/escape.js";

export interface LayoutOptions {
  title: string;
  /** Rendered <main> content — caller is responsible for escaping */
  body: string;
  /** Optional <meta name="description"> value */
  description?: string;
  /** ETag value — set as Last-Modified equivalent for conditional GET */
  etag?: string;
}

/**
 * Base HTML shell for the public site.
 * Returns a complete HTML document string (DOCTYPE included).
 * No JavaScript, no external resources — fully self-contained.
 */
export function layout({ title, body, description, etag }: LayoutOptions): string {
  const siteTitle = process.env["SITE_TITLE"] ?? "Very Light CMS";
  const descMeta = description
    ? `<meta name="description" content="${esc(description)}">`
    : "";
  const etagMeta = etag ? `<meta name="etag" content="${esc(etag)}">` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — ${esc(siteTitle)}</title>
  ${descMeta}
  ${etagMeta}
  <style>${css}</style>
</head>
<body>
  <header class="site-header">
    <div class="site-header__inner">
      <a href="/" class="site-header__title">${esc(siteTitle)}</a>
    </div>
  </header>
  <main>
    ${body}
  </main>
  <footer class="site-footer">
    <p>Powered by Very Light CMS</p>
  </footer>
</body>
</html>`;
}
