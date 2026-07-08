import { describe, expect, it } from "vitest";
import {
  estimateGenomaGalleryGenerateCostUsd,
  GENOMA_GALLERY_GENERATE_IMAGE_COUNT,
  GENOMA_GALLERY_PER_IMAGE_USD,
} from "./genoma-gallery-cost";
import { estimateWalletCostForRoute } from "@/lib/wallet-cost-estimates";

describe("genoma gallery cost", () => {
  it("uses per-image flash25 pricing, not token estimate", () => {
    expect(GENOMA_GALLERY_PER_IMAGE_USD).toBe(0.02);
    expect(GENOMA_GALLERY_GENERATE_IMAGE_COUNT).toBe(10);
    expect(estimateGenomaGalleryGenerateCostUsd()).toBe(0.2);
  });

  it("wallet preflight estimate matches 10 images at 0.02", () => {
    const estimate = estimateWalletCostForRoute("/api/spaces/genoma/gallery/generate", {
      genoma: { slots: {} },
    });
    expect(estimate?.estimatedCostMicros).toBe(200_000);
    expect(estimate?.reserveMicros).toBeGreaterThanOrEqual(300_000);
  });
});
