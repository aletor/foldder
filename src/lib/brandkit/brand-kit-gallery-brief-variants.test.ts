import { describe, expect, it } from "vitest";
import {
  galleryVariantPromptHint,
  normalizeGalleryCategoryBrief,
  resolveGalleryBriefVariants,
  categoryBriefDisplayDescription,
} from "./brand-kit-gallery-brief-variants";
import type { GalleryCategoryBrief } from "./brand-kit-types";

function brief(partial: Partial<GalleryCategoryBrief> & Pick<GalleryCategoryBrief, "category">): GalleryCategoryBrief {
  return {
    description: "Resumen",
    promptHint: "Summary prompt",
    variants: [],
    confidence: "medium",
    evidenceCount: 0,
    ...partial,
  };
}

describe("brand-kit-gallery-brief-variants", () => {
  it("keeps four explicit variants", () => {
    const normalized = normalizeGalleryCategoryBrief(
      brief({
        category: "objects",
        variants: [
          { description: "Zapatillas", promptHint: "Running shoes still life" },
          { description: "Reloj", promptHint: "Sports watch macro" },
          { description: "Botella", promptHint: "Ergonomic bottle" },
          { description: "Mochila", promptHint: "Training backpack" },
        ],
      }),
    );
    expect(normalized.variants).toHaveLength(4);
    expect(galleryVariantPromptHint(normalized, 2)).toContain("Ergonomic bottle");
  });

  it("expands legacy single prompt into four distinct hints", () => {
    const variants = resolveGalleryBriefVariants(
      brief({
        category: "textures",
        description: "Macro de lino crudo",
        promptHint: "Raw linen weave macro",
        variants: [],
      }),
    );
    expect(variants).toHaveLength(4);
    expect(variants[0].promptHint).toContain("Raw linen weave macro");
    expect(variants[1].promptHint).not.toBe(variants[0].promptHint);
    expect(variants[2].promptHint).not.toBe(variants[1].promptHint);
  });

  it("strips concatenated legacy variant text from display", () => {
    const text = categoryBriefDisplayDescription(
      brief({
        category: "people_mood",
        description:
          "Grupos diversos compartiendo bebida. Variación 2. Grupos diversos compartiendo bebida. Variación 3.",
        variants: [],
      }),
    );
    expect(text).toContain("Grupos diversos");
    expect(text).not.toContain("Variación 2");
  });
});
