import { describe, expect, it } from "vitest";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import type { BrainVisualAssetRef } from "@/lib/brain/brain-visual-analysis";
import { computeBrainVisualDnaCollageFingerprint } from "./brain-visual-dna-collage-nano";
import { buildBrainVisualDnaCollageModel } from "./brain-visual-dna-collage";

function row(ref: Partial<BrainVisualAssetRef>, analysis: BrainVisualImageAnalysis | null) {
  return {
    ref: {
      id: ref.id ?? "a1",
      name: ref.name ?? "t",
      mime: "image/png",
      sourceKind: "knowledge_document" as const,
      imageUrlForVision: ref.imageUrlForVision ?? "https://example.com/x.png",
      ...ref,
    } as BrainVisualAssetRef,
    analysis,
  };
}

function analyzed(partial: Partial<BrainVisualImageAnalysis>): BrainVisualImageAnalysis {
  return {
    id: partial.id ?? "an-1",
    sourceAssetId: partial.sourceAssetId ?? "a1",
    sourceKind: "knowledge_document",
    subject: partial.subject ?? "",
    subjectTags: partial.subjectTags ?? [],
    visualStyle: partial.visualStyle ?? ["natural light"],
    mood: partial.mood ?? ["warm"],
    colorPalette: partial.colorPalette ?? { dominant: ["#112233"], secondary: [], temperature: "neutral", saturation: "medium", contrast: "medium" },
    composition: partial.composition ?? [],
    people: partial.people ?? "",
    clothingStyle: partial.clothingStyle ?? "",
    graphicStyle: partial.graphicStyle ?? "",
    brandSignals: partial.brandSignals ?? [],
    possibleUse: partial.possibleUse ?? [],
    classification: partial.classification ?? "PROJECT_VISUAL_REFERENCE",
    coherenceScore: partial.coherenceScore ?? 0.9,
    analyzedAt: partial.analyzedAt ?? new Date().toISOString(),
    analysisStatus: "analyzed",
    visionProviderId: "gemini-vision",
    fallbackUsed: false,
    peopleDetail: partial.peopleDetail ?? { present: false },
    clothingDetail: partial.clothingDetail ?? { present: false },
    graphicDetail: partial.graphicDetail ?? { present: false },
    ...partial,
  } as BrainVisualImageAnalysis;
}

describe("buildBrainVisualDnaCollageModel", () => {
  it("returns empty slots without analyzed rows", () => {
    const m = buildBrainVisualDnaCollageModel([], { dominantPalette: ["#000000"], narrativeSummary: "" } as any);
    expect(m.sourceCount).toBe(0);
    expect(m.slots.every((s) => s.imageUrl === null)).toBe(true);
  });

  it("fills hero and pads people from any analyzed refs", () => {
    const rows = [
      row(
        { id: "r1", imageUrlForVision: "https://example.com/1.png" },
        analyzed({
          sourceAssetId: "r1",
          subject: "café interior con personas sonriendo",
          peopleDetail: { present: true, description: "grupo" },
          coherenceScore: 0.95,
          composition: ["interior luminoso"],
        }),
      ),
      row(
        { id: "r2", imageUrlForVision: "https://example.com/2.png" },
        analyzed({
          sourceAssetId: "r2",
          subject: "paisaje costero",
          peopleDetail: { present: false },
          composition: ["exterior", "paisaje"],
        }),
      ),
    ];
    const agg = {
      dominantPalette: ["#111111", "#222222"],
      narrativeSummary: "x",
      recurringStyles: [],
      dominantMoods: [],
      dominantSecondaryPalette: [],
      frequentSubjects: [],
      compositionNotes: [],
      peopleClothingNotes: [],
      graphicStyleNotes: [],
      implicitBrandMessages: [],
      countsByClassification: {},
      excludedFromVisualDnaCount: 0,
    } as any;
    const m = buildBrainVisualDnaCollageModel(rows, agg);
    expect(m.sourceCount).toBe(2);
    const hero = m.slots.find((s) => s.id === "hero");
    expect(hero?.imageUrl).toMatch(/^https:/);
    // r1 suele ir al héroe; r2 aporta entorno (paisaje / exterior)
    expect(m.slots.filter((s) => s.id.startsWith("env")).some((s) => s.imageUrl)).toBe(true);
  });
});

describe("computeBrainVisualDnaCollageFingerprint", () => {
  it("cambia cuando cambia la clasificación efectiva (override de usuario)", () => {
    const base = analyzed({
      sourceAssetId: "r1",
      classification: "PROJECT_VISUAL_REFERENCE",
      userVisualOverride: undefined,
    });
    const overridden = { ...base, userVisualOverride: "CORE_VISUAL_DNA" as const };
    const rowsA = [row({ id: "r1", imageUrlForVision: "https://example.com/1.png" }, base)];
    const rowsB = [row({ id: "r1", imageUrlForVision: "https://example.com/1.png" }, overridden)];
    expect(computeBrainVisualDnaCollageFingerprint(rowsA)).not.toBe(computeBrainVisualDnaCollageFingerprint(rowsB));
  });
});
