import type {
  AggregatedVisualPatterns,
  BrainVisualAnalysisStatus,
  BrainVisionProviderId,
  BrainVisualImageAnalysis,
  BrainVisualReferenceLayer,
  BrainVisualTelemetryImageSource,
  ProjectAssetsMetadata,
  VisualImageClassification,
} from "@/app/spaces/project-assets-metadata";
import type { LearningCandidate } from "./learning-candidate-schema";
import {
  BRAIN_VISION_PROVENANCE_EVENT_KEY,
  computeBrainVisionProvenanceKeyFromAnalyses,
  countVisualImageAnalysisDisposition,
} from "./brain-learning-provenance";
import type { TelemetryImageSource } from "./brain-models";
import type { BrainNodeType, TelemetryBatch, TelemetryEvent, TelemetryEventKind } from "./brain-telemetry";
import { parseVisionAnalysisJson } from "./brain-vision-json";

function newAnalysisId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `viz-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isExcludedFromVisualDna(a: BrainVisualImageAnalysis): boolean {
  return a.userVisualOverride === "EXCLUDED";
}

/** Clasificación efectiva para agregados y UI (respeta override manual salvo EXCLUDED). */
export function getEffectiveClassification(a: BrainVisualImageAnalysis): VisualImageClassification {
  if (a.userVisualOverride && a.userVisualOverride !== "EXCLUDED") {
    return a.userVisualOverride as VisualImageClassification;
  }
  const c = a.classification;
  if (
    c === "CORE_VISUAL_DNA" ||
    c === "PROJECT_VISUAL_REFERENCE" ||
    c === "CONTEXTUAL_VISUAL_MEMORY" ||
    c === "RAW_ASSET_ONLY"
  ) {
    return c;
  }
  return "PROJECT_VISUAL_REFERENCE";
}

function isVisualRowMockOrFallback(a: BrainVisualImageAnalysis): boolean {
  if (a.fallbackUsed === true) return true;
  if (a.visionProviderId === "mock") return true;
  if (!a.visionProviderId && String(a.analyzerVersion ?? "").toLowerCase().startsWith("mock")) return true;
  return false;
}

/** Solo filas con visión real analizada alimentan agregados (no mock ni pendientes). */
export function contributesToVisualAggregate(a: BrainVisualImageAnalysis): boolean {
  if (isExcludedFromVisualDna(a)) return false;
  const st: BrainVisualAnalysisStatus = a.analysisStatus ?? "analyzed";
  if (st !== "analyzed") return false;
  if (isVisualRowMockOrFallback(a)) return false;
  return true;
}

/** Entrada mínima para análisis (sin binarios pesados): metadatos + nombre. */
export type BrainVisualAssetRef = {
  projectId?: string;
  workspaceId?: string;
  id: string;
  name: string;
  mime: string;
  type?: "document" | "image";
  sourceKind: BrainVisualImageAnalysis["sourceKind"];
  /** Etiqueta legible (p. ej. slot «Protagonista»). */
  label?: string;
  dedupeKey?: string;
  assetRef?: string;
  imageFingerprint?: string;
  visualTelemetrySource?: BrainVisualTelemetryImageSource;
  originNodeId?: string;
  originNodeType?: string;
  usedInExport?: boolean;
  exportId?: string;
  artifactType?: "pdf" | "image" | "video" | "presentation" | "design" | "article" | "unknown";
  pageId?: string;
  frameId?: string;
  layerId?: string;
  maskId?: string;
  canvasObjectId?: string;
  fileName?: string;
  /** data:image/… o https://… para visión real (referencias en conocimiento / slots). */
  imageUrlForVision?: string;
};

export function analysisDedupeKeyFromRef(ref: BrainVisualAssetRef): string {
  return (ref.dedupeKey ?? ref.imageFingerprint ?? ref.assetRef ?? ref.id).trim();
}

export function analysisDedupeKeyFromAnalysis(a: BrainVisualImageAnalysis): string {
  return (a.analysisDedupeKey ?? a.imageFingerprint ?? a.assetRef ?? a.sourceAssetId).trim();
}

function mapTelemetryToVisualSource(s?: TelemetryImageSource): BrainVisualTelemetryImageSource | undefined {
  if (!s) return undefined;
  if (s === "USER_UPLOAD" || s === "upload") return "USER_UPLOAD";
  if (s === "BRAIN_SUGGESTION" || s === "brain") return "BRAIN_SUGGESTION";
  if (s === "PROJECT_ASSET" || s === "library") return "PROJECT_ASSET";
  if (s === "BRAIN_REFERENCE") return "BRAIN_REFERENCE";
  if (s === "generated" || s === "GENERATED_IMAGE") return "GENERATED_IMAGE";
  if (s === "PHOTOROOM_EDIT") return "PHOTOROOM_EDIT";
  if (s === "VIDEO_FRAME") return "VIDEO_FRAME";
  if (s === "MOODBOARD_REFERENCE") return "MOODBOARD_REFERENCE";
  if (s === "EXTERNAL") return "EXTERNAL";
  return "EXTERNAL";
}

const VISUAL_TELEMETRY_NODE_TYPES = new Set<BrainNodeType>([
  "DESIGNER",
  "PHOTOROOM",
  "IMAGE_GENERATOR",
  "VIDEO_NODE",
  "PRESENTATION_NODE",
  "CUSTOM",
]);

export function isVisualTelemetryNodeType(nodeType: BrainNodeType): boolean {
  return VISUAL_TELEMETRY_NODE_TYPES.has(nodeType);
}

const TELEM_ARTIFACT_TYPES = new Set<string>(["pdf", "image", "video", "presentation", "design", "article", "unknown"]);

function inferArtifactType(ev: TelemetryEvent, nodeType: BrainNodeType): BrainVisualAssetRef["artifactType"] {
  const at = ev.artifactType;
  if (typeof at === "string" && TELEM_ARTIFACT_TYPES.has(at)) return at as BrainVisualAssetRef["artifactType"];
  const fmt = (ev.exportFormat ?? "").toLowerCase();
  if (fmt.includes("pdf")) return "pdf";
  if (fmt.includes("png") || fmt.includes("jpeg") || fmt.includes("jpg") || fmt === "image") return "image";
  if (fmt.includes("video") || fmt.includes("mp4")) return "video";
  if (nodeType === "VIDEO_NODE") return "video";
  if (nodeType === "PRESENTATION_NODE") return "presentation";
  if (nodeType === "DESIGNER") return "design";
  if (nodeType === "ARTICLE_WRITER") return "article";
  return "unknown";
}

function sourceKindForVisualNode(nodeType: BrainNodeType): BrainVisualImageAnalysis["sourceKind"] {
  switch (nodeType) {
    case "DESIGNER":
      return "designer_image";
    case "PHOTOROOM":
      return "photoroom_image";
    case "IMAGE_GENERATOR":
      return "generated_image";
    default:
      return "project_asset";
  }
}

export type BuildVisualAssetRefsFromTelemetryParams = {
  projectId: string;
  workspaceId?: string;
  nodeId: string;
  batches: TelemetryBatch[];
};

const VISUAL_REF_EVENT_KINDS = new Set<TelemetryEventKind>([
  "IMAGE_IMPORTED",
  "IMAGE_USED",
  "IMAGE_EDITED",
  "IMAGE_EXPORTED",
  "IMAGE_GENERATED",
  "VISUAL_ASSET_USED",
  "ASSET_USED",
  "SUGGESTION_ACCEPTED",
  "BACKGROUND_REMOVED",
  "MASK_USED",
  "LAYER_USED",
  "STYLE_APPLIED",
  "COLOR_USED",
  "TYPOGRAPHY_USED",
  "LOGO_CREATED",
  "LOGO_EDITED",
  "VIDEO_FRAME_USED",
  "VIDEO_POSTER_USED",
  "CONTENT_EXPORTED",
]);

/** Eventos que solo generan ref si hay identidad de asset (id, ref, fingerprint o nombre estable). */
const VISUAL_REF_KINDS_REQUIRING_ASSET_IDENTITY = new Set<TelemetryEventKind>([
  "BACKGROUND_REMOVED",
  "MASK_USED",
  "LAYER_USED",
  "STYLE_APPLIED",
  "COLOR_USED",
  "TYPOGRAPHY_USED",
  "LOGO_CREATED",
  "LOGO_EDITED",
  "VISUAL_ASSET_USED",
  "CONTENT_EXPORTED",
]);

function eventHasAssetIdentity(ev: TelemetryEvent): boolean {
  return Boolean(
    (typeof ev.assetId === "string" && ev.assetId.trim()) ||
      (typeof ev.assetRef === "string" && ev.assetRef.trim()) ||
      (typeof ev.imageFingerprint === "string" && ev.imageFingerprint.trim()) ||
      (typeof ev.fileName === "string" && ev.fileName.trim()),
  );
}

function shouldBuildVisualRefFromEvent(ev: TelemetryEvent): boolean {
  if (!VISUAL_REF_EVENT_KINDS.has(ev.kind)) return false;
  if (ev.kind === "SUGGESTION_ACCEPTED" && !ev.suggestionId?.trim().startsWith("img:")) return false;
  if (ev.kind === "ASSET_USED") {
    const mt = (ev.mimeType ?? "").toLowerCase();
    if (mt && !mt.startsWith("image/")) return false;
  }
  if (VISUAL_REF_KINDS_REQUIRING_ASSET_IDENTITY.has(ev.kind)) {
    return eventHasAssetIdentity(ev);
  }
  return true;
}

/**
 * Construye referencias de imagen normalizadas desde lotes de telemetría de **cualquier** nodo visual.
 */
export function buildVisualAssetRefsFromTelemetryBatches(
  params: BuildVisualAssetRefsFromTelemetryParams,
): BrainVisualAssetRef[] {
  const { projectId, workspaceId, nodeId, batches } = params;
  const out: BrainVisualAssetRef[] = [];
  const seen = new Set<string>();

  for (const batch of batches) {
    if (batch.version !== 2) continue;
    const nodeType = batch.nodeType;
    if (!isVisualTelemetryNodeType(nodeType)) continue;
    const batchIsExport = batch.flushReason === "export";

    for (const e of batch.events) {
      const ev = e as TelemetryEvent;
      if (!shouldBuildVisualRefFromEvent(ev)) continue;

      const ref = buildVisualAssetRefFromEvent({
        ev,
        nodeType,
        nodeId,
        projectId,
        workspaceId,
        batchIsExport,
      });
      if (!ref) continue;
      const dk = analysisDedupeKeyFromRef(ref);
      if (seen.has(dk)) continue;
      seen.add(dk);
      out.push(ref);
    }
  }
  return out;
}

function buildVisualAssetRefFromEvent(opts: {
  ev: TelemetryEvent;
  nodeType: BrainNodeType;
  nodeId: string;
  projectId: string;
  workspaceId?: string;
  batchIsExport: boolean;
}): BrainVisualAssetRef | null {
  const { ev, nodeType, nodeId, projectId, workspaceId, batchIsExport } = opts;
  const slug = nodeType.toLowerCase();

  if (nodeType === "DESIGNER") {
    if (ev.kind !== "IMAGE_IMPORTED" && ev.kind !== "IMAGE_USED") return null;
  } else if (nodeType === "IMAGE_GENERATOR") {
    const allowIg: TelemetryEventKind[] = [
      "IMAGE_IMPORTED",
      "IMAGE_USED",
      "IMAGE_EDITED",
      "IMAGE_EXPORTED",
      "IMAGE_GENERATED",
      "VISUAL_ASSET_USED",
      "ASSET_USED",
      "SUGGESTION_ACCEPTED",
      "CONTENT_EXPORTED",
    ];
    if (!allowIg.includes(ev.kind)) return null;
  } else if (nodeType === "VIDEO_NODE") {
    const allowVid: TelemetryEventKind[] = [
      "IMAGE_IMPORTED",
      "IMAGE_USED",
      "IMAGE_EDITED",
      "IMAGE_EXPORTED",
      "VIDEO_FRAME_USED",
      "VIDEO_POSTER_USED",
      "VISUAL_ASSET_USED",
      "CONTENT_EXPORTED",
      "ASSET_USED",
    ];
    if (!allowVid.includes(ev.kind)) return null;
  } else if (nodeType === "PHOTOROOM") {
    if (ev.kind === "VIDEO_FRAME_USED" || ev.kind === "VIDEO_POSTER_USED") return null;
  } else {
    const allowGeneric: TelemetryEventKind[] = [
      "IMAGE_IMPORTED",
      "IMAGE_USED",
      "IMAGE_EDITED",
      "IMAGE_EXPORTED",
      "IMAGE_GENERATED",
      "VISUAL_ASSET_USED",
      "ASSET_USED",
      "CONTENT_EXPORTED",
    ];
    if (!allowGeneric.includes(ev.kind)) return null;
  }

  const id =
    (typeof ev.assetId === "string" && ev.assetId.trim()) ||
    `${slug}:${nodeId}:${ev.kind}:${ev.pageId ?? ""}:${ev.frameId ?? ""}:${ev.layerId ?? ev.fieldRef ?? ""}:${ev.maskId ?? ""}:${(ev.fileName ?? "").trim()}:${ev.source ?? ""}:${ev.suggestionId ?? ""}`;
  const dedupe =
    (typeof ev.imageFingerprint === "string" && ev.imageFingerprint.trim()) ||
    (typeof ev.assetId === "string" && ev.assetId.trim()) ||
    (typeof ev.assetRef === "string" && ev.assetRef.trim()) ||
    id;

  const name =
    typeof ev.fileName === "string" && ev.fileName.trim()
      ? ev.fileName.trim()
      : `${ev.kind.toLowerCase().replace(/_/g, "-")}-${slug}`;

  const exportKinds = new Set<TelemetryEventKind>([
    "IMAGE_USED",
    "IMAGE_EDITED",
    "IMAGE_EXPORTED",
    "IMAGE_GENERATED",
    "VISUAL_ASSET_USED",
    "VIDEO_FRAME_USED",
    "VIDEO_POSTER_USED",
  ]);
  const usedInExport =
    batchIsExport &&
    (ev.usedInExport === true ||
      exportKinds.has(ev.kind) ||
      (ev.kind === "CONTENT_EXPORTED" &&
        (nodeType === "VIDEO_NODE" || inferArtifactType(ev, nodeType) === "video" || Boolean(ev.usedInExport))));

  let vSource = mapTelemetryToVisualSource(ev.source);
  if (nodeType === "VIDEO_NODE" || ev.kind === "VIDEO_FRAME_USED" || ev.kind === "VIDEO_POSTER_USED") {
    vSource = vSource ?? "VIDEO_FRAME";
  }
  if (ev.kind === "IMAGE_GENERATED" || (ev.kind === "SUGGESTION_ACCEPTED" && ev.suggestionId?.startsWith("img:"))) {
    vSource = vSource ?? "GENERATED_IMAGE";
  }
  if (
    nodeType === "PHOTOROOM" &&
    (ev.kind === "IMAGE_EDITED" ||
      ev.kind === "BACKGROUND_REMOVED" ||
      ev.kind === "MASK_USED" ||
      ev.kind === "LAYER_USED" ||
      ev.kind === "STYLE_APPLIED" ||
      ev.kind === "IMAGE_EXPORTED" ||
      ev.kind === "LOGO_EDITED" ||
      ev.kind === "LOGO_CREATED")
  ) {
    vSource = "PHOTOROOM_EDIT";
  }

  return {
    projectId,
    workspaceId,
    id,
    name,
    mime: typeof ev.mimeType === "string" && ev.mimeType.trim() ? ev.mimeType : "image/*",
    type: "image",
    sourceKind: sourceKindForVisualNode(nodeType),
    dedupeKey: dedupe,
    imageFingerprint: typeof ev.imageFingerprint === "string" ? ev.imageFingerprint : undefined,
    assetRef: typeof ev.assetRef === "string" ? ev.assetRef : undefined,
    visualTelemetrySource: vSource,
    originNodeId: nodeId,
    originNodeType: nodeType,
    usedInExport,
    exportId: typeof ev.exportId === "string" ? ev.exportId : undefined,
    artifactType: inferArtifactType(ev, nodeType),
    pageId: ev.pageId,
    frameId: ev.frameId,
    layerId: typeof ev.layerId === "string" ? ev.layerId : typeof ev.fieldRef === "string" ? ev.fieldRef : undefined,
    maskId: typeof ev.maskId === "string" ? ev.maskId : undefined,
    canvasObjectId: typeof ev.canvasObjectId === "string" ? ev.canvasObjectId : undefined,
    fileName: ev.fileName,
  };
}

/** @deprecated Usar `buildVisualAssetRefsFromTelemetryBatches`. */
export function buildDesignerTelemetryImageAssetRefs(nodeId: string, batches: TelemetryBatch[]): BrainVisualAssetRef[] {
  return buildVisualAssetRefsFromTelemetryBatches({
    projectId: "",
    workspaceId: undefined,
    nodeId,
    batches,
  });
}

/**
 * Fila mínima sin contenido simulado: hasta que Gemini/OpenAI Vision analicen de verdad,
 * no rellenamos sujetos/paletas ficticios (evita contaminar agregados y prompts).
 */
export function buildEmptyBrainVisualAnalysisShell(
  asset: BrainVisualAssetRef,
  dedupeKey: string,
  opts: {
    analysisStatus: BrainVisualAnalysisStatus;
    visionProviderId?: BrainVisionProviderId;
    analyzerVersion?: string;
    reasoning?: string;
    failureReason?: string;
    fallbackUsed?: boolean;
    visionProviderAttempted?: BrainVisionProviderId;
    fallbackProvider?: BrainVisualImageAnalysis["fallbackProvider"];
  },
): BrainVisualImageAnalysis {
  const hasPixels = Boolean(
    typeof asset.imageUrlForVision === "string" &&
      (asset.imageUrlForVision.startsWith("data:image") || /^https:\/\//i.test(asset.imageUrlForVision.trim())),
  );
  return {
    id: newAnalysisId(),
    sourceAssetId: asset.id,
    sourceKind: asset.sourceKind,
    sourceLabel: asset.label ?? asset.name,
    subject: "",
    subjectTags: [],
    visualStyle: [],
    mood: [],
    colorPalette: {
      dominant: [],
      secondary: [],
      temperature: "neutral",
      saturation: "low",
      contrast: "low",
    },
    composition: [],
    people: "",
    clothingStyle: "",
    graphicStyle: "",
    brandSignals: [],
    possibleUse: [],
    classification: "PROJECT_VISUAL_REFERENCE",
    coherenceScore: 0,
    analyzedAt: new Date().toISOString(),
    analysisDedupeKey: dedupeKey,
    assetRef: asset.assetRef,
    imageFingerprint: asset.imageFingerprint,
    visualTelemetrySource: asset.visualTelemetrySource,
    originNodeId: asset.originNodeId,
    originNodeType: asset.originNodeType,
    usedInExport: asset.usedInExport === true,
    pageId: asset.pageId,
    frameId: asset.frameId,
    fileName: asset.fileName,
    peopleDetail: { present: false },
    clothingDetail: { present: false },
    graphicDetail: { present: false },
    reasoning:
      opts.reasoning ??
      (opts.analysisStatus === "pending"
        ? "Pendiente de análisis con visión remota (Gemini/OpenAI). No hay datos simulados."
        : ""),
    analysisStatus: opts.analysisStatus,
    visionProviderId: opts.visionProviderId,
    analyzerVersion: opts.analyzerVersion ?? "none-1",
    fallbackUsed: opts.fallbackUsed,
    visionProviderAttempted: opts.visionProviderAttempted,
    fallbackProvider: opts.fallbackProvider,
    failureReason: opts.failureReason,
    imageUrlForVisionAvailable: hasPixels,
  };
}

/** Base vacía para tests o fusión JSON; no inventa escena ni paleta. */
export function buildBrainVisualMockAnalysisFromAsset(_projectId: string, asset: BrainVisualAssetRef): BrainVisualImageAnalysis {
  const k = analysisDedupeKeyFromRef(asset);
  return buildEmptyBrainVisualAnalysisShell(asset, k, {
    analysisStatus: "analyzed",
    visionProviderId: "mock",
    analyzerVersion: "mock-1",
    reasoning: "Proveedor mock explícito (solo tests); sin señales simuladas.",
  });
}

/**
 * Sin visión remota configurada solo registramos la referencia en estado pendiente.
 * Si ya existe análisis con la misma clave de dedupe, lo reutiliza (salvo fallos).
 */
export function analyzeBrainImageAsset(
  _projectId: string,
  asset: BrainVisualAssetRef,
  existing?: readonly BrainVisualImageAnalysis[],
): BrainVisualImageAnalysis {
  const k = analysisDedupeKeyFromRef(asset);
  const hit = existing?.find((a) => analysisDedupeKeyFromAnalysis(a) === k);
  if (hit && hit.analysisStatus !== "failed") return { ...hit };
  return buildEmptyBrainVisualAnalysisShell(asset, k, {
    analysisStatus: "pending",
    reasoning: "Sin análisis automático simulado. Usa «Reanalizar imágenes» con visión remota o sube referencias y vuelve a analizar.",
  });
}

export type AnalyzeBrainImageBatchOptions = {
  existingAnalyses?: readonly BrainVisualImageAnalysis[];
  maxImages?: number;
};

export function analyzeBrainImageBatch(
  projectId: string,
  assets: BrainVisualAssetRef[],
  opts?: AnalyzeBrainImageBatchOptions,
): BrainVisualImageAnalysis[] {
  const existing = opts?.existingAnalyses ?? [];
  const max = opts?.maxImages ?? 32;
  const uniq: BrainVisualAssetRef[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    const k = analysisDedupeKeyFromRef(a);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(a);
    if (uniq.length >= max) break;
  }
  return uniq.map((r) => analyzeBrainImageAsset(projectId, r, existing));
}

function countStrings(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of list) {
    const k = s.trim().toLowerCase();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function topN(m: Map<string, number>, n: number): string[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  return [];
}

export function aggregateVisualPatterns(analyses: BrainVisualImageAnalysis[]): AggregatedVisualPatterns {
  const excludedFromVisualDnaCount = analyses.filter((a) => isExcludedFromVisualDna(a)).length;
  const active = analyses.filter(contributesToVisualAggregate);

  const styleTally = countStrings(active.flatMap((a) => asStringList(a.visualStyle)));
  const moodTally = countStrings(active.flatMap((a) => asStringList(a.mood)));
  const subjectTally = countStrings(
    active.flatMap((a) => {
      const tags = asStringList(a.subjectTags);
      if (tags.length) return tags;
      const subj = typeof a.subject === "string" ? a.subject : "";
      return subj.split(/[,;]/g).map((s) => s.trim()).filter(Boolean);
    }),
  );
  const composition = countStrings(active.flatMap((a) => asStringList(a.composition)));
  const palettes = active.flatMap((a) => asStringList(a.colorPalette?.dominant));
  const secondaries = active.flatMap((a) => asStringList(a.colorPalette?.secondary));

  const graphicPieces = active.flatMap((a) =>
    String(a.graphicStyle ?? "")
      .split(/[,;·]/g)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const implicitPieces = active
    .map((a) => (a.implicitBrandMessage || "").trim())
    .filter(Boolean);

  const countsByClassification: Partial<Record<VisualImageClassification, number>> = {};
  for (const a of active) {
    const eff = getEffectiveClassification(a);
    countsByClassification[eff] = (countsByClassification[eff] ?? 0) + 1;
  }

  const recurringStyles = topN(styleTally, 8);
  const dominantMoods = topN(moodTally, 6);
  const dominantPalette = Array.from(new Set(palettes)).slice(0, 10);
  const dominantSecondaryPalette = Array.from(new Set(secondaries)).slice(0, 8);
  const frequentSubjects = topN(subjectTally, 5);
  const compositionNotes = topN(composition, 6);
  const peopleClothingNotes = topN(
    countStrings(
      active.flatMap((a) =>
        `${String(a.people ?? "")}; ${String(a.clothingStyle ?? "")}`
          .split(";")
          .flatMap((x) => x.split(","))
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ),
    5,
  );
  const graphicStyleNotes = topN(countStrings(graphicPieces), 6);
  const implicitBrandMessages = topN(countStrings(implicitPieces), 4);

  const narrativeSummary = [
    recurringStyles.length ? `Estética dominante: ${recurringStyles.slice(0, 3).join(", ")}.` : "",
    dominantMoods.length ? `Mood recurrente: ${dominantMoods.slice(0, 3).join(", ")}.` : "",
    dominantPalette.length ? `Paleta reiterada: ${dominantPalette.slice(0, 4).join(", ")}.` : "",
    implicitBrandMessages.length ? `Lectura de marca: ${implicitBrandMessages.slice(0, 2).join(" · ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const coherenceAvg =
    active.length > 0
      ? active.reduce((s, a) => s + (typeof a.coherenceScore === "number" ? a.coherenceScore : 0.62), 0) / active.length
      : 0.55;

  const outlierSourceAssetIds = active
    .filter((a) => {
      const eff = getEffectiveClassification(a);
      return eff === "CONTEXTUAL_VISUAL_MEMORY" || (typeof a.coherenceScore === "number" && a.coherenceScore < 0.45);
    })
    .map((a) => a.sourceAssetId)
    .slice(0, 32);

  const patternSummary = buildDensePatternSummaryPhrase({
    recurringStyles,
    dominantMoods,
    compositionNotes,
    peopleClothingNotes,
    dominantPalette,
    implicitBrandMessages,
  });

  const patternConfidence = Math.min(0.95, 0.28 + Math.min(active.length, 14) * 0.035 + coherenceAvg * 0.28);

  return {
    recurringStyles,
    dominantMoods,
    dominantPalette,
    dominantSecondaryPalette,
    frequentSubjects,
    compositionNotes,
    peopleClothingNotes,
    graphicStyleNotes,
    implicitBrandMessages,
    narrativeSummary: narrativeSummary || "Patrones visuales consistentes en las referencias subidas.",
    countsByClassification,
    excludedFromVisualDnaCount,
    ...(outlierSourceAssetIds.length ? { outlierSourceAssetIds } : {}),
    patternConfidence,
    ...(patternSummary ? { patternSummary } : {}),
  };
}

function buildDensePatternSummaryPhrase(parts: {
  recurringStyles: string[];
  dominantMoods: string[];
  compositionNotes: string[];
  peopleClothingNotes: string[];
  dominantPalette: string[];
  implicitBrandMessages: string[];
}): string {
  const bits: string[] = [];
  if (parts.recurringStyles.length) bits.push(parts.recurringStyles.slice(0, 5).join(", "));
  if (parts.dominantMoods.length) bits.push(`mood ${parts.dominantMoods.slice(0, 4).join(", ")}`);
  if (parts.compositionNotes.length) bits.push(`composición ${parts.compositionNotes.slice(0, 3).join(", ")}`);
  if (parts.peopleClothingNotes.length) bits.push(`personas/ropa ${parts.peopleClothingNotes.slice(0, 3).join(", ")}`);
  if (parts.dominantPalette.length) bits.push(`paleta ${parts.dominantPalette.slice(0, 5).join(", ")}`);
  if (parts.implicitBrandMessages.length) bits.push(`mensaje ${parts.implicitBrandMessages.slice(0, 2).join(" · ")}`);
  if (!bits.length) return "";
  return `Esta pieza usa imágenes ${bits.join(", ")}.`.slice(0, 480);
}

/**
 * Genera candidatos revisables (no escriben ADN solos). Regla: conjunto fuerte → VISUAL_MEMORY / BRAND_DNA;
 * imagen claramente periférica → OUTLIER o PROJECT_MEMORY.
 */
export function createVisualLearningCandidates(
  projectId: string,
  analyses: BrainVisualImageAnalysis[],
  aggregated: AggregatedVisualPatterns,
): LearningCandidate[] {
  void projectId;
  if (!analyses.length) return [];

  const active = analyses.filter((a) => !isExcludedFromVisualDna(a));
  const n = active.length;
  if (!n) return [];
  const provKey = computeBrainVisionProvenanceKeyFromAnalyses(analyses);
  const disp = countVisualImageAnalysisDisposition(analyses);
  const visionProvEventCounts = {
    [BRAIN_VISION_PROVENANCE_EVENT_KEY]: provKey,
    brain_vision_real_remote_count: disp.realRemoteAnalyzed,
    brain_vision_fallback_mock_count: disp.fallbackOrMockAnalyzed,
  } as const;
  const coreLike = active.filter((a) => getEffectiveClassification(a) === "CORE_VISUAL_DNA").length;
  const ctxLike = active.filter((a) => getEffectiveClassification(a) === "CONTEXTUAL_VISUAL_MEMORY").length;
  const coherenceAvg =
    active.reduce((s, a) => s + (typeof a.coherenceScore === "number" ? a.coherenceScore : 0.6), 0) / n;

  const bullets = [
    aggregated.compositionNotes.slice(0, 3).join(" · "),
    aggregated.dominantMoods.slice(0, 3).join(" · "),
    aggregated.recurringStyles.slice(0, 3).join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");

  const isBrand = coreLike / n >= 0.35 && coherenceAvg > 0.55;
  const mainValue = isBrand
    ? `La dirección visual de la marca se apoya en ${[
        aggregated.recurringStyles.slice(0, 4).join(", "),
        aggregated.dominantMoods.length ? `mood ${aggregated.dominantMoods.slice(0, 3).join(", ")}` : "",
        aggregated.dominantPalette.length ? `paleta ${aggregated.dominantPalette.slice(0, 4).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(", ")}.`.slice(0, 500)
    : aggregated.patternSummary?.trim() || mainValueSummary(aggregated, n);

  const main: LearningCandidate = {
    type: isBrand ? "BRAND_DNA" : "VISUAL_MEMORY",
    scope: isBrand ? "BRAND" : "PROJECT",
    topic: "visual_direction",
    value: mainValue,
    confidence: Math.min(0.92, 0.45 + (coherenceAvg * 0.35) + (n >= 8 ? 0.1 : 0)),
    reasoning: "Patrones visuales alineados en el lote de referencias analizadas.",
    evidence: {
      sourceNodeIds: ["brain:visual_references"],
      sourceNodeTypes: ["brain_studio"],
      primarySourceNodeId: "brain:visual_references",
      evidenceSource: "visual_reference",
      relatedArtifactKinds: ["reference_image", "moodboard"],
      examples: [aggregated.narrativeSummary.slice(0, 200), signalLineFromAggregated(aggregated).slice(0, 200)].filter(
        (x) => x.trim().length > 0,
      ),
      eventCounts: {
        reference_images: n,
        reference_images_total: analyses.length,
        core_visual_dna_candidates: coreLike,
        contextual_outliers: ctxLike,
        ...visionProvEventCounts,
      },
    },
  };

  const out: LearningCandidate[] = [main];

  const exportLinked = active.filter((a) => a.usedInExport === true).length;
  if (exportLinked >= 1 && aggregated.recurringStyles.length) {
    out.push({
      type: "PROJECT_MEMORY",
      scope: "PROJECT",
      topic: "project_memory",
      value: `En este proyecto se han usado imágenes ${aggregated.recurringStyles.slice(0, 4).join(", ")} como parte de la dirección visual en piezas exportadas.`.slice(
        0,
        500,
      ),
      confidence: Math.min(0.78, 0.42 + exportLinked * 0.06),
      reasoning:
        "Telemetría o análisis marcan imágenes vinculadas a exportación; revisar antes de promover a ADN o memoria global."
          .slice(0, 150),
      evidence: {
        sourceNodeIds: ["brain:visual_references"],
        sourceNodeTypes: ["brain_studio"],
        primarySourceNodeId: "brain:visual_references",
        evidenceSource: "visual_reference",
        relatedArtifactKinds: ["Designer", "Exportación"],
        examples: [signalLineFromAggregated(aggregated).slice(0, 200)],
        eventCounts: {
          reference_images: n,
          export_linked_images: exportLinked,
          ...visionProvEventCounts,
        },
      },
    });
  }

  if (ctxLike >= 1 && ctxLike / n >= 0.2) {
    out.push({
      type: "OUTLIER",
      scope: "WORKSPACE",
      topic: "contextual_memory",
      value:
        "Algunas referencias se alejan del estilo predominante; pueden servir como contexto puntual para piezas concretas.",
      confidence: 0.35,
      reasoning: "Detección de referencias con coherencia baja frente al centro del conjunto.",
      evidence: {
        sourceNodeIds: ["brain:visual_references"],
        sourceNodeTypes: ["brain_studio"],
        evidenceSource: "visual_reference",
        eventCounts: { contextual_images: ctxLike, ...visionProvEventCounts },
        examples: [bullets.slice(0, 180)],
      },
    });
  }

  return out;
}

function signalLineFromAggregated(agg: AggregatedVisualPatterns): string {
  const parts = [
    ...agg.compositionNotes.slice(0, 2),
    ...agg.recurringStyles.slice(0, 2),
    ...agg.dominantMoods.slice(0, 2),
    ...agg.graphicStyleNotes.slice(0, 1),
    ...agg.implicitBrandMessages.slice(0, 1),
  ].filter(Boolean);
  return parts.length ? `Señales: ${parts.join(" · ")}.` : "";
}

function mainValueSummary(agg: AggregatedVisualPatterns, n: number): string {
  if (agg.patternSummary?.trim()) return agg.patternSummary.trim();
  const tone = agg.recurringStyles[0] ?? "una dirección visual coherente";
  const mood = agg.dominantMoods[0] ?? "equilibrada";
  return `Predomina una estética ${tone} con sensación ${mood}, consolidada a partir de ${n} imagen${n === 1 ? "" : "es"} de referencia analizadas.`;
}

/** Resumen agregado portable (p. ej. outbound context a nodos conectados). */
export type VisualPatternSummary = {
  projectId: string;
  totalImages: number;
  analyzedImages: number;
  dominantStyles: string[];
  dominantMood: string[];
  dominantPalette: string[];
  commonSubjects: string[];
  commonCompositions: string[];
  peoplePatterns: string[];
  clothingPatterns: string[];
  visualMessages: string[];
  outlierImages: string[];
  confidence: number;
  summary: string;
};

export function buildVisualPatternSummary(
  projectId: string,
  analyses: BrainVisualImageAnalysis[],
  aggregated: AggregatedVisualPatterns,
): VisualPatternSummary {
  const active = analyses.filter((a) => !isExcludedFromVisualDna(a));
  const visualMsgs = active.flatMap((a) => a.visualMessage ?? []).filter(Boolean);
  return {
    projectId,
    totalImages: analyses.length,
    analyzedImages: active.length,
    dominantStyles: aggregated.recurringStyles.slice(0, 12),
    dominantMood: aggregated.dominantMoods.slice(0, 10),
    dominantPalette: aggregated.dominantPalette.slice(0, 14),
    commonSubjects: aggregated.frequentSubjects.slice(0, 10),
    commonCompositions: aggregated.compositionNotes.slice(0, 10),
    peoplePatterns: aggregated.peopleClothingNotes.slice(0, 8),
    clothingPatterns: aggregated.peopleClothingNotes.slice(0, 8),
    visualMessages: Array.from(new Set(visualMsgs)).slice(0, 12),
    outlierImages: aggregated.outlierSourceAssetIds ?? [],
    confidence: aggregated.patternConfidence ?? 0.5,
    summary: aggregated.patternSummary ?? aggregated.narrativeSummary,
  };
}

export function listVisualReferences(assets: ProjectAssetsMetadata): BrainVisualReferenceLayer {
  return (
    assets.strategy.visualReferenceAnalysis ?? {
      analyses: [],
    }
  );
}

export type MergeVisualReferenceLayerOptions = {
  visionProviderId?: BrainVisionProviderId;
};

export function mergeVisualReferenceLayer(
  prev: BrainVisualReferenceLayer | undefined,
  analyses: BrainVisualImageAnalysis[],
  aggregated: AggregatedVisualPatterns,
  analyzerVersion: string = "mock-1",
  opts?: MergeVisualReferenceLayerOptions,
): BrainVisualReferenceLayer {
  const map = new Map<string, BrainVisualImageAnalysis>();
  for (const a of prev?.analyses ?? []) {
    map.set(a.sourceAssetId, a);
  }
  for (const a of analyses) {
    const prevRow = map.get(a.sourceAssetId);
    const ov = prevRow?.userVisualOverride;
    const stamped: BrainVisualImageAnalysis = {
      ...a,
      analyzerVersion: a.analyzerVersion ?? analyzerVersion,
    };
    const mergedRow = ov !== undefined ? { ...stamped, userVisualOverride: ov } : stamped;
    map.set(a.sourceAssetId, mergedRow);
  }
  const merged = [...map.values()].sort((x, y) => y.analyzedAt.localeCompare(x.analyzedAt));
  return {
    analyses: merged,
    aggregated,
    lastAnalyzedAt: new Date().toISOString(),
    analyzerVersion,
    lastVisionProviderId: opts?.visionProviderId ?? prev?.lastVisionProviderId,
    ...(prev?.confirmedVisualPatterns?.length ? { confirmedVisualPatterns: prev.confirmedVisualPatterns } : {}),
    ...(prev?.dnaCollageImageDataUrl ? { dnaCollageImageDataUrl: prev.dnaCollageImageDataUrl } : {}),
    ...(prev?.dnaCollageSourceFingerprint ? { dnaCollageSourceFingerprint: prev.dnaCollageSourceFingerprint } : {}),
    ...(prev?.dnaCollageGeneratedAt ? { dnaCollageGeneratedAt: prev.dnaCollageGeneratedAt } : {}),
    ...(prev?.brandVisualDnaBundle ? { brandVisualDnaBundle: prev.brandVisualDnaBundle } : {}),
  };
}

/** Referencias de imagen conocidas en assets (sin descargar S3). */
export function collectVisualImageAssetRefs(assets: ProjectAssetsMetadata): BrainVisualAssetRef[] {
  const out: BrainVisualAssetRef[] = [];
  const mimeIsImage = (mime: string) => mime.startsWith("image/");

  for (const d of assets.knowledge.documents) {
    const im = mimeIsImage(d.mime) || d.type === "image" || d.format === "image";
    if (!im) continue;
    let imageUrlForVision: string | undefined;
    if (typeof d.dataUrl === "string" && d.dataUrl.startsWith("data:image")) {
      imageUrlForVision = d.dataUrl;
    } else if (typeof d.originalSourceUrl === "string" && /^https:\/\//i.test(d.originalSourceUrl.trim())) {
      imageUrlForVision = d.originalSourceUrl.trim();
    }
    out.push({
      id: d.id,
      name: d.name,
      mime: d.mime,
      type: d.type === "image" ? "image" : "document",
      sourceKind: "knowledge_document",
      ...(imageUrlForVision ? { imageUrlForVision } : {}),
    });
  }

  const vs = assets.strategy.visualStyle;
  for (const key of ["protagonist", "environment", "textures", "people"] as const) {
    const slot = vs[key];
    if (slot?.imageUrl?.trim() || slot?.imageS3Key?.trim()) {
      const u = slot.imageUrl?.trim();
      const imageUrlForVision =
        u && (u.startsWith("data:image") || /^https:\/\//i.test(u)) ? u : undefined;
      out.push({
        id: `slot:${key}`,
        name: `${slot.title} (${key})`,
        mime: "image/*",
        type: "image",
        sourceKind: "visual_style_slot",
        label: slot.title,
        ...(imageUrlForVision ? { imageUrlForVision } : {}),
      });
    }
  }

  if (assets.brand.logoPositive) {
    const lp = assets.brand.logoPositive.trim();
    const imageUrlForVision =
      lp.startsWith("data:image") || /^https:\/\//i.test(lp) ? assets.brand.logoPositive : undefined;
    out.push({
      id: "brand:logoPositive",
      name: "Logo positivo",
      mime: "image/*",
      sourceKind: "brand_logo",
      ...(imageUrlForVision ? { imageUrlForVision } : {}),
    });
  }
  if (assets.brand.logoNegative) {
    const ln = assets.brand.logoNegative.trim();
    const imageUrlForVision =
      ln.startsWith("data:image") || /^https:\/\//i.test(ln) ? assets.brand.logoNegative : undefined;
    out.push({
      id: "brand:logoNegative",
      name: "Logo negativo",
      mime: "image/*",
      sourceKind: "brand_logo",
      ...(imageUrlForVision ? { imageUrlForVision } : {}),
    });
  }

  return out;
}

export function reanalyzeVisualReferences(projectId: string, assets: ProjectAssetsMetadata): BrainVisualReferenceLayer {
  const refs = collectVisualImageAssetRefs(assets);
  const existing = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const analyses = analyzeBrainImageBatch(projectId, refs, { existingAnalyses: existing });
  const aggregated = aggregateVisualPatterns(analyses);
  return mergeVisualReferenceLayer(assets.strategy.visualReferenceAnalysis, analyses, aggregated, "client-pending-v1", {
    visionProviderId: undefined,
  });
}

/** Fusiona JSON validado de visión sobre una fila existente (p. ej. tras proveedor real). */
export function mergeVisionJsonIntoAnalysis(base: BrainVisualImageAnalysis, json: unknown): BrainVisualImageAnalysis {
  const p = parseVisionAnalysisJson(json);
  if (!p) return base;
  return {
    ...base,
    subject: p.subject.join(", "),
    subjectTags: p.subject,
    visualStyle: p.visualStyle,
    mood: p.mood,
    composition: p.composition,
    colorPalette: {
      dominant: p.colorPalette.dominant,
      secondary: p.colorPalette.secondary ?? [],
      temperature: p.colorPalette.temperature,
      saturation: p.colorPalette.saturation,
      contrast: p.colorPalette.contrast,
    },
    people: p.people.present ? (p.people.description ?? "personas en escena") : base.people,
    clothingStyle: p.clothingStyle.present ? (p.clothingStyle.style ?? []).join(", ") : base.clothingStyle,
    graphicStyle: p.graphicStyle.present
      ? [...(p.graphicStyle.layout ?? []), ...(p.graphicStyle.texture ?? [])].join(", ") || base.graphicStyle
      : base.graphicStyle,
    brandSignals: p.brandSignals.length ? p.brandSignals : base.brandSignals,
    visualMessage: p.visualMessage,
    possibleUse: p.possibleUse.length ? p.possibleUse : base.possibleUse,
    implicitBrandMessage: p.visualMessage.length ? p.visualMessage[0] : base.implicitBrandMessage,
    classification: p.classification,
    coherenceScore: p.confidence,
    reasoning: p.reasoning,
    peopleDetail: p.people,
    clothingDetail: p.clothingStyle,
    graphicDetail: p.graphicStyle,
    analysisStatus: "analyzed",
  };
}
