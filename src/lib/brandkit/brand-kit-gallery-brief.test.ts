import { describe, expect, it } from "vitest";
import {
  computeGalleryBriefSourceKey,
  galleryBriefsAreFresh,
  resolveGalleryCategoryBriefing,
} from "./brand-kit-gallery-brief";
import type { BrandKitDocument, GalleryValue } from "./brand-kit-types";

function docWithGallery(gallery: GalleryValue): BrandKitDocument {
  return {
    brandName: { value: "Atresmedia Sales", provenance: { type: "user", detail: "" } },
    slots: {
      visualWorld: {
        status: "resolved",
        value: {
          summary: "Ventana vibrante a producciones diversas.",
          moodTags: ["Dinámico", "Profesional"],
          visualTraits: ["Luz cálida de estudio sobre personas."],
          limits: [],
          evidence: [],
          galleryRefs: [],
        },
      },
      gallery: {
        status: "resolved",
        value: gallery,
      },
    },
    updatedAt: "",
  } as BrandKitDocument;
}

describe("brand-kit-gallery-brief", () => {
  it("marks briefs stale when harvest changes", () => {
    const gallery: GalleryValue = {
      harvested: [
        { assetId: "a", included: true, provenance: { type: "header_img", detail: "hero" } },
        { assetId: "b", included: true, provenance: { type: "header_img", detail: "banner" } },
        { assetId: "c", included: true, provenance: { type: "header_img", detail: "cover" } },
        { assetId: "d", included: true, provenance: { type: "header_img", detail: "photo" } },
      ],
      generated: [],
      stylePromptVersion: 0,
      categoryBriefs: [
        {
          category: "textures",
          description: "Tela rugosa azul marino con trama visible.",
          promptHint: "Macro rough navy blue fabric weave.",
          confidence: "high",
          evidenceCount: 4,
        },
      ],
      categoryBriefsSourceKey: "old-key",
    };
    const doc = docWithGallery(gallery);
    const key = computeGalleryBriefSourceKey(doc);
    expect(galleryBriefsAreFresh(gallery, key)).toBe(false);
    const resolved = resolveGalleryCategoryBriefing(doc, "textures");
    expect(resolved.stale).toBe(true);
    expect(resolved.description).toContain("Tela rugosa azul");
  });

  it("uses stored brief when fresh", () => {
    const harvested = Array.from({ length: 4 }, (_, index) => ({
      assetId: `img-${index}`,
      included: true,
      provenance: { type: "header_img" as const, detail: `foto ${index}` },
    }));
    const doc = docWithGallery({
      harvested,
      generated: [],
      stylePromptVersion: 0,
      categoryBriefs: [
        {
          category: "objects",
          description: "Micrófono de podcast y tablet sobre mesa de madera clara.",
          promptHint: "Podcast microphone and tablet on light wood desk.",
          confidence: "high",
          evidenceCount: 4,
        },
      ],
    });
    const key = computeGalleryBriefSourceKey(doc);
    const gallery = doc.slots.gallery!.value as GalleryValue;
    const freshGallery = { ...gallery, categoryBriefsSourceKey: key };
    const freshDoc = docWithGallery(freshGallery);
    const resolved = resolveGalleryCategoryBriefing(freshDoc, "objects");
    expect(resolved.stale).toBe(false);
    expect(resolved.description).toContain("Micrófono");
    expect(resolved.needsAnalysis).toBe(false);
  });
});
