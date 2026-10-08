import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import {
  appendCineBrandStyleImages,
  cineBrandFromBrandKitData,
  cineBrandStyleImageUrls,
  mergeCineBrandStylePrompt,
  shouldIncludeCineBrandLogo,
} from "./cine-brandkit";

describe("cineBrandFromBrandKitData", () => {
  it("returns disabled pack when BrandKit is empty", () => {
    const pack = cineBrandFromBrandKitData({ brandKit: createEmptyBrandKit() });
    expect(pack.enabled).toBe(false);
    expect(pack.analyzeBlock).toBe("");
    expect(pack.galleryImageUrls).toEqual([]);
  });

  it("maps voice, essence, visual world, palette, gallery and logo", () => {
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
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "resolved",
      value: {
        summary: "Cercana y orgullosa",
        descriptors: ["cercana", "institucional"],
        rules: ["Hablar de afición"],
        avoid: ["disruptivo"],
        evidence: [],
      },
      confidence: 0.9,
    };
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: {
        summary: "Compromiso con la comunidad",
        headline: "El fútbol une",
        purpose: "Impulsar el fútbol",
        beliefs: [{ label: "Comunidad primero" }],
        evidence: [],
      },
      confidence: 0.88,
    };
    doc.slots.visualWorld = {
      ...doc.slots.visualWorld,
      status: "resolved",
      value: {
        summary: "Noche de estadio, grano y contraste",
        moodTags: [],
        visualTraits: ["grano"],
        limits: ["sin texto inventado"],
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

    const pack = cineBrandFromBrandKitData({ brandKit: doc });
    expect(pack.enabled).toBe(true);
    expect(pack.analyzeBlock).toContain("LaLiga");
    expect(pack.analyzeBlock).toContain("Cercana y orgullosa");
    expect(pack.analyzeBlock).toContain("Compromiso con la comunidad");
    expect(pack.analyzeBlock).toContain("Noche de estadio");
    expect(pack.analyzeBlock).toContain("BrandKit logo exists");
    expect(pack.styleBlock).toContain("#E30613");
    expect(pack.hasLogo).toBe(true);
    expect(pack.logoFirstImageUrls[0]).toBe("https://cdn.test/logo.png");
    expect(pack.galleryImageUrls).toContain("https://cdn.test/ref.jpg");
    expect(pack.galleryImageUrls[0]).not.toBe("https://cdn.test/logo.png");
    expect(pack.hints.some((h) => h.includes("Logo"))).toBe(true);
  });
});

describe("shouldIncludeCineBrandLogo", () => {
  it("includes logo for advertising and brand-story modes", () => {
    expect(shouldIncludeCineBrandLogo({ mode: "advertising" })).toBe(true);
    expect(shouldIncludeCineBrandLogo({ mode: "brand_story" })).toBe(true);
    expect(shouldIncludeCineBrandLogo({ mode: "short_film" })).toBe(false);
  });

  it("includes logo when the scene text asks for branding", () => {
    expect(shouldIncludeCineBrandLogo({ mode: "short_film", sceneText: "Cierre con logo de marca" })).toBe(true);
    expect(shouldIncludeCineBrandLogo({ mode: "short_film", sceneText: "Puffy corre por el bosque" })).toBe(false);
  });
});

describe("mergeCineBrandStylePrompt", () => {
  it("keeps the base prompt first and relaxes logo ban when includeLogo", () => {
    const base = [
      "Create a cinematic keyframe.",
      "Do not render any written text, subtitles, captions, logos or typography inside the image. On-screen text will be added later as a separate overlay.",
    ].join("\n");
    const merged = mergeCineBrandStylePrompt(base, "Palette: primary:#E30613.", { includeLogo: true });
    expect(merged.indexOf("Create a cinematic")).toBeLessThan(merged.indexOf("BRAND STYLE"));
    expect(merged).toContain("exact brand mark");
    expect(merged).not.toContain("Do not render any written text, subtitles, captions, logos or typography inside the image.");
  });

  it("keeps no-logo directive when includeLogo is false", () => {
    const merged = mergeCineBrandStylePrompt("Frame prompt", "Palette: #000.", { includeLogo: false });
    expect(merged).toContain("Do not render logos");
  });
});

describe("cineBrandStyleImageUrls / appendCineBrandStyleImages", () => {
  it("puts logo first only when includeLogo", () => {
    const pack = cineBrandFromBrandKitData({
      brandKit: (() => {
        const doc = createEmptyBrandKit();
        doc.brandName = { value: "X", provenance: { type: "user_input", detail: "tú" } };
        doc.slots.logo = {
          ...doc.slots.logo,
          status: "resolved",
          value: {
            assetId: "https://cdn.test/logo.png",
            previewUrl: "https://cdn.test/logo.png",
            format: "png",
            width: 1,
            height: 1,
            background: "transparent",
            variants: [],
          },
          confidence: 1,
        };
        doc.slots.gallery = {
          ...doc.slots.gallery,
          status: "resolved",
          value: {
            harvested: [{ assetId: "https://cdn.test/g.jpg", previewUrl: "https://cdn.test/g.jpg", included: true }],
            generated: [],
            stylePromptVersion: 1,
          },
          confidence: 1,
        };
        return doc;
      })(),
    });
    expect(cineBrandStyleImageUrls(pack, true)[0]).toBe("https://cdn.test/logo.png");
    expect(cineBrandStyleImageUrls(pack, false)).not.toContain("https://cdn.test/logo.png");
  });

  it("keeps user images ahead of brand refs", () => {
    expect(appendCineBrandStyleImages(["user-a.png"], ["brand.jpg"], 4)).toEqual([
      "user-a.png",
      "brand.jpg",
    ]);
  });
});
