/**
 * auth command — vlcms whoami
 *
 * Verifies the current token by hitting GET /api/auth/me.
 * Prints the authenticated user's info.
 */

import type { ApiClient } from "../client.js";
import { fmt } from "../format.js";

interface MeResponse {
  userId: string;
  role: string;
}

export async function authCommand(client: ApiClient, args: string[]): Promise<void> {
  const [sub] = args;
  if (sub === "whoami" || sub === undefined) {
    return whoami(client);
  }
  fmt.help(`
Usage: vlcms whoami     Verify token and show current user
`);
}

async function whoami(client: ApiClient): Promise<void> {
  const me = await client.get<MeResponse>("/api/auth/me");
  fmt.detail({
    userId: me.userId,
    role: me.role,
  });
}
