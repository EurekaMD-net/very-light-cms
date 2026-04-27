/**
 * auth commands — vlcms login / vlcms whoami
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ApiClient } from "../client.js";
import { saveToken } from "../client.js";
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
  if (sub === "login") {
    return login(client);
  }
  fmt.help(`
Usage:
  vlcms login           Interactive login — saves token to ~/.vlcms/config.json
  vlcms whoami          Verify token and show current user
`);
}

async function login(client: ApiClient): Promise<void> {
  const rl = createInterface({ input, output });
  const email = await rl.question("Email: ");
  // Prompt for password without echoing
  output.write("Password: ");
  const password = await new Promise<string>((resolve) => {
    let pw = "";
    // Disable echo
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        process.stdin.removeListener("data", onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        output.write("\n");
        resolve(pw);
      } else if (ch === "\u0003") {
        // Ctrl-C
        process.exit(0);
      } else if (ch === "\u007f" || ch === "\b") {
        // Backspace
        pw = pw.slice(0, -1);
      } else {
        pw += ch;
      }
    };
    process.stdin.on("data", onData);
  });
  rl.close();

  // ApiClient.login() POSTs to /api/auth/login and unwraps { data: { token, userId, role } }
  const result = await client.login(email, password);

  // Persist token alongside the base URL for future invocations
  // client exposes baseUrl via the config passed at construction;
  // we read it from env / saved config the same way loadConfig() does.
  const baseUrl =
    (process.env["VLCMS_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
  saveToken(baseUrl, result.token);

  fmt.detail({
    status: "Logged in",
    userId: result.userId,
    role: result.role,
    saved: "~/.vlcms/config.json",
  });
}

async function whoami(client: ApiClient): Promise<void> {
  const me = await client.get<MeResponse>("/api/auth/me");
  fmt.detail({
    userId: me.userId,
    role: me.role,
  });
}
