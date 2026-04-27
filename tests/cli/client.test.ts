/**
 * tests/cli/client.test.ts
 * Tests for ApiClient: HTTP error mapping, auth headers, 204 handling.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClient, ApiError } from "../../src/cli/client.js";

const BASE = "http://localhost:3000";
const TOKEN = "test-jwt";

function makeClient(token?: string) {
  return new ApiClient({ baseUrl: BASE, token });
}

function mockFetch(status: number, body: unknown, ok?: boolean) {
  const isOk = ok !== undefined ? ok : status >= 200 && status < 300;
  return vi.fn().mockResolvedValue({
    ok: isOk,
    status,
    statusText: "Status " + status,
    json: () => Promise.resolve(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiClient.get", () => {
  it("returns parsed JSON on 200", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: { pages: [] } }));
    const client = makeClient(TOKEN);
    const result = await client.get("/api/pages");
    expect(result).toEqual({ pages: [] });
  });

  it("sends Authorization header when token provided", async () => {
    const spy = mockFetch(200, { data: {} });
    vi.stubGlobal("fetch", spy);
    await makeClient(TOKEN).get("/api/pages");
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("omits Authorization header when no token", async () => {
    const spy = mockFetch(200, { data: {} });
    vi.stubGlobal("fetch", spy);
    await makeClient().get("/api/pages");
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("throws ApiError with status on 401", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { error: "Unauthorized" }));
    await expect(makeClient().get("/api/pages")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });

  it("throws ApiError with status on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { error: "Not found" }));
    await expect(makeClient(TOKEN).get("/api/pages/missing")).rejects.toMatchObject({
      status: 404,
      message: "Not found",
    });
  });

  it("falls back to statusText when body is not JSON", async () => {
    vi.stubGlobal("fetch", {
      ...mockFetch(500, null),
      mockResolvedValue: undefined,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    }));
    await expect(makeClient(TOKEN).get("/api/pages")).rejects.toMatchObject({
      status: 500,
      message: "Internal Server Error",
    });
  });
});

describe("ApiClient.put", () => {
  it("sends PUT with JSON body and Authorization header", async () => {
    const spy = mockFetch(200, { data: { slug: "hello", status: "published" } });
    vi.stubGlobal("fetch", spy);
    await makeClient(TOKEN).put("/api/pages/hello", { title: "Updated" });
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ title: "Updated" }));
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });
});

describe("ApiClient — 204 No Content", () => {
  it("returns empty object on 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("no body")),
    }));
    const result = await makeClient(TOKEN).delete("/api/pages/my-page");
    expect(result).toEqual({});
  });
});

describe("ApiError", () => {
  it("is instanceof ApiError", () => {
    const e = new ApiError(404, "not found");
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(404);
    expect(e.message).toBe("not found");
    expect(e.name).toBe("ApiError");
  });
});
