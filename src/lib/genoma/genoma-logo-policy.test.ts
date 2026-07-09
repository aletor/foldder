import { describe, expect, it } from "vitest";
import type { Candidate, LogoValue } from "./genoma-types";
import {
  applyLogoVisionLabels,
  buildLogoSlotPatch,
  groupLogoCandidatesForDisplay,
  isExplicitPdfLogoAsset,
  isStrongLogoProvenance,
  prepareLogoCandidates,
  shouldAutoResolveLogo,
} from "./genoma-logo-policy";

function logoCandidate(
  url: string,
  score: number,
  provenanceType: Candidate<LogoValue>["provenance"]["type"],
  detail = provenanceType,
): Candidate<LogoValue> {
  return {
    score,
    provenance: { type: provenanceType, detail },
    value: {
      assetId: url,
      previewUrl: url,
      format: url.endsWith(".svg") ? "svg" : "png",
      width: 240,
      height: 80,
      background: "transparent",
      variants: [],
    },
  };
}

describe("isStrongLogoProvenance", () => {
  it("treats schema and uploads as strong", () => {
    expect(isStrongLogoProvenance({ type: "jsonld", detail: "Organization.logo" })).toBe(true);
    expect(isStrongLogoProvenance({ type: "file_upload", detail: "logo.png" })).toBe(true);
  });

  it("requires explicit logo naming for pdf xobjects", () => {
    expect(isStrongLogoProvenance({ type: "pdf_xobject", detail: "page-1-photo.jpg" })).toBe(false);
    expect(isStrongLogoProvenance({ type: "pdf_xobject", detail: "brand-logo.png" })).toBe(true);
    expect(isExplicitPdfLogoAsset("Imagotipo_RGB.pdf")).toBe(true);
  });
});

describe("prepareLogoCandidates", () => {
  it("drops weak vision rejects and consolidates duplicates", () => {
    const url = "https://brand.test/logo.svg";
    const prepared = prepareLogoCandidates([
      logoCandidate(url, 0.9, "jsonld"),
      logoCandidate(url, 0.85, "header_img"),
      logoCandidate("https://brand.test/hero.jpg", 0.2, "header_img"),
    ]);

    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.score).toBeGreaterThan(0.9);
  });
});

describe("applyLogoVisionLabels", () => {
  it("demotes non-logo images and tags variants", () => {
    const candidates = [
      logoCandidate("https://brand.test/logo.svg", 0.9, "jsonld"),
      logoCandidate("https://brand.test/hero.jpg", 0.7, "header_img"),
      logoCandidate("https://brand.test/icon.png", 0.6, "link_icon"),
    ];

    const labeled = applyLogoVisionLabels(candidates, [
      { index: 0, isLikelyLogo: true, kind: "principal" },
      { index: 1, isLikelyLogo: false },
      { index: 2, isLikelyLogo: true, kind: "icono" },
    ]);

    expect(labeled.some((row) => row.value.previewUrl?.includes("hero"))).toBe(false);
    expect(labeled[0]?.value.previewUrl).toContain("logo.svg");
  });
});

describe("groupLogoCandidatesForDisplay", () => {
  it("folds icon variants into the principal card", () => {
    const principal = applyLogoVisionLabels(
      [logoCandidate("https://brand.test/logo.svg", 0.92, "jsonld")],
      [{ index: 0, isLikelyLogo: true, kind: "principal" }],
    )[0];
    const icon = applyLogoVisionLabels(
      [logoCandidate("https://brand.test/favicon.png", 0.55, "link_icon")],
      [{ index: 0, isLikelyLogo: true, kind: "icono" }],
    )[0];

    const grouped = groupLogoCandidatesForDisplay([principal, icon]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.value.variants).toHaveLength(1);
    expect(grouped[0]?.value.variants[0]?.kind).toBe("icono");
  });
});

describe("buildLogoSlotPatch", () => {
  it("auto-resolves strong schema logos", () => {
    const patch = buildLogoSlotPatch([
      logoCandidate("https://brand.test/logo.svg", 0.95, "jsonld"),
      logoCandidate("https://brand.test/favicon.ico", 0.3, "link_icon"),
    ]);

    expect(patch.status).toBe("resolved");
    expect(patch.value?.previewUrl).toContain("logo.svg");
    expect(patch.needsReviewReason).toBeUndefined();
  });

  it("shows a small picker when evidence conflicts", () => {
    const patch = buildLogoSlotPatch([
      logoCandidate("https://brand.test/a.png", 0.7, "header_img"),
      logoCandidate("https://brand.test/b.png", 0.68, "header_img"),
    ]);

    expect(patch.status).toBe("candidates");
    expect(patch.candidates?.length).toBeLessThanOrEqual(3);
  });

  it("keeps shouldAutoResolveLogo compatible with schema evidence", () => {
    const candidates = [
      logoCandidate("https://brand.test/logo.svg", 0.95, "jsonld"),
      logoCandidate("https://brand.test/favicon.ico", 0.3, "link_icon"),
    ];
    expect(shouldAutoResolveLogo(candidates).auto).toBe(true);
  });

  it("treats vision bbox logos as strong provenance", () => {
    expect(
      isStrongLogoProvenance(
        { type: "pdf_xobject", detail: "visión" },
        {
          assetId: "x",
          format: "png",
          width: 1,
          height: 1,
          background: "transparent",
          variants: [],
          detectionMethod: "vision_bbox",
        },
      ),
    ).toBe(true);
  });
});
