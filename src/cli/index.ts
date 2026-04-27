#!/usr/bin/env node
/**
 * vlcms — Very Light CMS CLI
 *
 * Usage:
 *   vlcms pages list
 *   vlcms pages get <slug>
 *   vlcms pages create --title T [--file F] [--publish]
 *   vlcms pages update <slug> [--title T] [--file F] [--publish] [--draft]
 *   vlcms pages delete <slug>
 *   vlcms media list
 *   vlcms media upload <file> [--alt T]
 *   vlcms media delete <id>
 *   vlcms whoami
 *
 * Config via env vars:
 *   VLCMS_URL    — base URL (default: http://localhost:3000)
 *   VLCMS_TOKEN  — JWT token from POST /api/auth/login
 */

import { ApiClient, ApiError, loadConfig } from "./client.js";
import { fmt } from "./format.js";
import { pagesCommand } from "./commands/pages.js";
import { mediaCommand } from "./commands/media.js";
import { authCommand } from "./commands/auth.js";

async function main(): Promise<void> {
  // Strip node + script path; also strip --json (handled by format.ts module-level)
  const rawArgs = process.argv.slice(2).filter((a) => a !== "--json");
  const [entity, ...rest] = rawArgs;

  if (!entity || entity === "--help" || entity === "-h") {
    fmt.help(`
vlcms — Very Light CMS CLI

Usage: vlcms <command> [subcommand] [options]

Commands:
  pages   Manage pages       (list, get, create, update, delete)
  media   Manage media       (list, upload, delete)
  whoami  Verify token and show current user

Options:
  --json  Output raw JSON (suitable for piping)
  -h, --help  Show this help

Config:
  VLCMS_URL    Base URL of the CMS  (default: http://localhost:3000)
  VLCMS_TOKEN  JWT token from POST /api/auth/login
`);
    process.exit(0);
  }

  const config = loadConfig();
  const client = new ApiClient(config);

  try {
    switch (entity) {
      case "pages":
        await pagesCommand(client, rest);
        break;
      case "media":
        await mediaCommand(client, rest);
        break;
      case "whoami":
        await authCommand(client, ["whoami"]);
        break;
      default:
        fmt.error(`Unknown command: ${entity}. Run vlcms --help for usage.`);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      fmt.error(`${err.message} (HTTP ${err.status})`);
      if (err.status === 401) {
        process.stderr.write("Hint: set VLCMS_TOKEN to a valid JWT from POST /api/auth/login\n");
      }
      process.exit(1);
    }
    // Network errors, file not found, etc.
    const msg = err instanceof Error ? err.message : String(err);
    fmt.error(msg);
    process.exit(1);
  }
}

main();
