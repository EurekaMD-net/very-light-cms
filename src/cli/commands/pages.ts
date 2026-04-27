/**
 * pages commands — vlcms pages <subcommand>
 *
 * Subcommands:
 *   list                          GET  /api/pages
 *   get <slug>                    GET  /api/pages/:slug
 *   create --title T [--file F] [--description D] [--publish]
 *                                 POST /api/pages
 *   update <slug> [--title T] [--file F] [--description D] [--publish] [--draft]
 *                                 PUT  /api/pages/:slug
 *   delete <slug>                 DELETE /api/pages/:slug
 */

import { readFile } from "node:fs/promises";
import type { ApiClient } from "../client.js";
import { fmt } from "../format.js";
import { parseFlags } from "../parse-flags.js";

// Shape returned by GET /api/pages (items array inside { items, pagination })
interface PageListItem {
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface PageListResponse {
  items: PageListItem[];
  pagination: { limit: number; offset: number; total: number };
}

// Shape returned by GET /api/pages/:slug and POST/PUT /api/pages
interface PageDetail {
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  draft: boolean;
  createdAt: number;
  updatedAt: number;
  html?: string;   // GET /:slug returns html; POST/PUT return same minus html
}

export async function pagesCommand(client: ApiClient, args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  switch (sub) {
    case "list":
      return pagesList(client);
    case "get":
      return pagesGet(client, rest);
    case "create":
      return pagesCreate(client, rest);
    case "update":
      return pagesUpdate(client, rest);
    case "delete":
      return pagesDelete(client, rest);
    default:
      fmt.help(`
Usage: vlcms pages <subcommand>

Subcommands:
  list                             List all pages
  get <slug>                       Get page detail
  create --title T [--file F]      Create a page (--publish to publish immediately)
         [--description D]
         [--publish]
  update <slug> [--title T]        Update a page (--publish / --draft to change status)
         [--file F] [--description D]
         [--publish] [--draft]
  delete <slug>                    Delete a page
`);
  }
}

async function pagesList(client: ApiClient): Promise<void> {
  const { items, pagination } = await client.get<PageListResponse>("/api/pages");
  const rows = items.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description ?? "",
    created: new Date(p.createdAt * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/Mexico_City",
    }),
  }));
  fmt.table(rows, ["slug", "title", "description", "created"]);
  fmt.info(`Total: ${pagination.total} (showing ${items.length})`);
}

async function pagesGet(client: ApiClient, args: string[]): Promise<void> {
  const [slug] = args;
  if (!slug) {
    fmt.error("Usage: vlcms pages get <slug>");
    process.exit(1);
  }
  const page = await client.get<PageDetail>(`/api/pages/${slug}`);
  fmt.detail({
    slug: page.slug,
    title: page.title,
    draft: String(page.draft),
    description: page.description ?? "",
    created_at: new Date(page.createdAt * 1000).toISOString(),
    updated_at: new Date(page.updatedAt * 1000).toISOString(),
    html: page.html ? (page.html.slice(0, 200) + (page.html.length > 200 ? "…" : "")) : "",
  });
}

async function pagesCreate(client: ApiClient, args: string[]): Promise<void> {
  const { flags } = parseFlags(args);
  const title = typeof flags["title"] === "string" ? flags["title"] : undefined;
  if (!title) {
    fmt.error("Usage: vlcms pages create --title T [--file F] [--description D] [--publish]");
    process.exit(1);
  }

  let content = "";
  if (typeof flags["file"] === "string") {
    content = await readFile(flags["file"], "utf8");
  }

  const body: Record<string, unknown> = {
    title,
    content,
    status: flags["publish"] ? "published" : "draft",
  };
  if (typeof flags["description"] === "string") body["description"] = flags["description"];

  const page = await client.post<PageDetail>("/api/pages", body);
  fmt.success(`Created page: ${page.slug} (${page.draft ? "draft" : "published"})`);
  if (fmt.isJsonMode()) fmt.detail(page as unknown as Record<string, unknown>);
}

async function pagesUpdate(client: ApiClient, args: string[]): Promise<void> {
  const { flags, positional } = parseFlags(args);
  const [slug] = positional;
  if (!slug) {
    fmt.error("Usage: vlcms pages update <slug> [--title T] [--file F] [--publish] [--draft]");
    process.exit(1);
  }

  const body: Record<string, unknown> = {};
  if (typeof flags["title"] === "string") body["title"] = flags["title"];
  if (typeof flags["description"] === "string") body["description"] = flags["description"];
  if (flags["publish"]) body["status"] = "published";
  if (flags["draft"]) body["status"] = "draft";
  if (typeof flags["file"] === "string") {
    body["content"] = await readFile(flags["file"], "utf8");
  }

  if (Object.keys(body).length === 0) {
    fmt.error("Nothing to update — pass at least one flag (--title, --file, --publish, --draft)");
    process.exit(1);
  }

  const page = await client.put<PageDetail>(`/api/pages/${slug}`, body);
  fmt.success(`Updated page: ${page.slug} (${page.draft ? "draft" : "published"})`);
  if (fmt.isJsonMode()) fmt.detail(page as unknown as Record<string, unknown>);
}

async function pagesDelete(client: ApiClient, args: string[]): Promise<void> {
  const [slug] = args;
  if (!slug) {
    fmt.error("Usage: vlcms pages delete <slug>");
    process.exit(1);
  }
  await client.delete(`/api/pages/${slug}`);
  fmt.success(`Deleted page: ${slug}`);
}
