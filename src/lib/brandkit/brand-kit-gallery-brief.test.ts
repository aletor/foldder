import { describe, expect, it } from "vitest";
import {
  computeGalleryBriefSourceKey,
  galleryBriefsAreFresh,
  promptHintForGalleryCategory,
  resolveGalleryCategoryBriefing,
} from "./brand-kit-gallery-brief";
import { hasGalleryAdnContext, promptHintFromAdn, promptHintsFromAdn } from "./brand-kit-gallery-brief-adn";
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
          variants: [],
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
          variants: [],
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

  it("allows generation from ADN text without harvested images", () => {
    const doc = docWithGallery({
      harvested: [{ assetId: "solo", included: true, provenance: { type: "header_img", detail: "hero" } }],
      generated: [],
      stylePromptVersion: 0,
    });
    const resolved = resolveGalleryCategoryBriefing(doc, "textures");
    expect(resolved.needsAnalysis).toBe(false);
    expect(resolved.description).not.toContain("Añade al menos");
    expect(hasGalleryAdnContext(doc)).toBe(true);
  });

  it("builds prompt hints from ADN when no stored brief exists", () => {
    const doc = docWithGallery({
      harvested: [],
      generated: [],
      stylePromptVersion: 0,
    });
    const hint = promptHintFromAdn(doc, "textures");
    expect(hint.toLowerCase()).toContain("macro");
    const fallback = promptHintForGalleryCategory(undefined, "textures", "generic suffix", doc);
    expect(fallback).toBe(hint);
  });

  it("returns different prompt hints per variant index", () => {
    const doc = docWithGallery({
      harvested: [],
      generated: [],
      stylePromptVersion: 0,
      categoryBriefs: [
        {
          category: "objects",
          description: "Cuatro objetos distintos de producto.",
          promptHint: "Running shoes still life",
          variants: [
            { description: "Zapatillas", promptHint: "Running shoes still life" },
            { description: "Reloj", promptHint: "Sports watch macro" },
            { description: "Botella", promptHint: "Ergonomic bottle" },
            { description: "Mochila", promptHint: "Training backpack" },
          ],
          confidence: "high",
          evidenceCount: 0,
        },
      ],
    });
    const gallery = doc.slots.gallery!.value as GalleryValue;
    expect(promptHintForGalleryCategory(gallery, "objects", "fallback", doc, 0)).toContain("Running shoes");
    expect(promptHintForGalleryCategory(gallery, "objects", "fallback", doc, 2)).toContain("Ergonomic bottle");
    const adnHints = promptHintsFromAdn(doc, "objects");
    expect(adnHints).toHaveLength(4);
    expect(adnHints[0]).not.toBe(adnHints[1]);
  });

  it("shows only category essence paragraph, not all variant descriptions", () => {
    const doc = docWithGallery({
      harvested: [],
      generated: [],
      stylePromptVersion: 0,
      categoryBriefs: [
        {
          category: "people_mood",
          description:
            "Grupos diversos compartiendo comida y bebida en ambiente cálido y relajado, coherente con el tono de la marca.",
          promptHint: "Editorial group portrait",
          variants: [
            {
              description: "Retrato de grupo en terraza",
              promptHint: "Group on terrace laughing",
            },
            {
              description: "Pareja brindando al atardecer",
              promptHint: "Couple toasting at sunset",
            },
            {
              description: "Amigos en mesa compartiendo tapas",
              promptHint: "Friends sharing tapas",
            },
            {
              description: "Escena social en bar al aire libre",
              promptHint: "Outdoor bar social scene",
            },
          ],
          confidence: "high",
          evidenceCount: 9,
        },
      ],
    });
    const resolved = resolveGalleryCategoryBriefing(doc, "people_mood");
    expect(resolved.description).toContain("Grupos diversos");
    expect(resolved.description).not.toContain("Pareja brindando");
    expect(resolved.description).not.toContain("Variación");
    expect(resolved.description).not.toContain(" · ");
  });
});
