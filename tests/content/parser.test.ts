import { describe, it, expect } from "vitest";
import { parseContent } from "../../src/content/parser.js";

describe("parseContent", () => {
  it("parses frontmatter and markdown body into a ContentNode", () => {
    const raw = `---
title: Hello World
slug: hello-world
date: "2026-01-01"
tags:
  - news
draft: false
---

## Intro

This is a paragraph.
`;
    const node = parseContent(raw, "hello-world");

    expect(node.slug).toBe("hello-world");
    expect(node.meta.title).toBe("Hello World");
    expect(node.meta.date).toBe("2026-01-01");
    expect(node.meta.draft).toBe(false);
    expect(node.meta.tags).toEqual(["news"]);
    expect(node.html).toContain("<h2");
    expect(node.html).toContain("Intro");
    expect(node.html).toContain("<p>");
    expect(node.raw).toContain("## Intro");
  });

  it("uses filename slug when frontmatter slug is absent", () => {
    const raw = `---
title: No Slug Here
---

Content.
`;
    const node = parseContent(raw, "no-slug-here");
    expect(node.slug).toBe("no-slug-here");
  });

  it("handles empty frontmatter gracefully", () => {
    const raw = `---
---

Just content, no metadata.
`;
    const node = parseContent(raw, "bare");
    expect(node.slug).toBe("bare");
    expect(node.meta.title).toBeUndefined();
    expect(node.html).toContain("Just content");
  });

  it("handles empty markdown body (frontmatter only)", () => {
    const raw = `---
title: Empty Body
slug: empty
---
`;
    const node = parseContent(raw, "empty");
    expect(node.html.trim()).toBe("");
    // node.raw is the full input string (including frontmatter); html is empty
    expect(node.raw).toContain("Empty Body");
  });

  it("handles a string with no frontmatter at all", () => {
    const raw = "Just a plain markdown file.\n\nNo YAML here.";
    const node = parseContent(raw, "plain");
    expect(node.slug).toBe("plain");
    expect(node.html).toContain("plain markdown");
  });
});
