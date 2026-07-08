import { describe, expect, it } from "vitest";
import { createEmptyGenoma } from "./genoma-defaults";
import { enrichGenomaDocument } from "./genoma-enrich";
import type { EssenceValue, GalleryValue, VoiceValue } from "./genoma-types";

describe("enrichGenomaDocument", () => {
  it("fills visual world when gallery has enough images", () => {
    const doc = createEmptyGenoma();
    const gallery: GalleryValue = {
      harvested: Array.from({ length: 12 }, (_, index) => ({
        assetId: `g-${index}`,
        previewUrl: `https://cdn.example.com/photo-${index}.jpg`,
        included: false,
        provenance: { type: "header_img", detail: "film still" },
      })),
      generated: [],
      stylePromptVersion: 0,
    };

    doc.slots.gallery = {
      ...doc.slots.gallery,
      status: "resolved",
      value: gallery,
      confidence: 0.8,
    };
    doc.slots.visualWorld = {
      ...doc.slots.visualWorld,
      status: "needs_user",
      confidence: 0,
    };

    const enriched = enrichGenomaDocument(doc);
    const visual = enriched.slots.visualWorld?.value as { summary?: string } | undefined;
    expect(enriched.slots.visualWorld?.status).toBe("resolved");
    expect(visual?.summary?.length).toBeGreaterThan(24);
    const harvested = (enriched.slots.gallery?.value as GalleryValue).harvested;
    expect(harvested.every((item) => item.included !== false)).toBe(true);
  });

  it("auto-resolves a single voice candidate and improves placeholder essence", () => {
    const doc = createEmptyGenoma();
    doc.brandName = { value: "Alima Producciones", provenance: { type: "jsonld", detail: "name" } };
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      locked: true,
      value: {
        summary: "Propuesta de respaldo a partir del manifiesto.",
        beliefs: [{ label: "Hacemos cine" }, { label: "Narrativa" }],
        evidence: [],
      } satisfies EssenceValue,
      confidence: 0.7,
    };
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "candidates",
      candidates: [
        {
          value: {
            summary: "Voz cinematográfica, directa y emocional, alejada del tono corporativo.",
            descriptors: ["cinematográfica", "directa", "emocional"],
            rules: ["Usar frases cortas.", "Priorizar narrativa.", "Evitar jerga corporativa."],
            avoid: [],
            evidence: [{ quote: "Vivimos de la narrativa" }],
          } satisfies VoiceValue,
          score: 0.7,
          provenance: { type: "llm_synthesis", detail: "fallback" },
        },
      ],
      confidence: 0.55,
    };

    const enriched = enrichGenomaDocument(doc);
    expect(enriched.slots.voice?.status).toBe("resolved");
    expect((enriched.slots.essence?.value as EssenceValue).summary).toContain("Alima Producciones");
    expect((enriched.slots.essence?.value as EssenceValue).summary).not.toMatch(/respaldo/i);
  });
});
