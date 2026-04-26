import { describe, it, expect } from "vitest";
import { render, escapeHtml } from "../../src/content/renderer.js";
import type { ContentNode } from "../../src/content/types.js";

function makeNode(overrides: Partial<ContentNode> = {}): ContentNode {
  return {
    slug: "test-page",
    meta: {
      title: "Test Page",
      date: "2026-04-26",
      tags: ["alpha", "beta"],
    },
    raw: "## Heading\n\nParagraph.",
    html: "<h2>Heading</h2>\n<p>Paragraph.</p>",
    ...overrides,
  };
}

describe("render", () => {
  it("wraps output in an <article> element", () => {
    const out = render(makeNode());
    expect(out).toContain("<article>");
    expect(out).toContain("</article>");
  });

  it("renders title in <h1>", () => {
    const out = render(makeNode());
    expect(out).toContain("<h1>Test Page</h1>");
  });

  it("renders date in <time> with datetime attribute", () => {
    const out = render(makeNode());
    expect(out).toContain('<time datetime="2026-04-26">2026-04-26</time>');
  });

  it("renders tags as <ul class='tags'>", () => {
    const out = render(makeNode());
    expect(out).toContain('<ul class="tags">');
    expect(out).toContain("<li>alpha</li>");
    expect(out).toContain("<li>beta</li>");
  });

  it("renders html body inside <section class='content'>", () => {
    const out = render(makeNode());
    expect(out).toContain('<section class="content">');
    expect(out).toContain("<h2>Heading</h2>");
    expect(out).toContain("<p>Paragraph.</p>");
  });

  it("handles missing date gracefully (no <time> element)", () => {
    const out = render(makeNode({ meta: { title: "No Date" } }));
    expect(out).not.toContain("<time");
  });

  it("handles empty tags array (no <ul> element)", () => {
    const out = render(makeNode({ meta: { title: "No Tags", tags: [] } }));
    expect(out).not.toContain('<ul class="tags">');
  });

  it("handles missing title with fallback 'Untitled'", () => {
    const out = render(makeNode({ meta: {} }));
    expect(out).toContain("<h1>Untitled</h1>");
  });

  it("output is deterministic across calls", () => {
    const node = makeNode();
    expect(render(node)).toBe(render(node));
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, >, \", '", () => {
    expect(escapeHtml('a & b < c > d " e \' f')).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &#39; f"
    );
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("does not double-escape", () => {
    const once = escapeHtml("<b>");
    const twice = escapeHtml(once);
    // Second escape should change &lt; to &amp;lt;, confirming no idempotency
    expect(twice).not.toBe(once);
  });
});
