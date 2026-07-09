import { describe, expect, it } from "vitest";
import type { LogoValue } from "./genoma-types";
import {
  logoCandidateFingerprint,
  logosAreSameFamily,
} from "./genoma-logo-policy";

function logoValue(overrides: Partial<LogoValue> = {}): LogoValue {
  return {
    assetId: "https://cdn.test/logo.png",
    previewUrl: "https://cdn.test/logo.png",
    format: "png",
    width: 240,
    height: 80,
    background: "transparent",
    variants: [],
    ...overrides,
  };
}

describe("logoCandidateFingerprint", () => {
  it("uses vision bbox coordinates when present", () => {
    const fingerprint = logoCandidateFingerprint({
      score: 0.9,
      provenance: { type: "pdf_xobject", detail: "visión" },
      value: logoValue({
        sourcePdfSha256: "abc123",
        sourcePageNumber: 1,
        sourceBbox: { x: 0.04, y: 0.03, width: 0.28, height: 0.09 },
      }),
    });
    expect(fingerprint).toContain("vision:abc123:1:");
  });
});

describe("logosAreSameFamily", () => {
  it("treats same PDF page as same family", () => {
    const a = logoValue({ sourcePdfSha256: "sha", sourcePageNumber: 2 });
    const b = logoValue({
      assetId: "other",
      previewUrl: "other",
      sourcePdfSha256: "sha",
      sourcePageNumber: 2,
    });
    expect(logosAreSameFamily(a, b)).toBe(true);
  });

  it("treats different PDF logos as different families", () => {
    const a = logoValue({
      assetId: "https://cdn.test/a.png",
      previewUrl: "https://cdn.test/a.png",
      sourcePdfSha256: "sha-a",
      sourcePageNumber: 1,
    });
    const b = logoValue({
      assetId: "https://cdn.test/b.png",
      previewUrl: "https://cdn.test/b.png",
      sourcePdfSha256: "sha-b",
      sourcePageNumber: 1,
    });
    expect(logosAreSameFamily(a, b)).toBe(false);
  });
});
