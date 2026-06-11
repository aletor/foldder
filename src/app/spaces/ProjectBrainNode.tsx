"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Brain, Link2 } from "lucide-react";
import { BRAIN_ADN_COMPLETENESS_TOOLTIP_ES, computeAdnScore } from "@/lib/brain/brain-adn-score";
import { listDownstreamBrainClients } from "@/lib/brain/brain-canvas-brain-links";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import { learningRowMatchesCanvasNode } from "@/lib/brain/brain-connected-signals-ui";
import {
  BRAIN_TELEMETRY_SYNCED_EVENT,
  type BrainTelemetrySyncedEventDetail,
} from "@/lib/brain/brain-telemetry-client";
import { fetchBrainTelemetrySummaryByNodeId } from "@/lib/brain/fetch-brain-telemetry-summary";
import { labelForBrainNodeSource } from "@/lib/brain/brain-review-labels";
import { readResponseJson } from "@/lib/read-response-json";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { FoldderNodeHeaderTitle, NodeLabel } from "./foldder-node-ui";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { useProjectBrainCanvas } from "./project-brain-canvas-context";

export type ProjectBrainNodeData = {
  label?: string;
};

type TelemetryRowUi = { summaryLine: string | null; lastAt: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ProjectBrainNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as ProjectBrainNodeData;
  const ctx = useProjectBrainCanvas();
  const assets = useMemo(() => normalizeProjectAssets(ctx?.assetsMetadata), [ctx?.assetsMetadata]);
  const adn = useMemo(() => computeAdnScore(assets), [assets]);

  const visualRefCount = useMemo(() => collectVisualImageAssetRefs(assets).length, [assets]);
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
  const brainClientIds = useMemo(() => brainClients.map((c) => c.id).filter(Boolean), [brainClients]);
  const brainClientIdsKey = useMemo(() => brainClientIds.join("|"), [brainClientIds]);

  const totalActives = assets.knowledge.documents.length + assets.knowledge.urls.length;

  const [pendingRows, setPendingRows] = useState<StoredLearningCandidate[]>([]);
  const [telemetryByNodeId, setTelemetryByNodeId] = useState<Record<string, TelemetryRowUi>>({});
  const projectId = ctx?.projectScopeId && ctx.projectScopeId !== "__local__" ? ctx.projectScopeId : null;

  const refreshTelemetrySummary = useCallback(async () => {
    if (!projectId?.trim()) {
      setTelemetryByNodeId({});
      return;
    }
    const clientIds = brainClientIdsKey ? brainClientIdsKey.split("|").filter(Boolean) : [];
    try {
      const map = clientIds.length
        ? await fetchBrainTelemetrySummaryByNodeId(projectId.trim(), clientIds)
        : {};
      setTelemetryByNodeId(map);
    } catch {
      setTelemetryByNodeId({});
    }
  }, [projectId, brainClientIdsKey]);

  useEffect(() => {
    if (!projectId?.trim()) {
      const t = window.setTimeout(() => {
        setPendingRows([]);
        setTelemetryByNodeId({});
      }, 0);
      return () => window.clearTimeout(t);
    }
    const clientIds = brainClientIdsKey ? brainClientIdsKey.split("|").filter(Boolean) : [];
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
  }, [projectId, brainClientIdsKey]);

  useEffect(() => {
    if (!projectId?.trim() || !brainClientIds.length) return;
    const knownClientIds = new Set(brainClientIds);
    const handleTelemetrySynced = (event: Event) => {
      const detail = (event as CustomEvent<BrainTelemetrySyncedEventDetail>).detail;
      if (!detail || detail.projectId !== projectId.trim() || !knownClientIds.has(detail.nodeId)) return;
      void refreshTelemetrySummary();
    };
    window.addEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, handleTelemetrySynced);
    return () => {
      window.removeEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, handleTelemetrySynced);
    };
  }, [projectId, brainClientIds, refreshTelemetrySummary]);

  const pendingLinkedRows = useMemo(() => {
    if (!brainClients.length) return pendingRows;
    return pendingRows.filter((r) =>
      brainClients.some((c) => learningRowMatchesCanvasNode(r, c.id, c.brainNodeType)),
    );
  }, [pendingRows, brainClients]);

  const pendingCount = pendingLinkedRows.length;

  const openStudio = useCallback(() => {
    ctx?.openProjectBrain?.();
    if (!ctx?.openProjectBrain && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-open-project-brain"));
    }
  }, [ctx]);

  const introActive = !!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro;
  const expanded = Boolean(selected);

  const normalizeCardHex = useCallback((value: string | null | undefined, fallback: string) => {
    const v = String(value ?? "").trim();
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
  }, []);
  const primaryColor = normalizeCardHex(assets.brand.colorPrimary, "#7c3aed");
  const secondaryColor = normalizeCardHex(assets.brand.colorSecondary, "#f5f0ff");
  const accentColor = normalizeCardHex(assets.brand.colorAccent, "#c4b5fd");
  const atmosphereImage =
    assets.strategy.visualReferenceAnalysis?.dnaCollageImageDataUrl ||
    assets.strategy.visualStyle.environment.imageUrl ||
    assets.strategy.visualStyle.protagonist.imageUrl ||
    null;
  const totalLooks = (assets.strategy.visualCapsules ?? []).filter((capsule) => capsule.status !== "archived").length;
  const connectedPrimary = brainClients[0];
  const connectedLabel = connectedPrimary ? labelForBrainNodeSource(connectedPrimary.brainNodeType) : "Sin nodos";
  const connectedLine = connectedPrimary
    ? `${connectedLabel} conectado${brainClients.length > 1 ? ` +${brainClients.length - 1}` : ""}`
    : "Conecta Designer o Photoroom";
  const signalLine = connectedPrimary
    ? telemetryByNodeId[connectedPrimary.id]?.lastAt
      ? "Última señal · ahora"
      : "Aprendiendo de señales"
    : "Esperando señales creativas";
  const activeCount =
    totalActives + visualRefCount + totalLooks + (hasVoice ? 1 : 0) + (hasPalette ? 1 : 0) + (hasLogo ? 1 : 0);
  const headerTitle = nodeData.label?.trim() && !/\.(jpg|jpeg|png|webp|mp4)$/i.test(nodeData.label.trim())
    ? nodeData.label.trim()
    : "Brain";

  return (
    <div
      className={`custom-node tool-node project-brain-node foldder-node--frameless node--glass group/node relative text-zinc-950 ${
        expanded ? "ring-2 ring-violet-400/45" : ""
      } ${introActive ? "ring-2 ring-cyan-300/60" : ""}`}
      style={{
        width: 332,
        height: 332,
        backgroundColor: secondaryColor,
        "--foldder-node-header-tint-color": primaryColor,
        "--foldder-node-output-color": primaryColor,
      } as React.CSSProperties}
    >
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Brain" />

      <div className="node-header">
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10">
          <span className="absolute inset-0 rounded-md bg-white/15 opacity-0 transition-opacity group-hover/node:opacity-100" />
          <Brain className="relative h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
        </span>
        <FoldderNodeHeaderTitle
          className="min-w-0 flex-1 uppercase leading-tight tracking-[0.14em]"
          introActive={introActive}
        >
          {headerTitle}
        </FoldderNodeHeaderTitle>
        <div className="node-badge" title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}>
          ADN {adn.total}
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl"
        style={{
          background: atmosphereImage
            ? `linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,255,255,0.22) 44%, rgba(255,255,255,0.82) 100%), url(${atmosphereImage}) center/cover no-repeat`
            : `radial-gradient(circle at 76% 24%, ${accentColor}72 0, transparent 32%), linear-gradient(135deg, ${secondaryColor}, #fff7f2 48%, ${primaryColor}1d)`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_14%,rgba(255,255,255,0.84),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.66))]" />
        <div
          className="absolute -right-12 top-9 h-44 w-44 rounded-full opacity-55 blur-2xl"
          style={{ backgroundColor: `${primaryColor}50` }}
        />

        <div className="relative flex min-h-0 flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-h-[86px] min-w-0 flex-1 items-center justify-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] border border-white/60 bg-white/50 shadow-[0_18px_42px_rgba(91,68,145,0.16)] backdrop-blur-md">
                {assets.brand.logoPositive || assets.brand.logoNegative ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assets.brand.logoPositive || assets.brand.logoNegative || ""}
                    alt=""
                    className="h-16 w-16 object-contain"
                  />
                ) : (
                  <Brain className="h-11 w-11 text-violet-600" strokeWidth={1.65} aria-hidden />
                )}
              </div>
            </div>

            <div
              className="shrink-0 rounded-2xl border border-violet-200/70 bg-white/54 px-3 py-2 text-center shadow-[0_12px_28px_rgba(91,68,145,0.14)] backdrop-blur-md"
              title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}
            >
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-violet-600">ADN</p>
              <p className="text-[30px] font-black leading-none text-violet-700">{adn.total}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-medium tracking-[-0.03em] text-zinc-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <span>{activeCount} activos</span>
            <span className="text-zinc-400">·</span>
            <span>{brainClients.length} {brainClients.length === 1 ? "nodo" : "nodos"}</span>
            <span className="text-zinc-400">·</span>
            <span>{pendingCount} pendientes</span>
          </div>

          <div className="mb-2 mt-auto space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/58 bg-white/54 px-3 py-2.5 shadow-[0_12px_28px_rgba(91,68,145,0.12)] backdrop-blur-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100/80 text-violet-700">
                <Link2 className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold tracking-[-0.03em] text-zinc-950">{connectedLine}</p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-zinc-500">{signalLine}</p>
              </div>
              <div className="h-8 w-px bg-zinc-300/75" />
              <div className="shrink-0 rounded-[13px] bg-white/62 px-2.5 py-1.5 text-center shadow-sm">
                <p className="text-[22px] font-black leading-none text-violet-700">{totalLooks}</p>
                <p className="text-[9px] font-medium text-zinc-500">looks</p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
              className="nodrag action-btn group flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-3 text-center text-[15px] font-black uppercase tracking-[0.16em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"
            >
              Abrir Brain
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
          </div>
        </div>
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
