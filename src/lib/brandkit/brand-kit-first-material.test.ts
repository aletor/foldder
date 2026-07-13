import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import { enrichBrandKitDocument } from "./brand-kit-enrich";
import { validateBrandKitContentQuality } from "./brand-kit-content-quality";
import { isFirstBrandKitMaterial, sootheFirstMaterialSlots } from "./brand-kit-first-material";
import type { EssenceValue, GalleryValue, VoiceValue, VisualWorldValue } from "./brand-kit-types";

describe("brand-kit-first-material", () => {
  it("detects first material with a single source", () => {
    const doc = createEmptyBrandKit();
    doc.sources = [{ kind: "file", ref: "catalogo26.pdf", ts: "2026-01-01" }];
    expect(isFirstBrandKitMaterial(doc)).toBe(true);
  });

  it("clears benign review reasons on first material", () => {
    const doc = createEmptyBrandKit();
    doc.sources = [{ kind: "file", ref: "catalogo26.pdf", ts: "2026-01-01" }];
    doc.slots.visualWorld = {
      ...doc.slots.visualWorld,
      status: "resolved",
      value: {
        summary: "Mundo visual editorial con retratos de ficción y luz cálida de estudio.",
        moodTags: ["Dinámico"],
        visualTraits: ["Retratos con intención narrativa"],
        limits: ["Sin stock genérico"],
        evidence: [],
        galleryRefs: [],
      } satisfies VisualWorldValue,
      confidence: 0.7,
      needsReviewReason: "La síntesis necesita revisión",
    };

    const soothed = sootheFirstMaterialSlots(doc);
    expect(soothed.slots.visualWorld.needsReviewReason).toBeUndefined();
  });

  it("does not force review on first ingest after validate + enrich", () => {
    const doc = createEmptyBrandKit();
    doc.sources = [{ kind: "file", ref: "catalogo26.pdf", ts: "2026-01-01" }];
    doc.brandName = { value: "Atresmedia", provenance: { type: "file_upload", detail: "probe" } };
    const gallery: GalleryValue = {
      harvested: Array.from({ length: 10 }, (_, index) => ({
        assetId: `/api/spaces/s3-file?key=img-${index}`,
        previewUrl: `/api/spaces/s3-file?key=img-${index}`,
        included: true,
        provenance: { type: "file_upload", detail: `still ${index}` },
      })),
      generated: [],
      stylePromptVersion: 0,
    };
    doc.slots.gallery = { ...doc.slots.gallery, status: "resolved", value: gallery, confidence: 0.8 };
    doc.slots.voice = {
      ...doc.slots.voice,
      status: "candidates",
      candidates: [
        {
          value: {
            summary: "Voz cinematográfica y cercana para catálogo de ficción.",
            descriptors: ["cinematográfica", "cercana"],
            rules: ["Frases cortas.", "Evitar jerga corporativa."],
            avoid: [],
            evidence: [],
          } satisfies VoiceValue,
          score: 0.72,
          provenance: { type: "llm_synthesis", detail: "batch" },
        },
      ],
      confidence: 0.55,
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
      confidence: 0.5,
    };

    const polished = enrichBrandKitDocument(validateBrandKitContentQuality(doc));
    expect(polished.slots.voice.status).toBe("resolved");
    expect(polished.slots.voice.needsReviewReason).toBeUndefined();
    expect(polished.slots.visualWorld.needsReviewReason).toBeUndefined();
    expect((polished.slots.visualWorld.value as VisualWorldValue).summary.length).toBeGreaterThan(24);
  });
});
