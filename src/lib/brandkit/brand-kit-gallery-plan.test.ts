import { describe, expect, it } from "vitest";
import {
  GALLERY_CATEGORY_ORDER,
  GALLERY_CATEGORY_SLOT_COUNT,
  GALLERY_GENERATE_PLAN,
  buildCategoryBriefing,
  groupGeneratedByCategory,
  slotsForCategory,
} from "./brand-kit-gallery-plan";

describe("brand-kit-gallery-plan", () => {
  it("defines four slots per category", () => {
    for (const category of GALLERY_CATEGORY_ORDER) {
      expect(slotsForCategory(category)).toHaveLength(GALLERY_CATEGORY_SLOT_COUNT);
    }
    expect(GALLERY_GENERATE_PLAN).toHaveLength(GALLERY_CATEGORY_ORDER.length * GALLERY_CATEGORY_SLOT_COUNT);
  });

  it("groups generated items by category", () => {
    const grouped = groupGeneratedByCategory([
      { assetId: "a", category: "objects" },
      { assetId: "b", category: "textures" },
      { assetId: "c", category: "objects" },
    ]);
    expect(grouped.objects).toHaveLength(2);
    expect(grouped.textures).toHaveLength(1);
    expect(grouped.places).toHaveLength(0);
  });

  it("builds category briefing with tone", () => {
    const briefing = buildCategoryBriefing("places", "Luz cálida y espacios amplios.");
    expect(briefing.label).toBe("Entorno");
    expect(briefing.hint).toMatch(/localización|vacío|ocupación/i);
    expect(briefing.tone).toBe("Luz cálida y espacios amplios.");
  });
});
