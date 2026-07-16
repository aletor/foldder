import { describe, expect, it } from "vitest";
import {
  approveGalleryImage,
  computeGalleryLibraryStats,
  gallerySlotKey,
  resolveGalleryImageVisualState,
  resolveShowcaseGalleryImage,
} from "./brand-kit-gallery-image-state";
import type { GalleryValue } from "./brand-kit-types";

const baseGallery = (): GalleryValue => ({
  harvested: [],
  generated: [],
  stylePromptVersion: 1,
});

describe("brand-kit-gallery-image-state", () => {
  it("distingue autoaceptada de aprobada", () => {
    const gallery = baseGallery();
    gallery.generated = [
      {
        assetId: "a",
        previewUrl: "https://example.com/a.png",
        verdict: "up",
        promptVersion: 1,
        category: "people_mood",
        variantIndex: 0,
      },
    ];
    const key = gallerySlotKey("people_mood", 0);
    expect(resolveGalleryImageVisualState(gallery.generated[0], key, gallery, false)).toBe("auto_accepted");

    const approved = approveGalleryImage(gallery, "people_mood", 0);
    expect(resolveGalleryImageVisualState(approved.generated[0], key, approved, false)).toBe("approved");
  });

  it("cuenta estadísticas de biblioteca", () => {
    const gallery = baseGallery();
    gallery.generated = [
      {
        assetId: "a",
        previewUrl: "https://example.com/a.png",
        userApproved: true,
        promptVersion: 1,
        category: "people_mood",
        variantIndex: 0,
      },
      {
        assetId: "b",
        previewUrl: "https://example.com/b.png",
        verdict: "up",
        promptVersion: 1,
        category: "places",
        variantIndex: 0,
      },
    ];
    gallery.slotIssues = {
      "objects:0": { error: "falló", at: "2026-01-01T00:00:00.000Z", noCharge: true },
    };
    const stats = computeGalleryLibraryStats(gallery, false);
    expect(stats.approved).toBe(1);
    expect(stats.proposals).toBe(1);
    expect(stats.errors).toBe(1);
  });

  it("prioriza imagen principal y aprobada en showcase", () => {
    const gallery = baseGallery();
    gallery.generated = [
      {
        assetId: "auto",
        previewUrl: "https://example.com/auto.png",
        verdict: "up",
        promptVersion: 1,
        category: "people_mood",
        variantIndex: 0,
      },
      {
        assetId: "hero",
        previewUrl: "https://example.com/hero.png",
        userApproved: true,
        promptVersion: 1,
        category: "places",
        variantIndex: 0,
      },
    ];
    gallery.primaryImageAssetId = "hero";
    expect(resolveShowcaseGalleryImage(gallery, false)).toBe("https://example.com/hero.png");
  });
});
