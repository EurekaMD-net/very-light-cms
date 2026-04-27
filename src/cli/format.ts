/**
 * format.ts — output formatters for the vlcms CLI.
 *
 * Two modes:
 *   - Human (default): aligned table + key-value detail view
 *   - JSON (--json flag): raw JSON to stdout, for piping
 *
 * Usage:
 *   import { fmt } from "../format.js";
 *   fmt.table(rows, ["id", "slug", "status"]);
 *   fmt.detail(obj);
 *   fmt.success("Created page: my-slug");
 *   fmt.error("Not found");          // writes to stderr
 */

const jsonMode = process.argv.includes("--json");

function isJsonMode(): boolean {
  return jsonMode;
}

/** Print a list of objects as an aligned text table, or raw JSON array. */
function table(rows: Record<string, unknown>[], columns: string[]): void {
  if (isJsonMode()) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }
  if (rows.length === 0) {
    process.stdout.write("(no results)\n");
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length)),
  );

  // Header
  const header = columns.map((col, i) => col.toUpperCase().padEnd(widths[i]!)).join("  ");
  const divider = widths.map((w) => "-".repeat(w)).join("  ");
  process.stdout.write(header + "\n" + divider + "\n");

  // Rows
  for (const row of rows) {
    const line = columns.map((col, i) => String(row[col] ?? "").padEnd(widths[i]!)).join("  ");
    process.stdout.write(line + "\n");
  }
}

/** Print a single object as key: value pairs, or raw JSON. */
function detail(obj: Record<string, unknown>): void {
  if (isJsonMode()) {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
    return;
  }
  const keyWidth = Math.max(...Object.keys(obj).map((k) => k.length));
  for (const [key, val] of Object.entries(obj)) {
    const valStr = val === null ? "(null)" : val === undefined ? "(undefined)" : String(val);
    process.stdout.write(`${key.padEnd(keyWidth)}  ${valStr}\n`);
  }
}

/** Print a success message. Suppressed in --json mode (caller prints JSON). */
function success(msg: string): void {
  if (!isJsonMode()) process.stdout.write(msg + "\n");
}

/** Print an error message to stderr. Always shown, even in --json mode. */
function error(msg: string): void {
  process.stderr.write(`Error: ${msg}\n`);
}

/** Print an informational line (suppressed in --json mode). */
function info(msg: string): void {
  if (!isJsonMode()) process.stdout.write(msg + "\n");
}

/** Print usage/help text. */
function help(text: string): void {
  process.stdout.write(text.trimStart() + "\n");
}

export const fmt = { table, detail, success, error, info, help, isJsonMode };
