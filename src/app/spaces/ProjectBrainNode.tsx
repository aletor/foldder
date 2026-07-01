"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import {
  BRAIN_ADN_COMPLETENESS_TOOLTIP_ES,
  computeAdnScore,
} from "@/lib/brain/brain-adn-score";
import { listDownstreamBrainClients } from "@/lib/brain/brain-canvas-brain-links";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import { learningRowMatchesCanvasNode } from "@/lib/brain/brain-connected-signals-ui";
import { readResponseJson } from "@/lib/read-response-json";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "./canvas-grid-layout";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "./foldder-node-ui";
import { nodeFrameNeedsSync, resolveNodeFrameWidth } from "./studio-node-aspect";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { useProjectBrainCanvas } from "./project-brain-canvas-context";
import {
  StudioCanvasNodeShell,
  type StudioCanvasNodeHandleSpec,
} from "./studio-node/studio-canvas-node";
import { hasFoldderStudioTouched } from "./studio-node/foldder-studio-touched";
import { resolveFoldderNodeStudioBackground } from "./studio-node/foldder-studio-node-backgrounds";

const PROJECT_BRAIN_HANDLES: StudioCanvasNodeHandleSpec[] = [
  {
    side: "right",
    top: "50%",
    style: { transform: "translateY(-50%)" },
    type: "source",
    id: "brain",
    dataType: "brain",
    label: "BrandKit out",
  },
];

const BRANDKIT_EMPTY_BACKGROUND_SRC = resolveFoldderNodeStudioBackground("projectBrain");
const BRANDKIT_SHELL_ACCENT = "#b8bec8";
const BRANDKIT_DOCK_ACCENT = "#5e8e70";
const BRANDKIT_NODE_MAX_HEIGHT = 2200;
const BRANDKIT_DOCK_MIN_CHROME = 180;
const BRANDKIT_CONNECTED_PREVIEW_MIN = 140;

export type ProjectBrainNodeData = {
  label?: string;
};

function resolveBrandkitNodeHeight(args: {
  baseHeight: number;
  hasDock: boolean;
}): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    BRANDKIT_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, BRANDKIT_CONNECTED_PREVIEW_MIN + BRANDKIT_DOCK_MIN_CHROME)),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ProjectBrainNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as ProjectBrainNodeData;
  const ctx = useProjectBrainCanvas();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameSyncKeyRef = useRef<string | null>(null);
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
  const totalLooks = (assets.strategy.visualCapsules ?? []).filter((capsule) => capsule.status !== "archived").length;
  const activeCount =
    totalActives + visualRefCount + totalLooks + (hasVoice ? 1 : 0) + (hasPalette ? 1 : 0) + (hasLogo ? 1 : 0);

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

  const atmosphereImage =
    assets.strategy.visualReferenceAnalysis?.dnaCollageImageDataUrl ||
    assets.strategy.visualStyle.environment.imageUrl ||
    assets.strategy.visualStyle.protagonist.imageUrl ||
    null;
  const hasPreview = Boolean(atmosphereImage);
  const headerTitle = nodeData.label?.trim() && !/\.(jpg|jpeg|png|webp|mp4)$/i.test(nodeData.label.trim())
    ? nodeData.label.trim()
    : "BrandKit";
  const hasConnections = brainClients.length > 0;
  const hasContent = activeCount > 0 || hasPreview || adn.total > 0;
  const hasDock = hasContent || hasConnections || pendingCount > 0;
  const isEmpty = !hasDock;
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
  const showConnectedIcon = hasConnections;
  const showExteriorTile = !isEmpty && (studioTouched || showConnectedIcon);

  const nodesLabel = brainClients.length === 1 ? "1 nodo" : `${brainClients.length} nodos`;
  const activosLabel = `${activeCount} activo${activeCount === 1 ? "" : "s"}`;
  const pendientesLabel = pendingCount > 0 ? String(pendingCount) : "—";
  const salidaLabel = hasConnections ? nodesLabel : "—";
  const adnLabel = `ADN ${adn.total}`;
  const statusLabel = pendingCount > 0
    ? hasConnections
      ? "Pendientes · Conectado"
      : "Pendientes"
    : hasConnections
      ? "Conectado"
      : hasContent
        ? adn.total >= 80
          ? "Completo"
          : "Configurado"
        : "Vacío";
  const previewLine = hasContent
    ? `${adnLabel} · ${activosLabel}${hasConnections ? ` · ${nodesLabel}` : ""}`
    : hasConnections
      ? `Salida conectada a ${nodesLabel}`
      : "Define marca, voz y referencias visuales.";

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("projectBrain");
    if (!baseFrame) return;

    if (isEmpty) {
      const syncKey = "brandkit-base";
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          if (!nodeFrameNeedsSync(n, baseFrame)) return n;
          return {
            ...n,
            width: baseFrame.width,
            height: baseFrame.height,
            measured: { width: baseFrame.width, height: baseFrame.height },
            style: { ...(n.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height, minHeight: baseFrame.height },
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const measuredHeight = resolveBrandkitNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
    const syncKey = `brandkit-content:${hasPreview ? "preview" : "meta"}:${hasConnections ? "connected" : "idle"}:${measuredHeight}:${activeCount}:${pendingCount}`;
    if (frameSyncKeyRef.current === syncKey) return;

    frameSyncKeyRef.current = syncKey;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const resolvedWidth = resolveNodeFrameWidth(n, baseFrame.width);
        const resolvedTarget = { width: resolvedWidth, height: measuredHeight };
        if (!nodeFrameNeedsSync(n, resolvedTarget)) return n;
        return {
          ...n,
          width: resolvedWidth,
          height: measuredHeight,
          measured: { width: resolvedWidth, height: measuredHeight },
          style: {
            ...(n.style as React.CSSProperties),
            width: resolvedWidth,
            height: measuredHeight,
            minHeight: measuredHeight,
            maxHeight: BRANDKIT_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    activeCount,
    hasConnections,
    hasPreview,
    id,
    isEmpty,
    pendingCount,
    setNodes,
    updateNodeInternals,
  ]);

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="projectBrain"
      selected={selected}
      label={nodeData.label}
      defaultLabel="BrandKit"
      title="BRANDKIT"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      minWidth={200}
      className={`project-brain-node foldder-frameless-label-dark${hasDock ? " project-brain-node--has-content" : " project-brain-node--empty"}${hasPreview ? " project-brain-node--has-preview" : ""}${hasConnections ? " project-brain-node--connected" : ""}`}
      handles={PROJECT_BRAIN_HANDLES}
      variant="frameless"
      material="media"
      studioTouched={showExteriorTile && studioTouched}
      exteriorTileMark={showExteriorTile && showConnectedIcon}
      style={
        {
          minWidth: 200,
          minHeight: hasDock ? BRANDKIT_DOCK_MIN_CHROME + BRANDKIT_CONNECTED_PREVIEW_MIN : 280,
          "--foldder-node-card-bg": hasDock ? BRANDKIT_DOCK_ACCENT : BRANDKIT_SHELL_ACCENT,
          "--foldder-frameless-glass-bg": BRANDKIT_SHELL_ACCENT,
          "--foldder-frameless-accent": BRANDKIT_SHELL_ACCENT,
          "--foldder-node-header-tint-color": assets.brand.colorPrimary?.trim() || BRANDKIT_DOCK_ACCENT,
          "--foldder-node-output-color": assets.brand.colorPrimary?.trim() || BRANDKIT_DOCK_ACCENT,
        } as React.CSSProperties
      }
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={BRANDKIT_NODE_MAX_HEIGHT} isVisible={selected} />
      <div
        className={`node-content foldder-frameless-main project-brain-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div className="project-brain-node-preview-area foldder-node-content-preview-area">
          {hasPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={atmosphereImage!}
              alt=""
              className="project-brain-node-preview-img"
              draggable={false}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={BRANDKIT_EMPTY_BACKGROUND_SRC}
              alt=""
              className="project-brain-node-bg"
              draggable={false}
            />
          )}

          {isEmpty ? (
            <>
              <div className="project-brain-node-empty-hint" aria-hidden>
                <span className="project-brain-node-empty-hint__title">BrandKit vacío</span>
                <span className="project-brain-node-empty-hint__body">
                  Abre Studio para definir marca, voz y referencias.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Abrir BrandKit Studio"
                onClick={openStudio}
              />
            </>
          ) : null}
        </div>

        {hasDock ? (
          <div className="project-brain-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p
                  className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder"
                  title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}
                >
                  {previewLine}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="ADN" value={adnLabel} />
                  <FoldderNodeContentMetaRow label="Activos" value={activosLabel} />
                  <FoldderNodeContentMetaRow label="Salida" value={salidaLabel} />
                  <FoldderNodeContentMetaRow label="Pendientes" value={pendientesLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="project-brain-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Abrir BrandKit"
                  title="Abrir BrandKit Studio"
                  onClick={openStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>
    </StudioCanvasNodeShell>
  );
});

ProjectBrainNode.displayName = "ProjectBrainNode";
