/**
 * Minimal theme — inline CSS.
 * Delivered as a single <style> block inside layout <head>.
 * No external files, no build step, no runtime requests.
 */
export const css = `
*,*::before,*::after { box-sizing: border-box; }

:root {
  --color-bg:      #ffffff;
  --color-text:    #1a1a1a;
  --color-muted:   #666666;
  --color-accent:  #0057b8;
  --color-border:  #e2e2e2;
  --color-code-bg: #f4f4f4;
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

.site-header { border-bottom: 1px solid var(--color-border); padding: 0.75rem var(--spacing); }
.site-header__inner { max-width: var(--max-width); margin: 0 auto; display: flex; align-items: center; gap: 1rem; }
.site-header__title { font-size: 1rem; font-weight: 700; text-decoration: none; color: var(--color-text); }
.site-header__title:hover { color: var(--color-accent); }

main { max-width: var(--max-width); margin: 2.5rem auto; padding: 0 var(--spacing); }

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

.page-list { list-style: none; padding: 0; margin: 2rem 0 0; }
.page-list__item { border-bottom: 1px solid var(--color-border); padding: 1.25rem 0; }
.page-list__item:first-child { border-top: 1px solid var(--color-border); }
.page-list__title { margin: 0 0 0.25rem; font-size: 1.2rem; }
.page-list__title a { color: var(--color-text); text-decoration: none; font-weight: 600; }
.page-list__title a:hover { color: var(--color-accent); }
.page-list__description { margin: 0.2rem 0 0.4rem; color: var(--color-muted); font-size: 0.9rem; }
.page-list__meta { font-size: 0.8rem; color: var(--color-muted); }
.empty-state { color: var(--color-muted); font-style: italic; margin-top: 2rem; }

.error-page { text-align: center; padding: 4rem 0; }
.error-page h1 { font-size: 4rem; margin-bottom: 0.25rem; }
.error-page p { color: var(--color-muted); }
`;
