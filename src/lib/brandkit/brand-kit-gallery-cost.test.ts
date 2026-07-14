import { describe, expect, it } from "vitest";
import {
  estimateBrandKitGalleryGenerateCostUsd,
  estimateBrandKitGalleryCategoryCostUsd,
  BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT,
  BRAND_KIT_GALLERY_PER_IMAGE_USD,
} from "./brand-kit-gallery-cost";
import { estimateWalletCostForRoute } from "@/lib/wallet-cost-estimates";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";

describe("brandKit gallery cost", () => {
  const flash31 = estimateGeminiImageGenerationUsd("flash31", "1k");
  const flash25 = estimateGeminiImageGenerationUsd("flash25", "1k");

  it("uses mixed flash31 + flash25 pricing for full gallery", () => {
    const expectedTotal = Math.round((flash31 * 8 + flash25 * 12) * 1_000_000) / 1_000_000;
    expect(BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT).toBe(20);
    expect(estimateBrandKitGalleryGenerateCostUsd()).toBe(expectedTotal);
    expect(BRAND_KIT_GALLERY_PER_IMAGE_USD).toBe(
      Math.round((expectedTotal / BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT) * 1_000_000) / 1_000_000,
    );
  });

  it("charges premium per-category for people_mood and general", () => {
    expect(estimateBrandKitGalleryCategoryCostUsd("people_mood")).toBe(
      Math.round(flash31 * 4 * 1_000_000) / 1_000_000,
    );
    expect(estimateBrandKitGalleryCategoryCostUsd("general")).toBe(
      Math.round(flash31 * 4 * 1_000_000) / 1_000_000,
    );
    expect(estimateBrandKitGalleryCategoryCostUsd("objects")).toBe(
      Math.round(flash25 * 4 * 1_000_000) / 1_000_000,
    );
  });

  it("wallet preflight estimate matches mixed full gallery pricing", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/brandKit/gallery/generate", {
      brandKit: { slots: {} },
    });
    const expectedMicros = Math.ceil(estimateBrandKitGalleryGenerateCostUsd() * 1_000_000);
    expect(estimate?.estimatedCostMicros).toBe(expectedMicros);
    expect(estimate?.reserveMicros).toBeGreaterThanOrEqual(Math.ceil(expectedMicros * 1.5));
  });

  it("wallet preflight estimate matches per-category generation", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/brandKit/gallery/generate", {
      brandKit: { slots: {} },
      category: "people_mood",
    });
    expect(estimate?.estimatedCostMicros).toBe(Math.ceil(flash31 * 4 * 1_000_000));
    expect(estimate?.reserveMicros).toBeGreaterThanOrEqual(Math.ceil(flash31 * 4 * 1.5 * 1_000_000));
  });
});
