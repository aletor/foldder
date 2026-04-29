import { randomUUID } from "node:crypto";
import type { BrandDNA, TelemetryFlushReason, TelemetryImageSource } from "./brain-models";
import { brainDevLog } from "./brain-dev-log";
import type { BrainNodeType, TelemetryBatch, TelemetryEvent, TelemetryEventKind } from "./brain-telemetry";
import { buildLearningExtractionSystemPrompt } from "./brain-learning-extraction-prompt";
import { annotateCandidateDnaConflict } from "./brain-learning-conflict";
import {
  summarizeLearningCandidateTrace,
  summarizeTelemetryTrace,
  type BrainDecisionTrace,
} from "./brain-decision-trace";
import {
  LEARNING_CANDIDATES_RESPONSE_JSON_SCHEMA,
  parseLearningCandidatesResponse,
  summarizeBrandDnaForPrompt,
  type LearningCandidate,
  type LearningCandidateStore,
  type StoredLearningCandidate,
} from "./learning-candidate-schema";
import {
  inferTelemetryNodeTypeFromEvidence,
  resolveStoredLearningCandidateNodeId,
} from "./brain-learning-node-anchor";
import { analyzeBrainImageBatch, buildVisualAssetRefsFromTelemetryBatches } from "./brain-visual-analysis";
import {
  collectVisualNodeEvidenceDigest,
  createVisualLearningCandidatesFromVisualSignals,
  extractVisualHintsFromBatches,
  mergeVisualNodeSignalsWithLlmCandidates,
  shouldEmitVisualNodeLearnings,
} from "./brain-visual-node-signals";

export type TelemetryStreamEvent = {
  projectId: string;
  workspaceId?: string;
  nodeId: string;
  receivedAt: string;
  batches: TelemetryBatch[];
};

export type AggregatedTelemetryCore = {
  version: 2;
  batchCount: number;
  sessionIds: string[];
  nodeTypes: BrainNodeType[];
  flushReasonCounts: Partial<Record<TelemetryFlushReason, number>>;
  eventKindCounts: Partial<Record<TelemetryEventKind, number>>;
  suggestions: {
    uniqueShown: number;
    uniqueAccepted: number;
    uniqueIgnored: number;
    acceptedTextSlots: number;
    acceptedImageSlots: number;
    ignoredTextByWave: Record<string, number>;
    ignoredImageByIdPrefix: Record<string, number>;
    textSlotsShownThenIgnored: number;
    textSlotsBothAcceptedAndIgnored: number;
  };
  manualOverrideCounts: Record<string, number>;
  imageUseCountsBySource: Partial<Record<TelemetryImageSource, number>>;
};

export type AggregatedTelemetryPayload = AggregatedTelemetryCore & {
  projectId: string;
  workspaceId?: string;
  nodeId: string;
  decisionTraceId?: string;
  decisionTrace?: BrainDecisionTrace;
};

const STRONG_TELEMETRY_KINDS: readonly TelemetryEventKind[] = [
  "CONTENT_EXPORTED",
  "MANUAL_OVERRIDE",
  "TEXT_FINALIZED",
  "LAYOUT_FINALIZED",
  "STYLE_APPLIED",
  "DRIFT_FROM_BRAND",
  "ASSET_USED",
  "IMAGE_EDITED",
  "IMAGE_EXPORTED",
  "IMAGE_GENERATED",
  "VISUAL_ASSET_USED",
  "BACKGROUND_REMOVED",
  "MASK_USED",
  "LAYER_USED",
  "LOGO_CREATED",
  "LOGO_EDITED",
  "VIDEO_FRAME_USED",
  "VIDEO_POSTER_USED",
  "COLOR_USED",
  "TYPOGRAPHY_USED",
  "IMAGE_USED",
  "IMAGE_IMPORTED",
  "PROMPT_ACCEPTED",
  "PROMPT_USED",
];

function collectStrongSignalKinds(eventKindCounts: Partial<Record<TelemetryEventKind, number>>): string[] {
  const out: string[] = [];
  for (const k of STRONG_TELEMETRY_KINDS) {
    if ((eventKindCounts[k] ?? 0) > 0) out.push(k);
  }
  return out;
}

function dominantFlushReason(
  flushReasonCounts: Partial<Record<TelemetryFlushReason, number>>,
): TelemetryFlushReason | undefined {
  const pairs = Object.entries(flushReasonCounts) as Array<[TelemetryFlushReason, number | undefined]>;
  let best: TelemetryFlushReason | undefined;
  let bestCount = -1;
  for (const [key, count] of pairs) {
    const n = typeof count === "number" ? count : 0;
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  return best;
}

/** Señales suficientes para invocar extracción (evita candidatos fuertes solo por ignores). */
export function hasStrongLearningSignals(aggregated: AggregatedTelemetryCore): boolean {
  if (aggregated.batchCount === 0) return false;
  /** Solo export como señal de cierre fuerte; manual/unmount puede ser solo “guardar” con sugerencias ignoradas. */
  if ((aggregated.flushReasonCounts.export ?? 0) > 0) return true;
  if ((aggregated.suggestions?.uniqueAccepted ?? 0) > 0) return true;
  if (Object.keys(aggregated.manualOverrideCounts).length > 0) return true;
  for (const k of STRONG_TELEMETRY_KINDS) {
    if ((aggregated.eventKindCounts[k] ?? 0) > 0) return true;
  }
  return false;
}

export type LlmExtractRequest = {
  system: string;
  user: string;
  responseJsonSchema: typeof LEARNING_CANDIDATES_RESPONSE_JSON_SCHEMA;
};

export interface BrainLearningExtractionLlm {
  extractCandidates(req: LlmExtractRequest): Promise<unknown>;
}

function parseSuggestionSlot(id: string): { kind: "text" | "image" | "unknown"; wave?: string } {
  const t = id.trim();
  if (t.startsWith("txt:")) {
    const parts = t.split(":");
    const wave = parts.length >= 2 ? parts[1] : undefined;
    return { kind: "text", wave };
  }
  if (t.startsWith("img:")) {
    const rest = t.slice(4);
    const prefix = rest.split(/[-_/]/)[0] ?? rest;
    return { kind: "image", wave: prefix.slice(0, 24) };
  }
  return { kind: "unknown" };
}

function countMapIncrement(m: Record<string, number>, key: string, delta = 1): void {
  if (!key) return;
  m[key] = (m[key] ?? 0) + delta;
}

function textSlotKey(id: string): string | null {
  const m = /^txt:([^:]+):(\d+)$/.exec(id.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

export class TelemetryProcessor {
  constructor(
    private readonly llm: BrainLearningExtractionLlm,
    private readonly store: LearningCandidateStore,
  ) {}

  aggregateBatch(telemetryEvents: TelemetryBatch[]): AggregatedTelemetryCore {
    const shown = new Set<string>();
    const accepted = new Set<string>();
    const ignored = new Set<string>();
    const flushReasonCounts: Partial<Record<TelemetryFlushReason, number>> = {};
    const eventKindCounts: Partial<Record<TelemetryEventKind, number>> = {};
    const manualOverrideCounts: Record<string, number> = {};
    const imageUseCounts: Partial<Record<TelemetryImageSource, number>> = {};
    const sessionIds: string[] = [];
    const nodeTypes = new Set<BrainNodeType>();
    const ignoredTextByWave: Record<string, number> = {};
    const ignoredImageByIdPrefix: Record<string, number> = {};

    let acceptedTextSlots = 0;
    let acceptedImageSlots = 0;

    for (const batch of telemetryEvents) {
      if (batch.version !== 2) continue;
      sessionIds.push(batch.sessionId);
      nodeTypes.add(batch.nodeType);
      flushReasonCounts[batch.flushReason] = (flushReasonCounts[batch.flushReason] ?? 0) + 1;
      for (const e of batch.events) {
        const ev = e as TelemetryEvent;
        eventKindCounts[ev.kind] = (eventKindCounts[ev.kind] ?? 0) + 1;
        if (ev.kind === "SUGGESTION_SHOWN" && ev.suggestionId) shown.add(ev.suggestionId);
        if (ev.kind === "SUGGESTION_ACCEPTED" && ev.suggestionId) accepted.add(ev.suggestionId);
        if (ev.kind === "SUGGESTION_IGNORED" && ev.suggestionId) ignored.add(ev.suggestionId);
        if (ev.kind === "MANUAL_OVERRIDE" && typeof ev.fieldRef === "string" && ev.fieldRef.trim()) {
          countMapIncrement(manualOverrideCounts, ev.fieldRef.trim(), 1);
        }
        if (
          (ev.kind === "IMAGE_USED" ||
            ev.kind === "ASSET_USED" ||
            ev.kind === "IMAGE_IMPORTED" ||
            ev.kind === "IMAGE_EDITED" ||
            ev.kind === "IMAGE_GENERATED" ||
            ev.kind === "IMAGE_EXPORTED" ||
            ev.kind === "VIDEO_FRAME_USED" ||
            ev.kind === "VIDEO_POSTER_USED" ||
            ev.kind === "VISUAL_ASSET_USED") &&
          ev.source
        ) {
          imageUseCounts[ev.source] = (imageUseCounts[ev.source] ?? 0) + 1;
        }
      }
    }

    for (const id of accepted) {
      const p = parseSuggestionSlot(id);
      if (p.kind === "text") acceptedTextSlots += 1;
      else if (p.kind === "image") acceptedImageSlots += 1;
    }

    for (const id of ignored) {
      const p = parseSuggestionSlot(id);
      if (p.kind === "text" && p.wave) countMapIncrement(ignoredTextByWave, p.wave, 1);
      if (p.kind === "image" && p.wave) countMapIncrement(ignoredImageByIdPrefix, p.wave, 1);
    }

    const shownTextSlots = new Set<string>();
    for (const id of shown) {
      const k = textSlotKey(id);
      if (k) shownTextSlots.add(k);
    }
    const ignoredTextSlots = new Set<string>();
    for (const id of ignored) {
      const k = textSlotKey(id);
      if (k) ignoredTextSlots.add(k);
    }
    const acceptedTextSlotKeys = new Set<string>();
    for (const id of accepted) {
      const k = textSlotKey(id);
      if (k) acceptedTextSlotKeys.add(k);
    }
    let textSlotsShownThenIgnored = 0;
    for (const k of ignoredTextSlots) {
      if (shownTextSlots.has(k)) textSlotsShownThenIgnored += 1;
    }
    let textSlotsBothAcceptedAndIgnored = 0;
    for (const k of ignoredTextSlots) {
      if (acceptedTextSlotKeys.has(k)) textSlotsBothAcceptedAndIgnored += 1;
    }

    return {
      version: 2,
      batchCount: telemetryEvents.length,
      sessionIds: [...new Set(sessionIds)],
      nodeTypes: [...nodeTypes],
      flushReasonCounts,
      eventKindCounts,
      suggestions: {
        uniqueShown: shown.size,
        uniqueAccepted: accepted.size,
        uniqueIgnored: ignored.size,
        acceptedTextSlots,
        acceptedImageSlots,
        ignoredTextByWave,
        ignoredImageByIdPrefix,
        textSlotsShownThenIgnored,
        textSlotsBothAcceptedAndIgnored,
      },
      manualOverrideCounts,
      imageUseCountsBySource: imageUseCounts,
    };
  }

  aggregateBatchForEvent(
    event: Pick<TelemetryStreamEvent, "projectId" | "workspaceId" | "nodeId" | "batches">,
  ): AggregatedTelemetryPayload {
    const core = this.aggregateBatch(event.batches);
    const strongKinds = collectStrongSignalKinds(core.eventKindCounts);
    const flush = dominantFlushReason(core.flushReasonCounts);
    const examples: string[] = [];
    for (const [key, val] of Object.entries(core.manualOverrideCounts)) {
      if (examples.length >= 4) break;
      examples.push(`manual:${key}=${val}`);
    }
    const telemetryTrace = summarizeTelemetryTrace({
      targetNodeId: event.nodeId,
      targetNodeType: core.nodeTypes[0],
      telemetryBatchId: core.sessionIds[0],
      flushReason: flush,
      acceptedCount: core.suggestions.uniqueAccepted,
      ignoredCount: core.suggestions.uniqueIgnored,
      exportedCount: core.eventKindCounts.CONTENT_EXPORTED ?? 0,
      styleAppliedCount: core.eventKindCounts.STYLE_APPLIED ?? 0,
      imageUsedCount:
        (core.eventKindCounts.IMAGE_USED ?? 0) +
        (core.eventKindCounts.ASSET_USED ?? 0) +
        (core.eventKindCounts.VISUAL_ASSET_USED ?? 0),
      batchCount: core.batchCount,
      strongKinds,
      examples,
      confidence: strongKinds.length > 0 ? 0.72 : core.suggestions.uniqueAccepted > 0 ? 0.62 : 0.4,
    });
    return {
      ...core,
      projectId: event.projectId,
      workspaceId: event.workspaceId,
      nodeId: event.nodeId,
      decisionTraceId: telemetryTrace.id,
      decisionTrace: telemetryTrace,
    };
  }

  enrichCandidateEvidence(
    candidate: LearningCandidate,
    event: TelemetryStreamEvent,
    aggregated: AggregatedTelemetryPayload,
  ): LearningCandidate {
    const base = candidate.evidence;
    const eventCounts: Record<string, number | string> = {
      ...(base.eventCounts ?? {}),
      batches: aggregated.batchCount,
      uniqueAccepted: aggregated.suggestions.uniqueAccepted,
      uniqueIgnored: aggregated.suggestions.uniqueIgnored,
      uniqueShown: aggregated.suggestions.uniqueShown,
      flush_export: aggregated.flushReasonCounts.export ?? 0,
      flush_unmount: aggregated.flushReasonCounts.unmount ?? 0,
      flush_manual: aggregated.flushReasonCounts.manual ?? 0,
      textSlots_accept_ignore: aggregated.suggestions.textSlotsBothAcceptedAndIgnored,
      telemetry_emitter_node_id: event.nodeId,
    };
    for (const [k, v] of Object.entries(aggregated.eventKindCounts)) {
      eventCounts[`evt:${k}`] = v ?? 0;
    }
    for (const [k, v] of Object.entries(aggregated.manualOverrideCounts)) {
      eventCounts[`manual:${k.slice(0, 48)}`] = v;
    }
    const nodeIds = [...new Set([...(base.sourceNodeIds ?? [])])].filter(Boolean).slice(0, 24);
    const types = [
      ...new Set([
        ...base.sourceNodeTypes,
        ...aggregated.nodeTypes.map((t) => t.toLowerCase()),
      ]),
    ];
    const artifacts = [
      ...new Set([...(base.sourceArtifactIds ?? []), ...aggregated.sessionIds]),
    ].slice(0, 24);
    return {
      ...candidate,
      evidence: {
        sourceNodeIds: nodeIds,
        sourceNodeTypes: types,
        evidenceSource: base.evidenceSource ?? "telemetry",
        ...(base.primarySourceNodeId ? { primarySourceNodeId: base.primarySourceNodeId } : {}),
        ...(artifacts.length ? { sourceArtifactIds: artifacts } : {}),
        ...(base.relatedArtifactKinds?.length ? { relatedArtifactKinds: [...base.relatedArtifactKinds] } : {}),
        ...(base.examples?.length ? { examples: base.examples } : {}),
        eventCounts,
      },
    };
  }

  async extractLearnings(
    aggregatedData: AggregatedTelemetryPayload,
    currentBrandDNA: BrandDNA,
  ): Promise<LearningCandidate[]> {
    const dnaSummary = summarizeBrandDnaForPrompt(currentBrandDNA);
    const user = JSON.stringify({
      aggregatedTelemetry: aggregatedData,
      brandDnaSummary: dnaSummary,
      constraints: {
        maxCandidates: 12,
        noDirectBrandDnaMutation: true,
        preferOmitOverWeakInference: true,
      },
    });
    const raw = await this.llm.extractCandidates({
      system: buildLearningExtractionSystemPrompt(),
      user,
      responseJsonSchema: LEARNING_CANDIDATES_RESPONSE_JSON_SCHEMA,
    });
    return parseLearningCandidatesResponse(raw);
  }

  toStoredPending(
    event: TelemetryStreamEvent,
    aggregated: AggregatedTelemetryPayload,
    candidates: LearningCandidate[],
  ): StoredLearningCandidate[] {
    const sessionKeys = [...new Set(event.batches.map((b) => b.sessionId))];
    const now = new Date().toISOString();
    const telemetryNodeType = event.batches[0]?.nodeType;
    const emitterNid = event.nodeId.trim();
    const strongKinds = collectStrongSignalKinds(aggregated.eventKindCounts);
    return candidates.map((c) => {
      const enriched = this.enrichCandidateEvidence(c, event, aggregated);
      const nid = resolveStoredLearningCandidateNodeId(enriched, event);
      const resolvedTelemetryType: BrainNodeType | undefined =
        nid && nid === emitterNid ? telemetryNodeType : inferTelemetryNodeTypeFromEvidence(enriched);
      const candidateTrace = summarizeLearningCandidateTrace({
        targetNodeType: resolvedTelemetryType,
        targetNodeId: nid,
        learningCandidateId: undefined,
        topic: enriched.topic,
        candidateType: enriched.type,
        value: enriched.value,
        reasoning: enriched.reasoning,
        confidence: enriched.confidence,
        eventCounts: enriched.evidence.eventCounts,
        examples: enriched.evidence.examples,
        strongKinds,
        evidenceSource: enriched.evidence.evidenceSource,
      });
      return {
        id: randomUUID(),
        projectId: event.projectId,
        workspaceId: event.workspaceId,
        nodeId: nid,
        ...(resolvedTelemetryType ? { telemetryNodeType: resolvedTelemetryType } : {}),
        status: "PENDING_REVIEW" as const,
        sourceSessionIds: sessionKeys,
        candidate: enriched,
        createdAt: now,
        decisionTraceId: candidateTrace.id,
        decisionTrace: {
          ...candidateTrace,
          ...(aggregated.decisionTraceId
            ? {
                sourceRefs: {
                  ...(candidateTrace.sourceRefs ?? {}),
                  telemetryBatchId:
                    aggregated.decisionTrace?.sourceRefs?.telemetryBatchId ?? aggregated.decisionTraceId,
                },
              }
            : {}),
        },
      };
    });
  }

  async processStreamEvent(event: TelemetryStreamEvent): Promise<{ stored: number; aggregated: AggregatedTelemetryPayload }> {
    if (!event.batches.length) {
      const aggregated = this.aggregateBatchForEvent(event);
      return { stored: 0, aggregated };
    }
    const aggregated = this.aggregateBatchForEvent(event);
    if (!hasStrongLearningSignals(aggregated)) {
      brainDevLog("telemetry-processor", "skip_llm_weak_signals", {
        projectId: event.projectId,
        nodeId: event.nodeId,
        batchCount: aggregated.batchCount,
      });
      return { stored: 0, aggregated };
    }
    brainDevLog("telemetry-processor", "extract_learnings", {
      projectId: event.projectId,
      nodeId: event.nodeId,
      batches: event.batches.length,
    });
    const dna =
      (await this.store.getBrandDna(event.projectId, event.workspaceId ?? "__root__")) ??
      ({
        sectors: [],
        claims: [],
        palettes: [],
        typography: [],
        prohibitions: [] as BrandDNA["prohibitions"],
      } satisfies BrandDNA);
    const digest = collectVisualNodeEvidenceDigest(event.batches);
    const hints = extractVisualHintsFromBatches(event.batches);
    const exportFlushN = aggregated.flushReasonCounts.export ?? 0;
    const visualRefs = buildVisualAssetRefsFromTelemetryBatches({
      projectId: event.projectId,
      workspaceId: event.workspaceId,
      nodeId: event.nodeId,
      batches: event.batches,
    });
    /**
     * Modo avanzado (coste API): por defecto **no** se llama a visión en la ruta de telemetría.
     * Con `BRAIN_TELEMETRY_VISION=1` se enriquecen candidatos con análisis remoto sobre refs de imagen.
     */
    let telemetryImageAnalyses =
      visualRefs.length > 0 ? analyzeBrainImageBatch(event.projectId, visualRefs, { maxImages: 12 }) : [];
    if (process.env.BRAIN_TELEMETRY_VISION === "1" && visualRefs.length > 0) {
      const { analyzeBrainImageBatchAsync } = await import("./brain-vision-analyze-async");
      telemetryImageAnalyses = await analyzeBrainImageBatchAsync(event.projectId, visualRefs, {
        maxImages: 12,
        route: "/api/telemetry/brain-visual-digest",
      });
    }
    const visualNodeLearnings =
      shouldEmitVisualNodeLearnings(
        digest,
        aggregated.nodeTypes,
        exportFlushN,
        aggregated.suggestions.acceptedImageSlots,
      )
        ? createVisualLearningCandidatesFromVisualSignals(
            event.nodeId,
            digest,
            hints,
            aggregated.nodeTypes,
            aggregated.suggestions.acceptedImageSlots,
            exportFlushN,
            telemetryImageAnalyses,
          )
        : [];
    const rawCandidates = await this.extractLearnings(aggregated, dna);
    const merged = mergeVisualNodeSignalsWithLlmCandidates(visualNodeLearnings, rawCandidates);
    const candidates = merged.map((c) => annotateCandidateDnaConflict(c, dna));
    const rows = this.toStoredPending(event, aggregated, candidates);
    if (rows.length) await this.store.savePendingReview(rows);
    return { stored: rows.length, aggregated };
  }
}

export class MockBrainLearningExtractionLlm implements BrainLearningExtractionLlm {
  async extractCandidates(req: LlmExtractRequest): Promise<unknown> {
    let emitterNodeId = "";
    let nodeTypes: string[] = ["DESIGNER"];
    try {
      const u = JSON.parse(req.user) as {
        aggregatedTelemetry?: { nodeId?: string; nodeTypes?: string[] };
      };
      emitterNodeId = typeof u.aggregatedTelemetry?.nodeId === "string" ? u.aggregatedTelemetry.nodeId.trim() : "";
      if (Array.isArray(u.aggregatedTelemetry?.nodeTypes) && u.aggregatedTelemetry.nodeTypes.length > 0) {
        nodeTypes = u.aggregatedTelemetry.nodeTypes.map((x) => String(x));
      }
    } catch {
      emitterNodeId = "";
    }
    const srcIds = emitterNodeId ? [emitterNodeId] : ["designer-node"];
    const srcTypes = nodeTypes.length ? nodeTypes : ["DESIGNER"];
    return {
      candidates: [
        {
          type: "CREATIVE_PREFERENCE",
          scope: "USER",
          topic: "creative_preference",
          value: "Repeated manual changes to Brain length and tone presets in Designer.",
          confidence: 0.44,
          reasoning: "Stronger signal from manualOverrideCounts than from ignored suggestions alone.",
          evidence: {
            sourceNodeIds: srcIds,
            sourceNodeTypes: srcTypes,
            examples: ["manual:brain:lengthPreset", "manual:brain:tonePreset"],
          },
        },
        {
          type: "PROJECT_MEMORY",
          scope: "PROJECT",
          topic: "project_memory",
          value: "Telemetry tied to this node/session suggests project-scoped copy tuning, not global brand.",
          confidence: 0.33,
          reasoning: "Export/manual signals present; keep scoped until user confirms.",
          evidence: {
            sourceNodeIds: srcIds,
            sourceNodeTypes: srcTypes,
          },
        },
        {
          type: "OUTLIER",
          scope: "WORKSPACE",
          topic: "contextual_memory",
          value: "Mixed accept/ignore on same text slots—contextual only, not a preference.",
          confidence: 0.22,
          reasoning: "Weak pattern from ignores; down-ranked per policy.",
          evidence: {
            sourceNodeIds: srcIds,
            sourceNodeTypes: srcTypes,
          },
        },
      ],
    };
  }
}

export class InMemoryLearningCandidateStore implements LearningCandidateStore {
  private readonly dnaByKey = new Map<string, BrandDNA>();
  readonly pending: StoredLearningCandidate[] = [];

  seedBrandDna(projectId: string, workspaceId: string, dna: BrandDNA): void {
    this.dnaByKey.set(`${projectId.trim()}#${workspaceId.trim()}`, dna);
  }

  async getBrandDna(projectId: string, workspaceId: string): Promise<BrandDNA | null> {
    return this.dnaByKey.get(`${projectId.trim()}#${workspaceId.trim()}`) ?? null;
  }

  async savePendingReview(rows: StoredLearningCandidate[]): Promise<void> {
    this.pending.push(...rows);
  }
}
