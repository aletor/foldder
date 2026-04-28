import { describe, expect, it } from "vitest";
import type { BrandDNA } from "./brain-models";
import type { TelemetryBatch } from "./brain-telemetry";
import {
  hasStrongLearningSignals,
  MockBrainLearningExtractionLlm,
  TelemetryProcessor,
  type AggregatedTelemetryPayload,
} from "./telemetry-processor";
import { BrainService } from "./brain-service";
import { parseLearningCandidatesResponse } from "./learning-candidate-schema";
import { VISUAL_NODE_REVIEW_BUNDLE_KEY } from "./brain-visual-review-constants";

function batch(
  nodeType: TelemetryBatch["nodeType"],
  events: TelemetryBatch["events"],
  flush: TelemetryBatch["flushReason"] = "manual",
  batchId: string,
): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId,
    sessionId: "sess-agg",
    projectId: "p1",
    nodeId: "n1",
    capturedAt: ts,
    createdAt: ts,
    flushReason: flush,
    nodeType,
    events,
  };
}

describe("TelemetryProcessor.aggregateBatch", () => {
  const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), new BrainService());

  it("deduplica sessionIds en el agregado", () => {
    const ts = new Date().toISOString();
    const b1 = batch("DESIGNER", [{ kind: "SUGGESTION_SHOWN", ts, suggestionId: "a" }], "manual", "b1");
    const b2 = batch("DESIGNER", [{ kind: "SUGGESTION_IGNORED", ts, suggestionId: "a" }], "manual", "b2");
    b2.sessionId = b1.sessionId;
    const agg = proc.aggregateBatch([b1, b2]);
    expect(agg.sessionIds).toEqual([b1.sessionId]);
  });

  it("cuenta frecuencias de event kinds y sugerencias", () => {
    const ts = new Date().toISOString();
    const ev = [
      { kind: "SUGGESTION_SHOWN" as const, ts, suggestionId: "txt:w:1" },
      { kind: "SUGGESTION_ACCEPTED" as const, ts, suggestionId: "txt:w:1" },
      { kind: "MANUAL_OVERRIDE" as const, ts, fieldRef: "hero" },
    ];
    const agg = proc.aggregateBatch([batch("DESIGNER", ev, "export", "bx")]);
    expect(agg.eventKindCounts.SUGGESTION_SHOWN).toBe(1);
    expect(agg.eventKindCounts.SUGGESTION_ACCEPTED).toBe(1);
    expect(agg.eventKindCounts.MANUAL_OVERRIDE).toBe(1);
    expect(agg.suggestions.uniqueShown).toBe(1);
    expect(agg.suggestions.uniqueAccepted).toBe(1);
    expect(agg.flushReasonCounts.export).toBe(1);
    expect(agg.manualOverrideCounts.hero).toBe(1);
  });

  it("resume muchos eventos repetidos en contadores (no duplica ids internos de sugerencia en salida)", () => {
    const ts = new Date().toISOString();
    const events = Array.from({ length: 20 }, (_, i) => ({
      kind: "SUGGESTION_SHOWN" as const,
      ts,
      suggestionId: `img:wave-${i % 3}`,
    }));
    const agg = proc.aggregateBatch([batch("DESIGNER", events, "manual", "b-big")]);
    expect(agg.suggestions.uniqueShown).toBeLessThanOrEqual(20);
    expect(agg.batchCount).toBe(1);
  });
});

describe("hasStrongLearningSignals", () => {
  const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), new BrainService());

  it("es false si solo hay ignores / shown sin aceptación ni señales fuertes", () => {
    const ts = new Date().toISOString();
    const agg = proc.aggregateBatch([
      batch(
        "DESIGNER",
        [
          { kind: "SUGGESTION_SHOWN", ts, suggestionId: "txt:x:1" },
          { kind: "SUGGESTION_IGNORED", ts, suggestionId: "txt:x:1" },
        ],
        "manual",
        "weak",
      ),
    ]);
    expect(hasStrongLearningSignals(agg)).toBe(false);
  });

  it("es true con export flush o CONTENT_EXPORTED", () => {
    const ts = new Date().toISOString();
    const aggExportFlush = proc.aggregateBatch([
      batch("DESIGNER", [{ kind: "SUGGESTION_IGNORED", ts, suggestionId: "z" }], "export", "e1"),
    ]);
    expect(hasStrongLearningSignals(aggExportFlush)).toBe(true);

    const aggContent = proc.aggregateBatch([
      batch(
        "DESIGNER",
        [{ kind: "CONTENT_EXPORTED", ts, exportFormat: "pdf" }],
        "manual",
        "e2",
      ),
    ]);
    expect(hasStrongLearningSignals(aggContent)).toBe(true);
  });
});

describe("TelemetryProcessor.extractLearnings", () => {
  it("parsea JSON válido desde el mock LLM", async () => {
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), new BrainService());
    const dna: BrandDNA = {
      sectors: [],
      claims: [{ id: "c1", text: "Marca seria" }],
      palettes: [],
      typography: [],
      prohibitions: [{ text: "No humor verde" }],
    };
    const agg: AggregatedTelemetryPayload = {
      ...proc.aggregateBatch([]),
      projectId: "p",
      nodeId: "n",
    };
    const candidates = await proc.extractLearnings(agg, dna);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.topic.length).toBeGreaterThan(0);
      expect(c.evidence.sourceNodeIds.length).toBeGreaterThan(0);
    }
  });
});

describe("TelemetryProcessor.processStreamEvent", () => {
  it("no invoca extracción con señales solo débiles (sin candidatos persistidos)", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-weak",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const { stored } = await proc.processStreamEvent({
      projectId: "p-weak",
      workspaceId: "__root__",
      nodeId: "n1",
      receivedAt: ts,
      batches: [
        batch(
          "DESIGNER",
          [
            { kind: "SUGGESTION_SHOWN", ts, suggestionId: "txt:only:1" },
            { kind: "SUGGESTION_IGNORED", ts, suggestionId: "txt:only:1" },
          ],
          "manual",
          "weak-batch",
        ),
      ],
    });
    expect(stored).toBe(0);
    expect((await store.listPendingLearnings("p-weak")).length).toBe(0);
  });

  it("crea candidatos visuales Designer cuando USER_UPLOAD se usa y se exporta", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-designer-vis",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const { stored } = await proc.processStreamEvent({
      projectId: "p-designer-vis",
      workspaceId: "__root__",
      nodeId: "designer-node-1",
      receivedAt: ts,
      batches: [
        batch(
          "DESIGNER",
          [
            {
              kind: "IMAGE_IMPORTED",
              ts,
              source: "USER_UPLOAD",
              fileName: "ref.png",
              pageId: "page-a",
              frameId: "frame-1",
            },
            {
              kind: "IMAGE_USED",
              ts,
              source: "USER_UPLOAD",
              fileName: "ref.png",
              pageId: "page-a",
              frameId: "frame-1",
            },
            {
              kind: "CONTENT_EXPORTED",
              ts,
              exportFormat: "vector_pdf",
              designer: {
                pageExported: true,
                exportImagesSummary: { imageFramesWithContent: 1, looseImageObjects: 0 },
              },
            },
          ],
          "export",
          "designer-vis-batch",
        ),
      ],
    });
    expect(stored).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("p-designer-vis");
    const visual = pending.find((p) => p.candidate.type === "VISUAL_MEMORY");
    expect(visual).toBeTruthy();
    expect(visual?.candidate.value.toLowerCase()).not.toMatch(/^brain\s+ha\s+detectado/);
    expect(visual?.candidate.value.toLowerCase()).toMatch(/esta pieza .*imágenes/);
    expect(visual?.candidate.evidence.examples?.some((x) => x.startsWith("Basado en: Designer"))).toBe(true);
    expect(visual?.candidate.evidence.eventCounts?.[VISUAL_NODE_REVIEW_BUNDLE_KEY]).toBe(1);
    expect(visual?.candidate.evidence.eventCounts?.designer_user_upload_used).toBe(1);
    expect(visual?.candidate.evidence.eventCounts?.visual_user_upload_used).toBe(1);
    expect(pending.some((p) => p.candidate.type === "PROJECT_MEMORY")).toBe(true);
  });

  it("añade CREATIVE_PREFERENCE cauteloso si hubo sugerencias img sin aceptar y se usaron subidas", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-designer-pref",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    await proc.processStreamEvent({
      projectId: "p-designer-pref",
      workspaceId: "__root__",
      nodeId: "n-pref",
      receivedAt: ts,
      batches: [
        batch(
          "DESIGNER",
          [
            { kind: "SUGGESTION_SHOWN", ts, suggestionId: "img:waveA:slot1" },
            {
              kind: "IMAGE_USED",
              ts,
              source: "USER_UPLOAD",
              fileName: "own.jpg",
              pageId: "p1",
              frameId: "f1",
            },
            {
              kind: "CONTENT_EXPORTED",
              ts,
              designer: { exportImagesSummary: { imageFramesWithContent: 1, looseImageObjects: 0 } },
            },
          ],
          "export",
          "pref-batch",
        ),
      ],
    });
    const pending = await store.listPendingLearnings("p-designer-pref");
    const creative = pending.find((p) => p.candidate.type === "CREATIVE_PREFERENCE");
    expect(creative?.candidate.value.toLowerCase()).toContain("se han preferido");
    expect(creative?.candidate.reasoning.toLowerCase()).toContain("cautelosa");
  });

  it("crea candidatos PENDING_REVIEW cuando hay señal fuerte (export)", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-strong",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const { stored } = await proc.processStreamEvent({
      projectId: "p-strong",
      workspaceId: "__root__",
      nodeId: "n1",
      receivedAt: ts,
      batches: [
        batch(
          "DESIGNER",
          [{ kind: "CONTENT_EXPORTED", ts, exportFormat: "vector_pdf", designer: { pageExported: true } }],
          "export",
          "strong-batch",
        ),
      ],
    });
    expect(stored).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("p-strong");
    expect(pending.length).toBe(stored);
    expect(pending.every((p) => p.status === "PENDING_REVIEW")).toBe(true);
  });

  it("no muta BrandDNA en el store al extraer", async () => {
    const store = new BrainService();
    const dna: BrandDNA = {
      sectors: [],
      claims: [{ id: "x", text: "Claim fijo" }],
      palettes: [],
      typography: [],
      prohibitions: [],
    };
    store.seedStaticBrain({
      projectId: "p-dna",
      workspaceId: "__root__",
      dna,
      preferences: { defaultCopyLength: "short" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    await proc.processStreamEvent({
      projectId: "p-dna",
      workspaceId: "__root__",
      nodeId: "n1",
      receivedAt: ts,
      batches: [
        batch("DESIGNER", [{ kind: "TEXT_FINALIZED", ts, textPreview: "Hola" }], "manual", "dna-safe"),
      ],
    });
    const after = await store.getBrandDna("p-dna", "__root__");
    expect(after?.claims.length).toBe(1);
    expect(after?.claims[0]?.text).toBe("Claim fijo");
  });

  it("Photoroom con IMAGE_EXPORTED + CONTENT_EXPORTED en flush export genera PENDING_REVIEW con bundle visual", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-photoroom-export",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const { stored } = await proc.processStreamEvent({
      projectId: "p-photoroom-export",
      workspaceId: "__root__",
      nodeId: "pr-export-node",
      receivedAt: ts,
      batches: [
        batch(
          "PHOTOROOM",
          [
            { kind: "IMAGE_IMPORTED", ts, source: "USER_UPLOAD", fileName: "in.png" },
            { kind: "IMAGE_EDITED", ts, fileName: "in.png" },
            { kind: "IMAGE_EXPORTED", ts, exportFormat: "png", artifactType: "image" },
            { kind: "CONTENT_EXPORTED", ts, artifactType: "image" },
          ],
          "export",
          "pr-export-batch",
        ),
      ],
    });
    expect(stored).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("p-photoroom-export");
    expect(pending.every((p) => p.status === "PENDING_REVIEW")).toBe(true);
    const visual = pending.find((p) => p.candidate.type === "VISUAL_MEMORY");
    expect(visual?.candidate.evidence.eventCounts?.[VISUAL_NODE_REVIEW_BUNDLE_KEY]).toBe(1);
  });

  it("crea candidatos visuales desde Photoroom con IMAGE_EDITED en exportación", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-photoroom-vis",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const { stored } = await proc.processStreamEvent({
      projectId: "p-photoroom-vis",
      workspaceId: "__root__",
      nodeId: "photoroom-node-1",
      receivedAt: ts,
      batches: [
        batch(
          "PHOTOROOM",
          [
            {
              kind: "IMAGE_EDITED",
              ts,
              source: "USER_UPLOAD",
              fileName: "product-cutout.png",
            },
          ],
          "export",
          "photoroom-vis-batch",
        ),
      ],
    });
    expect(stored).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("p-photoroom-vis");
    const visual = pending.find((p) => p.candidate.type === "VISUAL_MEMORY");
    expect(visual).toBeTruthy();
    expect(visual?.candidate.evidence.examples?.some((x) => x.startsWith("Basado en: Photoroom"))).toBe(true);
    expect(visual?.candidate.evidence.eventCounts?.[VISUAL_NODE_REVIEW_BUNDLE_KEY]).toBe(1);
    expect(visual?.candidate.evidence.sourceNodeTypes).toContain("PHOTOROOM");
  });

  it("crea candidatos visuales desde Image Generator con slot de imagen aceptado en exportación", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-imgen-vis",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const { stored } = await proc.processStreamEvent({
      projectId: "p-imgen-vis",
      workspaceId: "__root__",
      nodeId: "imgen-node-1",
      receivedAt: ts,
      batches: [
        batch(
          "IMAGE_GENERATOR",
          [{ kind: "SUGGESTION_ACCEPTED", ts, suggestionId: "img:waveA:slot1" }],
          "export",
          "imgen-vis-batch",
        ),
      ],
    });
    expect(stored).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("p-imgen-vis");
    const visual = pending.find((p) => p.candidate.type === "VISUAL_MEMORY");
    expect(visual?.candidate.evidence.examples?.some((x) => x.startsWith("Basado en: Image Generator"))).toBe(
      true,
    );
    expect(visual?.candidate.evidence.sourceNodeTypes).toContain("IMAGE_GENERATOR");
  });

  it("mezcla etiquetas de origen cuando hay lotes Designer y Photoroom en el mismo evento", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-mixed-vis",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    await proc.processStreamEvent({
      projectId: "p-mixed-vis",
      workspaceId: "__root__",
      nodeId: "mixed-node",
      receivedAt: ts,
      batches: [
        batch(
          "DESIGNER",
          [
            {
              kind: "IMAGE_USED",
              ts,
              source: "USER_UPLOAD",
              fileName: "a.png",
              pageId: "p1",
              frameId: "f1",
            },
            {
              kind: "CONTENT_EXPORTED",
              ts,
              designer: { exportImagesSummary: { imageFramesWithContent: 1, looseImageObjects: 0 } },
            },
          ],
          "export",
          "mix-designer",
        ),
        batch(
          "PHOTOROOM",
          [{ kind: "IMAGE_EDITED", ts, source: "USER_UPLOAD", fileName: "b.png" }],
          "export",
          "mix-photo",
        ),
      ],
    });
    const pending = await store.listPendingLearnings("p-mixed-vis");
    const visual = pending.find((p) => p.candidate.type === "VISUAL_MEMORY");
    const basado = visual?.candidate.evidence.examples?.find((x) => x.startsWith("Basado en:"));
    expect(basado).toContain("Designer");
    expect(basado).toContain("Photoroom");
  });

  it("no mezcla nodeId entre dos eventos de nodos visuales distintos", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "p-isolate",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const batchA = batch(
      "PHOTOROOM",
      [{ kind: "IMAGE_EDITED", ts, source: "USER_UPLOAD", fileName: "a.png" }],
      "export",
      "iso-a",
    );
    const batchB = batch(
      "PHOTOROOM",
      [{ kind: "IMAGE_EDITED", ts, source: "USER_UPLOAD", fileName: "b.png" }],
      "export",
      "iso-b",
    );
    await proc.processStreamEvent({
      projectId: "p-isolate",
      workspaceId: "__root__",
      nodeId: "node-alpha",
      receivedAt: ts,
      batches: [batchA],
    });
    await proc.processStreamEvent({
      projectId: "p-isolate",
      workspaceId: "__root__",
      nodeId: "node-beta",
      receivedAt: ts,
      batches: [batchB],
    });
    const pending = await store.listPendingLearnings("p-isolate");
    const alpha = pending.filter((p) => p.nodeId === "node-alpha");
    const beta = pending.filter((p) => p.nodeId === "node-beta");
    expect(alpha.length).toBeGreaterThan(0);
    expect(beta.length).toBeGreaterThan(0);
    expect(alpha.every((p) => p.nodeId === "node-alpha")).toBe(true);
    expect(beta.every((p) => p.nodeId === "node-beta")).toBe(true);
  });
});

describe("parseLearningCandidatesResponse contract", () => {
  it("rechaza JSON sin reasoning o evidencia válida", () => {
    const bad = parseLearningCandidatesResponse({
      candidates: [
        {
          type: "BRAND_DNA",
          scope: "BRAND",
          topic: "t",
          value: "v",
          confidence: 1,
          reasoning: "",
          evidence: { sourceNodeIds: [], sourceNodeTypes: [] },
        },
      ],
    });
    expect(bad.length).toBe(0);
  });
});
