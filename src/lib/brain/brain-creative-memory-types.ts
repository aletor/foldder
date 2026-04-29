/**
 * Contrato de memoria creativa Brain (tipos transversales).
 * Persistencia principal: `project.metadata.assets` + normalización en `normalizeProjectAssets`.
 */
import type { BrainDecisionTrace } from "./brain-decision-trace";

export const BRAIN_EXTRACTED_CONTEXT_SCHEMA_VERSION = "1.0.0";

export type BrainAnalysisOrigin = "remote_ai" | "local_heuristic" | "fallback" | "mock" | "manual";

export type BrainEvidenceSourceType =
  | "document"
  | "image"
  | "url"
  | "manual"
  | "analysis"
  | "fallback"
  | "mock";

export type BrainEvidenceItem = {
  id: string;
  sourceType: BrainEvidenceSourceType;
  sourceId?: string;
  field?: string;
  reason: string;
  confidence?: number;
  createdAt?: string;
  brainVersion?: number;
};

export type BrainClaim = { text: string; strength?: "high" | "medium" | "low" };
export type BrainFact = { text: string; sourceDocId?: string };
export type BrainMetric = { name: string; value: string };
export type BrainProductSignal = { text: string };
export type BrainPeopleSignal = { text: string };
export type BrainVisualSignal = { axis?: string; text: string; confidence?: number };
export type BrainContentSignal = { text: string };
export type BrainSafetySignal = { text: string; severity?: "info" | "warn" | "block" };

export type BrainExtractedContextSourceType = "pdf" | "docx" | "image" | "url" | "txt" | "other";

/** Contexto estructurado extraído de un documento (paralelo al JSON legado en `extractedContext`). */
export type BrainExtractedContext = {
  schemaVersion: string;
  sourceType: BrainExtractedContextSourceType;
  summary?: string;
  claims?: BrainClaim[];
  facts?: BrainFact[];
  metrics?: BrainMetric[];
  products?: BrainProductSignal[];
  people?: BrainPeopleSignal[];
  toneSignals?: string[];
  visualSignals?: BrainVisualSignal[];
  contentSignals?: BrainContentSignal[];
  safetySignals?: BrainSafetySignal[];
  evidence?: BrainEvidenceItem[];
  confidence?: number;
  provider?: string;
  analysisOrigin?: BrainAnalysisOrigin;
  createdAt?: string;
};

export type BrainDocumentWorkflowStatus =
  | "uploaded"
  | "queued"
  | "analyzing"
  | "analyzed"
  | "failed_retryable"
  | "failed_final"
  | "stale";

export type BrainMetaAnalysisStatus = "idle" | "queued" | "analyzing" | "failed" | "stale";

export type BrainMeta = {
  brainVersion: number;
  lastSavedAt?: string;
  lastKnowledgeAnalysisAt?: string;
  lastVisualAnalysisAt?: string;
  lastContentDnaAnalysisAt?: string;
  lastBrandVisualDnaAnalysisAt?: string;
  lastRuntimeContextBuildAt?: string;
  lastResetAt?: string;
  analysisStatus: BrainMetaAnalysisStatus;
  staleReasons: string[];
};

export type ContentDna = {
  schemaVersion?: string;
  brandVoice?: unknown;
  editorialTone?: unknown;
  audienceProfiles: unknown[];
  contentPillars: string[];
  topics: string[];
  trendOpportunities: string[];
  preferredFormats: string[];
  articleStructures: string[];
  ctaStyle?: string;
  forbiddenClaims: string[];
  approvedClaims: string[];
  writingDo: string[];
  writingAvoid: string[];
  narrativeAngles: string[];
  readingLevel?: string;
  evidence: BrainEvidenceItem[];
  confidence: number;
  updatedAt?: string;
};

export type BrandVisualStyleCluster = {
  id: string;
  label: string;
  weightHint?: number;
  keywords: string[];
};

/** Síntesis oficial de ADN visual de marca (separada del bundle técnico en `visualReferenceAnalysis.brandVisualDnaBundle`). */
export type BrainBrandVisualDna = {
  schemaVersion: string;
  coreStyle?: string;
  secondaryStyles: string[];
  styleClusters: BrandVisualStyleCluster[];
  globalVisualRules: {
    dominantColors: string[];
    dominantMood: string[];
    dominantLighting: string[];
    dominantComposition: string[];
    dominantPeopleStrategy?: string;
    dominantProductStrategy?: string;
    brandFeeling: string[];
    safeGenerationRules: string[];
    avoid: string[];
  };
  peopleLanguage?: unknown;
  productLanguage?: unknown;
  evidence: BrainEvidenceItem[];
  confidence: number;
  updatedAt?: string;
  provider?: string;
  analysisOrigin?: BrainAnalysisOrigin;
};

export type SafeCreativeRules = {
  schemaVersion?: string;
  visualAbstractionRules: string[];
  imageGenerationAvoid: string[];
  protectedReferencePolicy?: string;
  writingClaimRules: string[];
  brandSafetyRules: string[];
  legalOrComplianceWarnings: string[];
  canUse: string[];
  shouldAvoid: string[];
  doNotGenerate: string[];
  evidence: BrainEvidenceItem[];
  updatedAt?: string;
};

/** Recorte editorial para runtime Guionista (sin `metadata.assets` completo). */
export type BrainGuionistaRuntimePack = {
  topics: string[];
  contentPillars: string[];
  trendOpportunities: string[];
  preferredFormats: string[];
  articleStructures: string[];
  approvedClaims: string[];
  forbiddenClaims: string[];
  narrativeAngles: string[];
  writingDo: string[];
  writingAvoid: string[];
  ctaStyle?: string;
  readingLevel?: string;
  corporateExcerpt?: string;
};

/** Resumen de slots ADN por imagen para runtime de nodos creativos (sin binarios pesados). */
export type BrainRuntimeVisualDnaSlotSummary = {
  id: string;
  label: string;
  status: string;
  sourceDocumentId?: string;
  hasMosaic: boolean;
  dominantColors: string[];
  confidence?: number;
  updatedAt?: string;
};

/** Capa dentro de un slot cuando se pasa `selectedVisualDnaLayer` al runtime. */
export type BrainRuntimeVisualDnaLayer =
  | "general"
  | "people"
  | "objects"
  | "environments"
  | "textures"
  | "palette";

export type BrainRuntimeContext = {
  targetNodeType: string;
  targetNodeId?: string;
  projectScopeId?: string;
  brainVersion?: number;
  contextSlices: string[];
  brand?: unknown;
  voice?: unknown;
  knowledge?: unknown;
  visualDna?: BrainBrandVisualDna;
  contentDna?: ContentDna;
  safeCreativeRules?: SafeCreativeRules;
  productContext?: unknown;
  audience?: unknown;
  recommendations?: unknown;
  /** Presente cuando `targetNodeType` es guionista / writer / script. */
  guionistaPack?: BrainGuionistaRuntimePack;
  /** Slots ADN por imagen (Brain Studio). */
  visualDnaSlotsSummary?: BrainRuntimeVisualDnaSlotSummary[];
  /** Vista filtrada por capa cuando se pasa `selectedVisualDnaLayer`. */
  selectedVisualDnaSlot?: Record<string, unknown>;
  selectedVisualDnaLayer?: BrainRuntimeVisualDnaLayer;
  avoid: string[];
  evidence: BrainEvidenceItem[];
  confidence: number;
  warnings: string[];
  /** ID de trace unificada (diagnóstico) para esta construcción de runtime context. */
  traceId?: string;
  /** Resumen corto de la decisión (útil para logs/UI sin payload extra). */
  traceSummary?: string;
  /** Trace estructurada opcional; la persistencia la decide el caller. */
  decisionTrace?: BrainDecisionTrace;
};

export const VISUAL_SIGNAL_SOURCE_PRIORITY = [
  "manual",
  "remote_vision_analysis",
  "visual_reference_analysis",
  "image_extracted_context",
  "text_inferred_visual_style",
  "local_heuristic",
  "fallback",
  "mock",
] as const;

export type VisualSignalSourceId = (typeof VISUAL_SIGNAL_SOURCE_PRIORITY)[number];
