import { randomUUID } from "node:crypto";
import type {
  BrandDNA,
  BrainContextSnapshot,
  BrainEntityVersionStamp,
  ContextualMemoryEntry,
  CreativePreferences,
  ProjectMemory,
} from "./brain-models";
import {
  analyzeExportedArtifact as buildLearningCandidatesFromArtifact,
  type ArtifactPayload,
} from "./brain-artifact-analysis";
import { brainDevLog } from "./brain-dev-log";
import { annotateCandidateDnaConflict, checkPromoteRespectsLocks } from "./brain-learning-conflict";
import {
  BRAIN_NODE_TYPES,
  TELEMETRY_EVENT_KINDS,
  type TelemetryBatch,
  type TelemetryEvent,
  type TelemetryEventKind,
} from "./brain-telemetry";
import {
  LEARNING_RESOLUTION_ACTIONS,
  type LearningCandidate,
  type LearningCandidateStore,
  type LearningResolutionAction,
  type StoredLearningCandidate,
} from "./learning-candidate-schema";
import { resolveLearningPendingAnchorNodeId } from "./brain-connected-signals-ui";
import { normalizeBrainDecisionTrace, summarizeLearningCandidateTrace } from "./brain-decision-trace";

export type BrainNodeTelemetryDigestEntry = {
  nodeId: string;
  eventCounts: Partial<Record<TelemetryEventKind, number>>;
  /** Último `capturedAt` de un lote visto para este nodo (ISO). */
  lastAt: string | null;
};

export class BrainValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BrainValidationError";
    this.code = code;
  }
}

const MAX_TELEMETRY_EVENTS = 800;
const MAX_FIELD_REF_LEN = 128;
const MAX_ASSET_REF_LEN = 512;
const MAX_LEARNING_ID_LEN = 80;
const MAX_CONTEXTUAL = 200;
const MAX_TEXT_PREVIEW = 2000;

const DEFAULT_DNA: BrandDNA = {
  sectors: [],
  claims: [],
  palettes: [],
  typography: [],
  prohibitions: [],
};

const DEFAULT_PREFS: CreativePreferences = {
  defaultCopyLength: "auto",
};

const EMPTY_PROJECT_MEMORY: ProjectMemory = { entries: [] };

function readEventCountString(
  row: Record<string, number | string> | undefined,
  keys: string[],
): string | undefined {
  if (!row) return undefined;
  for (const key of keys) {
    const raw = row[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed.slice(0, 120);
  }
  return undefined;
}

function shouldTraceVisualOrRestudyCandidate(
  candidate: LearningCandidate,
  opts:
    | {
        sourceAnalysisId?: string;
        createdFromAnalysisVersion?: string;
      }
    | undefined,
): boolean {
  if (candidate.evidence.evidenceSource === "visual_reference") return true;
  if (typeof opts?.sourceAnalysisId === "string" && opts.sourceAnalysisId.trim()) return true;
  if (typeof opts?.createdFromAnalysisVersion === "string" && opts.createdFromAnalysisVersion.trim()) return true;
  return false;
}

function isBrainNodeType(v: unknown): v is import("./brain-telemetry").BrainNodeType {
  return typeof v === "string" && (BRAIN_NODE_TYPES as readonly string[]).includes(v);
}

function isTelemetryEventKind(v: unknown): v is TelemetryEventKind {
  return typeof v === "string" && (TELEMETRY_EVENT_KINDS as readonly string[]).includes(v);
}

function sanitizeTelemetryEvent(ev: TelemetryEvent): void {
  if (typeof ev.suggestionId === "string") ev.suggestionId = ev.suggestionId.trim().slice(0, 256);
  if (typeof ev.fieldRef === "string") ev.fieldRef = ev.fieldRef.trim().slice(0, MAX_FIELD_REF_LEN);
  if (typeof ev.assetRef === "string") ev.assetRef = ev.assetRef.trim().slice(0, MAX_ASSET_REF_LEN);
  if (typeof ev.textPreview === "string") ev.textPreview = ev.textPreview.slice(0, MAX_TEXT_PREVIEW);
  if (typeof ev.assetId === "string") ev.assetId = ev.assetId.trim().slice(0, 128);
  if (typeof ev.fileName === "string") ev.fileName = ev.fileName.trim().slice(0, 256);
  if (typeof ev.mimeType === "string") ev.mimeType = ev.mimeType.trim().slice(0, 128);
  if (typeof ev.pageId === "string") ev.pageId = ev.pageId.trim().slice(0, 128);
  if (typeof ev.frameId === "string") ev.frameId = ev.frameId.trim().slice(0, 128);
  if (typeof ev.imageWidth === "number" && (!Number.isFinite(ev.imageWidth) || ev.imageWidth < 0)) {
    delete ev.imageWidth;
  }
  if (typeof ev.imageHeight === "number" && (!Number.isFinite(ev.imageHeight) || ev.imageHeight < 0)) {
    delete ev.imageHeight;
  }
}

function validateTelemetryBatch(batch: TelemetryBatch, projectId: string, nodeId: string): void {
  if (batch.version !== 2) throw new BrainValidationError("INVALID_TELEMETRY_VERSION", "only telemetry batch version 2 is supported");
  if (!batch.sessionId || typeof batch.sessionId !== "string") {
    throw new BrainValidationError("INVALID_SESSION", "sessionId required");
  }
  if (batch.sessionId.length > 64) throw new BrainValidationError("SESSION_TOO_LONG", "sessionId too long");
  if (!batch.capturedAt) throw new BrainValidationError("INVALID_TIME", "capturedAt required");
  if (batch.batchId !== undefined) {
    const bid = String(batch.batchId).trim();
    if (!bid || bid.length > 128) throw new BrainValidationError("INVALID_BATCH_ID", "batchId invalid");
  }
  if (batch.projectId !== undefined && batch.projectId.trim() !== projectId.trim()) {
    throw new BrainValidationError("PROJECT_MISMATCH", "batch.projectId must match request projectId");
  }
  if (batch.nodeId !== undefined && batch.nodeId.trim() !== nodeId.trim()) {
    throw new BrainValidationError("NODE_MISMATCH", "batch.nodeId must match request nodeId");
  }
  if (batch.flushReason !== "unmount" && batch.flushReason !== "export" && batch.flushReason !== "manual") {
    throw new BrainValidationError("INVALID_FLUSH", "flushReason invalid");
  }
  if (!isBrainNodeType(batch.nodeType)) throw new BrainValidationError("INVALID_NODE_TYPE", "nodeType invalid");
  if (!Array.isArray(batch.events)) throw new BrainValidationError("INVALID_EVENTS", "events must be an array");
  if (batch.events.length > MAX_TELEMETRY_EVENTS) {
    throw new BrainValidationError("TELEMETRY_TOO_LARGE", `events exceeds ${MAX_TELEMETRY_EVENTS}`);
  }
  for (const raw of batch.events) {
    if (!raw || typeof raw !== "object") throw new BrainValidationError("INVALID_EVENT", "event invalid");
    const ev = raw as TelemetryEvent;
    if (!isTelemetryEventKind(ev.kind)) throw new BrainValidationError("INVALID_EVENT_KIND", "event.kind invalid");
    if (typeof ev.ts !== "string" || !ev.ts.trim()) throw new BrainValidationError("INVALID_EVENT_TS", "event.ts required");
    sanitizeTelemetryEvent(ev);
  }
}

function normalizeTelemetryBatch(projectId: string, nodeId: string, batch: TelemetryBatch): TelemetryBatch {
  const pid = projectId.trim();
  const nid = nodeId.trim();
  const batchId = batch.batchId?.trim() || randomUUID();
  const createdAt = batch.createdAt?.trim() || batch.capturedAt;
  return {
    ...batch,
    batchId,
    projectId: pid,
    nodeId: nid,
    createdAt,
  };
}

export type EphemeralTelemetryRow = {
  pk: string;
  sk: string;
  projectId: string;
  nodeId: string;
  workspaceId?: string;
  batch: TelemetryBatch;
  ttlEpochSec: number;
  createdAt: string;
};

export type LearningResolveResult = {
  learningId: string;
  action: LearningResolutionAction;
  learning: StoredLearningCandidate;
};

type StaticBrainRow = {
  projectId: string;
  workspaceId: string;
  dna: BrandDNA;
  preferences: CreativePreferences;
  dnaVersion?: BrainEntityVersionStamp;
  preferencesVersion?: BrainEntityVersionStamp;
};

function isResolutionAction(v: unknown): v is LearningResolutionAction {
  return typeof v === "string" && (LEARNING_RESOLUTION_ACTIONS as readonly string[]).includes(v);
}

function cloneProhibition(p: BrandDNA["prohibitions"][number]): { text: string; locked?: boolean } {
  return { text: p.text, ...(p.locked ? { locked: true } : {}) };
}

function cloneDna(dna: BrandDNA): BrandDNA {
  return {
    sectors: dna.sectors.map((s) => ({ ...s })),
    claims: dna.claims.map((c) => ({ ...c })),
    palettes: dna.palettes.map((p) => ({ ...p, swatches: [...p.swatches] })),
    typography: dna.typography.map((t) => ({ ...t, weights: t.weights ? [...t.weights] : undefined })),
    prohibitions: dna.prohibitions.map((p) => cloneProhibition(p)),
  };
}

function validateLearningCandidate(c: LearningCandidate): void {
  if (!c.topic?.trim() || !c.value?.trim()) throw new BrainValidationError("INVALID_CANDIDATE", "topic and value required");
  if (!c.evidence?.sourceNodeIds?.length || !c.evidence?.sourceNodeTypes?.length) {
    throw new BrainValidationError("INVALID_EVIDENCE", "evidence.sourceNodeIds and sourceNodeTypes required");
  }
}

export class BrainService implements LearningCandidateStore {
  private readonly staticByKey = new Map<string, StaticBrainRow>();
  private readonly projectMemoryByKey = new Map<string, ProjectMemory>();
  private readonly contextualByKey = new Map<string, ContextualMemoryEntry[]>();
  private readonly pendingById = new Map<string, StoredLearningCandidate>();
  private readonly telemetryQueue: EphemeralTelemetryRow[] = [];
  private readonly processedTelemetryBatchIds: string[] = [];
  private readonly processedTelemetryBatchSet = new Set<string>();

  constructor(seed?: {
    staticRows?: StaticBrainRow[];
    pending?: StoredLearningCandidate[];
    projectMemory?: Array<{ key: string; memory: ProjectMemory }>;
    contextual?: Array<{ key: string; entries: ContextualMemoryEntry[] }>;
  }) {
    for (const row of seed?.staticRows ?? []) {
      this.staticByKey.set(`${row.projectId}#${row.workspaceId}`, row);
    }
    for (const p of seed?.pending ?? []) {
      const decisionTrace = normalizeBrainDecisionTrace(p.decisionTrace);
      this.pendingById.set(p.id, {
        ...p,
        candidate: { ...p.candidate, evidence: { ...p.candidate.evidence } },
        ...(p.decisionTraceId ? { decisionTraceId: p.decisionTraceId } : {}),
        ...(decisionTrace ? { decisionTrace } : {}),
      });
    }
    for (const pm of seed?.projectMemory ?? []) {
      this.projectMemoryByKey.set(pm.key, {
        entries: pm.memory.entries.map((e) => ({ ...e })),
      });
    }
    for (const cx of seed?.contextual ?? []) {
      this.contextualByKey.set(cx.key, cx.entries.map((e) => ({ ...e })));
    }
  }

  private key(projectId: string, workspaceId: string): string {
    return `${projectId.trim()}#${workspaceId.trim()}`;
  }

  private getOrInitStatic(pid: string, wid: string): StaticBrainRow {
    const k = this.key(pid, wid);
    let row = this.staticByKey.get(k);
    if (!row) {
      const now = new Date().toISOString();
      row = {
        projectId: pid,
        workspaceId: wid,
        dna: cloneDna(DEFAULT_DNA),
        preferences: { ...DEFAULT_PREFS },
        dnaVersion: { version: 1, updatedAt: now },
        preferencesVersion: { version: 1, updatedAt: now },
      };
      this.staticByKey.set(k, row);
    }
    if (!row.dnaVersion) {
      row.dnaVersion = { version: 1, updatedAt: new Date().toISOString() };
    }
    if (!row.preferencesVersion) {
      row.preferencesVersion = { version: 1, updatedAt: new Date().toISOString() };
    }
    return row;
  }

  private rememberTelemetryBatch(batchId: string): boolean {
    if (this.processedTelemetryBatchSet.has(batchId)) return false;
    this.processedTelemetryBatchSet.add(batchId);
    this.processedTelemetryBatchIds.push(batchId);
    while (this.processedTelemetryBatchIds.length > 5000) {
      const old = this.processedTelemetryBatchIds.shift();
      if (old) this.processedTelemetryBatchSet.delete(old);
    }
    return true;
  }

  private getOrInitProjectMemory(pid: string, wid: string): ProjectMemory {
    const k = this.key(pid, wid);
    let m = this.projectMemoryByKey.get(k);
    if (!m) {
      m = { entries: [] };
      this.projectMemoryByKey.set(k, m);
    }
    return m;
  }

  private getOrInitContextual(pid: string, wid: string): ContextualMemoryEntry[] {
    const k = this.key(pid, wid);
    let list = this.contextualByKey.get(k);
    if (!list) {
      list = [];
      this.contextualByKey.set(k, list);
    }
    return list;
  }

  async getBrainContext(projectId: string, workspaceId: string): Promise<BrainContextSnapshot> {
    const pid = projectId.trim();
    const wid = workspaceId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    if (!wid) throw new BrainValidationError("MISSING_WORKSPACE", "workspaceId required");
    const row = this.staticByKey.get(this.key(pid, wid));
    const brandDna = row?.dna ? cloneDna(row.dna) : cloneDna(DEFAULT_DNA);
    const preferences = row?.preferences ? { ...row.preferences } : { ...DEFAULT_PREFS };
    const pm = this.projectMemoryByKey.get(this.key(pid, wid)) ?? EMPTY_PROJECT_MEMORY;
    const projectMemory: ProjectMemory = {
      entries: pm.entries.map((e) => ({ ...e })),
    };
    const cx = this.contextualByKey.get(this.key(pid, wid)) ?? [];
    const contextualMemory = cx.slice(-50).map((e) => ({ ...e }));
    return { projectId: pid, workspaceId: wid, brandDna, preferences, projectMemory, contextualMemory };
  }

  async getBrandDna(projectId: string, workspaceId: string): Promise<BrandDNA | null> {
    const row = this.staticByKey.get(this.key(projectId.trim(), workspaceId.trim()));
    return row ? cloneDna(row.dna) : null;
  }

  async syncNodeTelemetry(
    projectId: string,
    nodeId: string,
    batch: TelemetryBatch,
    workspaceId?: string | null,
  ): Promise<{ record: EphemeralTelemetryRow } | { duplicate: true; batchId: string }> {
    const pid = projectId.trim();
    const nid = nodeId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    if (!nid) throw new BrainValidationError("MISSING_NODE", "nodeId required");
    const copy = structuredClone(batch) as TelemetryBatch;
    validateTelemetryBatch(copy, pid, nid);
    const normalized = normalizeTelemetryBatch(pid, nid, copy);
    const batchId = normalized.batchId!;
    if (!this.rememberTelemetryBatch(batchId)) {
      brainDevLog("brain-service", "telemetry_duplicate_batch", { projectId: pid, nodeId: nid, batchId });
      return { duplicate: true, batchId };
    }
    brainDevLog("brain-service", "telemetry_ingested", {
      projectId: pid,
      nodeId: nid,
      batchId,
      events: normalized.events.length,
    });
    const ttlEpochSec = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
    const record: EphemeralTelemetryRow = {
      pk: `TELEM#${pid}`,
      sk: `NODE#${nid}#${normalized.sessionId}`,
      projectId: pid,
      nodeId: nid,
      workspaceId: workspaceId?.trim() || undefined,
      batch: {
        ...normalized,
        events: normalized.events.map((e) => ({ ...e })),
      },
      ttlEpochSec,
      createdAt: new Date().toISOString(),
    };
    this.telemetryQueue.push(record);
    if (this.telemetryQueue.length > 500) this.telemetryQueue.splice(0, this.telemetryQueue.length - 500);
    return { record };
  }

  async analyzeExportedArtifact(
    projectId: string,
    artifactPayload: ArtifactPayload,
    opts?: {
      workspaceId?: string | null;
      nodeId?: string | null;
      sourceSessionIds?: string[];
      telemetryNodeType?: import("./brain-telemetry").BrainNodeType;
    },
  ): Promise<{ ids: string[] }> {
    const pid = projectId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    const wid = (opts?.workspaceId ?? "__root__").trim();
    const dna = (await this.getBrandDna(pid, wid)) ?? cloneDna(DEFAULT_DNA);
    const raw = buildLearningCandidatesFromArtifact(pid, artifactPayload);
    const tagged = raw.map((c) => annotateCandidateDnaConflict(c, dna));
    return this.createLearningCandidates(pid, tagged, {
      workspaceId: wid,
      nodeId: opts?.nodeId ?? artifactPayload.sourceNodeId ?? null,
      sourceSessionIds: opts?.sourceSessionIds,
      telemetryNodeType: opts?.telemetryNodeType ?? artifactPayload.telemetryNodeType,
    });
  }

  async createLearningCandidates(
    projectId: string,
    candidates: LearningCandidate[],
    opts?: {
      workspaceId?: string | null;
      nodeId?: string | null;
      sourceSessionIds?: string[];
      telemetryNodeType?: import("./brain-telemetry").BrainNodeType;
      brainVersion?: number;
      sourceAnalysisId?: string;
      createdFromAnalysisVersion?: string;
    },
  ): Promise<{ ids: string[] }> {
    const pid = projectId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    const wid = (opts?.workspaceId ?? "__root__").trim();
    const nodeId = opts?.nodeId?.trim() || undefined;
    const sessions = opts?.sourceSessionIds?.filter((s) => typeof s === "string" && s.trim()) ?? [];
    if (opts?.telemetryNodeType !== undefined && !isBrainNodeType(opts.telemetryNodeType)) {
      throw new BrainValidationError("INVALID_TELEMETRY_NODE_TYPE", "telemetryNodeType invalid");
    }
    const telemetryNodeType = opts?.telemetryNodeType;
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const c of candidates) {
      validateLearningCandidate(c);
      const id = randomUUID();
      let decisionTraceId: string | undefined;
      let decisionTrace: StoredLearningCandidate["decisionTrace"] | undefined;
      if (shouldTraceVisualOrRestudyCandidate(c, opts)) {
        const eventCounts = c.evidence.eventCounts ? { ...c.evidence.eventCounts } : {};
        const selectedVisualDnaSlotId = readEventCountString(eventCounts, [
          "selected_visual_dna_slot_id",
          "selectedVisualDnaSlotId",
          "visual_dna_slot_id",
          "slot_id",
        ]);
        const selectedVisualDnaLayer = readEventCountString(eventCounts, [
          "selected_visual_dna_layer",
          "selectedVisualDnaLayer",
          "visual_dna_layer",
          "selected_layer",
        ]);
        if (typeof opts?.sourceAnalysisId === "string" && opts.sourceAnalysisId.trim()) {
          eventCounts.source_analysis_id = opts.sourceAnalysisId.trim().slice(0, 120);
        }
        if (typeof opts?.createdFromAnalysisVersion === "string" && opts.createdFromAnalysisVersion.trim()) {
          eventCounts.analysis_version = opts.createdFromAnalysisVersion.trim().slice(0, 120);
        }
        if (selectedVisualDnaSlotId) {
          eventCounts.selected_visual_dna_slot_id = selectedVisualDnaSlotId;
        }
        if (selectedVisualDnaLayer) {
          eventCounts.selected_visual_dna_layer = selectedVisualDnaLayer;
        }
        eventCounts.trace_origin =
          typeof opts?.sourceAnalysisId === "string" && opts.sourceAnalysisId.trim()
            ? "restudy_visual"
            : "visual_reference";
        if (c.evidence.evidenceSource) {
          eventCounts.evidence_source = c.evidence.evidenceSource;
        }
        const candidateTrace = summarizeLearningCandidateTrace({
          projectScopeId: pid,
          targetNodeType: telemetryNodeType,
          targetNodeId: nodeId,
          learningCandidateId: id,
          topic: c.topic,
          candidateType: c.type,
          value: c.value,
          reasoning: `Origen visual/restudy: ${eventCounts.trace_origin}. ${c.reasoning}`,
          confidence: c.confidence,
          eventCounts,
          examples: [
            ...(c.evidence.examples ?? []),
            ...(c.evidence.sourceArtifactIds ?? []).slice(0, 4).map((src) => `source:${src}`),
          ],
          strongKinds: [
            eventCounts.trace_origin === "restudy_visual" ? "RESTUDY_VISUAL" : "VISUAL_REFERENCE",
            ...(selectedVisualDnaSlotId ? ["VISUAL_DNA_SLOT_SELECTED"] : []),
            ...(selectedVisualDnaLayer ? ["VISUAL_DNA_LAYER_SELECTED"] : []),
          ],
          evidenceSource: c.evidence.evidenceSource,
        });
        decisionTraceId = candidateTrace.id;
        decisionTrace = candidateTrace;
      }
      const row: StoredLearningCandidate = {
        id,
        projectId: pid,
        workspaceId: wid === "__root__" ? undefined : wid,
        nodeId,
        ...(telemetryNodeType ? { telemetryNodeType } : {}),
        ...(typeof opts?.brainVersion === "number" ? { brainVersion: opts.brainVersion } : {}),
        ...(opts?.sourceAnalysisId ? { sourceAnalysisId: opts.sourceAnalysisId } : {}),
        ...(opts?.createdFromAnalysisVersion ? { createdFromAnalysisVersion: opts.createdFromAnalysisVersion } : {}),
        status: "PENDING_REVIEW",
        candidate: {
          ...c,
          ...(c.conflictWithDNA ? { conflictWithDNA: true } : {}),
          evidence: {
            sourceNodeIds: [...c.evidence.sourceNodeIds],
            sourceNodeTypes: [...c.evidence.sourceNodeTypes],
            ...(c.evidence.primarySourceNodeId ? { primarySourceNodeId: c.evidence.primarySourceNodeId } : {}),
            ...(c.evidence.evidenceSource ? { evidenceSource: c.evidence.evidenceSource } : {}),
            ...(c.evidence.sourceArtifactIds?.length
              ? { sourceArtifactIds: [...c.evidence.sourceArtifactIds] }
              : {}),
            ...(c.evidence.relatedArtifactKinds?.length
              ? { relatedArtifactKinds: [...c.evidence.relatedArtifactKinds] }
              : {}),
            ...(c.evidence.examples?.length ? { examples: [...c.evidence.examples] } : {}),
            ...(c.evidence.eventCounts ? { eventCounts: { ...c.evidence.eventCounts } } : {}),
          },
        },
        sourceSessionIds: sessions.length ? [...new Set(sessions)] : [],
        createdAt: now,
        ...(decisionTraceId ? { decisionTraceId } : {}),
        ...(decisionTrace ? { decisionTrace } : {}),
      };
      this.pendingById.set(id, row);
      ids.push(id);
    }
    if (ids.length) {
      brainDevLog("brain-service", "learning_candidates_created", { projectId: pid, count: ids.length });
    }
    return { ids };
  }

  async savePendingReview(rows: StoredLearningCandidate[]): Promise<void> {
    for (const row of rows) {
      const decisionTrace = normalizeBrainDecisionTrace(row.decisionTrace);
      const copy: StoredLearningCandidate = {
        ...row,
        candidate: {
          ...row.candidate,
          evidence: {
            ...row.candidate.evidence,
            sourceNodeIds: [...row.candidate.evidence.sourceNodeIds],
            sourceNodeTypes: [...row.candidate.evidence.sourceNodeTypes],
            ...(row.candidate.evidence.primarySourceNodeId
              ? { primarySourceNodeId: row.candidate.evidence.primarySourceNodeId }
              : {}),
            ...(row.candidate.evidence.evidenceSource ? { evidenceSource: row.candidate.evidence.evidenceSource } : {}),
            ...(row.candidate.evidence.sourceArtifactIds
              ? { sourceArtifactIds: [...row.candidate.evidence.sourceArtifactIds] }
              : {}),
            ...(row.candidate.evidence.relatedArtifactKinds
              ? { relatedArtifactKinds: [...row.candidate.evidence.relatedArtifactKinds] }
              : {}),
            ...(row.candidate.evidence.examples ? { examples: [...row.candidate.evidence.examples] } : {}),
            ...(row.candidate.evidence.eventCounts ? { eventCounts: { ...row.candidate.evidence.eventCounts } } : {}),
          },
        },
        sourceSessionIds: [...row.sourceSessionIds],
        ...(row.decisionTraceId ? { decisionTraceId: row.decisionTraceId } : {}),
        ...(decisionTrace ? { decisionTrace } : {}),
      };
      this.pendingById.set(copy.id, copy);
    }
  }

  /**
   * Solo desarrollo (o `BRAIN_DEV_TOOLS=1`): elimina pendientes en revisión del proyecto.
   * `orphan`: sin `nodeId`/ancla fiable; `visual_reference`: cola desde Brain Studio/referencias.
   */
  devClearPendingLearnings(
    projectId: string,
    mode: "all" | "orphan" | "visual_reference",
  ): { removed: number } {
    if (process.env.NODE_ENV !== "development" && process.env.BRAIN_DEV_TOOLS !== "1") {
      throw new BrainValidationError("DEV_ONLY", "solo disponible en desarrollo o con BRAIN_DEV_TOOLS=1");
    }
    const pid = projectId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    let removed = 0;
    for (const [id, row] of [...this.pendingById.entries()]) {
      if (row.projectId.trim() !== pid) continue;
      if (row.status !== "PENDING_REVIEW") continue;
      let del = false;
      if (mode === "all") del = true;
      else if (mode === "orphan") del = !resolveLearningPendingAnchorNodeId(row);
      else if (mode === "visual_reference") del = row.candidate.evidence.evidenceSource === "visual_reference";
      if (del) {
        this.pendingById.delete(id);
        removed += 1;
      }
    }
    brainDevLog("brain-service", "dev_clear_pending_learnings", { projectId: pid, mode, removed });
    return { removed };
  }

  /**
   * Solo desarrollo / `BRAIN_DEV_TOOLS=1`: borra pendientes que cumplan el predicado (p. ej. re-estudio Brain).
   */
  devRemovePendingLearningsIf(projectId: string, predicate: (row: StoredLearningCandidate) => boolean): { removed: number } {
    if (process.env.NODE_ENV !== "development" && process.env.BRAIN_DEV_TOOLS !== "1") {
      throw new BrainValidationError("DEV_ONLY", "solo disponible en desarrollo o con BRAIN_DEV_TOOLS=1");
    }
    const pid = projectId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    let removed = 0;
    for (const [id, row] of [...this.pendingById.entries()]) {
      if (row.projectId.trim() !== pid) continue;
      if (row.status !== "PENDING_REVIEW") continue;
      if (predicate(row)) {
        this.pendingById.delete(id);
        removed += 1;
      }
    }
    brainDevLog("brain-service", "dev_remove_pending_learnings_if", { projectId: pid, removed });
    return { removed };
  }

  async listPendingLearnings(projectId: string): Promise<StoredLearningCandidate[]> {
    const pid = projectId.trim();
    if (!pid) throw new BrainValidationError("MISSING_PROJECT", "projectId required");
    const out: StoredLearningCandidate[] = [];
    for (const row of this.pendingById.values()) {
      if (row.projectId !== pid) continue;
      if (row.status !== "PENDING_REVIEW") continue;
      const decisionTrace = normalizeBrainDecisionTrace(row.decisionTrace);
      out.push({
        ...row,
        candidate: {
          ...row.candidate,
          evidence: { ...row.candidate.evidence },
        },
        sourceSessionIds: [...row.sourceSessionIds],
        ...(row.decisionTraceId ? { decisionTraceId: row.decisionTraceId } : {}),
        ...(decisionTrace ? { decisionTrace } : {}),
      });
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }

  async resolvePendingLearning(
    learningId: string,
    action: LearningResolutionAction,
    meta?: { updatedBy?: string | null },
  ): Promise<LearningResolveResult> {
    const lid = learningId.trim();
    if (!lid || lid.length > MAX_LEARNING_ID_LEN) {
      throw new BrainValidationError("INVALID_LEARNING_ID", "learningId invalid");
    }
    if (!isResolutionAction(action)) {
      throw new BrainValidationError("INVALID_ACTION", "action invalid");
    }
    const cur = this.pendingById.get(lid);
    if (!cur) throw new BrainValidationError("NOT_FOUND", "learning not found");
    if (cur.status !== "PENDING_REVIEW") {
      throw new BrainValidationError("INVALID_STATE", "learning is not pending review");
    }
    const wid = (cur.workspaceId ?? "__root__").trim();
    const pid = cur.projectId.trim();
    const now = new Date().toISOString();
    const updatedBy = meta?.updatedBy?.trim() || undefined;

    if (action === "DISMISS") {
      const updated: StoredLearningCandidate = {
        ...cur,
        status: "DISMISSED",
        updatedAt: now,
        resolutionAction: action,
      };
      this.pendingById.set(lid, updated);
      brainDevLog("brain-service", "learning_resolved", { learningId: lid, action });
      return { learningId: lid, action, learning: updated };
    }

    if (action === "PROMOTE_TO_DNA") {
      const staticRow = this.getOrInitStatic(pid, wid);
      const lockHit = checkPromoteRespectsLocks(cur.candidate, staticRow.dna);
      if (lockHit) throw new BrainValidationError(lockHit.code, lockHit.message);
      const stampBase: Omit<BrainEntityVersionStamp, "version"> = {
        updatedAt: now,
        updatedBy,
        sourceLearningId: lid,
      };
      if (cur.candidate.type === "CREATIVE_PREFERENCE") {
        const prefs = staticRow.preferences;
        const note = cur.candidate.value.slice(0, 400);
        const toneParts = [prefs.toneNotes, note].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        staticRow.preferences = {
          ...prefs,
          toneNotes: toneParts.join("\n—\n").slice(0, 4000),
        };
        const prevPv = staticRow.preferencesVersion ?? { version: 1, updatedAt: now };
        staticRow.preferencesVersion = {
          ...stampBase,
          version: prevPv.version + 1,
        };
      } else if (cur.candidate.type === "BRAND_DNA" || cur.candidate.type === "VISUAL_MEMORY") {
        /** ADN persistido del proyecto vive en `metadata.assets.strategy`; no duplicar en claims estáticos. */
        brainDevLog("brain-service", "promote_skip_static_dna_claims", {
          learningId: lid,
          type: cur.candidate.type,
        });
      } else {
        staticRow.dna.claims.push({
          id: `from_learning_${lid.slice(0, 8)}`,
          text: cur.candidate.value.slice(0, 400),
          channel: cur.candidate.topic.slice(0, 80),
        });
        const prevDv = staticRow.dnaVersion ?? { version: 1, updatedAt: now };
        staticRow.dnaVersion = {
          ...stampBase,
          version: prevDv.version + 1,
        };
      }
    } else if (action === "KEEP_IN_PROJECT") {
      const pm = this.getOrInitProjectMemory(pid, wid);
      pm.entries.push({
        id: randomUUID(),
        topic: cur.candidate.topic,
        value: cur.candidate.value,
        createdAt: now,
        sourceLearningId: lid,
      });
    } else if (action === "SAVE_AS_CONTEXT") {
      const list = this.getOrInitContextual(pid, wid);
      list.push({
        id: randomUUID(),
        topic: cur.candidate.topic,
        value: cur.candidate.value,
        isOutlier: false,
        createdAt: now,
        sourceLearningId: lid,
      });
      if (list.length > MAX_CONTEXTUAL) list.splice(0, list.length - MAX_CONTEXTUAL);
    } else if (action === "MARK_OUTLIER") {
      const list = this.getOrInitContextual(pid, wid);
      list.push({
        id: randomUUID(),
        topic: cur.candidate.topic,
        value: cur.candidate.value,
        isOutlier: true,
        createdAt: now,
        sourceLearningId: lid,
      });
      if (list.length > MAX_CONTEXTUAL) list.splice(0, list.length - MAX_CONTEXTUAL);
    }

    const updated: StoredLearningCandidate = {
      ...cur,
      status: "APPROVED",
      updatedAt: now,
      resolutionAction: action,
    };
    this.pendingById.set(lid, updated);
    brainDevLog("brain-service", "learning_resolved", { learningId: lid, action });
    return { learningId: lid, action, learning: updated };
  }

  /**
   * Agrega eventos de telemetría recientes en memoria (~500 lotes) por `nodeId` de canvas.
   * No incluye lotes duplicados (mismo batchId se descarta en ingest).
   */
  summarizeRecentTelemetryForNodes(projectId: string, nodeIdList: string[]): BrainNodeTelemetryDigestEntry[] {
    const pid = projectId.trim();
    const ordered = [...new Set(nodeIdList.map((x) => x.trim()).filter(Boolean))];
    const wanted = new Set(ordered);
    const acc = new Map<string, Partial<Record<TelemetryEventKind, number>>>();
    const last = new Map<string, string>();

    for (const row of this.telemetryQueue) {
      if (row.projectId !== pid) continue;
      const nid = row.nodeId.trim();
      if (!wanted.has(nid)) continue;
      const cur = acc.get(nid) ?? {};
      for (const ev of row.batch.events) {
        const k = ev.kind;
        cur[k] = (cur[k] ?? 0) + 1;
      }
      acc.set(nid, cur);
      const t = (row.batch.capturedAt || row.createdAt || "").trim();
      if (t) {
        const prev = last.get(nid);
        if (!prev || t > prev) last.set(nid, t);
      }
    }

    return ordered.map((nodeId) => ({
      nodeId,
      eventCounts: { ...(acc.get(nodeId) ?? {}) },
      lastAt: last.get(nodeId) ?? null,
    }));
  }

  peekTelemetryQueue(): readonly EphemeralTelemetryRow[] {
    return this.telemetryQueue;
  }

  peekPendingLearnings(): readonly StoredLearningCandidate[] {
    return [...this.pendingById.values()];
  }

  seedStaticBrain(row: StaticBrainRow): void {
    this.staticByKey.set(this.key(row.projectId, row.workspaceId), row);
  }
}

export const defaultBrainService = new BrainService();
