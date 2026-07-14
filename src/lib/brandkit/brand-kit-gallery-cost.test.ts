import { describe, expect, it } from "vitest";
import {
  estimateBrandKitGalleryGenerateCostUsd,
  estimateBrandKitGalleryCategoryCostUsd,
  BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT,
  BRAND_KIT_GALLERY_PER_IMAGE_USD,
} from "./brand-kit-gallery-cost";
import { estimateWalletCostForRoute } from "@/lib/wallet-cost-estimates";

describe("brandKit gallery cost", () => {
  it("uses per-image flash25 pricing, not token estimate", () => {
    expect(BRAND_KIT_GALLERY_PER_IMAGE_USD).toBe(0.02);
    expect(BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT).toBe(20);
    expect(estimateBrandKitGalleryGenerateCostUsd()).toBe(0.4);
    expect(estimateBrandKitGalleryCategoryCostUsd()).toBe(0.08);
  });

  it("wallet preflight estimate matches 20 images at 0.02", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/brandKit/gallery/generate", {
      brandKit: { slots: {} },
    });
    expect(estimate?.estimatedCostMicros).toBe(400_000);
    expect(estimate?.reserveMicros).toBeGreaterThanOrEqual(300_000);
  });

  it("wallet preflight estimate matches per-category generation", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/brandKit/gallery/generate", {
      brandKit: { slots: {} },
      category: "objects",
    });
    expect(estimate?.estimatedCostMicros).toBe(80_000);
    expect(estimate?.reserveMicros).toBeGreaterThanOrEqual(120_000);
  });
});
