import { describe, expect, it } from "vitest";
import { mergeSlotStreamPatch } from "./brand-kit-stream-merge";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import { applySlotAction } from "./brand-kit-slot-actions";
import {
  areSemanticValuesEqual,
  countPendingBrandKitConflicts,
  dedupeSemanticCandidates,
  reconcileSemanticSlot,
  textSimilarity,
} from "./brand-kit-reconcile";

describe("textSimilarity", () => {
  it("scores overlapping summaries higher", () => {
    const score = textSimilarity(
      "Voz cercana y directa para audiencias jóvenes",
      "Voz directa y cercana con tono conversacional",
    );
    expect(score).toBeGreaterThan(0.35);
  });
});

describe("reconcileSemanticSlot", () => {
  it("merges reinforcement without candidates", () => {
    const result = reconcileSemanticSlot(
      "voice",
      {
        summary: "Voz cercana y directa",
        descriptors: ["cercano"],
        rules: ["Frases cortas"],
        avoid: [],
        evidence: [],
      },
      {
        summary: "Voz directa y cercana con tono conversacional",
        descriptors: ["conversacional"],
        rules: ["Evitar jerga"],
        avoid: [],
        evidence: [{ quote: "Hola, somos la marca" }],
      },
    );
    expect(result.outcome).toBe("reinforcement");
    if (result.outcome === "reinforcement") {
      expect(result.value).toMatchObject({
        descriptors: expect.arrayContaining(["cercano", "conversacional"]),
      });
    }
  });

  it("flags contradiction on opposing descriptors", () => {
    const result = reconcileSemanticSlot(
      "voice",
      {
        summary: "Voz institucional y formal para comunicación corporativa",
        descriptors: ["formal", "institucional"],
        rules: [],
        avoid: [],
        evidence: [],
      },
      {
        summary: "Voz cercana e informal para hablar de tú a tú",
        descriptors: ["informal", "cercano"],
        rules: [],
        avoid: [],
        evidence: [],
      },
      undefined,
      { type: "file_upload", detail: "brandbook.pdf" },
    );
    expect(result.outcome).toBe("contradiction");
    if (result.outcome === "contradiction") {
      expect(result.reconciliation.sourceLabel).toBe("archivo");
    }
  });
});

describe("semantic candidate dedupe", () => {
  const baseVisual = {
    summary: "Mundo visual limpio y tecnológico",
    moodTags: ["moderno"],
    visualTraits: ["Minimalismo", "Azules profundos"],
    limits: ["Evitar recargado"],
    evidence: [{ quote: "A" }],
    galleryRefs: ["g1"],
  };

  it("treats visually identical worlds as equal", () => {
    expect(
      areSemanticValuesEqual("visualWorld", baseVisual, {
        ...baseVisual,
        evidence: [{ quote: "B" }],
        galleryRefs: ["g2", "g3"],
      }),
    ).toBe(true);
  });

  it("collapses duplicate candidates to one", () => {
    const deduped = dedupeSemanticCandidates("visualWorld", [
      {
        value: baseVisual,
        score: 0.7,
        provenance: { type: "llm_synthesis", detail: "oaro.net", sourceUrl: "https://oaro.net" },
      },
      {
        value: { ...baseVisual, galleryRefs: ["other"] },
        score: 0.68,
        provenance: { type: "llm_synthesis", detail: "oaro.net", sourceUrl: "https://oaro.net" },
      },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.score).toBe(0.7);
  });
});

describe("mergeSlotStreamPatch with reconciliation", () => {
  it("auto-merges aligned voice updates", () => {
    const current = {
      ...createEmptyBrandKit().slots.voice,
      status: "resolved" as const,
      value: {
        summary: "Voz cercana y directa",
        descriptors: ["cercano"],
        rules: ["Frases cortas"],
        avoid: [],
        evidence: [],
      },
      confidence: 0.7,
    };
    const merged = mergeSlotStreamPatch(
      "voice",
      current,
      {
        status: "resolved",
        value: {
          summary: "Voz directa y cercana con tono conversacional",
          descriptors: ["conversacional"],
          rules: ["Evitar jerga"],
          avoid: [],
          evidence: [{ quote: "Ejemplo" }],
        },
        confidence: 0.8,
      },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("resolved");
    expect(merged?.reconciliation).toBeUndefined();
    expect((merged?.value as { descriptors: string[] }).descriptors).toEqual(
      expect.arrayContaining(["cercano", "conversacional"]),
    );
  });

  it("creates contradiction candidates for opposing voice", () => {
    const current = {
      ...createEmptyBrandKit().slots.voice,
      status: "resolved" as const,
      value: {
        summary: "Voz institucional y formal para comunicación corporativa",
        descriptors: ["formal"],
        rules: [],
        avoid: [],
        evidence: [],
      },
      confidence: 0.7,
    };
    const merged = mergeSlotStreamPatch(
      "voice",
      current,
      {
        status: "resolved",
        value: {
          summary: "Voz cercana e informal para hablar de tú a tú",
          descriptors: ["informal", "cercano"],
          rules: [],
          avoid: [],
          evidence: [],
        },
        confidence: 0.8,
      },
      { respectLocks: true },
    );
    expect(merged?.status).toBe("candidates");
    expect(merged?.reconciliation?.outcome).toBe("contradiction");
    expect(merged?.needsReviewReason).toContain("contradicción");
  });
});

describe("slot reconcile actions", () => {
  it("merges two candidates into one resolved value", () => {
    let doc = createEmptyBrandKit();
    doc = {
      ...doc,
      slots: {
        ...doc.slots,
        voice: {
          ...doc.slots.voice,
          status: "candidates",
          candidates: [
            {
              value: {
                summary: "Voz formal",
                descriptors: ["formal"],
                rules: ["Usted"],
                avoid: [],
                evidence: [],
              },
              score: 0.7,
              provenance: { type: "jsonld", detail: "web" },
            },
            {
              value: {
                summary: "Voz cercana",
                descriptors: ["cercano"],
                rules: ["Tú"],
                avoid: [],
                evidence: [],
              },
              score: 0.72,
              provenance: { type: "file_upload", detail: "pdf" },
            },
          ],
          reconciliation: {
            outcome: "contradiction",
            previousSummary: "Voz formal",
            incomingSummary: "Voz cercana",
          },
        },
      },
    };

    doc = applySlotAction(doc, "voice", { action: "merge_candidates", candidateIndices: [0, 1] });
    expect(doc.slots.voice.status).toBe("resolved");
    expect(doc.slots.voice.reconciliation).toBeUndefined();
    expect((doc.slots.voice.value as { descriptors: string[] }).descriptors).toEqual(
      expect.arrayContaining(["formal", "cercano"]),
    );
    expect(countPendingBrandKitConflicts(doc.slots)).toBe(0);
  });
});
