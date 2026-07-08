import { describe, expect, it } from "vitest";
import { createEmptyGenoma } from "./genoma-defaults";
import { validateGenomaContentQuality } from "./genoma-content-quality";
import type { EssenceValue, GalleryValue, VoiceValue, VisualWorldValue } from "./genoma-types";

const CORPUS =
  "Hacemos Cinema y publicidad. Vivimos de la narrativa y de historias que muerden.";

describe("validateGenomaContentQuality", () => {
  it("repairs resolved essence when summary is a literal quote", () => {
    const doc = createEmptyGenoma();
    doc.brandName = { value: "Alima", provenance: { type: "jsonld", detail: "name" } };
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: {
        summary: "Hacemos Cinema y publicidad",
        beliefs: [
          { label: "La narrativa es el centro." },
          { label: "Historias con carácter." },
        ],
        evidence: [{ quote: "Vivimos de la narrativa" }],
      } satisfies EssenceValue,
      confidence: 0.8,
    };

    const result = validateGenomaContentQuality(doc, { corpus: CORPUS });
    expect(result.slots.essence.status).toBe("resolved");
    expect((result.slots.essence.value as EssenceValue).summary).not.toBe("Hacemos Cinema y publicidad");
    expect((result.slots.essence.value as EssenceValue).summary.length).toBeGreaterThan(24);
  });

  it("keeps resolved essence with interpretive summary", () => {
    const doc = createEmptyGenoma();
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: {
        summary:
          "Productora audiovisual con mirada cinematográfica, centrada en historias con carácter y emoción.",
        beliefs: [{ label: "La narrativa es el centro." }],
        evidence: [{ quote: "Vivimos de la narrativa" }],
      } satisfies EssenceValue,
      confidence: 0.8,
    };

    const result = validateGenomaContentQuality(doc, { corpus: CORPUS });
    expect(result.slots.essence.status).toBe("resolved");
    expect(result.slots.essence.value).toBeDefined();
  });

  it("repairs visualWorld from gallery when synthesis is incomplete", () => {
    const doc = createEmptyGenoma();
    const gallery: GalleryValue = {
      harvested: Array.from({ length: 8 }, (_, index) => ({
        assetId: `g-${index}`,
        previewUrl: `https://cdn.example.com/film-still-${index}.jpg`,
        included: true,
        provenance: { type: "header_img", detail: "film still portrait" },
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
      status: "resolved",
      value: {
        summary: "Corto",
        moodTags: [],
        visualTraits: [],
        limits: [],
        evidence: [],
        galleryRefs: [],
      } satisfies VisualWorldValue,
      confidence: 0.4,
    };

    const result = validateGenomaContentQuality(doc, { corpus: CORPUS });
    expect(result.slots.visualWorld.status).toBe("resolved");
    const visual = result.slots.visualWorld.value as VisualWorldValue;
    expect(visual.summary.length).toBeGreaterThan(24);
    expect(visual.limits.length).toBeGreaterThan(0);
    expect(visual.visualTraits.length).toBeGreaterThan(0);
  });

  it("repairs voice with generic descriptors instead of degrading", () => {
    const doc = createEmptyGenoma();
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "resolved",
      value: {
        summary: "Voz profesional, creativa e innovadora para la marca con tono cinematográfico.",
        descriptors: ["profesional", "creativo", "cinematográfica"],
        rules: ["Usar frases cortas.", "Evitar jerga corporativa."],
        avoid: [],
        evidence: [{ quote: "Vivimos de la narrativa" }],
      } satisfies VoiceValue,
      confidence: 0.7,
    };

    const result = validateGenomaContentQuality(doc, { corpus: CORPUS });
    expect(result.slots.voice.status).toBe("resolved");
    const voice = result.slots.voice.value as VoiceValue;
    expect(voice.descriptors).not.toContain("profesional");
    expect(voice.descriptors).toContain("cinematográfica");
  });
});
