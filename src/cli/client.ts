/**
 * ApiClient — thin fetch wrapper for the vlcms CLI.
 *
 * Reads config from env:
 *   VLCMS_URL   — base URL of the CMS server (default: http://localhost:3000)
 *   VLCMS_TOKEN — JWT token. If not set, falls back to ~/.vlcms/config.json (written by `vlcms login`).
 *
 * All methods throw ApiError on non-2xx responses so callers don't have
 * to check status manually.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ClientConfig {
  baseUrl: string;
  token: string | undefined;
}

/** Path to the local token store written by `vlcms login`. */
const CONFIG_FILE = join(homedir(), ".vlcms", "config.json");

/**
 * Save a token to ~/.vlcms/config.json.
 * Directory is created if it doesn't exist.
 */
export function saveToken(baseUrl: string, token: string): void {
  const dir = join(homedir(), ".vlcms");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ baseUrl, token }, null, 2),
    "utf8",
  );
}

/**
 * Load saved credentials from ~/.vlcms/config.json, if the file exists.
 */
function loadSavedConfig(): Partial<ClientConfig> {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Partial<ClientConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(): ClientConfig {
  const saved = loadSavedConfig();
  const baseUrl = (
    process.env["VLCMS_URL"] ??
    saved.baseUrl ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  // env var takes precedence over saved file
  const token = process.env["VLCMS_TOKEN"] ?? saved.token;
  return { baseUrl, token };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
  }

  /**
   * POST /api/auth/login — returns { token, userId, role } unwrapped.
   * Does NOT save the token; callers decide whether to persist.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; userId: string; role: string }> {
    return this.post<{ token: string; userId: string; role: string }>(
      "/api/auth/login",
      { email, password },
    );
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return { ...h, ...extra };
  }

  /**
   * Fetch with one transparent retry on transient network errors. HTTP error
   * statuses are NOT retried — those are real responses. Retry is only
   * enabled for safe methods (idempotent: GET, HEAD) — retrying POST/PUT/DELETE
   * on ECONNRESET could double-apply when the server received the request
   * but the response was lost.
   * Backoff: 250ms before the single retry.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retryable: boolean,
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (retryable && isTransientNetworkError(err)) {
        await new Promise((r) => setTimeout(r, 250));
        return await fetch(url, init);
      }
      throw err;
    }
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}${path}`,
      { headers: this.headers() },
      true, // GET is idempotent — safe to retry
    );
    return this.unwrap<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}${path}`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      },
      false, // POST may have side effects — don't retry
    );
    return this.unwrap<T>(res);
  }

  async postForm<T>(path: string, form: FormData): Promise<T> {
    // No Content-Type header — fetch sets multipart/form-data with boundary automatically
    const h: Record<string, string> = {};
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    const res = await this.fetchWithRetry(
      `${this.baseUrl}${path}`,
      { method: "POST", headers: h, body: form },
      false,
    );
    return this.unwrap<T>(res);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}${path}`,
      {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify(body),
      },
      false,
    );
    return this.unwrap<T>(res);
  }

  async delete<T>(path: string): Promise<T> {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}${path}`,
      { method: "DELETE", headers: this.headers() },
      false,
    );
    return this.unwrap<T>(res);
  }

  private async unwrap<T>(res: Response): Promise<T> {
    if (res.ok) {
      // 204 No Content — return empty object
      if (res.status === 204) return {} as T;
      // Server always wraps success in { data: ... } via lib/response.ts ok()
      const envelope = (await res.json()) as { data: T };
      return envelope.data;
    }

    // Try to extract a message from the JSON body
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // body is not JSON — use status text
      message = res.statusText || message;
    }
    throw new ApiError(res.status, message);
  }
}

/**
 * Identify network-level failures worth one retry. Node fetch wraps the
 * underlying system error in `cause` (TypeError "fetch failed" with cause.code),
 * but raw http(s) clients use `err.code` directly. Check both.
 *
 * Codes covered:
 *   ECONNREFUSED — server is not listening (transient during restart)
 *   ETIMEDOUT    — TCP timeout
 *   ENOTFOUND    — DNS hiccup
 *   ECONNRESET   — peer closed mid-request
 *   EAI_AGAIN    — DNS server temporarily unavailable
 *   ENETUNREACH  — network blip (common on VPS / mobile)
 */
const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
]);

export function isTransientNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string } };
  const code = e.cause?.code ?? e.code;
  if (!code) return false;
  return TRANSIENT_CODES.has(code);
}
