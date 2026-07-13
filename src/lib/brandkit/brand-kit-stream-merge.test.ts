import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import { applyBrandKitStreamEvent } from "@/app/spaces/brandKit/brand-kit-api";
import { applySlotAction } from "./brand-kit-slot-actions";
import { essenceCandidatesFromOnelinerLlm } from "./llm/brand-kit-llm-validate";
import { mergeSlotStreamPatch } from "./brand-kit-stream-merge";

describe("mergeSlotStreamPatch", () => {
  it("ignores pending when slot already has content", () => {
    const current = {
      ...createEmptyBrandKit().slots.voice,
      status: "resolved" as const,
      value: { summary: "Voz A", descriptors: [], rules: [], evidence: [] },
      confidence: 0.8,
    };
    const merged = mergeSlotStreamPatch(
      "voice",
      current,
      { status: "pending", confidence: 0 },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("resolved");
    expect((merged?.value as { summary: string }).summary).toBe("Voz A");
  });

  it("turns conflicting resolved values into candidates", () => {
    const current = {
      ...createEmptyBrandKit().slots.essence,
      status: "resolved" as const,
      value: {
        headline: "Antes",
        headlineOrigin: "extracted",
        summary: "Marca institucional seria con tono corporativo formal",
        beliefs: [],
        evidence: [],
      },
      confidence: 0.7,
    };
    const merged = mergeSlotStreamPatch(
      "essence",
      current,
      {
        status: "resolved",
        value: {
          headline: "Después",
          headlineOrigin: "extracted",
          summary: "Marca rebelde informal con tono cercano y divertido",
          beliefs: [],
          evidence: [],
        },
        confidence: 0.85,
      },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("candidates");
    expect(merged?.value).toBeUndefined();
    expect(merged?.candidates).toHaveLength(2);
    expect(merged?.reconciliation?.outcome).toBe("contradiction");
  });

  it("keeps prior resolved essence when new ingest adds headline candidates", () => {
    const current = {
      ...createEmptyBrandKit().slots.essence,
      status: "resolved" as const,
      value: {
        summary: "Esencia del primer documento",
        headline: "Primera headline",
        headlineOrigin: "generated" as const,
        beliefs: [{ label: "Trust" }],
        evidence: [],
      },
      provenance: { type: "file_upload" as const, detail: "doc-1.pdf", fileId: "f1" },
      confidence: 0.72,
    };
    const merged = mergeSlotStreamPatch(
      "essence",
      current,
      {
        status: "candidates",
        candidates: [
          {
            value: {
              summary: "Segunda opción",
              headline: "Headline B",
              headlineOrigin: "generated" as const,
              beliefs: [{ label: "Security" }],
              evidence: [],
            },
            score: 0.55,
            provenance: { type: "file_upload", detail: "doc-2.pdf", fileId: "f2" },
          },
          {
            value: {
              summary: "Tercera opción",
              headline: "Headline C",
              headlineOrigin: "generated" as const,
              beliefs: [{ label: "Innovation" }],
              evidence: [],
            },
            score: 0.5,
            provenance: { type: "file_upload", detail: "doc-3.pdf", fileId: "f3" },
          },
        ],
        confidence: 0.48,
      },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("candidates");
    expect(merged?.value).toBeUndefined();
    expect(merged?.candidates).toHaveLength(3);
    expect((merged?.candidates[0]?.value as { headline?: string }).headline).toBe("Primera headline");
    expect(merged?.needsReviewReason).toContain("Nueva fuente");
  });

  it("dedupes identical visual world candidates that differ only in metadata", () => {
    const visualWorld = {
      summary:
        "El mundo visual de OARO transmite seguridad avanzada, modernidad tecnológica y claridad operativa.",
      moodTags: ["futurista", "seguro"],
      visualTraits: [
        "Estética limpia y futurista",
        "Representaciones de seguridad digital",
        "Conectividad y fluidez",
        "Profesionalismo y liderazgo",
      ],
      limits: ["Evitar imágenes que sugieran complejidad o confusión", "Evitar estéticas obsoletas"],
      evidence: [{ quote: "Primera cita" }],
      galleryRefs: ["img-1", "img-2"],
    };
    const current = {
      ...createEmptyBrandKit().slots.visualWorld,
      status: "resolved" as const,
      value: visualWorld,
      provenance: { type: "llm_synthesis" as const, detail: "oaro.net", sourceUrl: "https://oaro.net" },
      confidence: 0.72,
    };
    const merged = mergeSlotStreamPatch(
      "visualWorld",
      current,
      {
        status: "candidates",
        candidates: [
          {
            value: {
              ...visualWorld,
              evidence: [{ quote: "Segunda cita distinta" }],
              galleryRefs: ["img-3"],
            },
            score: 0.68,
            provenance: { type: "llm_synthesis", detail: "oaro.net", sourceUrl: "https://oaro.net" },
          },
        ],
        confidence: 0.68,
        needsReviewReason: "Nueva fuente — elige la mejor opción",
      },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("candidates");
    expect(merged?.candidates).toHaveLength(1);
    expect(merged?.needsReviewReason).toContain("Revisa");
  });

  it("collapses ingest-style essence headline variants to a single resolved value", () => {
    const beliefs = [
      { label: "Trust" },
      { label: "Security" },
      { label: "Simplicity" },
    ];
    const current = {
      ...createEmptyBrandKit().slots.essence,
      status: "resolved" as const,
      value: { beliefs },
      provenance: { type: "llm_synthesis" as const, detail: "documentos" },
      confidence: 0.62,
    };
    const merged = mergeSlotStreamPatch(
      "essence",
      current,
      {
        status: "candidates",
        candidates: essenceCandidatesFromOnelinerLlm(
          {
            options: [
              { text: "OARO: La confianza digital que tu empresa necesita." },
              { text: "OARO: Redefiniendo la identidad digital con innovación y sencillez." },
              { text: "OARO: Impulsando la identidad digital del futuro, hoy." },
            ],
          },
          beliefs,
        ),
        confidence: 0.48,
      },
      { respectLocks: true },
    );

    expect(merged?.status).toBe("resolved");
    expect(merged?.value).toMatchObject({
      headline: "OARO: La confianza digital que tu empresa necesita.",
      beliefs,
    });
    expect(merged?.candidates.length).toBeGreaterThan(0);
  });

  it("opens logo picker when a second source proposes a different logo", () => {
    const current = {
      ...createEmptyBrandKit().slots.logo,
      status: "resolved" as const,
      value: {
        assetId: "deck-a.png",
        previewUrl: "deck-a.png",
        format: "png" as const,
        width: 200,
        height: 80,
        background: "transparent" as const,
        variants: [],
        sourcePdfSha256: "sha-a",
        sourcePageNumber: 1,
        detectionMethod: "vision_bbox" as const,
      },
      confidence: 0.88,
      provenance: { type: "pdf_xobject", detail: "deck A" },
    };
    const merged = mergeSlotStreamPatch(
      "logo",
      current,
      {
        status: "resolved",
        value: {
          assetId: "manual-b.png",
          previewUrl: "manual-b.png",
          format: "png",
          width: 220,
          height: 90,
          background: "transparent",
          variants: [],
          sourcePdfSha256: "sha-b",
          sourcePageNumber: 2,
          detectionMethod: "vision_bbox" as const,
        },
        confidence: 0.9,
        provenance: { type: "pdf_xobject", detail: "deck B" },
      },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("candidates");
    expect(merged?.value).toBeUndefined();
    expect(merged?.candidates?.length).toBeGreaterThanOrEqual(2);
    expect(merged?.needsReviewReason).toContain("elige el logo");
  });

  it("merges gallery harvested and preserves category briefs from incoming patch", () => {
    const current = {
      ...createEmptyBrandKit().slots.gallery,
      status: "resolved" as const,
      value: {
        harvested: [
          {
            assetId: "/api/spaces/s3-file?key=img-1",
            previewUrl: "/api/spaces/s3-file?key=img-1",
            included: true,
            provenance: { type: "file_upload", detail: "probe 1" },
          },
        ],
        generated: [],
        stylePromptVersion: 0,
      },
      confidence: 0.72,
    };
    const merged = mergeSlotStreamPatch(
      "gallery",
      current,
      {
        status: "resolved",
        value: {
          harvested: [
            {
              assetId: "/api/spaces/s3-file?key=img-1",
              previewUrl: "/api/spaces/s3-file?key=img-1",
              included: true,
              provenance: { type: "file_upload", detail: "probe 1" },
            },
          ],
          generated: [],
          stylePromptVersion: 0,
          categoryBriefs: [
            {
              category: "people_mood",
              description: "Retratos editoriales con luz cálida.",
              promptHint: "editorial portraits",
              confidence: "high",
              evidenceCount: 3,
            },
          ],
          categoryBriefsSourceKey: "abc123",
          categoryBriefsAnalyzedAt: "2026-07-13T10:00:00.000Z",
        },
        confidence: 0.76,
      },
      { respectLocks: true },
    );

    const gallery = merged?.value as {
      harvested: Array<{ assetId: string }>;
      categoryBriefs?: Array<{ description: string }>;
      categoryBriefsSourceKey?: string;
    };
    expect(gallery?.harvested).toHaveLength(1);
    expect(gallery?.categoryBriefs?.[0]?.description).toContain("Retratos editoriales");
    expect(gallery?.categoryBriefsSourceKey).toBe("abc123");
  });

  it("returns null for locked slots", () => {
    const current = {
      ...createEmptyBrandKit().slots.logo,
      status: "resolved" as const,
      locked: true,
      value: { assetId: "logo-1", format: "png", width: 1, height: 1, background: "transparent", variants: [] },
    };
    const merged = mergeSlotStreamPatch(
      "logo",
      current,
      { status: "pending" },
      { respectLocks: true, sources: [] },
    );
    expect(merged?.locked).toBe(true);
    expect(merged?.value).toMatchObject({ assetId: "logo-1" });
  });
});

describe("applyBrandKitStreamEvent additive mode", () => {
  it("preserves locked logo on second crawl patch", () => {
    let doc = createEmptyBrandKit();
    doc = applyBrandKitStreamEvent(doc, {
      type: "slot_update",
      slotId: "logo",
      patch: {
        status: "candidates",
        candidates: [
          {
            value: {
              assetId: "logo-a",
              previewUrl: "/a.png",
              format: "png",
              width: 100,
              height: 100,
              background: "transparent",
              variants: [],
            },
            score: 0.9,
            provenance: { type: "header_img", detail: "logo" },
          },
        ],
        confidence: 0.9,
      },
    });
    doc = applySlotAction(doc, "logo", { action: "choose_candidate", candidateIndex: 0, lock: true });

    doc = applyBrandKitStreamEvent(
      doc,
      {
        type: "slot_update",
        slotId: "logo",
        patch: { status: "pending", confidence: 0 },
      },
      { respectLocks: true },
    );

    expect(doc.slots.logo.locked).toBe(true);
    expect(doc.slots.logo.status).toBe("resolved");
    expect(doc.slots.logo.value).toMatchObject({ assetId: "logo-a" });
  });

  it("does not overwrite user_input brand name", () => {
    let doc = createEmptyBrandKit();
    doc = {
      ...doc,
      brandName: { value: "Mi marca", provenance: { type: "user_input", detail: "manual" } },
    };
    doc = applyBrandKitStreamEvent(
      doc,
      {
        type: "brand_name",
        value: "Otra marca",
        provenance: { type: "jsonld", detail: "Organization.name" },
      },
      { respectLocks: true },
    );
    expect(doc.brandName?.value).toBe("Mi marca");
  });

  it("preserves crawl web logo when PDF ingest adds a different logo", () => {
    let doc = createEmptyBrandKit();
    doc = applyBrandKitStreamEvent(doc, {
      type: "slot_update",
      slotId: "logo",
      patch: {
        status: "resolved",
        value: {
          assetId: "web-logo.svg",
          previewUrl: "https://example.com/logo.svg",
          format: "svg",
          width: 200,
          height: 80,
          background: "transparent",
          variants: [],
          detectionMethod: "header_img",
        },
        confidence: 0.99,
        provenance: { type: "header_img", detail: "https://oaro.net", sourceUrl: "https://oaro.net" },
        needsReviewReason: "Revisa el logo detectado en la web.",
      },
    }, { respectLocks: true });

    doc = applyBrandKitStreamEvent(doc, {
      type: "slot_update",
      slotId: "logo",
      patch: {
        status: "resolved",
        value: {
          assetId: "deck-logo.png",
          previewUrl: "/deck-logo.png",
          format: "png",
          width: 220,
          height: 90,
          background: "transparent",
          variants: [],
          sourcePdfSha256: "sha-deck",
          sourcePageNumber: 1,
          detectionMethod: "vision_bbox",
        },
        confidence: 0.99,
        provenance: { type: "pdf_xobject", detail: "Investor Deck V1.pdf", fileId: "f-deck" },
      },
    }, { respectLocks: true });

    expect(doc.slots.logo.status).toBe("candidates");
    expect(doc.slots.logo.candidates?.length).toBeGreaterThanOrEqual(2);
    expect(doc.slots.logo.value).toBeUndefined();
  });
});
