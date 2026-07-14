import { describe, expect, it } from "vitest";
import {
  brandImageStyleLead,
  brandImageStyleRenderClause,
  gallerySceneLead,
  inferImageMediumFromText,
  normalizeBrandImageMedium,
  resolveBrandImageStyle,
} from "./brand-kit-visual-style";
import { buildBrandKitStylePrompt } from "./compile-brand-kit";
import { buildGalleryImagePrompt } from "./brand-kit-gallery-category-guidance";

describe("brand-kit-visual-style", () => {
  it("normalizes medium aliases", () => {
    expect(normalizeBrandImageMedium("fotografía")).toBe("photography");
    expect(normalizeBrandImageMedium("illustration")).toBe("illustration");
    expect(normalizeBrandImageMedium("3d")).toBe("3d_render");
  });

  it("infers illustration from corpus text", () => {
    expect(inferImageMediumFromText("Flat vector illustration with hand-drawn line art")).toBe(
      "illustration",
    );
  });

  it("infers photography as default", () => {
    expect(inferImageMediumFromText("Cinematic editorial portrait with natural light")).toBe(
      "photography",
    );
  });

  it("builds illustration style lead and render clause", () => {
    const visual = {
      summary: "Mundo ilustrado",
      moodTags: [],
      visualTraits: [],
      limits: [],
      imageMedium: "illustration",
      imageStyleTags: ["flat vector"],
      evidence: [],
      galleryRefs: [],
    };
    expect(brandImageStyleLead("Acme", visual)).toContain("illustration");
    expect(brandImageStyleRenderClause(visual)).toContain("Illustrated brand imagery");
    expect(gallerySceneLead("Hero character waving", "illustration")).toContain("Scene to illustrate");
  });

  it("resolveBrandImageStyle falls back to inference", () => {
    const visual = {
      summary: "Collage editorial con papel recortado",
      moodTags: [],
      visualTraits: [],
      limits: [],
      evidence: [],
      galleryRefs: [],
    };
    expect(resolveBrandImageStyle(visual).medium).toBe("collage");
  });
});

describe("compile + gallery with image medium", () => {
  const baseDoc = {
    brandName: { value: "Acme", provenance: { type: "user", detail: "" } },
    slots: {
      palette: { status: "resolved", value: { colors: [{ hex: "#E07A5F", role: "accent" }] } },
      visualWorld: {
        status: "resolved",
        value: {
          summary: "Estética ilustrada con trazos planos",
          moodTags: ["alegre"],
          visualTraits: [],
          limits: [],
          imageMedium: "illustration",
          imageStyleTags: ["flat vector"],
          evidence: [],
          galleryRefs: [],
        },
      },
    },
    updatedAt: "",
  } as import("./brand-kit-types").BrandKitDocument;

  it("buildBrandKitStylePrompt uses illustration medium", () => {
    const prompt = buildBrandKitStylePrompt(baseDoc, 1);
    expect(prompt).toContain("illustration");
    expect(prompt).not.toContain("Brand editorial photo");
    expect(prompt).toContain("Illustrated brand imagery");
  });

  it("buildGalleryImagePrompt uses illustrate scene lead for illustration ADN", () => {
    const prompt = buildGalleryImagePrompt(
      "people_mood",
      buildBrandKitStylePrompt(baseDoc, 1),
      "Character smiling in a park",
      baseDoc,
    );
    expect(prompt).toContain("Scene to illustrate:");
    expect(prompt).toContain("Illustrated portrait");
    expect(prompt).not.toContain("Scene to photograph:");
  });
});
