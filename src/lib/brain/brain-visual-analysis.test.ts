import { describe, expect, it } from "vitest";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import { BRAIN_VISION_PROVENANCE_EVENT_KEY } from "./brain-learning-provenance";
import type { TelemetryBatch } from "./brain-telemetry";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  aggregateVisualPatterns,
  analyzeBrainImageAsset,
  analyzeBrainImageBatch,
  analysisDedupeKeyFromRef,
  buildVisualAssetRefsFromTelemetryBatches,
  buildVisualPatternSummary,
  collectVisualImageAssetRefs,
  createVisualLearningCandidates,
  mergeVisionJsonIntoAnalysis,
  type BrainVisualAssetRef,
} from "./brain-visual-analysis";
import { parseVisionAnalysisJson } from "./brain-vision-json";

const ref = (over: Partial<BrainVisualAssetRef>): BrainVisualAssetRef => ({
  id: "a1",
  name: "studio-moodboard.png",
  mime: "image/png",
  type: "image",
  sourceKind: "designer_image",
  ...over,
});

function telemetryBatch(
  nodeType: TelemetryBatch["nodeType"],
  events: TelemetryBatch["events"],
  flush: TelemetryBatch["flushReason"] = "export",
  batchId = "batch-1",
): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId,
    sessionId: "sess-1",
    projectId: "p1",
    nodeId: "node-telemetry",
    capturedAt: ts,
    createdAt: ts,
    flushReason: flush,
    nodeType,
    events,
  };
}

describe("collectVisualImageAssetRefs", () => {
  it("expone imageUrlForVision desde dataUrl de documento de conocimiento", () => {
    const assets = defaultProjectAssets();
    assets.knowledge.documents.push({
      id: "doc-img-1",
      name: "ref.png",
      size: 100,
      mime: "image/png",
      type: "image",
      format: "image",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    const refs = collectVisualImageAssetRefs(assets);
    const row = refs.find((r) => r.id === "doc-img-1");
    expect(row?.imageUrlForVision?.startsWith("data:image/png")).toBe(true);
  });
});

describe("buildVisualAssetRefsFromTelemetryBatches", () => {
  it("Designer sigue produciendo refs desde IMAGE_IMPORTED / IMAGE_USED", () => {
    const ts = new Date().toISOString();
    const refs = buildVisualAssetRefsFromTelemetryBatches({
      projectId: "proj-a",
      workspaceId: "ws",
      nodeId: "designer-1",
      batches: [
        telemetryBatch(
          "DESIGNER",
          [
            { kind: "IMAGE_IMPORTED", ts, source: "USER_UPLOAD", fileName: "hero.png", pageId: "p1", frameId: "f1" },
            { kind: "IMAGE_USED", ts, source: "USER_UPLOAD", fileName: "hero.png", pageId: "p1", frameId: "f1" },
          ],
          "export",
        ),
      ],
    });
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs.every((r) => r.originNodeType === "DESIGNER")).toBe(true);
  });

  it("Photoroom produce refs desde IMAGE_EDITED con fuente PHOTOROOM_EDIT", () => {
    const ts = new Date().toISOString();
    const refs = buildVisualAssetRefsFromTelemetryBatches({
      projectId: "proj-b",
      nodeId: "photoroom-1",
      batches: [
        telemetryBatch("PHOTOROOM", [
          {
            kind: "IMAGE_EDITED",
            ts,
            source: "USER_UPLOAD",
            fileName: "cutout.png",
            imageFingerprint: "fp-ph",
          },
        ]),
      ],
    });
    expect(refs.length).toBe(1);
    expect(refs[0]?.originNodeType).toBe("PHOTOROOM");
    expect(refs[0]?.visualTelemetrySource).toBe("PHOTOROOM_EDIT");
    expect(refs[0]?.projectId).toBe("proj-b");
  });

  it("Photoroom acumula refs desde import, export, fondo y estilo con identidad de asset", () => {
    const ts = new Date().toISOString();
    const refs = buildVisualAssetRefsFromTelemetryBatches({
      projectId: "proj-ph",
      nodeId: "ph-2",
      batches: [
        telemetryBatch("PHOTOROOM", [
          { kind: "IMAGE_IMPORTED", ts, source: "USER_UPLOAD", fileName: "base.png", imageFingerprint: "fp-work" },
          { kind: "BACKGROUND_REMOVED", ts, fileName: "base.png", imageFingerprint: "fp-work" },
          { kind: "STYLE_APPLIED", ts, fileName: "base.png", imageFingerprint: "fp-work" },
          { kind: "IMAGE_EXPORTED", ts, fileName: "out.png", imageFingerprint: "fp-out", usedInExport: true },
        ]),
      ],
    });
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs.every((r) => r.originNodeId === "ph-2" && r.originNodeType === "PHOTOROOM")).toBe(true);
    const exported = refs.find((r) => r.usedInExport);
    expect(exported).toBeDefined();
  });

  it("Image Generator produce refs desde IMAGE_GENERATED e IMAGE_USED", () => {
    const ts = new Date().toISOString();
    const refs = buildVisualAssetRefsFromTelemetryBatches({
      projectId: "proj-ig",
      nodeId: "ig-1",
      batches: [
        telemetryBatch("IMAGE_GENERATOR", [
          {
            kind: "IMAGE_GENERATED",
            ts,
            source: "GENERATED_IMAGE",
            fileName: "gen-1.png",
            imageFingerprint: "gen-fp",
          },
          {
            kind: "IMAGE_USED",
            ts,
            source: "GENERATED_IMAGE",
            fileName: "gen-1.png",
            imageFingerprint: "gen-fp",
          },
        ]),
      ],
    });
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs[0]?.visualTelemetrySource).toBe("GENERATED_IMAGE");
    expect(refs.every((r) => r.originNodeType === "IMAGE_GENERATOR")).toBe(true);
  });

  it("Video produce refs con VIDEO_FRAME_USED y VIDEO_POSTER_USED", () => {
    const ts = new Date().toISOString();
    const refs = buildVisualAssetRefsFromTelemetryBatches({
      projectId: "proj-vid",
      nodeId: "vid-1",
      batches: [
        telemetryBatch(
          "VIDEO_NODE",
          [
            {
              kind: "VIDEO_FRAME_USED",
              ts,
              fileName: "frame.png",
              imageFingerprint: "vf-1",
              source: "VIDEO_FRAME",
            },
            {
              kind: "VIDEO_POSTER_USED",
              ts,
              fileName: "poster.jpg",
              imageFingerprint: "vp-1",
              source: "VIDEO_FRAME",
            },
          ],
          "export",
        ),
      ],
    });
    expect(refs.length).toBe(2);
    expect(refs.every((r) => r.originNodeType === "VIDEO_NODE")).toBe(true);
    expect(refs.every((r) => r.visualTelemetrySource === "VIDEO_FRAME")).toBe(true);
  });
});

describe("analyzeBrainImageAsset", () => {
  it("no vuelve a analizar si existe la misma clave de dedupe", () => {
    const first = analyzeBrainImageAsset("p1", ref({ dedupeKey: "k-same" }));
    const second = analyzeBrainImageAsset("p1", ref({ id: "other-id", dedupeKey: "k-same" }), [first]);
    expect(second.id).toBe(first.id);
    expect(analysisDedupeKeyFromRef(ref({ dedupeKey: "k-same" }))).toBe("k-same");
  });
});

describe("analyzeBrainImageBatch", () => {
  it("deduplica por dedupeKey y respeta maxImages", () => {
    const assets = [
      ref({ id: "1", dedupeKey: "x" }),
      ref({ id: "2", dedupeKey: "x", name: "other.png" }),
      ref({ id: "3", dedupeKey: "y", name: "b.png" }),
    ];
    const out = analyzeBrainImageBatch("p1", assets, { maxImages: 1 });
    expect(out).toHaveLength(1);
  });
});

describe("parseVisionAnalysisJson", () => {
  it("acepta JSON mínimo válido", () => {
    const p = parseVisionAnalysisJson({
      subject: ["a"],
      visualStyle: ["b"],
      mood: ["c"],
      composition: ["d"],
      colorPalette: { dominant: ["#fff"] },
      people: { present: false },
      clothingStyle: { present: false },
      graphicStyle: { present: false },
      brandSignals: ["x"],
      visualMessage: ["y"],
      possibleUse: ["z"],
      classification: "PROJECT_VISUAL_REFERENCE",
      confidence: 0.7,
      reasoning: "ok",
    });
    expect(p?.classification).toBe("PROJECT_VISUAL_REFERENCE");
  });

  it("rechaza JSON incompleto", () => {
    expect(parseVisionAnalysisJson({ subject: [] })).toBeNull();
  });
});

describe("mergeVisionJsonIntoAnalysis", () => {
  it("fusiona sobre una fila base", () => {
    const base: BrainVisualImageAnalysis = {
      id: "id-1",
      sourceAssetId: "s1",
      sourceKind: "knowledge_document",
      subject: "old",
      visualStyle: ["old"],
      mood: ["old"],
      colorPalette: { dominant: ["#000"], secondary: [] },
      composition: [],
      people: "",
      clothingStyle: "",
      graphicStyle: "",
      brandSignals: [],
      possibleUse: [],
      classification: "PROJECT_VISUAL_REFERENCE",
      analyzedAt: "2026-01-01T00:00:00.000Z",
    };
    const merged = mergeVisionJsonIntoAnalysis(base, {
      subject: ["nuevo"],
      visualStyle: ["editorial"],
      mood: ["cálido"],
      composition: ["centro"],
      colorPalette: { dominant: ["#f00"] },
      people: { present: true, description: "equipo" },
      clothingStyle: { present: true, style: ["casual"] },
      graphicStyle: { present: false },
      brandSignals: ["marca"],
      visualMessage: ["mensaje"],
      possibleUse: ["ads"],
      classification: "CORE_VISUAL_DNA",
      confidence: 0.9,
      reasoning: "visión",
    });
    expect(merged.subject).toContain("nuevo");
    expect(merged.classification).toBe("CORE_VISUAL_DNA");
  });
});

describe("aggregateVisualPatterns", () => {
  it("expone outliers y patternSummary cuando hay dispersión", () => {
    const a: BrainVisualImageAnalysis[] = [
      {
        id: "1",
        sourceAssetId: "1",
        sourceKind: "knowledge_document",
        subject: "a",
        visualStyle: ["minimal"],
        mood: ["calma"],
        colorPalette: { dominant: ["#fff"], secondary: [] },
        composition: ["centro"],
        people: "",
        clothingStyle: "",
        graphicStyle: "foto",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.8,
        analyzedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        sourceAssetId: "2",
        sourceKind: "knowledge_document",
        subject: "b",
        visualStyle: ["caos"],
        mood: ["tensión"],
        colorPalette: { dominant: ["#000"], secondary: [] },
        composition: ["diagonal"],
        people: "",
        clothingStyle: "",
        graphicStyle: "collage",
        brandSignals: [],
        possibleUse: [],
        classification: "CONTEXTUAL_VISUAL_MEMORY",
        coherenceScore: 0.35,
        analyzedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const agg = aggregateVisualPatterns(a);
    expect(agg.outlierSourceAssetIds?.length).toBeGreaterThan(0);
    expect(agg.patternSummary?.length).toBeGreaterThan(10);
  });

  it("no lanza si listas legacy vienen como string (p. ej. JSON antiguo)", () => {
    const row = {
      id: "legacy-1",
      sourceAssetId: "legacy-1",
      sourceKind: "knowledge_document",
      subject: "mesa, luz",
      subjectTags: "libros, café" as unknown as string[],
      visualStyle: "editorial documental" as unknown as string[],
      mood: ["cálido"],
      colorPalette: { dominant: ["#111"], secondary: [] },
      composition: ["centro"],
      people: "",
      clothingStyle: "",
      graphicStyle: undefined as unknown as string,
      brandSignals: [],
      possibleUse: [],
      classification: "PROJECT_VISUAL_REFERENCE",
      coherenceScore: 0.75,
      analyzedAt: "2026-01-01T00:00:00.000Z",
      analysisStatus: "analyzed",
      visionProviderId: "gemini-vision" as const,
      fallbackUsed: false,
    } as BrainVisualImageAnalysis;
    expect(() => aggregateVisualPatterns([row])).not.toThrow();
    const agg = aggregateVisualPatterns([row]);
    expect(agg.frequentSubjects.length).toBeGreaterThan(0);
  });
});

describe("createVisualLearningCandidates", () => {
  it("crea BRAND_DNA cuando hay núcleo fuerte y coherencia", () => {
    const analyses: BrainVisualImageAnalysis[] = Array.from({ length: 5 }, (_, i) => ({
      id: `c-${i}`,
      sourceAssetId: `c-${i}`,
      sourceKind: "knowledge_document",
      subject: "core",
      visualStyle: ["editorial", "premium"],
      mood: ["sofisticación"],
      colorPalette: { dominant: ["#eee"], secondary: [] },
      composition: ["aire"],
      people: "",
      clothingStyle: "",
      graphicStyle: "",
      brandSignals: ["premium"],
      possibleUse: [],
      classification: "CORE_VISUAL_DNA",
      coherenceScore: 0.82,
      analyzedAt: "2026-01-01T00:00:00.000Z",
    }));
    const agg = aggregateVisualPatterns(analyses);
    const cands = createVisualLearningCandidates("p1", analyses, agg);
    expect(cands.some((c) => c.type === "BRAND_DNA")).toBe(true);
    const main = cands.find((c) => c.topic === "visual_direction");
    expect(typeof main?.evidence.eventCounts?.[BRAIN_VISION_PROVENANCE_EVENT_KEY]).toBe("string");
  });
});

describe("buildVisualPatternSummary", () => {
  it("devuelve resumen portable", () => {
    const analyses: BrainVisualImageAnalysis[] = [
      {
        id: "1",
        sourceAssetId: "1",
        sourceKind: "designer_image",
        subject: "x",
        visualStyle: ["a"],
        mood: ["b"],
        colorPalette: { dominant: ["#fff"], secondary: [] },
        composition: ["c"],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.7,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        usedInExport: true,
      },
    ];
    const agg = aggregateVisualPatterns(analyses);
    const sum = buildVisualPatternSummary("p1", analyses, agg);
    expect(sum.projectId).toBe("p1");
    expect(sum.totalImages).toBe(1);
  });
});
