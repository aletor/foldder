"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { NodeResizer, Position, type NodeProps } from "@xyflow/react";
import {
  BRAIN_ADN_COMPLETENESS_TOOLTIP_ES,
  computeAdnScore,
} from "@/lib/brain/brain-adn-score";
import { listDownstreamBrainClients } from "@/lib/brain/brain-canvas-brain-links";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import { learningRowMatchesCanvasNode } from "@/lib/brain/brain-connected-signals-ui";
import { readResponseJson } from "@/lib/read-response-json";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeLabel } from "./foldder-node-ui";
import { hasFoldderStudioTouched } from "./studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "./studio-node/foldder-studio-touched-mark";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { useProjectBrainCanvas } from "./project-brain-canvas-context";

const BRAIN_EMPTY_BACKGROUND_SRC = "/assets/nodes/brain-empty.jpg";

export type ProjectBrainNodeData = {
  label?: string;
};

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

  const totalActives = assets.knowledge.documents.length + assets.knowledge.urls.length;

  const [pendingRows, setPendingRows] = useState<StoredLearningCandidate[]>([]);
  const projectId = ctx?.projectScopeId && ctx.projectScopeId !== "__local__" ? ctx.projectScopeId : null;

  useEffect(() => {
    if (!projectId?.trim()) {
      const t = window.setTimeout(() => {
        setPendingRows([]);
      }, 0);
      return () => window.clearTimeout(t);
    }
    let cancelled = false;
    void (async () => {
      try {
        const pendUrl = `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(projectId.trim())}`;
        const pRes = await fetch(pendUrl);
        if (cancelled) return;
        const pJson = await readResponseJson<{ items?: StoredLearningCandidate[] }>(pRes, "brain/pending");
        setPendingRows(pJson?.items ?? []);
      } catch {
        if (!cancelled) setPendingRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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

  const normalizeCardHex = useCallback((value: string | null | undefined, fallback: string) => {
    const v = String(value ?? "").trim();
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
  }, []);
  const primaryColor = normalizeCardHex(assets.brand.colorPrimary, "#7c3aed");
  const atmosphereImage =
    assets.strategy.visualReferenceAnalysis?.dnaCollageImageDataUrl ||
    assets.strategy.visualStyle.environment.imageUrl ||
    assets.strategy.visualStyle.protagonist.imageUrl ||
    null;
  const totalLooks = (assets.strategy.visualCapsules ?? []).filter((capsule) => capsule.status !== "archived").length;
  const activeCount =
    totalActives + visualRefCount + totalLooks + (hasVoice ? 1 : 0) + (hasPalette ? 1 : 0) + (hasLogo ? 1 : 0);
  const headerTitle = nodeData.label?.trim() && !/\.(jpg|jpeg|png|webp|mp4)$/i.test(nodeData.label.trim())
    ? nodeData.label.trim()
    : "BrandKit";
  const hasPreview = Boolean(atmosphereImage);
  const nodesLabel = brainClients.length === 1 ? "nodo" : "nodos";

  return (
    <div
      className={`custom-node tool-node foldder-studio-node foldder-studio-node--projectBrain project-brain-node foldder-node--frameless node--media group/node relative ${
        hasPreview ? "project-brain-node--has-preview" : "project-brain-node--empty foldder-frameless-label-dark"
      } ${selected ? "ring-2 ring-violet-400/45" : ""} ${introActive ? "ring-2 ring-cyan-300/60" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 200,
        minHeight: 280,
        padding: 0,
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
        "--foldder-node-card-bg": "#b8bec8",
        "--foldder-frameless-accent": "#1f2328",
        "--foldder-node-header-tint-color": primaryColor,
        "--foldder-node-output-color": primaryColor,
      } as React.CSSProperties}
    >
      <NodeResizer minWidth={200} minHeight={280} maxWidth={960} maxHeight={2200} isVisible={selected} />
      {hasFoldderStudioTouched(nodeData as Record<string, unknown>) ? (
        <FoldderStudioTouchedMark nodeType="projectBrain" />
      ) : null}
      <NodeLabel id={id} label={nodeData.label} defaultLabel="BrandKit" />

      <div className="node-content project-brain-node-content foldder-frameless-main relative overflow-hidden">
        {hasPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={atmosphereImage!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="brain-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAIN_EMPTY_BACKGROUND_SRC}
              alt=""
              className="brain-empty-background__img h-full w-full object-cover object-center"
              draggable={false}
            />
          </div>
        )}

        <div className="project-brain-node-scrim pointer-events-none absolute inset-0 z-[2]" aria-hidden />

        <span
          className="project-brain-node-media-tag absolute left-3 top-[42px] z-[8] max-w-[calc(100%-24px)] truncate"
          title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}
        >
          ADN {adn.total}
        </span>

        <div className="project-brain-node-footer absolute inset-x-0 bottom-0 z-[8] px-3 pb-3 pt-10">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-tight tracking-[-0.02em]">
                {headerTitle}
              </p>
              <p className="project-brain-node-stats mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="project-brain-node-stats-dot shrink-0"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden
                  />
                  {activeCount} activos
                </span>
                <span className="project-brain-node-stats-sep" aria-hidden>
                  ·
                </span>
                <span>
                  {brainClients.length} {nodesLabel}
                </span>
                <span className="project-brain-node-stats-sep" aria-hidden>
                  ·
                </span>
                <span className={pendingCount > 0 ? "project-brain-node-stats-pending" : undefined}>
                  {pendingCount} pendientes
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
              className="project-brain-node-open-btn foldder-node-footer-button nodrag inline-flex shrink-0 items-center gap-1.5 rounded-none border-0 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-black shadow-none transition hover:bg-[#f7f7f4]"
            >
              Abrir BrandKit
            </button>
          </div>
        </div>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">BrandKit out</span>
        <FoldderDataHandle type="source" position={Position.Right} id="brain" dataType="brain" />
      </div>
    </div>
  );
});

ProjectBrainNode.displayName = "ProjectBrainNode";
