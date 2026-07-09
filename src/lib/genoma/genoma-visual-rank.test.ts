import { describe, expect, it } from "vitest";
import {
  consolidateLogoCandidates,
  rankHarvestedGalleryItems,
  rankLogoCandidatesMultiSource,
} from "./genoma-visual-rank";
import type { Candidate, LogoValue } from "./genoma-types";

function logoCandidate(
  url: string,
  score: number,
  provenanceType: "jsonld" | "header_img" | "link_icon" | "file_upload",
  format: LogoValue["format"] = "png",
): Candidate<LogoValue> {
  return {
    score,
    provenance: {
      type: provenanceType,
      detail: provenanceType,
      sourceUrl: url,
    },
    value: {
      assetId: url,
      previewUrl: url,
      format,
      width: 240,
      height: 80,
      background: "transparent",
      variants: [],
    },
  };
}

describe("rankLogoCandidatesMultiSource", () => {
  it("prefers svg + schema over favicon", () => {
    const ranked = rankLogoCandidatesMultiSource([
      logoCandidate("https://brand.test/favicon.ico", 0.82, "link_icon", "ico"),
      logoCandidate("https://brand.test/logo.svg", 0.86, "jsonld", "svg"),
    ]);

    expect(ranked[0]?.value.previewUrl).toContain("logo.svg");
    expect(ranked[0]?.rankLabel).toBeTruthy();
    expect(ranked[0]?.rankSignals).toEqual(expect.arrayContaining(["svg", "schema oficial"]));
  });

  it("boosts repeated logo detections", () => {
    const url = "https://brand.test/header-logo.png";
    const ranked = rankLogoCandidatesMultiSource([
      logoCandidate(url, 0.8, "header_img"),
      logoCandidate(url, 0.78, "header_img"),
      logoCandidate(url, 0.77, "header_img"),
    ]);

    expect(consolidateLogoCandidates([
      logoCandidate(url, 0.8, "header_img"),
      logoCandidate(url, 0.78, "header_img"),
    ])).toHaveLength(1);
    expect(ranked[0]?.rankSignals).toEqual(expect.arrayContaining(["repetido 3×"]));
  });
});

describe("rankHarvestedGalleryItems", () => {
  it("ranks brand photography above generic assets", () => {
    const ranked = rankHarvestedGalleryItems([
      {
        assetId: "a",
        previewUrl: "https://brand.test/spacer.gif",
        included: true,
        provenance: { type: "header_img", detail: "spacer" },
      },
      {
        assetId: "b",
        previewUrl: "https://brand.test/hero-project.jpg",
        included: true,
        provenance: { type: "og_meta", detail: "portfolio hero" },
      },
    ]);

    expect(ranked[0]?.assetId).toBe("b");
    expect(ranked[0]?.rankSignals).toEqual(expect.arrayContaining(["fotografía de marca"]));
  });
});
