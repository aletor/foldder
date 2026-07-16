import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import type { PaletteValue } from "./brand-kit-types";
import {
  buildStyleGuideChapterPlan,
  countUnlockedSlotsWithContent,
  evaluateFinalStyleGuideExport,
  unlockedSlotLabels,
} from "./brand-kit-presentation-export";
import { resolveBrandKitStyleGuideSoloValidado } from "./projection/style-guide-export-types";

function withResolvedPalette(doc: ReturnType<typeof createEmptyBrandKit>) {
  const palette: PaletteValue = {
    colors: [{ hex: "#1B3A8A", role: "primary" }],
  };
  doc.slots.palette = {
    ...doc.slots.palette,
    status: "resolved",
    value: palette,
    locked: false,
  };
  doc.brandName = { value: "OARO", provenance: { type: "user_input", detail: "test" } };
  return doc;
}

describe("brand-kit-presentation-export", () => {
  it("versión final solo incluye capítulos con slots bloqueados", () => {
    const doc = withResolvedPalette(createEmptyBrandKit());
    const plan = buildStyleGuideChapterPlan(doc, true);
    const included = plan.filter((chapter) => chapter.included).map((chapter) => chapter.id);

    expect(included).toContain("cover");
    expect(included).toContain("index");
    expect(included).toContain("closing");
    expect(included).not.toContain("palette");
  });

  it("borrador incluye capítulos con contenido aunque no estén bloqueados", () => {
    const doc = withResolvedPalette(createEmptyBrandKit());
    const plan = buildStyleGuideChapterPlan(doc, false);
    const included = plan.filter((chapter) => chapter.included).map((chapter) => chapter.id);

    expect(included).toContain("palette");
    expect(resolveBrandKitStyleGuideSoloValidado("operativo")).toBe(false);
    expect(resolveBrandKitStyleGuideSoloValidado("cliente")).toBe(true);
  });

  it("advierte cuando hay bloques sin confirmar en export final", () => {
    const doc = withResolvedPalette(createEmptyBrandKit());
    expect(countUnlockedSlotsWithContent(doc)).toBeGreaterThan(0);
    expect(unlockedSlotLabels(doc).length).toBeGreaterThan(0);

    const preflight = evaluateFinalStyleGuideExport(doc);
    expect(preflight.shouldWarn).toBe(true);
    expect(preflight.message).toContain("versión final");
  });
});
