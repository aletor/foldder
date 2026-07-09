import { describe, expect, it } from "vitest";
import {
  applyGalleryMediaMirrors,
  externalGalleryMediaUrls,
  galleryItemSourceUrl,
} from "./genoma-gallery-media";
import type { GalleryValue } from "./genoma-types";

const SAMPLE_GALLERY: GalleryValue = {
  harvested: [
    {
      assetId: "https://volleyball.it/wp-content/uploads/hero.jpg",
      included: true,
      provenance: { type: "header_img", detail: "image principal" },
    },
    {
      assetId: "https://volleyball.it/wp-content/uploads/hero.jpg",
      previewUrl: "https://volleyball.it/wp-content/uploads/hero-2.jpg",
      included: true,
      provenance: { type: "header_img", detail: "image principal" },
    },
    {
      assetId: "/api/spaces/s3-file?key=knowledge-files%2Fu%2Fgenoma%2Fingest%2Fa.png",
      previewUrl: "/api/spaces/s3-file?key=knowledge-files%2Fu%2Fgenoma%2Fingest%2Fa.png",
      included: true,
      provenance: { type: "file_upload", detail: "archivo" },
    },
  ],
  generated: [],
  stylePromptVersion: 0,
};

describe("genoma-gallery-media", () => {
  it("resolves source url from preview or asset", () => {
    expect(galleryItemSourceUrl(SAMPLE_GALLERY.harvested[0])).toBe(
      "https://volleyball.it/wp-content/uploads/hero.jpg",
    );
    expect(galleryItemSourceUrl(SAMPLE_GALLERY.harvested[1])).toBe(
      "https://volleyball.it/wp-content/uploads/hero-2.jpg",
    );
  });

  it("lists only external urls pending hydration", () => {
    expect(externalGalleryMediaUrls(SAMPLE_GALLERY).sort()).toEqual([
      "https://volleyball.it/wp-content/uploads/hero-2.jpg",
      "https://volleyball.it/wp-content/uploads/hero.jpg",
    ]);
  });

  it("applies mirrored preview urls", () => {
    const mirrored = {
      "https://volleyball.it/wp-content/uploads/hero.jpg":
        "/api/spaces/s3-file?key=knowledge-files%2Fu%2Fgenoma%2Fingest%2Fmirrored.jpg",
    };
    const next = applyGalleryMediaMirrors(SAMPLE_GALLERY, mirrored);
    expect(next.harvested[0]?.previewUrl).toContain("/api/spaces/s3-file");
  });
});
