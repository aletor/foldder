import type { BrandDNA } from "./brain-models";
import { prohibitionText } from "./brain-models";
import type { BrainNodeType } from "./brain-telemetry";
import type { BrainDecisionTrace } from "./brain-decision-trace";

export const LEARNING_CANDIDATE_TYPES = [
  "BRAND_DNA",
  "CREATIVE_PREFERENCE",
  "PROJECT_MEMORY",
  "VISUAL_MEMORY",
  "OUTLIER",
  "CONTRADICTION",
] as const;

export type LearningCandidateType = (typeof LEARNING_CANDIDATE_TYPES)[number];

/** Topics canónicos para `candidate.topic` (aprendizajes y resolución a ADN). */
export const LEARNING_CANDIDATE_TOPICS = [
  "tone",
  "visual_direction",
  "visual_pattern",
  "message",
  "claim",
  "persona",
  "fact",
  "taboo_phrase",
  "approved_phrase",
  "preferred_term",
  "forbidden_term",
  "project_memory",
  "contextual_memory",
  "creative_preference",
  "layout_preference",
  "image_preference",
] as const;

export type LearningCandidateTopic = (typeof LEARNING_CANDIDATE_TOPICS)[number];

/** Alias legacy / históricos → topic canónico (migración suave sin heurística de substring). */
export const LEARNING_CANDIDATE_TOPIC_LEGACY_ALIASES: Readonly<Record<string, LearningCandidateTopic>> = {
  tone_notes: "tone",
  funnel_awareness: "message",
  exported_visual_images: "project_memory",
  visual_outliers: "contextual_memory",
  visual_node_export_signals: "visual_pattern",
  project_visual_node_signals: "visual_pattern",
  visual_multi_node_common_direction: "visual_direction",
  manual_images_vs_brain_suggestions: "image_preference",
  claim_topic: "claim",
  mem: "project_memory",
  ctx: "contextual_memory",
  d: "creative_preference",
  t: "tone",
  t2: "message",
  ui_presets: "creative_preference",
  session_focus: "project_memory",
  suggestion_noise: "contextual_memory",
  tono: "tone",
  estilo_visual: "visual_direction",
};

export function isLearningCandidateTopic(s: string): s is LearningCandidateTopic {
  return (LEARNING_CANDIDATE_TOPICS as readonly string[]).includes(s.trim());
}

/** Resuelve `topic` guardado o emitido por modelos antiguos a un topic canónico, o `null` si no aplica. */
export function resolveLearningCandidateTopic(raw: string): LearningCandidateTopic | null {
  const t = raw.trim();
  if (!t) return null;
  if (isLearningCandidateTopic(t)) return t;
  const alias = LEARNING_CANDIDATE_TOPIC_LEGACY_ALIASES[t] ?? LEARNING_CANDIDATE_TOPIC_LEGACY_ALIASES[t.toLowerCase()];
  if (alias) return alias;
  const underscored = t.toLowerCase().replace(/\s+/g, "_");
  if (isLearningCandidateTopic(underscored)) return underscored;
  if (/^export_[a-z0-9_]+$/i.test(t)) return "project_memory";
  return null;
}

export const LEARNING_CANDIDATE_SCOPES = ["WORKSPACE", "BRAND", "PROJECT", "USER"] as const;

export type LearningCandidateScope = (typeof LEARNING_CANDIDATE_SCOPES)[number];

export const LEARNING_CANDIDATE_STATUSES = ["PENDING_REVIEW", "APPROVED", "DISMISSED", "ARCHIVED"] as const;

export type LearningCandidateStatus = (typeof LEARNING_CANDIDATE_STATUSES)[number];

export const LEARNING_RESOLUTION_ACTIONS = [
  "PROMOTE_TO_DNA",
  "KEEP_IN_PROJECT",
  "SAVE_AS_CONTEXT",
  "MARK_OUTLIER",
  "DISMISS",
] as const;

export type LearningResolutionAction = (typeof LEARNING_RESOLUTION_ACTIONS)[number];

export const LEARNING_EVIDENCE_SOURCES = [
  "telemetry",
  "export",
  "artifact_analysis",
  "manual",
  "visual_reference",
] as const;

export type LearningEvidenceSource = (typeof LEARNING_EVIDENCE_SOURCES)[number];

export type LearningEvidence = {
  sourceNodeIds: string[];
  sourceNodeTypes: string[];
  /** Nodo principal para trazabilidad en UI (“Ver por qué”). */
  primarySourceNodeId?: string;
  /** Origen del razonamiento estructurado (no mostrar literal al usuario). */
  evidenceSource?: LearningEvidenceSource;
  sourceArtifactIds?: string[];
  relatedArtifactKinds?: string[];
  examples?: string[];
  /** Contadores numéricos y, en casos puntuales, strings de trazabilidad (p. ej. nodo emisor). */
  eventCounts?: Record<string, number | string>;
};

export type LearningCandidate = {
  type: LearningCandidateType;
  scope: LearningCandidateScope;
  topic: string;
  value: string;
  confidence: number;
  reasoning: string;
  evidence: LearningEvidence;
  /** Si true, el aprendizaje choca con el ADN actual; no promover sin decisión explícita del usuario. */
  conflictWithDNA?: boolean;
};

export type StoredLearningCandidate = {
  id: string;
  projectId: string;
  workspaceId?: string;
  nodeId?: string;
  /** Origen del canvas (agnóstico al product UI). */
  telemetryNodeType?: BrainNodeType;
  status: LearningCandidateStatus;
  candidate: LearningCandidate;
  sourceSessionIds: string[];
  createdAt: string;
  updatedAt?: string;
  resolutionAction?: LearningResolutionAction;
  /** Versión de Brain del proyecto al generar el candidato (revalidación si cambia). */
  brainVersion?: number;
  sourceImageId?: string;
  sourceAnalysisId?: string;
  createdFromAnalysisVersion?: string;
  /** Enlace a traza unificada de por qué se propuso este aprendizaje. */
  decisionTraceId?: string;
  /** Snapshot ligero de la traza (complementa `candidate.evidence`; no la sustituye). */
  decisionTrace?: BrainDecisionTrace;
};

export interface LearningCandidateStore {
  savePendingReview(rows: StoredLearningCandidate[]): Promise<void>;
  getBrandDna(projectId: string, workspaceId: string): Promise<BrandDNA | null>;
}

const MAX_TOPIC_LEN = 64;
const MAX_VALUE_LEN = 500;
const MAX_REASONING_LEN = 150;
const MAX_CANDIDATES = 12;
const MAX_EVIDENCE_IDS = 24;
const MAX_EXAMPLES = 8;

const EVIDENCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceNodeIds: {
      type: "array",
      maxItems: MAX_EVIDENCE_IDS,
      items: { type: "string", maxLength: 128 },
    },
    sourceNodeTypes: {
      type: "array",
      maxItems: 16,
      items: { type: "string", maxLength: 64 },
    },
    primarySourceNodeId: { type: "string", maxLength: 128 },
    evidenceSource: { type: "string", enum: [...LEARNING_EVIDENCE_SOURCES] },
    sourceArtifactIds: {
      type: "array",
      maxItems: MAX_EVIDENCE_IDS,
      items: { type: "string", maxLength: 256 },
    },
    relatedArtifactKinds: {
      type: "array",
      maxItems: 12,
      items: { type: "string", maxLength: 32 },
    },
    examples: {
      type: "array",
      maxItems: MAX_EXAMPLES,
      items: { type: "string", maxLength: 200 },
    },
  },
  required: ["sourceNodeIds", "sourceNodeTypes"],
} as const;

export const LEARNING_CANDIDATES_RESPONSE_JSON_SCHEMA = {
  name: "learning_candidates",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        maxItems: MAX_CANDIDATES,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: [...LEARNING_CANDIDATE_TYPES] },
            scope: { type: "string", enum: [...LEARNING_CANDIDATE_SCOPES] },
            topic: { type: "string", enum: [...LEARNING_CANDIDATE_TOPICS] },
            value: { type: "string", maxLength: MAX_VALUE_LEN },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reasoning: { type: "string", maxLength: MAX_REASONING_LEN },
            conflictWithDNA: { type: "boolean" },
            evidence: EVIDENCE_JSON_SCHEMA,
          },
          required: ["type", "scope", "topic", "value", "confidence", "reasoning", "evidence"],
        },
      },
    },
    required: ["candidates"],
  },
} as const;

function isLearningCandidateType(v: unknown): v is LearningCandidateType {
  return typeof v === "string" && (LEARNING_CANDIDATE_TYPES as readonly string[]).includes(v);
}

function isLearningCandidateScope(v: unknown): v is LearningCandidateScope {
  return typeof v === "string" && (LEARNING_CANDIDATE_SCOPES as readonly string[]).includes(v);
}

function isLearningEvidenceSource(v: unknown): v is LearningEvidenceSource {
  return typeof v === "string" && (LEARNING_EVIDENCE_SOURCES as readonly string[]).includes(v);
}

function parseEvidence(raw: unknown): LearningEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.sourceNodeIds) || !Array.isArray(o.sourceNodeTypes)) return null;
  const sourceNodeIds = o.sourceNodeIds
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_EVIDENCE_IDS);
  const sourceNodeTypes = o.sourceNodeTypes
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 16);
  if (!sourceNodeIds.length || !sourceNodeTypes.length) return null;
  const primarySourceNodeId =
    typeof o.primarySourceNodeId === "string" ? o.primarySourceNodeId.trim().slice(0, 128) : undefined;
  const evidenceSource = isLearningEvidenceSource(o.evidenceSource) ? o.evidenceSource : undefined;
  const sourceArtifactIds = Array.isArray(o.sourceArtifactIds)
    ? o.sourceArtifactIds
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_EVIDENCE_IDS)
    : undefined;
  const relatedArtifactKinds = Array.isArray(o.relatedArtifactKinds)
    ? o.relatedArtifactKinds
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().slice(0, 32))
        .filter(Boolean)
        .slice(0, 12)
    : undefined;
  const examples = Array.isArray(o.examples)
    ? o.examples
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, MAX_EXAMPLES)
    : undefined;
  let eventCounts: Record<string, number | string> | undefined;
  if (o.eventCounts && typeof o.eventCounts === "object" && !Array.isArray(o.eventCounts)) {
    const ec: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(o.eventCounts as Record<string, unknown>)) {
      const key = k.slice(0, 64);
      if (typeof v === "number" && Number.isFinite(v)) ec[key] = v;
      else if (typeof v === "string") {
        const s = v.trim().slice(0, 128);
        if (s) ec[key] = s;
      }
    }
    if (Object.keys(ec).length) eventCounts = ec;
  }
  return {
    sourceNodeIds,
    sourceNodeTypes,
    ...(primarySourceNodeId ? { primarySourceNodeId } : {}),
    ...(evidenceSource ? { evidenceSource } : {}),
    ...(sourceArtifactIds?.length ? { sourceArtifactIds } : {}),
    ...(relatedArtifactKinds?.length ? { relatedArtifactKinds } : {}),
    ...(examples?.length ? { examples } : {}),
    ...(eventCounts ? { eventCounts } : {}),
  };
}

export function clampReasoning(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_REASONING_LEN) return t;
  return t.slice(0, MAX_REASONING_LEN - 1).trimEnd() + "…";
}

export function parseLearningCandidatesResponse(raw: unknown): LearningCandidate[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as { candidates?: unknown };
  if (!Array.isArray(root.candidates)) return [];
  const out: LearningCandidate[] = [];
  for (const row of root.candidates) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (!isLearningCandidateType(o.type)) continue;
    if (!isLearningCandidateScope(o.scope)) continue;
    const topicRaw = typeof o.topic === "string" ? o.topic.trim().slice(0, MAX_TOPIC_LEN) : "";
    const topicResolved = resolveLearningCandidateTopic(topicRaw);
    const topic = topicResolved ?? topicRaw;
    const value = typeof o.value === "string" ? o.value.trim().slice(0, MAX_VALUE_LEN) : "";
    if (!topic || !value) continue;
    let confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : 0;
    confidence = Math.min(1, Math.max(0, confidence));
    const reasoning =
      typeof o.reasoning === "string" ? clampReasoning(o.reasoning) : "";
    if (!reasoning) continue;
    const evidence = parseEvidence(o.evidence);
    if (!evidence) continue;
    let conflictWithDNA = o.conflictWithDNA === true ? true : undefined;
    if (o.type === "CONTRADICTION") conflictWithDNA = true;
    out.push({
      type: o.type,
      scope: o.scope,
      topic,
      value,
      confidence,
      reasoning,
      evidence,
      ...(conflictWithDNA ? { conflictWithDNA: true } : {}),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

export type BrandDnaPromptSummary = {
  sectorLabels: string[];
  claimSnippets: string[];
  paletteNames: string[];
  typographyFamilies: string[];
  prohibitionCount: number;
  prohibitionSample: string[];
};

export function summarizeBrandDnaForPrompt(dna: BrandDNA, opts?: { maxClaims?: number; maxPerList?: number }): BrandDnaPromptSummary {
  const maxClaims = opts?.maxClaims ?? 4;
  const maxPer = opts?.maxPerList ?? 6;
  return {
    sectorLabels: dna.sectors.map((s) => s.label).filter(Boolean).slice(0, maxPer),
    claimSnippets: dna.claims
      .map((c) => c.text.trim())
      .filter(Boolean)
      .map((t) => (t.length > 80 ? `${t.slice(0, 77)}…` : t))
      .slice(0, maxClaims),
    paletteNames: dna.palettes.map((p) => p.name || p.id).filter(Boolean).slice(0, maxPer),
    typographyFamilies: dna.typography.map((t) => t.family).filter(Boolean).slice(0, maxPer),
    prohibitionCount: dna.prohibitions.length,
    prohibitionSample: dna.prohibitions.map((p) => prohibitionText(p)).filter(Boolean).slice(0, 3),
  };
}
