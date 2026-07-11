import { describe, expect, it } from "vitest";
import {
  estimateBrandKitGalleryGenerateCostUsd,
  BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT,
  BRAND_KIT_GALLERY_PER_IMAGE_USD,
} from "./brand-kit-gallery-cost";
import { estimateWalletCostForRoute } from "@/lib/wallet-cost-estimates";

describe("brandKit gallery cost", () => {
  it("uses per-image flash25 pricing, not token estimate", () => {
    expect(BRAND_KIT_GALLERY_PER_IMAGE_USD).toBe(0.02);
    expect(BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT).toBe(10);
    expect(estimateBrandKitGalleryGenerateCostUsd()).toBe(0.2);
  });

  it("wallet preflight estimate matches 10 images at 0.02", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/brandKit/gallery/generate", {
      brandKit: { slots: {} },
    });
    expect(estimate?.estimatedCostMicros).toBe(200_000);
    expect(estimate?.reserveMicros).toBeGreaterThanOrEqual(300_000);
  });
});
