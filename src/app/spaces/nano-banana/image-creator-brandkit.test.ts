import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import {
  appendBrandStyleImages,
  imageCreatorBrandFromBrandKitData,
  mergeImageCreatorPrompt,
} from "./image-creator-brandkit";

describe("mergeImageCreatorPrompt", () => {
  it("keeps the user brief first and states that it wins conflicts", () => {
    const merged = mergeImageCreatorPrompt("A red bicycle at night", "Palette: primary:#000.");
    expect(merged.indexOf("A red bicycle at night")).toBeLessThan(merged.indexOf("Palette:"));
    expect(merged).toContain("follow this brief");
    expect(merged).toContain("wins");
  });

  it("returns the user prompt alone when there is no brand style", () => {
    expect(mergeImageCreatorPrompt("Solo el brief", "")).toBe("Solo el brief");
  });
});

describe("imageCreatorBrandFromBrandKitData", () => {
  it("includes palette, visual world, and typography without gallery URLs in the text", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "LaLiga", provenance: { type: "user_input", detail: "tú" } };
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: { colors: [{ hex: "#1B4DFF", role: "primary" }] },
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
    expect(pack.styleBlock).toContain("#1B4DFF");
    expect(pack.styleBlock).toContain("Anton");
    expect(pack.styleBlock).toContain("Noche de estadio");
    expect(pack.styleBlock).not.toContain("https://cdn.test/ref.jpg");
    expect(pack.styleBlock).toContain("Do not draw words");
    expect(pack.styleImageUrls).toEqual(["https://cdn.test/ref.jpg"]);
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
