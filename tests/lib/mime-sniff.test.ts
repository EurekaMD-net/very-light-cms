/**
 * tests/lib/mime-sniff.test.ts — magic-byte signature checks per allowed type.
 */

import { describe, it, expect } from "vitest";
import { detectMimeMatches } from "../../src/lib/mime-sniff.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF87 = Buffer.from(Buffer.from("GIF87a"));
const GIF89 = Buffer.from(Buffer.from("GIF89a"));
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP"),
]);
const PDF = Buffer.from(Buffer.from("%PDF-1.4\n"));

describe("detectMimeMatches — happy path", () => {
  it("PNG signature matches image/png", () => {
    expect(detectMimeMatches(PNG, "image/png")).toBe(true);
  });

  it("JPEG signature matches image/jpeg", () => {
    expect(detectMimeMatches(JPEG, "image/jpeg")).toBe(true);
  });

  it("GIF87a matches image/gif", () => {
    expect(detectMimeMatches(GIF87, "image/gif")).toBe(true);
  });

  it("GIF89a matches image/gif", () => {
    expect(detectMimeMatches(GIF89, "image/gif")).toBe(true);
  });

  it("WebP RIFF...WEBP matches image/webp", () => {
    expect(detectMimeMatches(WEBP, "image/webp")).toBe(true);
  });

  it("PDF %PDF prefix matches application/pdf", () => {
    expect(detectMimeMatches(PDF, "application/pdf")).toBe(true);
  });
});

describe("detectMimeMatches — mismatch", () => {
  it("rejects PNG bytes claiming JPEG type", () => {
    expect(detectMimeMatches(PNG, "image/jpeg")).toBe(false);
  });

  it("rejects JPEG bytes claiming PNG type", () => {
    expect(detectMimeMatches(JPEG, "image/png")).toBe(false);
  });

  it("rejects PDF bytes claiming PNG type", () => {
    expect(detectMimeMatches(PDF, "image/png")).toBe(false);
  });

  it("rejects script content claiming image/png", () => {
    const script = Buffer.from("<script>alert(1)</script>");
    expect(detectMimeMatches(script, "image/png")).toBe(false);
  });

  it("rejects SVG (which is no longer in the allowlist anyway)", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectMimeMatches(svg, "image/svg+xml")).toBe(false);
  });
});

describe("detectMimeMatches — edge cases", () => {
  it("returns false on empty buffer", () => {
    expect(detectMimeMatches(Buffer.alloc(0), "image/png")).toBe(false);
  });

  it("returns false on too-short buffer (3 bytes)", () => {
    expect(
      detectMimeMatches(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"),
    ).toBe(false);
  });

  it("returns false on unrecognized declared type", () => {
    expect(detectMimeMatches(PNG, "video/mp4")).toBe(false);
  });
});
