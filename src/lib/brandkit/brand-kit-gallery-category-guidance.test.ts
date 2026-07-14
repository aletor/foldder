import { describe, expect, it } from "vitest";
import { buildGalleryImagePrompt } from "./brand-kit-gallery-category-guidance";

describe("buildGalleryImagePrompt", () => {
  const stylePrompt =
    "Brand editorial photo for Acme. Palette: primary:#E07A5F. Photorealistic brand imagery, no text overlays, no logos.";

  const doc = {
    brandName: { value: "Acme", provenance: { type: "user", detail: "" } },
    slots: {
      palette: {
        status: "resolved",
        value: { colors: [{ hex: "#E07A5F", role: "accent" }] },
      },
      visualWorld: {
        status: "resolved",
        value: {
          summary: "Luz cálida",
          moodTags: ["Cinematográfico"],
          visualTraits: [],
          limits: [],
          evidence: [],
        },
      },
    },
    updatedAt: "",
  } as import("./brand-kit-types").BrandKitDocument;

  const FORBIDDEN_HARDCODED = [
    "ice queen",
    "snowman",
    "web-pattern hero",
    "theme park",
    "family groups and visitors",
    "wonder, joy",
    "thematic props",
  ];

  it("uses brief hint as primary objects scene", () => {
    const briefHint =
      "High-performance running shoes, sports watches with minimalist data screens, ergonomic water bottles, still life with dramatic lighting on clean surfaces.";
    const prompt = buildGalleryImagePrompt("objects", stylePrompt, briefHint);
    expect(prompt.indexOf("Scene to photograph:")).toBeLessThan(prompt.indexOf("running shoes"));
    expect(prompt).toContain("running shoes");
    for (const term of FORBIDDEN_HARDCODED) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("uses brief hint as primary people_mood scene without theme-park defaults", () => {
    const briefHint =
      "Athlete mid-stride on urban track at golden hour, sweat and determination, tight editorial crop, dramatic side light.";
    const prompt = buildGalleryImagePrompt("people_mood", stylePrompt, briefHint, doc);
    expect(prompt).toContain("Scene to photograph:");
    expect(prompt).toContain("Athlete mid-stride");
    expect(prompt).toContain("Cinematográfico");
    for (const term of FORBIDDEN_HARDCODED) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("uses location-first places scene and omits product coherence hint", () => {
    const docWithProduct = {
      ...doc,
      slots: {
        ...doc.slots,
        essence: {
          status: "resolved",
          value: {
            summary: "Calzado deportivo de alto rendimiento",
            beliefs: [],
            evidence: [],
            brandContext: "Running shoes and performance sportswear",
            purpose: "Equip athletes for competition",
          },
        },
      },
    } as import("./brand-kit-types").BrandKitDocument;

    const prompt = buildGalleryImagePrompt(
      "places",
      stylePrompt,
      "Packed concert hall from rear, stage lights, crowd as ambient mass, wide establishing shot.",
      docWithProduct,
    );
    expect(prompt).toContain("Scene to photograph:");
    expect(prompt).toContain("Packed concert hall");
    expect(prompt).toContain("Location-first establishing shot");
    expect(prompt).toContain("Crowds, ambient objects");
    expect(prompt.toLowerCase()).not.toContain("product context");
    expect(prompt.toLowerCase()).not.toContain("brand offering");
    for (const term of FORBIDDEN_HARDCODED) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("still injects product coherence for objects category", () => {
    const docWithProduct = {
      ...doc,
      slots: {
        ...doc.slots,
        essence: {
          status: "resolved",
          value: {
            summary: "Calzado deportivo",
            beliefs: [],
            evidence: [],
            brandContext: "Running shoes",
            purpose: "Performance footwear",
          },
        },
      },
    } as import("./brand-kit-types").BrandKitDocument;

    const prompt = buildGalleryImagePrompt(
      "objects",
      stylePrompt,
      "Hero running shoe on track",
      docWithProduct,
    );
    expect(prompt.toLowerCase()).toContain("product context");
  });

  it("uses brief hint as primary textures scene", () => {
    const prompt = buildGalleryImagePrompt(
      "textures",
      stylePrompt,
      "Brushed aluminum with fine linear grain, satin finish.",
      doc,
    );
    expect(prompt).toContain("Scene to photograph:");
    expect(prompt).toContain("Brushed aluminum");
    expect(prompt).toContain("Macro material texture");
    for (const term of FORBIDDEN_HARDCODED) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("uses brief hint as primary general scene", () => {
    const prompt = buildGalleryImagePrompt(
      "general",
      stylePrompt,
      "Moody lobby interior with amber accent lighting and deep shadows.",
      doc,
    );
    expect(prompt).toContain("Scene to photograph:");
    expect(prompt).toContain("Moody lobby interior");
    for (const term of FORBIDDEN_HARDCODED) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("strips copyrighted names from hints without injecting character archetypes", () => {
    const prompt = buildGalleryImagePrompt(
      "objects",
      stylePrompt,
      "Merchandise still life with Elsa figurine beside Spider-Man plush at Disneyland Paris.",
    );
    expect(prompt.toLowerCase()).not.toContain("elsa");
    expect(prompt.toLowerCase()).not.toContain("spider-man");
    expect(prompt.toLowerCase()).not.toContain("disney");
    expect(prompt.toLowerCase()).not.toContain("ice queen");
    expect(prompt.toLowerCase()).not.toContain("snowman");
    expect(prompt).toContain("Merchandise still life");
  });
});
