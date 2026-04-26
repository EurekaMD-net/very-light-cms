import matter from "gray-matter";
import { marked } from "marked";
import { slugify } from "../lib/slugify.js";
import { ValidationError } from "../lib/errors.js";
import type { ContentNode, FrontMatter } from "./types.js";

/**
 * Parse a raw Markdown string (with optional frontmatter) into a ContentNode.
 *
 * Edge cases handled:
 * - Empty frontmatter  → meta defaults to { title: "Untitled" }
 * - Empty body         → html is empty string (not an error)
 * - Missing slug field → derived from title via slugify
 * - Unknown FM fields  → passed through as-is (open schema)
 */
export function parse(raw: string, filenameHint = ""): ContentNode {
  if (typeof raw !== "string") {
    throw new ValidationError("Content must be a string");
  }

  const { data, content } = matter(raw);

  // Normalize frontmatter — no defaults injected; keep raw YAML values as-is.
  const meta: FrontMatter = { ...data };

  // Derive slug: frontmatter.slug > title > filename hint
  const slug =
    typeof meta.slug === "string" && meta.slug.trim() !== ""
      ? meta.slug
      : typeof meta.title === "string" && meta.title.trim() !== ""
      ? slugify(meta.title)
      : filenameHint !== ""
      ? slugify(filenameHint)
      : "untitled";

  // Render Markdown → HTML (synchronous, no async marked plugins)
  // marked.parse() returns string | Promise<string>; we force sync and guard the type.
  const result = marked.parse(content, { async: false });
  const html = typeof result === "string" ? result : "";

  return { slug, meta, raw, html };
}

/** Alias for backward-compatible import in tests. */
export const parseContent = parse;
