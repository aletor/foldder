"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Brain, Link2 } from "lucide-react";
import { BRAIN_ADN_COMPLETENESS_TOOLTIP_ES, computeAdnScore } from "@/lib/brain/brain-adn-score";
import { listDownstreamBrainClients } from "@/lib/brain/brain-canvas-brain-links";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import {
  BRAIN_IMAGE_INVENTORY_NODE_TOOLTIP_ES,
  BRAIN_PENDING_QUEUE_TOOLTIP_ES,
  BRAIN_RECENT_SIGNALS_TOOLTIP_ES,
  BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES,
  BRAIN_VISION_REAL_COUNT_NODE_TOOLTIP_ES,
  buildPendingCountByNodeId,
  connectedNodeSignalsCopy,
  learningRowMatchesCanvasNode,
} from "@/lib/brain/brain-connected-signals-ui";
import { countVisualImageAnalysisDisposition } from "@/lib/brain/brain-learning-provenance";
import { fetchBrainTelemetrySummaryByNodeId } from "@/lib/brain/fetch-brain-telemetry-summary";
import { labelForBrainNodeSource, stripLearningValueUiPrefixes } from "@/lib/brain/brain-review-labels";
import { readResponseJson } from "@/lib/read-response-json";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeLabel } from "./foldder-node-ui";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { getBrainVersion, isBrainAnalysisStale } from "@/lib/brain/brain-meta";
import { useProjectBrainCanvas } from "./project-brain-canvas-context";

export type ProjectBrainNodeData = {
  label?: string;
};

type TelemetryRowUi = { summaryLine: string | null; lastAt: string | null };

function BrainNodeHeader({
  adnTotal,
  introActive,
}: {
  adnTotal: number;
  introActive: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-zinc-200/70 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-violet-200/80 bg-violet-50 ${
            introActive ? "ring-2 ring-cyan-400/45" : ""
          }`}
        >
          <Brain className="h-3.5 w-3.5 text-violet-700" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-[11px] font-semibold tracking-tight text-zinc-900">Brain</h2>
            <span className="rounded-[5px] border border-zinc-200/90 bg-zinc-50 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-zinc-500">
              Project
            </span>
          </div>
          <p className="text-[9px] text-zinc-500">Memoria creativa</p>
        </div>
      </div>
      <div
        className="shrink-0 rounded-[5px] border border-violet-100 bg-violet-50/90 px-2 py-0.5 text-center tabular-nums"
        title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}
      >
        <p className="text-[7px] font-semibold uppercase tracking-wide text-violet-700">ADN</p>
        <p className="text-base font-semibold leading-none text-violet-900">{adnTotal}</p>
      </div>
    </header>
  );
}

function BrainQuickStats({ activos, nodos, pendientes }: { activos: number; nodos: number; pendientes: number }) {
  return (
    <p
      className="text-[10px] font-medium tabular-nums leading-snug text-zinc-700"
      title="Activos = documentos y enlaces en conocimiento. Nodos = creativos enlazados al Brain. Por revisar = cola de aprendizajes pendientes (ver procedencia en Studio)."
    >
      {activos} activos · {nodos} nodos · {pendientes} pendientes
    </p>
  );
}

function BrainBrandChips({
  hasLogo,
  hasPalette,
  hasVoice,
  imageCount,
  visionRealCount,
}: {
  hasLogo: boolean;
  hasPalette: boolean;
  hasVoice: boolean;
  imageCount: number;
  visionRealCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {hasLogo ? (
        <span className="rounded-[5px] border border-emerald-200/80 bg-emerald-50/90 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-emerald-900">
          Logo
        </span>
      ) : null}
      {hasPalette ? (
        <span className="rounded-[5px] border border-sky-200/80 bg-sky-50/90 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-sky-900">
          Paleta
        </span>
      ) : null}
      {hasVoice ? (
        <span className="rounded-[5px] border border-violet-200/80 bg-violet-50/90 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-violet-900">
          Voz
        </span>
      ) : null}
      {imageCount > 0 ? (
        <span
          title={BRAIN_IMAGE_INVENTORY_NODE_TOOLTIP_ES}
          className="rounded-[5px] border border-indigo-200/80 bg-indigo-50/90 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-indigo-900"
        >
          {imageCount} img
        </span>
      ) : null}
      {visionRealCount > 0 ? (
        <span
          title={BRAIN_VISION_REAL_COUNT_NODE_TOOLTIP_ES}
          className="rounded-[5px] border border-emerald-200/80 bg-emerald-50/90 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-emerald-900"
        >
          {visionRealCount} visión
        </span>
      ) : null}
    </div>
  );
}

function BrainConnectedNodesSummary({
  clients,
  expanded,
  pendingByNodeId,
  telemetryByNodeId,
}: {
  clients: ReturnType<typeof listDownstreamBrainClients>;
  expanded: boolean;
  pendingByNodeId: Map<string, number>;
  telemetryByNodeId: Record<string, TelemetryRowUi>;
}) {
  if (clients.length === 0) {
    return (
      <p className="text-[9px] leading-snug text-zinc-500">
        Sin enlaces al puerto Brain. Conecta Designer, Photoroom u otros creativos.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {clients.map((c) => {
        const tel = telemetryByNodeId[c.id];
        const pendN = pendingByNodeId.get(c.id) ?? 0;
        const typeLabel = labelForBrainNodeSource(c.brainNodeType);
        const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
          summaryLine: tel?.summaryLine ?? null,
          lastAt: tel?.lastAt ?? null,
          pendingCount: pendN,
          expanded,
        });
        return (
          <li key={c.id} className="text-[9px] leading-snug text-zinc-800">
            <div className="font-semibold text-zinc-900">{c.label}</div>
            <div className="text-[8px] font-medium uppercase tracking-wide text-zinc-500">{typeLabel}</div>
            <div className="mt-0.5 text-zinc-800" title={BRAIN_RECENT_SIGNALS_TOOLTIP_ES}>
              {signalsLine}
            </div>
            {pendingLine ? (
              <div className="mt-0.5 text-zinc-700" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
                {pendingLine}
              </div>
            ) : null}
            {lastSignalLine ? <div className="mt-0.5 text-[8px] text-zinc-500">{lastSignalLine}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function BrainPendingSummary({
  count,
  samples,
}: {
  count: number;
  samples: string[];
}) {
  if (count === 0) {
    return (
      <p className="text-[9px] font-medium text-emerald-800" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
        Sin pendientes
      </p>
    );
  }
  return (
    <div className="space-y-0.5" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
      <p className="text-[9px] font-semibold text-amber-900">
        {count} {count === 1 ? "pendiente" : "pendientes"}
      </p>
      {samples.length > 0 && (
        <ul className="space-y-0.5 text-[8px] leading-snug text-amber-950/90">
          {samples.map((s, i) => (
            <li key={i} className="truncate">
              · {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ProjectBrainNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as ProjectBrainNodeData;
  const ctx = useProjectBrainCanvas();
  const assets = useMemo(() => normalizeProjectAssets(ctx?.assetsMetadata), [ctx?.assetsMetadata]);
  const adn = useMemo(() => computeAdnScore(assets), [assets]);

  const pdfCount = assets.knowledge.documents.filter((d) => d.mime === "application/pdf").length;
  const coreCount = assets.knowledge.documents.filter((d) => d.scope !== "context").length;
  const contextCount = assets.knowledge.documents.filter((d) => d.scope === "context").length;
  const linkCount = assets.knowledge.urls.length;
  const imageDocCount = assets.knowledge.documents.filter((d) => d.mime.toLowerCase().startsWith("image/")).length;
  const visualRefCount = useMemo(() => collectVisualImageAssetRefs(assets).length, [assets]);
  const visionDisposition = useMemo(
    () => countVisualImageAnalysisDisposition(assets.strategy.visualReferenceAnalysis?.analyses),
    [assets.strategy.visualReferenceAnalysis?.analyses],
  );
  const assetLikeCount = imageDocCount + visualRefCount;

  const hasLogo = Boolean(assets.brand.logoPositive || assets.brand.logoNegative);
  const hasPalette = [assets.brand.colorPrimary, assets.brand.colorSecondary, assets.brand.colorAccent].some(
    (c) => typeof c === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(c.trim()),
  );
  const hasVoice =
    assets.strategy.voiceExamples.length +
      assets.strategy.approvedPhrases.length +
      assets.strategy.languageTraits.length >
    0;

  const brainClients = useMemo(
    () => listDownstreamBrainClients(ctx?.flowNodes ?? undefined, ctx?.flowEdges ?? undefined),
    [ctx?.flowNodes, ctx?.flowEdges],
  );

  const totalActives = assets.knowledge.documents.length + assets.knowledge.urls.length;

  const [pendingRows, setPendingRows] = useState<StoredLearningCandidate[]>([]);
  const [telemetryByNodeId, setTelemetryByNodeId] = useState<Record<string, TelemetryRowUi>>({});
  /** Evita scroll interno: lista acotada + «Ver todos» al expandir el nodo. */
  const [showAllBrainClients, setShowAllBrainClients] = useState(false);

  const projectId = ctx?.projectScopeId && ctx.projectScopeId !== "__local__" ? ctx.projectScopeId : null;

  useEffect(() => {
    if (!projectId?.trim()) {
      setPendingRows([]);
      setTelemetryByNodeId({});
      return;
    }
    const clientIds = brainClients.map((c) => c.id).filter(Boolean);
    let cancelled = false;
    (async () => {
      try {
        const pendUrl = `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(projectId.trim())}`;
        const [pRes, telMap] = await Promise.all([
          fetch(pendUrl),
          clientIds.length > 0
            ? fetchBrainTelemetrySummaryByNodeId(projectId.trim(), clientIds)
            : Promise.resolve({} as Record<string, TelemetryRowUi>),
        ]);
        if (cancelled) return;
        const pJson = await readResponseJson<{ items?: StoredLearningCandidate[] }>(pRes, "brain/pending");
        const items = pJson?.items ?? [];
        setPendingRows(items);

        if (cancelled) return;
        setTelemetryByNodeId(telMap);
      } catch {
        if (!cancelled) {
          setPendingRows([]);
          setTelemetryByNodeId({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, ctx?.assetsMetadata, brainClients]);

  const pendingByNodeId = useMemo(() => buildPendingCountByNodeId(pendingRows), [pendingRows]);

  const pendingLinkedRows = useMemo(() => {
    if (!brainClients.length) return pendingRows;
    return pendingRows.filter((r) =>
      brainClients.some((c) => learningRowMatchesCanvasNode(r, c.id, c.brainNodeType)),
    );
  }, [pendingRows, brainClients]);

  const pendingCount = pendingLinkedRows.length;

  const pendingSamples = useMemo(() => {
    return pendingLinkedRows
      .slice(0, 2)
      .map((r) => stripLearningValueUiPrefixes(r.candidate.value).trim())
      .filter(Boolean)
      .map((v) => (v.length > 72 ? `${v.slice(0, 69)}…` : v));
  }, [pendingLinkedRows]);

  const variant = useMemo(() => {
    if (pendingCount > 0) return "attention" as const;
    if (totalActives === 0 && brainClients.length === 0) return "empty" as const;
    if (adn.total >= 72 && brainClients.length > 0 && pendingCount === 0) return "healthy" as const;
    return "partial" as const;
  }, [adn.total, brainClients.length, pendingCount, totalActives]);

  const shellClass =
    variant === "attention"
      ? "border-amber-300/90 bg-gradient-to-b from-amber-50/95 to-white shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
      : variant === "healthy"
        ? "border-emerald-200/90 bg-gradient-to-b from-emerald-50/50 to-white"
        : variant === "empty"
          ? "border-zinc-200 bg-zinc-50/40"
          : "border-zinc-200/90 bg-white";

  const openStudio = useCallback(() => {
    ctx?.openProjectBrain?.();
    if (!ctx?.openProjectBrain && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-open-project-brain"));
    }
  }, [ctx]);

  const openReview = useCallback(() => {
    if (ctx?.openProjectBrainReview) {
      ctx.openProjectBrainReview();
      return;
    }
    openStudio();
  }, [ctx, openStudio]);

  const introActive = !!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro;
  const expanded = Boolean(selected);

  useEffect(() => {
    setShowAllBrainClients(false);
  }, [expanded]);

  const brainClientsVisibleCap = expanded ? (showAllBrainClients ? brainClients.length : 5) : 2;
  const brainClientsVisible = useMemo(
    () => brainClients.slice(0, brainClientsVisibleCap),
    [brainClients, brainClientsVisibleCap],
  );
  const brainClientsHasMore = expanded && brainClients.length > brainClientsVisibleCap;

  return (
    <div
      className={`custom-node tool-node rounded-[5px] border ${shellClass} ${
        expanded ? "shadow-lg ring-2 ring-violet-400/35" : "shadow-sm"
      }`}
      style={{ width: 300, minHeight: expanded ? 260 : 200, padding: "11px 12px" }}
    >
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Brain" />

      <div className="flex min-w-0 flex-col gap-2">
        <BrainNodeHeader adnTotal={adn.total} introActive={introActive} />

        <BrainQuickStats activos={totalActives} nodos={brainClients.length} pendientes={pendingCount} />

        {isBrainAnalysisStale(assets.brainMeta) ? (
          <p className="rounded-[5px] border border-amber-200/80 bg-amber-50/90 px-2 py-1 text-[8px] font-medium text-amber-900">
            Material o análisis desactualizado: revisa Brain Studio.
          </p>
        ) : null}

        <section className="rounded-[5px] border border-zinc-200/70 bg-zinc-50/50 px-2 py-1.5">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">Conocimiento</p>
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-zinc-800">
            {coreCount} core · {pdfCount} PDF{pdfCount === 1 ? "" : "s"} · {assetLikeCount} assets
            {linkCount > 0 ? ` · ${linkCount} enlaces` : ""}
          </p>
          <p className="mt-0.5 text-[9px] text-zinc-600">
            {contextCount > 0 ? `${contextCount} contexto` : "Sin contexto externo"}
          </p>
        </section>

        <section className="rounded-[5px] border border-zinc-200/70 bg-white/90 px-2 py-1.5">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">Marca</p>
          <div className="mt-1">
            <BrainBrandChips
              hasLogo={hasLogo}
              hasPalette={hasPalette}
              hasVoice={hasVoice}
              imageCount={visualRefCount}
              visionRealCount={visionDisposition.realRemoteAnalyzed}
            />
          </div>
        </section>

        <section className="rounded-[5px] border border-zinc-200/70 bg-zinc-50/40 px-2 py-1.5">
          <div className="flex items-center gap-1">
            <Link2 className="h-2.5 w-2.5 shrink-0 text-zinc-400" aria-hidden />
            <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">Nodos</p>
          </div>
          <p className="mt-0.5 text-[8px] leading-snug text-zinc-500">Señales y colas por nodo enlazado.</p>
          <div className="mt-1">
            <BrainConnectedNodesSummary
              clients={brainClientsVisible}
              expanded={expanded}
              pendingByNodeId={pendingByNodeId}
              telemetryByNodeId={telemetryByNodeId}
            />
          </div>
          {brainClientsHasMore && !showAllBrainClients ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAllBrainClients(true);
              }}
              className="nodrag mt-1 w-full rounded-[5px] border border-zinc-200/80 bg-white py-1 text-center text-[8px] font-medium text-violet-700 hover:bg-violet-50"
            >
              Ver todos ({brainClients.length})
            </button>
          ) : null}
          {expanded && showAllBrainClients && brainClients.length > 5 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAllBrainClients(false);
              }}
              className="nodrag mt-1 w-full rounded-[5px] border border-transparent py-0.5 text-center text-[8px] font-medium text-zinc-500 hover:text-zinc-800"
            >
              Mostrar menos
            </button>
          ) : null}
          {!expanded && brainClients.length > 2 ? (
            <p className="mt-1 text-[8px] text-zinc-500">Selecciona el nodo para ver más detalle.</p>
          ) : null}
          {process.env.NODE_ENV === "development" ? (
            <p className="mt-1 text-[7px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
          ) : null}
        </section>

        <section className="rounded-[5px] border border-zinc-200/70 bg-white/90 px-2 py-1.5">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">Pendientes</p>
          <div className="mt-0.5">
            <BrainPendingSummary count={pendingCount} samples={pendingSamples} />
          </div>
        </section>

        {expanded && process.env.NODE_ENV === "development" ? (
          <p className="text-[7px] leading-snug text-zinc-400">Brain v{getBrainVersion(assets.brainMeta)}</p>
        ) : null}

        <footer className="mt-auto flex flex-col gap-1.5 border-t border-zinc-200/70 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openStudio();
            }}
            className="nodrag w-full rounded-[5px] border border-violet-600 bg-violet-600 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          >
            Abrir Brain
          </button>
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openReview();
              }}
              className="nodrag w-full rounded-[5px] border border-amber-300/90 bg-amber-50/90 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-amber-950 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              Revisar pendientes
            </button>
          ) : null}
        </footer>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "38%" }}>
        <span className="handle-label sr-only">Salida prompt</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
      <div className="handle-wrapper handle-right" style={{ top: "62%" }}>
        <span className="handle-label sr-only">Salida Brain</span>
        <FoldderDataHandle type="source" position={Position.Right} id="brain" dataType="brain" />
      </div>
    </div>
  );
});

ProjectBrainNode.displayName = "ProjectBrainNode";
