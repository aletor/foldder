import { describe, expect, it } from "vitest";
import type { BrandKitDocument, LogoValue } from "@/lib/brandkit/brand-kit-types";
import { shouldRenderLogoInverse, logoInversePreviewUrl } from "./brand-kit-logo-inverse";

function docWithLogo(logo: Partial<LogoValue> & Pick<LogoValue, "assetId">): BrandKitDocument {
  return {
    brandName: { value: "Test" },
    slots: {
      logo: {
        status: "resolved",
        locked: true,
        value: {
          format: "png",
          width: 100,
          height: 100,
          background: "transparent",
          variants: [],
          previewUrl: "https://example.com/logo.png",
          ...logo,
        } as LogoValue,
        candidates: [],
        history: [],
      },
    },
  } as unknown as BrandKitDocument;
}

describe("shouldRenderLogoInverse", () => {
  it("returns false for opaque PNG even with transparent metadata", () => {
    const doc = docWithLogo({ background: "transparent", format: "png" });
    expect(shouldRenderLogoInverse(doc)).toBe(false);
  });

  it("returns true for SVG", () => {
    const doc = docWithLogo({ background: "solid", format: "svg" });
    expect(shouldRenderLogoInverse(doc)).toBe(true);
  });

  it("returns true when negativo variant exists", () => {
    const doc = docWithLogo({
      background: "solid",
      variants: [{ kind: "negativo", assetId: "n1", previewUrl: "https://example.com/neg.png" }],
    });
    expect(shouldRenderLogoInverse(doc)).toBe(true);
    expect(logoInversePreviewUrl(doc)).toBe("https://example.com/neg.png");
  });
});
