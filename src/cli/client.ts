/**
 * ApiClient — thin fetch wrapper for the vlcms CLI.
 *
 * Reads config from env:
 *   VLCMS_URL   — base URL of the CMS server (default: http://localhost:3000)
 *   VLCMS_TOKEN — JWT obtained from POST /api/auth/login
 *
 * All methods throw ApiError on non-2xx responses so callers don't have
 * to check status manually.
 */

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

export function loadConfig(): ClientConfig {
  const baseUrl = (process.env["VLCMS_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
  const token = process.env["VLCMS_TOKEN"];
  return { baseUrl, token };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return { ...h, ...extra };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    return this.unwrap<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.unwrap<T>(res);
  }

  async postForm<T>(path: string, form: FormData): Promise<T> {
    // No Content-Type header — fetch sets multipart/form-data with boundary automatically
    const h: Record<string, string> = {};
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: h,
      body: form,
    });
    return this.unwrap<T>(res);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.unwrap<T>(res);
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.headers(),
    });
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
