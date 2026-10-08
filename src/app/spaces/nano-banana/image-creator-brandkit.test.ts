import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import {
  appendBrandStyleImages,
  imageCreatorBrandFromBrandKitData,
  mergeImageCreatorPrompt,
} from "./image-creator-brandkit";

describe("mergeImageCreatorPrompt", () => {
  it("keeps the user brief first and applies brand colors when the brief is silent", () => {
    const merged = mergeImageCreatorPrompt("A red bicycle at night", "Palette: primary:#000.");
    expect(merged.indexOf("A red bicycle at night")).toBeLessThan(merged.indexOf("Palette:"));
    expect(merged).toContain("If the brief does not specify colors or logo treatment");
  });

  it("returns the user prompt alone when there is no brand style", () => {
    expect(mergeImageCreatorPrompt("Solo el brief", "")).toBe("Solo el brief");
  });
});

describe("imageCreatorBrandFromBrandKitData", () => {
  it("includes palette, visual world, logo ref, and no gallery URLs in the text", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "LaLiga", provenance: { type: "user_input", detail: "tú" } };
    doc.slots.logo = {
      ...doc.slots.logo,
      status: "resolved",
      value: {
        assetId: "https://cdn.test/logo.png",
        previewUrl: "https://cdn.test/logo.png",
        format: "png",
        width: 200,
        height: 80,
        background: "transparent",
        variants: [],
      },
      confidence: 0.95,
    };
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: {
        colors: [
          { hex: "#E30613", role: "primary" },
          { hex: "#FFCC00", role: "accent" },
        ],
      },
      confidence: 0.9,
    };
    doc.slots.typography = {
      ...doc.slots.typography,
      status: "resolved",
      value: {
        families: [{ family: "Anton", role: "display", source: "google", fallbacks: [], weights: [700] }],
      },
      confidence: 0.8,
    };
    doc.slots.visualWorld = {
      ...doc.slots.visualWorld,
      status: "resolved",
      value: {
        summary: "Noche de estadio, grano y contraste",
        moodTags: [],
        visualTraits: ["grano"],
        limits: ["sin texto en imagen"],
        evidence: [],
        galleryRefs: [],
      },
      confidence: 0.8,
    };
    doc.slots.gallery = {
      ...doc.slots.gallery,
      status: "resolved",
      value: {
        harvested: [
          {
            assetId: "https://cdn.test/ref.jpg",
            previewUrl: "https://cdn.test/ref.jpg",
            included: true,
          },
        ],
        generated: [],
        stylePromptVersion: 1,
      },
      confidence: 0.7,
    };

    const pack = imageCreatorBrandFromBrandKitData({ brandKit: doc });
    expect(pack.connected).toBe(true);
    expect(pack.styleBlock).toContain("#E30613");
    expect(pack.styleBlock).toContain("#FFCC00");
    expect(pack.styleBlock).toContain("BRAND PALETTE");
    expect(pack.styleBlock).toContain("Anton");
    expect(pack.styleBlock).toContain("Noche de estadio");
    expect(pack.styleBlock).toContain("exact brand mark");
    expect(pack.styleBlock).not.toContain("Prefer style like:");
    expect(pack.styleImageUrls[0]).toBe("https://cdn.test/logo.png");
    expect(pack.styleImageUrls).toContain("https://cdn.test/ref.jpg");
  });
});

describe("appendBrandStyleImages", () => {
  it("keeps user images ahead of brand style refs", () => {
    expect(appendBrandStyleImages(["user-a.png", "user-b.png"], ["brand.jpg"], 4)).toEqual([
      "user-a.png",
      "user-b.png",
      "brand.jpg",
    ]);
  });

  it("drops brand refs that would exceed the cap", () => {
    expect(appendBrandStyleImages(["a", "b", "c", "d"], ["brand.jpg"], 4)).toEqual(["a", "b", "c", "d"]);
  });
});
