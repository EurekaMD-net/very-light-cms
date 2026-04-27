/**
 * tests/cli/media.test.ts
 * Tests for `mediaCommand` — mocks ApiClient to avoid real HTTP.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { mediaCommand } from "../../src/cli/commands/media.js";
import type { ApiClient } from "../../src/cli/client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    postForm: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

function suppressOutput() {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
}

describe("media list", () => {
  it("calls GET /api/media and prints table", async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        media: [
          {
            id: 1, filename: "photo.jpg", mime_type: "image/jpeg",
            size_bytes: 102400, alt_text: "A photo", uploaded_at: 1700000000,
          },
        ],
      }),
    });
    suppressOutput();
    await mediaCommand(client, ["list"]);
    expect(client.get).toHaveBeenCalledWith("/api/media");
  });
});

describe("media delete", () => {
  it("calls DELETE /api/media/:id", async () => {
    const client = makeClient({
      delete: vi.fn().mockResolvedValue({}),
    });
    suppressOutput();
    await mediaCommand(client, ["delete", "5"]);
    expect(client.delete).toHaveBeenCalledWith("/api/media/5");
  });

  it("exits when id missing", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    await expect(mediaCommand(client, ["delete"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when id is not a number", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    await expect(mediaCommand(client, ["delete", "not-a-number"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("media upload", () => {
  it("exits when file path missing", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    await expect(mediaCommand(client, ["upload"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("media — unknown subcommand prints help", () => {
  it("prints help for unknown subcommand", async () => {
    const client = makeClient();
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await mediaCommand(client, ["oops"]);
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Usage");
  });
});
