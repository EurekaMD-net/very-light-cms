/**
 * tests/cli/format.test.ts
 * Tests for the fmt formatters: table, detail, success, error, isJsonMode.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// --json mode is determined at module load time via process.argv.
// We test the non-JSON path by default (argv doesn't include --json in test runs).

afterEach(async () => {
  vi.restoreAllMocks();
  // jsonMode override is module-level state — always reset so a test that
  // forgets to clear it can't bleed into the next test or test file.
  const fmt = await import("../../src/cli/format.js");
  fmt.setJsonModeForTests(null);
});

describe("fmt.table", () => {
  it("prints aligned columns", async () => {
    const { fmt } = await import("../../src/cli/format.js");
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    fmt.table(
      [
        { id: 1, slug: "hello", status: "published" },
        { id: 2, slug: "world", status: "draft" },
      ],
      ["id", "slug", "status"],
    );
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("ID");
    expect(output).toContain("SLUG");
    expect(output).toContain("STATUS");
    expect(output).toContain("hello");
    expect(output).toContain("published");
  });

  it("prints (no results) for empty array", async () => {
    const { fmt } = await import("../../src/cli/format.js");
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    fmt.table([], ["id", "slug"]);
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("no results");
  });
});

describe("fmt.detail", () => {
  it("prints key: value pairs", async () => {
    const { fmt } = await import("../../src/cli/format.js");
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    fmt.detail({ id: 42, title: "Hello World", description: null });
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("id");
    expect(output).toContain("42");
    expect(output).toContain("title");
    expect(output).toContain("Hello World");
    expect(output).toContain("(null)");
  });
});

describe("fmt.success", () => {
  it("writes to stdout", async () => {
    const { fmt } = await import("../../src/cli/format.js");
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    fmt.success("Done!");
    expect(spy).toHaveBeenCalledWith("Done!\n");
  });
});

describe("fmt.error", () => {
  it("writes to stderr", async () => {
    const { fmt } = await import("../../src/cli/format.js");
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    fmt.error("Something went wrong");
    expect(spy).toHaveBeenCalledWith("Error: Something went wrong\n");
  });
});

describe("setJsonModeForTests + isJsonMode", () => {
  beforeEach(async () => {
    const fmt = await import("../../src/cli/format.js");
    fmt.setJsonModeForTests(null); // reset to argv-based detection
  });

  it("setJsonModeForTests(true) flips fmt.isJsonMode() on", async () => {
    const { fmt, setJsonModeForTests } =
      await import("../../src/cli/format.js");
    setJsonModeForTests(true);
    expect(fmt.isJsonMode()).toBe(true);
  });

  it("setJsonModeForTests(false) forces off even with --json in argv", async () => {
    const { fmt, setJsonModeForTests } =
      await import("../../src/cli/format.js");
    const originalArgv = process.argv;
    process.argv = [...originalArgv, "--json"];
    setJsonModeForTests(false);
    expect(fmt.isJsonMode()).toBe(false);
    process.argv = originalArgv;
  });

  it("setJsonModeForTests(null) restores argv-based detection", async () => {
    const { fmt, setJsonModeForTests } =
      await import("../../src/cli/format.js");
    setJsonModeForTests(true);
    expect(fmt.isJsonMode()).toBe(true);
    setJsonModeForTests(null);
    // Without --json in argv, default is false
    expect(fmt.isJsonMode()).toBe(false);
  });

  it("table emits raw JSON when --json mode is on", async () => {
    const { fmt, setJsonModeForTests } =
      await import("../../src/cli/format.js");
    setJsonModeForTests(true);
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    fmt.table([{ id: 1 }], ["id"]);
    const output = spy.mock.calls.map((c) => c[0]).join("");
    expect(output.trim()).toMatch(/^\[/); // JSON array
    expect(output).not.toContain("ID  "); // no ascii header
    setJsonModeForTests(null);
  });
});
