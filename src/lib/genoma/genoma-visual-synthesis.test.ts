import { describe, expect, it } from "vitest";
import { buildVisualWorldFromGallery } from "./genoma-visual-synthesis";
import type { GalleryValue } from "./genoma-types";

function galleryWithCount(count: number): GalleryValue {
  return {
    harvested: Array.from({ length: count }, (_, index) => ({
      assetId: `img-${index}`,
      previewUrl: `https://cdn.example.com/film/still-${index}.jpg`,
      included: true,
      provenance: { type: "header_img", detail: "portfolio film still portrait" },
    })),
    generated: [],
    stylePromptVersion: 0,
  };
}

describe("buildVisualWorldFromGallery", () => {
  it("returns null with fewer than 6 images", () => {
    expect(buildVisualWorldFromGallery(galleryWithCount(5))).toBeNull();
  });

  it("builds a cinematic summary from 24 harvested images", () => {
    const result = buildVisualWorldFromGallery(galleryWithCount(24), "Alima Producciones");
    expect(result?.summary.length).toBeGreaterThan(24);
    expect(result?.summary).toContain("24 imágenes");
    expect(result?.visualTraits.length).toBeGreaterThan(0);
    expect(result?.limits.length).toBeGreaterThan(0);
    expect(result?.galleryRefs).toHaveLength(24);
    expect(result?.moodTags).toContain("cinematográfico");
  });
});
