export interface FrontMatter {
  title: string;
  slug?: string;
  date?: string;
  description?: string;
  draft?: boolean;
  tags?: string[];
  /** Any additional custom fields */
  [key: string]: unknown;
}

export interface ContentNode {
  /** Resolved slug (from frontmatter or filename) */
  slug: string;
  /** Parsed frontmatter fields */
  meta: FrontMatter;
  /** Raw Markdown source */
  raw: string;
  /** Rendered HTML from Markdown body */
  html: string;
}
