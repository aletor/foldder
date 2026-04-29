export type BrainDecisionTraceKind =
  | "runtime_context"
  | "learning_candidate"
  | "visual_prompt"
  | "merge_resolution"
  | "telemetry_aggregation";

export type BrainDecisionTracePersistenceIntent =
  | "ephemeral"
  | "pending_review"
  | "persist_on_accept"
  | "persist_on_export"
  | "persist_immediately";

export type BrainDecisionTraceInput = {
  id: string;
  kind: string;
  label: string;
  summary?: string;
  source?: string;
  confidence?: number;
};

export type BrainDecisionTraceWeight = {
  inputId?: string;
  label: string;
  weight: number;
  reason?: string;
};

export type BrainDecisionTraceConflict = {
  id: string;
  left: string;
  right: string;
  resolution: string;
  severity?: "low" | "medium" | "high";
};

export type BrainDecisionTraceDiscardedSignal = {
  id: string;
  kind: string;
  summary: string;
  reason: string;
};

export type BrainDecisionTrace = {
  id: string;
  kind: BrainDecisionTraceKind;
  createdAt: string;
  persistenceIntent?: BrainDecisionTracePersistenceIntent;
  projectScopeId?: string;
  targetNodeType?: string;
  targetNodeId?: string;
  useCase?: string;
  inputs: BrainDecisionTraceInput[];
  weights?: BrainDecisionTraceWeight[];
  conflicts?: BrainDecisionTraceConflict[];
  discardedSignals?: BrainDecisionTraceDiscardedSignal[];
  outputSummary: {
    title?: string;
    summary: string;
    confidence?: number;
    warnings?: string[];
    contextSliceIds?: string[];
  };
  sourceRefs?: {
    learningCandidateId?: string;
    visualDiagnosticsId?: string;
    telemetryBatchId?: string;
    runtimeContextId?: string;
  };
  freshness?: {
    hasStaleData: boolean;
    staleReasons?: string[];
  };
  confidence: number;
};

export type RuntimeContextTraceSummaryInput = {
  projectScopeId?: string;
  targetNodeType: string;
  targetNodeId?: string;
  useCase?: string;
  contextSlices: string[];
  warnings?: string[];
  confidence: number;
  evidence?: Array<{ id?: string; sourceType?: string; sourceId?: string; reason?: string; confidence?: number }>;
  staleReasons?: string[];
  flowNodesProvided?: boolean;
  flowEdgesProvided?: boolean;
  includedSlices?: string[];
  ignoredSlices?: string[];
};

export type TelemetryTraceSummaryInput = {
  projectScopeId?: string;
  targetNodeType?: string;
  targetNodeId?: string;
  telemetryBatchId?: string;
  flushReason?: string;
  acceptedCount: number;
  ignoredCount: number;
  exportedCount: number;
  styleAppliedCount: number;
  imageUsedCount: number;
  batchCount: number;
  strongKinds: string[];
  examples?: string[];
  confidence?: number;
};

export type LearningCandidateTraceSummaryInput = {
  projectScopeId?: string;
  targetNodeType?: string;
  targetNodeId?: string;
  learningCandidateId?: string;
  topic: string;
  candidateType: string;
  value: string;
  reasoning: string;
  confidence: number;
  eventCounts?: Record<string, number | string>;
  examples?: string[];
  strongKinds?: string[];
  warnings?: string[];
  evidenceSource?: string;
};

export type VisualPromptTraceSummaryInput = {
  projectScopeId?: string;
  targetNodeType?: string;
  targetNodeId?: string;
  visualDiagnosticsId?: string;
  selectedVisualDnaSlotId?: string;
  selectedVisualDnaLayer?: string;
  visualSourcesUsed?: Record<string, boolean>;
  chosenAxes?: Record<string, string | number | boolean | undefined>;
  finalPrompt?: string;
  warnings?: string[];
  confidence?: number;
};

const MAX_TRACE_INPUTS = 20;
const MAX_TRACE_CONFLICTS = 10;
const MAX_TRACE_DISCARDED = 10;
const MAX_TRACE_WARNINGS = 10;
const MAX_TRACE_CONTEXT_SLICE_IDS = 20;
const MAX_TRACE_TEXT = 220;
const MAX_TRACE_SUMMARY = 700;
const MAX_TRACE_REASONS = 10;
const DEFAULT_TRACE_COUNT = 50;
const PAYLOAD_RISK_TRACE_COUNT = 25;
const MAX_APPROX_TOTAL_CHARS = 90_000;

function truncateText(raw: unknown, max = MAX_TRACE_TEXT): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}

function clamp01(n: unknown, fallback = 0.5): number {
  const value = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeIso(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const seed = Math.random().toString(36).slice(2, 10);
  return `trace-${Date.now().toString(36)}-${seed}`;
}

function traceId(kind: BrainDecisionTraceKind): string {
  const suffix = randomId().replace(/^trace-/, "").slice(0, 18);
  return `bdt_${kind}_${suffix}`;
}

function normalizeInput(raw: unknown, idx: number): BrainDecisionTraceInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = truncateText(o.label);
  if (!label) return null;
  const id = truncateText(o.id, 80) || `input_${idx + 1}`;
  const kind = truncateText(o.kind, 50) || "signal";
  const source = truncateText(o.source, 80);
  const summary = truncateText(o.summary, 260);
  const confidence =
    typeof o.confidence === "number" && Number.isFinite(o.confidence) ? clamp01(o.confidence, 0.5) : undefined;
  return {
    id,
    kind,
    label,
    ...(summary ? { summary } : {}),
    ...(source ? { source } : {}),
    ...(typeof confidence === "number" ? { confidence } : {}),
  };
}

function normalizeWeight(raw: unknown): BrainDecisionTraceWeight | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = truncateText(o.label, 120);
  if (!label) return null;
  const weight = clamp01(o.weight, 0.5);
  const inputId = truncateText(o.inputId, 80);
  const reason = truncateText(o.reason, 180);
  return {
    ...(inputId ? { inputId } : {}),
    label,
    weight,
    ...(reason ? { reason } : {}),
  };
}

function normalizeConflict(raw: unknown, idx: number): BrainDecisionTraceConflict | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const left = truncateText(o.left, 180);
  const right = truncateText(o.right, 180);
  const resolution = truncateText(o.resolution, 220);
  if (!left || !right || !resolution) return null;
  const severityRaw = typeof o.severity === "string" ? o.severity : "";
  const severity =
    severityRaw === "low" || severityRaw === "medium" || severityRaw === "high"
      ? severityRaw
      : undefined;
  return {
    id: truncateText(o.id, 80) || `conflict_${idx + 1}`,
    left,
    right,
    resolution,
    ...(severity ? { severity } : {}),
  };
}

function normalizeDiscarded(raw: unknown, idx: number): BrainDecisionTraceDiscardedSignal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reason = truncateText(o.reason, 220);
  const summary = truncateText(o.summary, 220);
  if (!reason || !summary) return null;
  const kind = truncateText(o.kind, 60) || "unknown";
  return {
    id: truncateText(o.id, 80) || `discarded_${idx + 1}`,
    kind,
    summary,
    reason,
  };
}

function normalizeStringList(raw: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => truncateText(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
  return out.length ? out : undefined;
}

function parseKind(raw: unknown): BrainDecisionTraceKind | null {
  return raw === "runtime_context" ||
    raw === "learning_candidate" ||
    raw === "visual_prompt" ||
    raw === "merge_resolution" ||
    raw === "telemetry_aggregation"
    ? raw
    : null;
}

function parsePersistenceIntent(raw: unknown): BrainDecisionTracePersistenceIntent | undefined {
  return raw === "ephemeral" ||
    raw === "pending_review" ||
    raw === "persist_on_accept" ||
    raw === "persist_on_export" ||
    raw === "persist_immediately"
    ? raw
    : undefined;
}

function defaultPersistenceIntentForKind(kind: BrainDecisionTraceKind): BrainDecisionTracePersistenceIntent {
  switch (kind) {
    case "runtime_context":
      return "ephemeral";
    case "visual_prompt":
      return "ephemeral";
    case "telemetry_aggregation":
      return "ephemeral";
    case "learning_candidate":
      return "pending_review";
    case "merge_resolution":
      return "persist_immediately";
    default:
      return "ephemeral";
  }
}

function approxChars(trace: BrainDecisionTrace): number {
  try {
    return JSON.stringify(trace).length;
  } catch {
    return 0;
  }
}

function sortedByDateDesc(items: BrainDecisionTrace[]): BrainDecisionTrace[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    if (Number.isFinite(tb)) return 1;
    if (Number.isFinite(ta)) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function normalizeBrainDecisionTrace(raw: unknown): BrainDecisionTrace | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = parseKind(o.kind);
  if (!kind) return null;
  const summaryRaw = o.outputSummary;
  if (!summaryRaw || typeof summaryRaw !== "object") return null;
  const summaryObj = summaryRaw as Record<string, unknown>;
  const summary = truncateText(summaryObj.summary, MAX_TRACE_SUMMARY);
  if (!summary) return null;

  const warnings = normalizeStringList(summaryObj.warnings, MAX_TRACE_WARNINGS, 180);
  const contextSliceIds = normalizeStringList(summaryObj.contextSliceIds, MAX_TRACE_CONTEXT_SLICE_IDS, 120);

  const inputs = Array.isArray(o.inputs)
    ? o.inputs.map((x, idx) => normalizeInput(x, idx)).filter((x): x is BrainDecisionTraceInput => Boolean(x))
    : [];

  const weights = Array.isArray(o.weights)
    ? o.weights.map((x) => normalizeWeight(x)).filter((x): x is BrainDecisionTraceWeight => Boolean(x))
    : [];

  const conflicts = Array.isArray(o.conflicts)
    ? o.conflicts
        .map((x, idx) => normalizeConflict(x, idx))
        .filter((x): x is BrainDecisionTraceConflict => Boolean(x))
    : [];

  const discardedSignals = Array.isArray(o.discardedSignals)
    ? o.discardedSignals
        .map((x, idx) => normalizeDiscarded(x, idx))
        .filter((x): x is BrainDecisionTraceDiscardedSignal => Boolean(x))
    : [];

  const sourceRefsRaw = o.sourceRefs;
  const sourceRefs =
    sourceRefsRaw && typeof sourceRefsRaw === "object"
      ? {
          ...(truncateText((sourceRefsRaw as Record<string, unknown>).learningCandidateId, 80)
            ? { learningCandidateId: truncateText((sourceRefsRaw as Record<string, unknown>).learningCandidateId, 80) }
            : {}),
          ...(truncateText((sourceRefsRaw as Record<string, unknown>).visualDiagnosticsId, 80)
            ? { visualDiagnosticsId: truncateText((sourceRefsRaw as Record<string, unknown>).visualDiagnosticsId, 80) }
            : {}),
          ...(truncateText((sourceRefsRaw as Record<string, unknown>).telemetryBatchId, 120)
            ? { telemetryBatchId: truncateText((sourceRefsRaw as Record<string, unknown>).telemetryBatchId, 120) }
            : {}),
          ...(truncateText((sourceRefsRaw as Record<string, unknown>).runtimeContextId, 80)
            ? { runtimeContextId: truncateText((sourceRefsRaw as Record<string, unknown>).runtimeContextId, 80) }
            : {}),
        }
      : undefined;

  const freshnessRaw = o.freshness;
  const freshness =
    freshnessRaw && typeof freshnessRaw === "object"
      ? {
          hasStaleData: Boolean((freshnessRaw as Record<string, unknown>).hasStaleData),
          ...(normalizeStringList((freshnessRaw as Record<string, unknown>).staleReasons, MAX_TRACE_REASONS, 180)
            ? { staleReasons: normalizeStringList((freshnessRaw as Record<string, unknown>).staleReasons, MAX_TRACE_REASONS, 180) }
            : {}),
        }
      : undefined;

  return {
    id: truncateText(o.id, 120) || traceId(kind),
    kind,
    createdAt: normalizeIso(o.createdAt),
    persistenceIntent: parsePersistenceIntent(o.persistenceIntent) ?? defaultPersistenceIntentForKind(kind),
    ...(truncateText(o.projectScopeId, 120) ? { projectScopeId: truncateText(o.projectScopeId, 120) } : {}),
    ...(truncateText(o.targetNodeType, 80) ? { targetNodeType: truncateText(o.targetNodeType, 80) } : {}),
    ...(truncateText(o.targetNodeId, 120) ? { targetNodeId: truncateText(o.targetNodeId, 120) } : {}),
    ...(truncateText(o.useCase, 120) ? { useCase: truncateText(o.useCase, 120) } : {}),
    inputs: inputs.slice(0, MAX_TRACE_INPUTS),
    ...(weights.length ? { weights: weights.slice(0, MAX_TRACE_INPUTS) } : {}),
    ...(conflicts.length ? { conflicts: conflicts.slice(0, MAX_TRACE_CONFLICTS) } : {}),
    ...(discardedSignals.length ? { discardedSignals: discardedSignals.slice(0, MAX_TRACE_DISCARDED) } : {}),
    outputSummary: {
      ...(truncateText(summaryObj.title, 120) ? { title: truncateText(summaryObj.title, 120) } : {}),
      summary,
      ...(typeof summaryObj.confidence === "number" ? { confidence: clamp01(summaryObj.confidence, 0.5) } : {}),
      ...(warnings?.length ? { warnings } : {}),
      ...(contextSliceIds?.length ? { contextSliceIds } : {}),
    },
    ...(sourceRefs && Object.keys(sourceRefs).length ? { sourceRefs } : {}),
    ...(freshness ? { freshness } : {}),
    confidence: clamp01(o.confidence, typeof summaryObj.confidence === "number" ? summaryObj.confidence : 0.5),
  };
}

export function capDecisionTraces(
  raw: unknown,
  opts?: { max?: number; order?: "desc" | "asc"; payloadRiskMax?: number },
): BrainDecisionTrace[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((item) => normalizeBrainDecisionTrace(item))
    .filter((item): item is BrainDecisionTrace => Boolean(item));
  if (!normalized.length) return [];
  const max = Math.max(1, Math.floor(opts?.max ?? DEFAULT_TRACE_COUNT));
  const payloadRiskMax = Math.max(1, Math.floor(opts?.payloadRiskMax ?? PAYLOAD_RISK_TRACE_COUNT));
  const sorted = sortedByDateDesc(normalized);
  const totalChars = sorted.reduce((acc, item) => acc + approxChars(item), 0);
  const cappedMax = totalChars > MAX_APPROX_TOTAL_CHARS ? Math.min(max, payloadRiskMax) : max;
  const sliced = sorted.slice(0, cappedMax);
  if (opts?.order === "asc") return [...sliced].reverse();
  return sliced;
}

export function createBrainDecisionTrace(
  input: Partial<BrainDecisionTrace> & {
    kind: BrainDecisionTraceKind;
    outputSummary: { summary: string; title?: string; confidence?: number; warnings?: string[]; contextSliceIds?: string[] };
    confidence?: number;
  },
): BrainDecisionTrace {
  const normalized = normalizeBrainDecisionTrace({
    ...input,
    id: input.id ?? traceId(input.kind),
    createdAt: input.createdAt ?? new Date().toISOString(),
    confidence: input.confidence ?? input.outputSummary.confidence ?? 0.5,
    inputs: input.inputs ?? [],
  });
  if (!normalized) {
    return {
      id: traceId(input.kind),
      kind: input.kind,
      createdAt: new Date().toISOString(),
      persistenceIntent: defaultPersistenceIntentForKind(input.kind),
      inputs: [],
      outputSummary: { summary: "trace_summary_unavailable" },
      confidence: 0.5,
    };
  }
  return normalized;
}

export function summarizeRuntimeContextTrace(input: RuntimeContextTraceSummaryInput): BrainDecisionTrace {
  const include = (input.includedSlices ?? input.contextSlices ?? []).map((s) => truncateText(s, 120)).filter(Boolean);
  const ignored = (input.ignoredSlices ?? []).map((s) => truncateText(s, 120)).filter(Boolean);
  const warningList = (input.warnings ?? []).map((w) => truncateText(w, 180)).filter(Boolean).slice(0, MAX_TRACE_WARNINGS);
  const staleReasons = (input.staleReasons ?? []).map((s) => truncateText(s, 180)).filter(Boolean).slice(0, MAX_TRACE_REASONS);

  const sliceInputs = include.slice(0, MAX_TRACE_INPUTS).map((slice, idx) => ({
    id: `slice_${idx + 1}`,
    kind: "context_slice",
    label: slice,
  }));
  const evidenceInputs = (input.evidence ?? [])
    .slice(0, Math.max(0, MAX_TRACE_INPUTS - sliceInputs.length))
    .map((ev, idx) => ({
      id: truncateText(ev.id, 80) || `evidence_${idx + 1}`,
      kind: "evidence",
      label: truncateText(ev.reason, 120) || "runtime_evidence",
      ...(truncateText(ev.sourceType, 40) ? { source: truncateText(ev.sourceType, 40) } : {}),
      ...(typeof ev.confidence === "number" ? { confidence: clamp01(ev.confidence, 0.5) } : {}),
      ...(truncateText(ev.sourceId, 120) ? { summary: truncateText(ev.sourceId, 120) } : {}),
    }));

  const discardedSignals: BrainDecisionTraceDiscardedSignal[] = [];
  if (ignored.length) {
    for (const [idx, row] of ignored.slice(0, MAX_TRACE_DISCARDED).entries()) {
      discardedSignals.push({
        id: `ignored_slice_${idx + 1}`,
        kind: "slice",
        summary: row,
        reason: "available_but_not_used",
      });
    }
  }
  if (input.flowNodesProvided && discardedSignals.length < MAX_TRACE_DISCARDED) {
    discardedSignals.push({
      id: "discarded_flow_nodes",
      kind: "flow_nodes",
      summary: "flowNodes provided to runtime context",
      reason: "available_but_not_used",
    });
  }
  if (input.flowEdgesProvided && discardedSignals.length < MAX_TRACE_DISCARDED) {
    discardedSignals.push({
      id: "discarded_flow_edges",
      kind: "flow_edges",
      summary: "flowEdges provided to runtime context",
      reason: "available_but_not_used",
    });
  }

  return createBrainDecisionTrace({
    kind: "runtime_context",
    persistenceIntent: "ephemeral",
    projectScopeId: input.projectScopeId,
    targetNodeType: input.targetNodeType,
    ...(input.targetNodeId ? { targetNodeId: input.targetNodeId } : {}),
    ...(input.useCase ? { useCase: input.useCase } : {}),
    inputs: [...sliceInputs, ...evidenceInputs].slice(0, MAX_TRACE_INPUTS),
    ...(discardedSignals.length ? { discardedSignals } : {}),
    outputSummary: {
      title: "Runtime Context",
      summary: truncateText(
        `Runtime context built for ${input.targetNodeType}${input.useCase ? ` (${input.useCase})` : ""} using ${include.length} slices and ${evidenceInputs.length} evidence signals.`,
        MAX_TRACE_SUMMARY,
      ),
      confidence: clamp01(input.confidence, 0.5),
      ...(warningList.length ? { warnings: warningList } : {}),
      ...(include.length ? { contextSliceIds: include.slice(0, MAX_TRACE_CONTEXT_SLICE_IDS) } : {}),
    },
    ...(staleReasons.length || warningList.length
      ? {
          freshness: {
            hasStaleData: staleReasons.length > 0 || warningList.length > 0,
            ...(staleReasons.length ? { staleReasons } : {}),
          },
        }
      : {}),
    confidence: clamp01(input.confidence, 0.5),
  });
}

export function summarizeTelemetryTrace(input: TelemetryTraceSummaryInput): BrainDecisionTrace {
  const inputs: BrainDecisionTraceInput[] = [
    { id: "accepted_count", kind: "count", label: `Accepted signals: ${Math.max(0, Math.floor(input.acceptedCount))}` },
    { id: "ignored_count", kind: "count", label: `Ignored signals: ${Math.max(0, Math.floor(input.ignoredCount))}` },
    { id: "exported_count", kind: "count", label: `Exported events: ${Math.max(0, Math.floor(input.exportedCount))}` },
    { id: "style_applied_count", kind: "count", label: `Style applied events: ${Math.max(0, Math.floor(input.styleAppliedCount))}` },
    { id: "image_used_count", kind: "count", label: `Image used events: ${Math.max(0, Math.floor(input.imageUsedCount))}` },
    { id: "batch_count", kind: "count", label: `Batches aggregated: ${Math.max(0, Math.floor(input.batchCount))}` },
  ];
  for (const [idx, k] of input.strongKinds.slice(0, 6).entries()) {
    inputs.push({
      id: `strong_kind_${idx + 1}`,
      kind: "strong_signal_kind",
      label: truncateText(k, 80),
    });
  }
  for (const [idx, ex] of (input.examples ?? []).slice(0, 4).entries()) {
    inputs.push({
      id: `telemetry_example_${idx + 1}`,
      kind: "example",
      label: truncateText(ex, 120),
    });
  }

  return createBrainDecisionTrace({
    kind: "telemetry_aggregation",
    persistenceIntent: "ephemeral",
    projectScopeId: input.projectScopeId,
    ...(input.targetNodeType ? { targetNodeType: input.targetNodeType } : {}),
    ...(input.targetNodeId ? { targetNodeId: input.targetNodeId } : {}),
    inputs: inputs.slice(0, MAX_TRACE_INPUTS),
    outputSummary: {
      title: "Telemetry Aggregation",
      summary: truncateText(
        `Aggregated telemetry with accepted=${input.acceptedCount}, ignored=${input.ignoredCount}, exported=${input.exportedCount}, strongKinds=${input.strongKinds.length}${input.flushReason ? `, flush=${input.flushReason}` : ""}.`,
        MAX_TRACE_SUMMARY,
      ),
      confidence: clamp01(input.confidence, 0.5),
    },
    ...(input.telemetryBatchId ? { sourceRefs: { telemetryBatchId: truncateText(input.telemetryBatchId, 120) } } : {}),
    confidence: clamp01(input.confidence, 0.5),
  });
}

export function summarizeLearningCandidateTrace(input: LearningCandidateTraceSummaryInput): BrainDecisionTrace {
  const eventCountInputs: BrainDecisionTraceInput[] = [];
  for (const [key, value] of Object.entries(input.eventCounts ?? {})) {
    if (eventCountInputs.length >= 10) break;
    if (typeof value !== "number" && typeof value !== "string") continue;
    eventCountInputs.push({
      id: `ev_${eventCountInputs.length + 1}`,
      kind: "event_count",
      label: truncateText(`${key}: ${String(value)}`, 140),
    });
  }
  const exampleInputs = (input.examples ?? []).slice(0, 4).map((row, idx) => ({
    id: `example_${idx + 1}`,
    kind: "example",
    label: truncateText(row, 120),
  }));
  const strongKindInputs = (input.strongKinds ?? []).slice(0, 4).map((row, idx) => ({
    id: `strong_${idx + 1}`,
    kind: "strong_signal_kind",
    label: truncateText(row, 80),
  }));

  const warnings = (input.warnings ?? []).map((w) => truncateText(w, 180)).filter(Boolean).slice(0, MAX_TRACE_WARNINGS);
  const inputs: BrainDecisionTraceInput[] = [
    {
      id: "candidate_topic",
      kind: "candidate",
      label: truncateText(`${input.candidateType} / ${input.topic}`, 120),
      ...(input.evidenceSource ? { source: truncateText(input.evidenceSource, 40) } : {}),
    },
    {
      id: "candidate_value",
      kind: "candidate_value",
      label: truncateText(input.value, 140),
    },
    ...strongKindInputs,
    ...eventCountInputs,
    ...exampleInputs,
  ];

  return createBrainDecisionTrace({
    kind: "learning_candidate",
    persistenceIntent: "pending_review",
    projectScopeId: input.projectScopeId,
    ...(input.targetNodeType ? { targetNodeType: input.targetNodeType } : {}),
    ...(input.targetNodeId ? { targetNodeId: input.targetNodeId } : {}),
    inputs: inputs.slice(0, MAX_TRACE_INPUTS),
    outputSummary: {
      title: "Learning Candidate",
      summary: truncateText(input.reasoning, MAX_TRACE_SUMMARY),
      confidence: clamp01(input.confidence, 0.5),
      ...(warnings.length ? { warnings } : {}),
    },
    ...(input.learningCandidateId ? { sourceRefs: { learningCandidateId: truncateText(input.learningCandidateId, 80) } } : {}),
    confidence: clamp01(input.confidence, 0.5),
  });
}

export function summarizeVisualPromptTrace(input: VisualPromptTraceSummaryInput): BrainDecisionTrace {
  const visualInputs: BrainDecisionTraceInput[] = [];
  for (const [k, v] of Object.entries(input.visualSourcesUsed ?? {})) {
    if (!v) continue;
    visualInputs.push({
      id: `visual_source_${visualInputs.length + 1}`,
      kind: "visual_source",
      label: truncateText(k, 120),
    });
    if (visualInputs.length >= 10) break;
  }
  for (const [k, v] of Object.entries(input.chosenAxes ?? {})) {
    if (visualInputs.length >= MAX_TRACE_INPUTS) break;
    if (v === undefined || v === null || v === false || v === "") continue;
    visualInputs.push({
      id: `axis_${visualInputs.length + 1}`,
      kind: "variation_axis",
      label: truncateText(`${k}: ${String(v)}`, 160),
    });
  }
  if (input.selectedVisualDnaSlotId && visualInputs.length < MAX_TRACE_INPUTS) {
    visualInputs.push({
      id: "selected_visual_dna_slot",
      kind: "visual_slot",
      label: truncateText(input.selectedVisualDnaSlotId, 120),
    });
  }
  if (input.selectedVisualDnaLayer && visualInputs.length < MAX_TRACE_INPUTS) {
    visualInputs.push({
      id: "selected_visual_dna_layer",
      kind: "visual_layer",
      label: truncateText(input.selectedVisualDnaLayer, 120),
    });
  }

  const warnings = (input.warnings ?? []).map((w) => truncateText(w, 180)).filter(Boolean).slice(0, MAX_TRACE_WARNINGS);
  const finalPrompt = truncateText(input.finalPrompt, 260);
  if (finalPrompt && visualInputs.length < MAX_TRACE_INPUTS) {
    visualInputs.push({
      id: "prompt_excerpt",
      kind: "prompt_excerpt",
      label: finalPrompt,
    });
  }

  return createBrainDecisionTrace({
    kind: "visual_prompt",
    persistenceIntent: "ephemeral",
    ...(input.projectScopeId ? { projectScopeId: input.projectScopeId } : {}),
    ...(input.targetNodeType ? { targetNodeType: input.targetNodeType } : {}),
    ...(input.targetNodeId ? { targetNodeId: input.targetNodeId } : {}),
    inputs: visualInputs.slice(0, MAX_TRACE_INPUTS),
    outputSummary: {
      title: "Visual Prompt",
      summary: truncateText(
        `Visual prompt composed with ${visualInputs.length} summarized inputs and ${warnings.length} warnings.`,
        MAX_TRACE_SUMMARY,
      ),
      confidence: clamp01(input.confidence, 0.55),
      ...(warnings.length ? { warnings } : {}),
    },
    ...(input.visualDiagnosticsId ? { sourceRefs: { visualDiagnosticsId: truncateText(input.visualDiagnosticsId, 80) } } : {}),
    confidence: clamp01(input.confidence, 0.55),
  });
}
