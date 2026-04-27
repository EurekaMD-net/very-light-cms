/**
 * media commands — vlcms media <subcommand>
 *
 * Subcommands:
 *   list                     GET    /api/media
 *   upload <file> [--alt T]  POST   /api/media/upload
 *   delete <id>              DELETE /api/media/:id
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ApiClient } from "../client.js";
import { fmt } from "../format.js";
import { parseFlags } from "../parse-flags.js";

interface MediaItem {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  alt_text: string | null;
  uploaded_at: number;
}

interface MediaListResponse {
  media: MediaItem[];
}

interface MediaUploadResponse {
  id: number;
  filename: string;
  url: string;
  mime_type: string;
  size_bytes: number;
}



export async function mediaCommand(client: ApiClient, args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  switch (sub) {
    case "list":
      return mediaList(client);
    case "upload":
      return mediaUpload(client, rest);
    case "delete":
      return mediaDelete(client, rest);
    default:
      fmt.help(`
Usage: vlcms media <subcommand>

Subcommands:
  list                        List all uploaded media
  upload <file> [--alt T]     Upload a file (image or PDF)
  delete <id>                 Delete a media file by ID
`);
  }
}

async function mediaList(client: ApiClient): Promise<void> {
  const data = await client.get<MediaListResponse>("/api/media");
  const rows = data.media.map((m) => ({
    id: m.id,
    filename: m.filename,
    type: m.mime_type,
    size: formatBytes(m.size_bytes),
    alt: m.alt_text ?? "",
    uploaded: new Date(m.uploaded_at * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/Mexico_City",
    }),
  }));
  fmt.table(rows, ["id", "filename", "type", "size", "alt", "uploaded"]);
}

async function mediaUpload(client: ApiClient, args: string[]): Promise<void> {
  const { flags, positional } = parseFlags(args);
  const [filePath] = positional;
  if (!filePath) {
    fmt.error("Usage: vlcms media upload <file> [--alt T]");
    process.exit(1);
  }

  const buffer = await readFile(filePath);
  const filename = basename(filePath);
  const mime = guessMime(filename);

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), filename);
  if (typeof flags["alt"] === "string") form.append("alt_text", flags["alt"]);

  const result = await client.postForm<MediaUploadResponse>("/api/media/upload", form);
  fmt.success(`Uploaded: ${result.filename} → ${result.url}`);
  if (fmt.isJsonMode()) {
    fmt.detail(result as unknown as Record<string, unknown>);
  }
}

async function mediaDelete(client: ApiClient, args: string[]): Promise<void> {
  const [id] = args;
  if (!id || isNaN(Number(id))) {
    fmt.error("Usage: vlcms media delete <id>");
    process.exit(1);
  }
  await client.delete(`/api/media/${id}`);
  fmt.success(`Deleted media: ${id}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
