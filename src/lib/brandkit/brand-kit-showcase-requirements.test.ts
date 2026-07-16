import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import type { GalleryValue, PaletteValue } from "@/lib/brandkit/brand-kit-types";
import {
  resolveShowcaseRequirements,
  showcaseRequirementsMet,
} from "@/lib/brandkit/brand-kit-showcase-requirements";

function withPalette(doc: ReturnType<typeof createEmptyBrandKit>) {
  const palette: PaletteValue = { colors: [{ hex: "#112233", role: "primary" }] };
  doc.slots.palette = { ...doc.slots.palette, status: "resolved", locked: true, value: palette };
  return doc;
}

describe("resolveShowcaseRequirements", () => {
  it("exige logo, paleta, tipografía, esencia/voz e imagen aprobada", () => {
    const doc = withPalette(createEmptyBrandKit());
    const requirements = resolveShowcaseRequirements(doc, false);
    expect(requirements).toHaveLength(5);
    expect(showcaseRequirementsMet(requirements)).toBe(false);
    expect(requirements.find((item) => item.id === "palette")?.met).toBe(true);
  });

  it("acepta imagen aprobada por usuario", () => {
    const doc = withPalette(createEmptyBrandKit());
    doc.slots.logo = { ...doc.slots.logo, status: "resolved", locked: true, value: { assetId: "l", previewUrl: "https://x.com/l.png", format: "png", width: 1, height: 1, background: "transparent", variants: [] } };
    doc.slots.typography = { ...doc.slots.typography, status: "resolved", locked: true, value: { families: [{ family: "Inter", role: "body", source: "system", fallbacks: [], weights: [400] }] } };
    doc.slots.essence = { ...doc.slots.essence, status: "resolved", locked: true, value: { summary: "S", beliefs: [], evidence: [] } };
    const gallery: GalleryValue = {
      harvested: [],
      generated: [{
        assetId: "g1",
        previewUrl: "https://x.com/g.png",
        userApproved: true,
        promptVersion: 1,
        category: "people_mood",
        variantIndex: 0,
      }],
      stylePromptVersion: 1,
    };
    doc.slots.gallery = { ...doc.slots.gallery, status: "resolved", value: gallery };

    const requirements = resolveShowcaseRequirements(doc, false);
    expect(showcaseRequirementsMet(requirements)).toBe(true);
  });
});
