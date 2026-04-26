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

  // Normalize frontmatter — title is the only required field
  const meta: FrontMatter = {
    title: "Untitled",
    ...data,
  };

  // Derive slug: frontmatter.slug > title > filename hint
  const slug =
    typeof meta.slug === "string" && meta.slug.trim() !== ""
      ? meta.slug
      : meta.title !== "Untitled"
      ? slugify(meta.title)
      : filenameHint !== ""
      ? slugify(filenameHint)
      : "untitled";

  // Render Markdown → HTML (synchronous, no async marked plugins)
  const html = marked.parse(content, { async: false }) as string;

  return { slug, meta, raw, html };
}
