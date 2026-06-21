/**
 * Store global de ejecuciones IA activas para el HUD inferior del lienzo
 * y la animación de ejecución dentro de cada nodo.
 */

export type AiActiveJobSource = "fetch" | "node";

export type AiActiveJob = {
  id: string;
  label: string;
  nodeId?: string;
  /** null = barra indeterminada */
  pct: number | null;
  source: AiActiveJobSource;
  startedAt: number;
};

type Listener = () => void;
const listeners = new Set<Listener>();

const jobs = new Map<string, AiActiveJob>();
const nodeJobCounts = new Map<string, number>();

const EMPTY_JOBS: readonly AiActiveJob[] = [];
const EMPTY_NODE_IDS: ReadonlySet<string> = new Set<string>();

let cachedSnapshot: readonly AiActiveJob[] = EMPTY_JOBS;
let cachedHudSnapshot: readonly AiActiveJob[] = EMPTY_JOBS;
let cachedActiveNodeIds: ReadonlySet<string> = EMPTY_NODE_IDS;
let activeAiNodeIdsVersion = 0;

let idCounter = 0;

function nextJobId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function rebuildSnapshot(): void {
  if (jobs.size === 0) {
    cachedSnapshot = EMPTY_JOBS;
    return;
  }
  cachedSnapshot = Array.from(jobs.values()).sort((a, b) => a.startedAt - b.startedAt);
}

function rebuildHudSnapshot(): void {
  const snapshot = cachedSnapshot;
  if (snapshot.length === 0) {
    cachedHudSnapshot = EMPTY_JOBS;
    return;
  }

  const hasNodeJob = snapshot.some((j) => j.source === "node");
  const visible = snapshot.filter((j) => j.label.trim().length > 0);
  if (visible.length === 0) {
    cachedHudSnapshot = EMPTY_JOBS;
    return;
  }
  if (!hasNodeJob) {
    cachedHudSnapshot = dedupeHudJobs(visible);
    return;
  }

  cachedHudSnapshot = dedupeHudJobs(visible.filter((j) => j.source !== "fetch"));
}

/** Una fila por nodo en el HUD (evita duplicados visuales). */
function dedupeHudJobs(jobs: readonly AiActiveJob[]): readonly AiActiveJob[] {
  if (jobs.length <= 1) return jobs;

  const byNode = new Map<string, AiActiveJob>();
  const withoutNode: AiActiveJob[] = [];

  for (const job of jobs) {
    const nodeId = job.nodeId?.trim();
    if (!nodeId) {
      withoutNode.push(job);
      continue;
    }
    const key = nodeJobKey(nodeId);
    const existing = byNode.get(key);
    if (!existing || job.startedAt >= existing.startedAt) {
      byNode.set(key, job);
    }
  }

  const merged = [...byNode.values(), ...withoutNode].sort((a, b) => a.startedAt - b.startedAt);
  return merged;
}

function rebuildActiveNodeIds(): void {
  if (nodeJobCounts.size === 0) {
    cachedActiveNodeIds = EMPTY_NODE_IDS;
    return;
  }
  cachedActiveNodeIds = new Set(nodeJobCounts.keys());
}

function notify() {
  rebuildSnapshot();
  rebuildHudSnapshot();
  rebuildActiveNodeIds();
  activeAiNodeIdsVersion += 1;
  listeners.forEach((l) => l());
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function nodeJobKey(nodeId: string): string {
  return `node:${nodeId}`;
}

/** Rutas cuyo progreso lo gestiona el nodo (runAiJobWithNotification), no el overlay de fetch. */
export const NODE_MANAGED_AI_PATHS: RegExp[] = [
  /^\/api\/gemini\/generate$/,
  /^\/api\/gemini\/generate-stream$/,
  /^\/api\/openai\/generate-stream$/,
  /^\/api\/gemini\/analyze-areas$/,
  /^\/api\/gemini\/video$/,
  /^\/api\/seedance\/video$/,
  /^\/api\/spaces\/describe$/,
  /^\/api\/spaces\/search$/,
  /^\/api\/spaces\/matte$/,
  /^\/api\/spaces\/assistant$/,
  /^\/api\/openai\/enhance$/,
  /^\/api\/grok\/generate$/,
  /^\/api\/grok\/status\//,
  /^\/api\/runway\/generate$/,
  /^\/api\/runway\/status\//,
  /^\/api\/inspiration\/search$/,
];

export function isNodeManagedAiPath(pathname: string): boolean {
  return NODE_MANAGED_AI_PATHS.some((re) => re.test(pathname));
}

export function subscribeActiveAiJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveAiJobsSnapshot(): readonly AiActiveJob[] {
  return cachedSnapshot;
}

/** HUD: oculta fetch duplicados cuando un nodo ya posee la ejecución. */
export function getActiveAiJobsForHudSnapshot(): readonly AiActiveJob[] {
  return cachedHudSnapshot;
}

export function getActiveAiNodeIdsSnapshot(): ReadonlySet<string> {
  return cachedActiveNodeIds;
}

/** Contador para useSyncExternalStore (evita snapshots Set estancados). */
export function getActiveAiNodeIdsVersion(): number {
  return activeAiNodeIdsVersion;
}

export function isNodeAiExecutionActive(nodeId: string): boolean {
  return (nodeJobCounts.get(nodeId) ?? 0) > 0;
}

export function getActiveAiJobForNode(nodeId: string): AiActiveJob | undefined {
  return jobs.get(nodeJobKey(nodeId));
}

export function aiActiveJobStartFetch(label: string): string {
  const id = nextJobId("fetch");
  jobs.set(id, {
    id,
    label,
    pct: null,
    source: "fetch",
    startedAt: Date.now(),
  });
  notify();
  return id;
}

export function aiActiveJobEndFetch(id: string): void {
  if (!id || id.startsWith("skip:")) return;
  if (!jobs.has(id)) return;
  jobs.delete(id);
  notify();
}

export function aiActiveJobStartNode(nodeId: string, label = "Image Creation"): void {
  const trimmed = nodeId.trim();
  if (!trimmed) return;
  const count = (nodeJobCounts.get(trimmed) ?? 0) + 1;
  nodeJobCounts.set(trimmed, count);
  const key = nodeJobKey(trimmed);
  const existing = jobs.get(key);
  jobs.set(key, {
    id: key,
    label,
    nodeId: trimmed,
    pct: existing?.pct ?? null,
    source: "node",
    startedAt: existing?.startedAt ?? Date.now(),
  });
  notify();
}

export function aiActiveJobProgressNode(nodeId: string, pct: number): void {
  const trimmed = nodeId.trim();
  if (!trimmed) return;
  const key = nodeJobKey(trimmed);
  const existing = jobs.get(key);
  if (!existing) return;
  const v = clampPct(pct);
  if (existing.pct === v) return;
  jobs.set(key, { ...existing, pct: v });
  notify();
}

export function aiActiveJobEndNode(nodeId: string): void {
  const trimmed = nodeId.trim();
  if (!trimmed) return;
  const count = nodeJobCounts.get(trimmed) ?? 0;
  if (count <= 1) {
    nodeJobCounts.delete(trimmed);
    jobs.delete(nodeJobKey(trimmed));
  } else {
    nodeJobCounts.set(trimmed, count - 1);
  }
  notify();
}

/** Cierra todas las ejecuciones activas del nodo (p. ej. polling VFX terminado). */
export function aiActiveJobReleaseNode(nodeId: string): void {
  const trimmed = nodeId.trim();
  if (!trimmed) return;
  if (!nodeJobCounts.has(trimmed)) return;
  nodeJobCounts.delete(trimmed);
  jobs.delete(nodeJobKey(trimmed));
  notify();
}

/** Mantiene el nodo en ejecución sin incrementar el contador (polling / jobs largos). */
export function aiActiveJobEnsureNode(nodeId: string, label = "Image Creation"): void {
  if (!isNodeAiExecutionActive(nodeId)) {
    aiActiveJobStartNode(nodeId, label);
    return;
  }
  const key = nodeJobKey(nodeId.trim());
  const existing = jobs.get(key);
  if (existing && existing.label !== label) {
    jobs.set(key, { ...existing, label });
    notify();
  }
}

export function getActiveAiJobProgressForNode(nodeId: string): number | null {
  const job = jobs.get(nodeJobKey(nodeId));
  return job?.pct ?? null;
}

/** Limpia todo (tests / Strict Mode). */
export function resetActiveAiJobsForTests(): void {
  jobs.clear();
  nodeJobCounts.clear();
  cachedSnapshot = EMPTY_JOBS;
  cachedHudSnapshot = EMPTY_JOBS;
  cachedActiveNodeIds = EMPTY_NODE_IDS;
  activeAiNodeIdsVersion = 0;
  notify();
}
