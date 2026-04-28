/**
 * Minimal theme — inline CSS.
 * Delivered as a single <style> block inside layout <head>.
 * No external files, no build step, no runtime requests.
 */
export const css = `
*,*::before,*::after { box-sizing: border-box; }

:root {
  --color-bg:      #0D1B2A;
  --color-text:    #ffffff;
  --color-muted:   #8BAAB8;
  --color-accent:  #00CC77;
  --color-border:  #1e3448;
  --color-code-bg: #112236;
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --max-width: 720px;
  --spacing:   1.5rem;
}

html { font-size: 18px; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  line-height: 1.7;
}

.site-header { border-bottom: 1px solid var(--color-border); padding: 0.75rem var(--spacing); background: var(--color-bg); }
.site-header__inner { max-width: var(--max-width); margin: 0 auto; display: flex; align-items: center; gap: 1rem; }
.site-header__title { font-size: 1rem; font-weight: 700; text-decoration: none; color: var(--color-text); }
.site-header__title:hover { color: var(--color-accent); }
.site-header__logo { display: inline-block; text-decoration: none; }
.site-header__logo-img { height: 224px; width: auto; display: block; }

main { max-width: var(--max-width); margin: 2.5rem auto; padding: 0 var(--spacing); }
main:has(.home-layout) { max-width: 1200px; }

.site-footer {
  border-top: 1px solid var(--color-border);
  padding: 1rem var(--spacing);
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-top: 4rem;
}

h1 { font-size: 2rem; margin: 0 0 0.5rem; line-height: 1.25; }
h2 { font-size: 1.5rem; margin: 2rem 0 0.5rem; }
h3 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; }
h4,h5,h6 { font-size: 1rem; margin: 1.25rem 0 0.25rem; }

/* Post content — headings in teal, body text white */
.content h1,
.content h2,
.content h3,
.content h4,
.content h5,
.content h6 { color: #1A6B5A; }
.content p,
.content li,
.content td,
.content th { color: #ffffff; }
p { margin: 0 0 1rem; }
a { color: var(--color-accent); }
a:hover { text-decoration: none; }

blockquote {
  margin: 1.5rem 0; padding: 0.75rem 1rem;
  border-left: 4px solid var(--color-border);
  color: var(--color-muted); font-style: italic;
}

pre {
  background: var(--color-code-bg); padding: 1rem;
  overflow-x: auto; border-radius: 4px;
  font-size: 0.85rem; line-height: 1.5;
}
code { font-family: var(--font-mono); font-size: 0.875em; background: var(--color-code-bg); padding: 0.15em 0.35em; border-radius: 3px; }
pre code { background: none; padding: 0; font-size: inherit; }
img { max-width: 100%; height: auto; }
hr { border: none; border-top: 1px solid var(--color-border); margin: 2rem 0; }

.article-header { margin-bottom: 2rem; }
.article-meta { font-size: 0.85rem; color: var(--color-muted); display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.5rem; }

.tags { list-style: none; margin: 0; padding: 0; display: flex; gap: 0.4rem; flex-wrap: wrap; }
.tags li { font-size: 0.75rem; padding: 0.15rem 0.6rem; border: 1px solid var(--color-border); border-radius: 99px; color: var(--color-muted); }

.journal-heading { color: var(--color-text); margin-bottom: 0.5rem; }

/* Entry list — home page */
.entry-list { list-style: none; padding: 0; margin: 2rem 0 0; }
.entry-card { border-bottom: 1px solid var(--color-border); padding: 1.5rem 0; }
.entry-card:first-child { border-top: 1px solid var(--color-border); }
.entry-card article { margin: 0; }
.entry-card .article-header { margin-bottom: 0; }
.entry-card__title { margin: 0 0 0.4rem; font-size: 1.3rem; }
.entry-card__title a { color: #1A6B5A; text-decoration: none; font-weight: 700; }
.entry-card__title a:hover { color: var(--color-accent); }
.article-description { margin: 0.25rem 0 0.4rem; color: var(--color-muted); font-size: 0.9rem; }
.empty-state { color: var(--color-muted); font-style: italic; margin-top: 2rem; }

.error-page { text-align: center; padding: 4rem 0; }
.error-page h1 { font-size: 4rem; margin-bottom: 0.25rem; }
.error-page p { color: var(--color-muted); }

/* Home — two-column grid layout, wider than default content column */
.home-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 3rem;
  align-items: start;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}
@media (max-width: 900px) { .home-layout { grid-template-columns: 180px 1fr; gap: 2rem; } }
@media (max-width: 600px) {
  .home-layout { grid-template-columns: 1fr; }
  .home-sidebar {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--color-bg);
    padding-top: 1rem;
    padding-bottom: 2rem;
    border-bottom: 2px solid var(--color-border);
  }
  .home-sidebar::after {
    content: "";
    display: block;
    position: absolute;
    left: 0;
    right: 0;
    bottom: -60px;
    height: 60px;
    background: linear-gradient(to bottom, var(--color-bg) 60%, transparent 100%);
    pointer-events: none;
    z-index: 20;
  }
  .home-sidebar .entry-list--mobile-only .entry-card:not(:first-child) { display: none; }
}

/* Sidebar — entry list, left column */
.home-sidebar { position: sticky; top: 2rem; }
.sidebar-heading { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-muted); margin: 0 0 0.75rem; font-weight: 600; }
.home-sidebar .entry-list { margin-top: 0; }
.home-sidebar .entry-card { padding: 0.6rem 0; border-bottom: 1px solid var(--color-border); }
.home-sidebar .entry-card:first-child { border-top: 1px solid var(--color-border); }
.home-sidebar .entry-card__title { font-size: 0.78rem; margin: 0; }
.home-sidebar .entry-card__title a { font-weight: 600; }
.home-sidebar .article-description { font-size: 0.7rem; }
.home-sidebar .article-meta { font-size: 0.68rem; }

/* Editors' note — permanent home section */
.editors-note { border: 1px solid var(--color-border); border-radius: 6px; padding: 2rem; background: #0a1622; }
.editors-note__title { color: #1A6B5A; font-size: 1.68rem; margin: 0 0 1.25rem; }
.editors-note__body p { color: #ffffff; margin: 0 0 1rem; font-size: 1.14rem; line-height: 1.75; }
.editors-note__body p:last-child { margin-bottom: 0; }
.editors-note__signature { color: var(--color-muted); font-style: italic; }
`;
