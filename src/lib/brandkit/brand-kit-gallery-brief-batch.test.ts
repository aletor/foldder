import { describe, expect, it } from "vitest";
import { parseGalleryCategoryBriefsFromBatch } from "./brand-kit-gallery-brief-batch";

describe("parseGalleryCategoryBriefsFromBatch", () => {
  it("parses and orders all five categories", () => {
    const raw = {
      galleryCategoryBriefs: [
        { category: "textures", description: "Lino crudo y sombras suaves", promptHint: "raw linen texture soft shadow", confidence: "high" },
        { category: "people_mood", description: "Retratos cercanos con luz natural", promptHint: "close portraits natural light", confidence: "medium" },
        { category: "general", description: "Escena editorial de marca", promptHint: "editorial brand scene", confidence: "low" },
        { category: "objects", description: "Detalle de producto en mesa", promptHint: "product detail on table", confidence: "high" },
        { category: "places", description: "Interior minimal con madera", promptHint: "minimal interior wood", confidence: "medium" },
      ],
    };

    const parsed = parseGalleryCategoryBriefsFromBatch(raw, 6);
    expect(parsed).not.toBeNull();
    expect(parsed!.map((entry) => entry.category)).toEqual([
      "people_mood",
      "places",
      "objects",
      "textures",
      "general",
    ]);
    expect(parsed![0].evidenceCount).toBe(6);
    expect(parsed![2].promptHint).toContain("product detail");
  });

  it("returns null when categories are incomplete", () => {
    const raw = {
      galleryCategoryBriefs: [
        { category: "people_mood", description: "Solo una", promptHint: "only one", confidence: "high" },
      ],
    };
    expect(parseGalleryCategoryBriefsFromBatch(raw, 4)).toBeNull();
  });

  it("ignores invalid rows", () => {
    const raw = {
      galleryCategoryBriefs: [
        { category: "unknown", description: "x", promptHint: "y", confidence: "high" },
        { category: "people_mood", description: "", promptHint: "ok", confidence: "high" },
      ],
    };
    expect(parseGalleryCategoryBriefsFromBatch(raw, 1)).toBeNull();
  });
});
