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
  /** Raw JSON-LD string — injected as-is inside <script type="application/ld+json"> */
  schema?: string;
  /** Canonical URL — injected as <link rel="canonical"> */
  canonicalUrl?: string;
  /** Open Graph / Twitter Card type — "website" or "article" */
  ogType?: "website" | "article";
}

/**
 * Base HTML shell for the public site.
 * Returns a complete HTML document string (DOCTYPE included).
 * No JavaScript, no external resources — fully self-contained.
 */
export function layout({
  title,
  body,
  description,
  etag,
  schema,
  canonicalUrl,
  ogType,
}: LayoutOptions): string {
  const siteTitle = process.env["SITE_TITLE"] ?? "Very Light CMS";
  const siteUrl = process.env["SITE_URL"] ?? "http://localhost:3344";
  // OG image — defaults to the site logo (always served by the
  // /assets/:filename route). SITE_OG_IMAGE overrides if a dedicated
  // social card exists, so social previews never break on a missing file.
  const ogImage = process.env["SITE_OG_IMAGE"] ?? `${siteUrl}/assets/logo.png`;

  // Avoid duplicating site name if title already contains it
  const fullTitle = title.includes(siteTitle)
    ? esc(title)
    : `${esc(title)} — ${esc(siteTitle)}`;

  const descMeta = description
    ? `<meta name="description" content="${esc(description)}">`
    : "";
  const etagMeta = etag ? `<meta name="etag" content="${esc(etag)}">` : "";
  const canonicalTag = canonicalUrl
    ? `<link rel="canonical" href="${esc(canonicalUrl)}">`
    : "";
  const schemaMeta = schema
    ? `<script type="application/ld+json">${schema}</script>`
    : "";

  // Open Graph + Twitter Card
  const og =
    canonicalUrl && description
      ? `<meta property="og:type" content="${esc(ogType ?? "website")}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:site_name" content="${esc(siteTitle)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${fullTitle}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  ${descMeta}
  ${canonicalTag}
  ${og}
  ${schemaMeta}
  ${etagMeta}
  <style>${css}</style>
</head>
<body>
  <header class="site-header">
    <div class="site-header__inner">
      <a href="/" class="site-header__logo">
        <img src="/assets/logo.png" alt="${esc(siteTitle)}" class="site-header__logo-img">
      </a>
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
