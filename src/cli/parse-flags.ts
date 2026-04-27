/**
 * parse-flags.ts — shared CLI flag parser for vlcms commands.
 *
 * Parses an arg array into:
 *   - flags: Record<string, string | true>   (--key value or --key for boolean flags)
 *   - positional: string[]                   (args that do not start with --)
 *
 * Rules:
 *   --key value   => flags["key"] = "value"   (next arg does not start with --)
 *   --key         => flags["key"] = true       (next arg starts with -- or missing)
 *   anything else => positional
 */
export function parseFlags(args: string[]): {
  flags: Record<string, string | true>;
  positional: string[];
} {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { flags, positional };
}
