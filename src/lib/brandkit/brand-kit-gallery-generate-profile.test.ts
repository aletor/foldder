import { describe, expect, it } from "vitest";
import {
  galleryCategoryGenerateProfile,
  galleryStyleReferenceUrls,
  galleryStyleReferencesAllowed,
  estimateGalleryGenerateCostUsd,
  isPremiumGalleryCategory,
} from "./brand-kit-gallery-generate-profile";
import type { GalleryValue } from "./brand-kit-types";

describe("brand-kit-gallery-generate-profile", () => {
  it("uses flash31 for people_mood and general", () => {
    expect(galleryCategoryGenerateProfile("people_mood")).toEqual({
      model: "flash31",
      aspect_ratio: "4:5",
      resolution: "1k",
    });
    expect(galleryCategoryGenerateProfile("general")).toEqual({
      model: "flash31",
      aspect_ratio: "16:9",
      resolution: "1k",
    });
    expect(isPremiumGalleryCategory("people_mood")).toBe(true);
    expect(isPremiumGalleryCategory("places")).toBe(false);
  });

  it("uses flash25 for places, objects, and textures", () => {
    expect(galleryCategoryGenerateProfile("places").model).toBe("flash25");
    expect(galleryCategoryGenerateProfile("objects").model).toBe("flash25");
    expect(galleryCategoryGenerateProfile("textures").model).toBe("flash25");
  });

  it("skips harvested refs for people_mood and places (copyright risk)", () => {
    expect(galleryStyleReferencesAllowed("people_mood")).toBe(false);
    expect(galleryStyleReferencesAllowed("places")).toBe(false);
    expect(galleryStyleReferencesAllowed("objects")).toBe(true);
    const gallery: GalleryValue = {
      harvested: [{ assetId: "b", rankScore: 5, included: true, previewUrl: "https://x/b.jpg" }],
      generated: [],
      stylePromptVersion: 1,
    };
    expect(galleryStyleReferenceUrls(gallery, 2, "people_mood")).toEqual([]);
    expect(galleryStyleReferenceUrls(gallery, 2, "objects")).toEqual(["https://x/b.jpg"]);
  });

  it("collects top harvested references excluding omitted items", () => {
    const gallery: GalleryValue = {
      harvested: [
        { assetId: "a", rankScore: 1, included: false, previewUrl: "https://x/a.jpg" },
        { assetId: "b", rankScore: 5, included: true, previewUrl: "https://x/b.jpg" },
        { assetId: "c", rankScore: 4, included: true, previewUrl: "https://x/c.jpg" },
        { assetId: "d", rankScore: 3, included: true, previewUrl: "https://x/b.jpg" },
      ],
      generated: [],
      stylePromptVersion: 1,
    };
    expect(galleryStyleReferenceUrls(gallery, 2)).toEqual([
      "https://x/b.jpg",
      "https://x/c.jpg",
    ]);
  });

  it("estimates full gallery with 8 premium and 12 standard images", () => {
    const total = estimateGalleryGenerateCostUsd(20);
    expect(total).toBeGreaterThan(0.7);
    expect(total).toBeLessThan(0.8);
  });
});
