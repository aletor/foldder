import { describe, expect, it } from "vitest";
import {
  buildAtelierAttributeCards,
  buildAtelierEvidenceItems,
  buildAtelierSynthesis,
  filterEvidenceForAttribute,
} from "./brand-kit-atelier-model";
import type { EssenceValue, SlotState } from "../brand-kit-types";

function essenceSlot(value: EssenceValue): SlotState<unknown> {
  return {
    id: "essence",
    status: "resolved",
    candidates: [],
    confidence: 0.9,
    locked: false,
    history: [],
    updatedAt: new Date().toISOString(),
    value,
  };
}

describe("brand-kit-atelier-model", () => {
  const essence: EssenceValue = {
    summary: "BMW protege una identidad **precisa** y unificada.",
    headline: "Excelencia y coherencia en cada experiencia BMW",
    promise: "Experiencia consistente y superior. La ingeniería construye confianza.",
    purpose: "Mantener una identidad inconfundible",
    pov: "El control garantiza la excelencia",
    beliefs: [
      { label: "Precisa", explanation: "Decisiones con rigor visual", evidence: "El documento establece las directrices" },
      { label: "Directiva", explanation: "Claridad en cada mensaje" },
    ],
    evidence: [
      { quote: "El documento establece las directrices de marketing y publicidad.", sourceUrl: "https://example.com/a" },
      { quote: "Detalla el uso de la identidad visual con precisión.", fileId: "file-1" },
    ],
  };

  it("builds synthesis with headline as hero", () => {
    const synthesis = buildAtelierSynthesis("essence", essenceSlot(essence));
    expect(synthesis?.headline).toContain("Excelencia");
    expect(synthesis?.rows.map((row) => row.label)).toContain("Promesa");
    expect(synthesis?.personality).toEqual(["Precisa", "Directiva"]);
  });

  it("builds attribute cards without dumping summary as a card", () => {
    const evidence = buildAtelierEvidenceItems("essence", essenceSlot(essence));
    const cards = buildAtelierAttributeCards("essence", essenceSlot(essence), evidence);
    expect(cards.map((card) => card.id)).toContain("promise");
    expect(cards.map((card) => card.id)).not.toContain("summary");
    expect(cards.some((card) => card.id.startsWith("belief:"))).toBe(true);
  });

  it("links evidence to attributes and filters by selection", () => {
    const evidence = buildAtelierEvidenceItems("essence", essenceSlot(essence));
    expect(evidence.length).toBeGreaterThan(0);
    const filtered = filterEvidenceForAttribute(evidence, "belief:0");
    expect(filtered.length).toBeGreaterThan(0);
  });
});
