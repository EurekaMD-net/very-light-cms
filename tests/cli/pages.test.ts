/**
 * tests/cli/pages.test.ts
 * Tests for `pagesCommand` — mocks ApiClient to avoid real HTTP.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { pagesCommand } from "../../src/cli/commands/pages.js";
import type { ApiClient } from "../../src/cli/client.js";
import { ApiError } from "../../src/cli/client.js";

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

describe("pages list", () => {
  it("calls GET /api/pages and prints table", async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        items: [
          {
            slug: "hello",
            title: "Hello",
            description: null,
            tags: [],
            createdAt: 1700000000,
            updatedAt: 1700000000,
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1 },
      }),
    });
    suppressOutput();
    await pagesCommand(client, ["list"]);
    expect(client.get).toHaveBeenCalledWith("/api/pages");
  });
});

describe("pages get", () => {
  it("calls GET /api/pages/:slug", async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        slug: "hello",
        title: "Hello",
        draft: false,
        html: "body text",
        description: null,
        tags: [],
        createdAt: 1700000000,
        updatedAt: 1700000000,
      }),
    });
    suppressOutput();
    await pagesCommand(client, ["get", "hello"]);
    expect(client.get).toHaveBeenCalledWith("/api/pages/hello");
  });

  it("exits with error when slug missing", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(pagesCommand(client, ["get"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("truncates html to 200 chars in human mode", async () => {
    const { setJsonModeForTests } = await import("../../src/cli/format.js");
    setJsonModeForTests(false);
    const longHtml = "<p>" + "a".repeat(500) + "</p>";
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        slug: "x",
        title: "X",
        draft: false,
        html: longHtml,
        description: null,
        tags: [],
        createdAt: 1700000000,
        updatedAt: 1700000000,
      }),
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await pagesCommand(client, ["get", "x"]);
    const out = writes.join("");
    expect(out).toContain("…");
    expect(out).not.toContain("a".repeat(500));
    setJsonModeForTests(null);
  });

  it("emits full html in --json mode", async () => {
    const { setJsonModeForTests } = await import("../../src/cli/format.js");
    setJsonModeForTests(true);
    const longHtml = "<p>" + "z".repeat(500) + "</p>";
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        slug: "x",
        title: "X",
        draft: false,
        html: longHtml,
        description: null,
        tags: [],
        createdAt: 1700000000,
        updatedAt: 1700000000,
      }),
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await pagesCommand(client, ["get", "x"]);
    const out = writes.join("");
    expect(out).toContain("z".repeat(500));
    expect(out).not.toContain("…");
    setJsonModeForTests(null);
  });
});

describe("pages create", () => {
  it("calls POST /api/pages with title and status=draft by default", async () => {
    const client = makeClient({
      post: vi.fn().mockResolvedValue({
        id: 1,
        slug: "my-page",
        title: "My Page",
        status: "draft",
        content: "",
        description: null,
        created_at: 1700000000,
        updated_at: 1700000000,
      }),
    });
    suppressOutput();
    await pagesCommand(client, ["create", "--title", "My Page"]);
    expect(client.post).toHaveBeenCalledWith(
      "/api/pages",
      expect.objectContaining({
        title: "My Page",
        status: "draft",
      }),
    );
  });

  it("sets status=published when --publish flag present", async () => {
    const client = makeClient({
      post: vi.fn().mockResolvedValue({
        id: 1,
        slug: "my-page",
        title: "My Page",
        status: "published",
        content: "",
        description: null,
        created_at: 1700000000,
        updated_at: 1700000000,
      }),
    });
    suppressOutput();
    await pagesCommand(client, ["create", "--title", "My Page", "--publish"]);
    expect(client.post).toHaveBeenCalledWith(
      "/api/pages",
      expect.objectContaining({
        status: "published",
      }),
    );
  });

  it("exits with error when --title missing", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(pagesCommand(client, ["create"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("pages update", () => {
  it("calls PUT /api/pages/:slug with body", async () => {
    const client = makeClient({
      put: vi.fn().mockResolvedValue({
        id: 1,
        slug: "hello",
        title: "Updated",
        status: "published",
        content: "",
        description: null,
        created_at: 1700000000,
        updated_at: 1700000001,
      }),
    });
    suppressOutput();
    await pagesCommand(client, [
      "update",
      "hello",
      "--title",
      "Updated",
      "--publish",
    ]);
    expect(client.put).toHaveBeenCalledWith(
      "/api/pages/hello",
      expect.objectContaining({
        title: "Updated",
        status: "published",
      }),
    );
  });

  it("exits when no update flags provided", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(pagesCommand(client, ["update", "hello"])).rejects.toThrow(
      "exit",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("pages delete", () => {
  it("calls DELETE /api/pages/:slug", async () => {
    const client = makeClient({
      delete: vi.fn().mockResolvedValue({}),
    });
    suppressOutput();
    await pagesCommand(client, ["delete", "hello"]);
    expect(client.delete).toHaveBeenCalledWith("/api/pages/hello");
  });

  it("exits when slug missing", async () => {
    const client = makeClient();
    suppressOutput();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(pagesCommand(client, ["delete"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("pages — unknown subcommand prints help", () => {
  it("prints help text for unknown subcommand", async () => {
    const client = makeClient();
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    await pagesCommand(client, ["oops"]);
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Usage");
  });
});
