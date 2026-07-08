import type { BrainMeta, BrainMetaAnalysisStatus } from "./brain-creative-memory-types";
import { normalizeBrandPipelineDiagnostics } from "@/lib/brandkit/brand-pipeline-diagnostics";
import { normalizeBrandKitBoardMeta } from "@/lib/brandkit/interpretation";
import { filterOutStaleReasons, KNOWLEDGE_STALE_REASONS, VISUAL_STALE_REASONS } from "./brain-stale-reasons";

export function normalizeBrainMeta(raw: unknown): BrainMeta {
  if (!raw || typeof raw !== "object") {
    return { brainVersion: 1, analysisStatus: "idle", staleReasons: [] };
  }
  const r = raw as Record<string, unknown>;
  const brainVersion = typeof r.brainVersion === "number" && Number.isFinite(r.brainVersion) ? Math.max(1, Math.floor(r.brainVersion)) : 1;
  const analysisStatus = ((): BrainMetaAnalysisStatus => {
    const s = String(r.analysisStatus ?? "idle");
    if (s === "queued" || s === "analyzing" || s === "failed" || s === "stale") return s;
    return "idle";
  })();
  const staleReasons = Array.isArray(r.staleReasons)
    ? (r.staleReasons.map((x) => String(x).trim()).filter(Boolean) as string[])
    : [];
  const boardMeta =
    r.boardMeta !== undefined ? normalizeBrandKitBoardMeta(r.boardMeta) : undefined;
  const brandPipelineDiagnostics = normalizeBrandPipelineDiagnostics(r.brandPipelineDiagnostics);
  const rejectedLogoSignatures = Array.isArray(r.rejectedLogoSignatures)
    ? r.rejectedLogoSignatures.map((x) => String(x).trim()).filter(Boolean)
    : undefined;

  return {
    brainVersion,
    lastSavedAt: typeof r.lastSavedAt === "string" ? r.lastSavedAt : undefined,
    lastKnowledgeAnalysisAt: typeof r.lastKnowledgeAnalysisAt === "string" ? r.lastKnowledgeAnalysisAt : undefined,
    lastVisualAnalysisAt: typeof r.lastVisualAnalysisAt === "string" ? r.lastVisualAnalysisAt : undefined,
    lastContentDnaAnalysisAt: typeof r.lastContentDnaAnalysisAt === "string" ? r.lastContentDnaAnalysisAt : undefined,
    lastBrandVisualDnaAnalysisAt: typeof r.lastBrandVisualDnaAnalysisAt === "string" ? r.lastBrandVisualDnaAnalysisAt : undefined,
    lastRuntimeContextBuildAt: typeof r.lastRuntimeContextBuildAt === "string" ? r.lastRuntimeContextBuildAt : undefined,
    lastResetAt: typeof r.lastResetAt === "string" ? r.lastResetAt : undefined,
    brandLocked: r.brandLocked === true,
    analysisStatus,
    staleReasons,
    ...(boardMeta ? { boardMeta } : {}),
    ...(brandPipelineDiagnostics ? { brandPipelineDiagnostics } : {}),
    ...(rejectedLogoSignatures?.length ? { rejectedLogoSignatures } : {}),
    ...(r.pendingLogoPicker === true ? { pendingLogoPicker: true } : {}),
  };
}

export function getBrainVersion(meta: BrainMeta | undefined | null): number {
  return meta?.brainVersion && meta.brainVersion > 0 ? meta.brainVersion : 1;
}

export function incrementBrainVersion(meta: BrainMeta | undefined | null): BrainMeta {
  const base = normalizeBrainMeta(meta ?? undefined);
  return { ...base, brainVersion: base.brainVersion + 1 };
}

export function isBrainAnalysisStale(meta: BrainMeta | undefined | null): boolean {
  if (!meta) return false;
  if (meta.analysisStatus === "stale") return true;
  return meta.staleReasons.length > 0;
}

export function markBrainStale(meta: BrainMeta | undefined | null, reasons: string[]): BrainMeta {
  const base = normalizeBrainMeta(meta ?? undefined);
  const merged = Array.from(new Set([...(base.staleReasons ?? []), ...reasons.map((r) => r.trim()).filter(Boolean)]));
  return {
    ...base,
    analysisStatus: merged.length ? "stale" : base.analysisStatus,
    staleReasons: merged,
  };
}

export function clearBrainStale(meta: BrainMeta | undefined | null): BrainMeta {
  const base = normalizeBrainMeta(meta ?? undefined);
  return { ...base, analysisStatus: "idle", staleReasons: [] };
}

export function getBrainFreshnessSummary(meta: BrainMeta | undefined | null): string {
  const m = normalizeBrainMeta(meta ?? undefined);
  const parts = [`v${m.brainVersion}`, m.analysisStatus];
  if (m.lastKnowledgeAnalysisAt) parts.push(`knowledge:${m.lastKnowledgeAnalysisAt.slice(0, 10)}`);
  if (m.lastVisualAnalysisAt) parts.push(`visual:${m.lastVisualAnalysisAt.slice(0, 10)}`);
  if (m.staleReasons.length) parts.push(`stale:${m.staleReasons.length}`);
  return parts.join(" · ");
}

/** Tras un análisis de conocimiento con documentos procesados, actualiza timestamps y versión. */
export function touchBrainMetaAfterKnowledgeAnalysis(meta: BrainMeta | undefined | null, analyzedCount: number): BrainMeta {
  const base = normalizeBrainMeta(meta ?? undefined);
  if (analyzedCount <= 0) return base;
  const staleReasons = filterOutStaleReasons(base.staleReasons, (r) => KNOWLEDGE_STALE_REASONS.has(r));
  return {
    ...base,
    lastKnowledgeAnalysisAt: new Date().toISOString(),
    brainVersion: base.brainVersion + 1,
    analysisStatus: staleReasons.length ? "stale" : "idle",
    staleReasons,
  };
}

/** Tras reanálisis visual exitoso: limpia stale visual, timestamps y versión. */
export function touchBrainMetaAfterVisualAnalysis(
  meta: BrainMeta | undefined | null,
  opts?: { synthesizedBrandVisualDna?: boolean },
): BrainMeta {
  const base = normalizeBrainMeta(meta ?? undefined);
  const staleReasons = filterOutStaleReasons(base.staleReasons, (r) => VISUAL_STALE_REASONS.has(r));
  const now = new Date().toISOString();
  return {
    ...base,
    lastVisualAnalysisAt: now,
    ...(opts?.synthesizedBrandVisualDna ? { lastBrandVisualDnaAnalysisAt: now } : {}),
    brainVersion: base.brainVersion + 1,
    analysisStatus: staleReasons.length ? "stale" : "idle",
    staleReasons,
  };
}
