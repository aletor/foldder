"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  NodeResizer,
  useReactFlow,
  useStore,
  useNodes,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import { DesignerNodeDockSlideFormats } from "../designer/designer-node-dock-slide-formats";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import { getPageDimensions, DEFAULT_DESIGNER_PAGE_FORMAT } from "../indesign/page-formats";
import {
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
  resolveNodeFrameWidth,
} from "../studio-node-aspect";
import { nodeFrameFromSnapshot, selectNodeFrameSnapshot } from "../react-flow-selectors";
import type { PresenterImageVideoPlacement } from "./presenter-image-video-types";
import { firstPlayableIndex } from "./presenter-skip-slide";
import type { SlideTransitionId } from "./slide-transition-types";
import { DEFAULT_SLIDE_TRANSITION } from "./slide-transition-types";
import type { PresenterEditorMode, PresenterProLayerTrack } from "./presenter-pro-timing";
import { DEFAULT_PRO_SLIDE_DURATION_MS } from "./presenter-pro-timing";
import { PresenterStudio } from "./PresenterStudio";
import { type FoldderStudioEventDetail } from "../desktop-studio-events";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import {
  StudioCanvasNodeShell,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";

const PRESENTER_NODE_MAX_WIDTH = 960;
const PRESENTER_NODE_MAX_HEIGHT = 2200;
const PRESENTER_ACCENT = "#f5b91b";
const PRESENTER_DOCK_MIN_CHROME = 180;
const PRESENTER_CONNECTED_PREVIEW_MIN = 140;
const PRESENTER_EMPTY_BACKGROUND_SRC = resolveFoldderNodeStudioBackground("presenter");

function resolvePresenterNodeHeight(args: { baseHeight: number; hasDock: boolean }): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    PRESENTER_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, PRESENTER_CONNECTED_PREVIEW_MIN + PRESENTER_DOCK_MIN_CHROME)),
  );
}

const PRESENTER_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  {
    id: "document",
    label: "Document",
    side: "left",
    top: "50%",
    type: "target",
    dataType: "generic",
  },
];

export type PresenterNodeData = {
  label?: string;
  /** Vídeos superpuestos a imágenes en el lienzo del Presenter (no forma parte del Designer). */
  imageVideoPlacements?: PresenterImageVideoPlacement[];
  /** Transiciones entre slides (persistidas en el nodo Presenter). */
  transitionsByPageId?: Record<string, SlideTransitionId>;
  /** Editor del Presenter: pasos por clic (simple) o timeline (pro). */
  presenterEditorMode?: PresenterEditorMode;
  /** Duración de cada slide en modo Pro (ms). */
  proSlideDurationByPageId?: Record<string, number>;
  /** In/out por capa en modo Pro, por página. */
  proLayerTracksByPageId?: Record<string, Record<string, PresenterProLayerTrack>>;
};

function useDesignerDocumentPages(presenterId: string): {
  pages: DesignerPageState[] | null;
  connected: boolean;
  designerMissing: boolean;
  designerNodeId: string | null;
  designerPreviewUrl: string | null;
} {
  return useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => {
      const edge = state.edges.find(
        (item) => item.target === presenterId && (item.targetHandle === "document" || item.targetHandle == null),
      );
      if (!edge) {
        return { pages: null, connected: false, designerMissing: false, designerNodeId: null, designerPreviewUrl: null };
      }
      const src = state.nodeLookup.get(edge.source);
      if (!src || src.type !== "designer") {
        return { pages: null, connected: true, designerMissing: true, designerNodeId: null, designerPreviewUrl: null };
      }
      const data = src.data as DesignerNodeData;
      const pages = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : null;
      const designerPreviewUrl =
        typeof data.value === "string" && data.value.trim().length > 0 ? data.value.trim() : null;
      return {
        pages,
        connected: true,
        designerMissing: false,
        designerNodeId: src.id,
        designerPreviewUrl,
      };
    }, [presenterId]),
    shallow,
  );
}

function PresenterNodeResizer(props: React.ComponentProps<typeof NodeResizer>) {
  return <NodeResizer {...props} />;
}

export const PresenterNode = memo(({ id, data, selected }: NodeProps<any>) => {
  useFoldderRenderMetric("PresenterNode", id);
  const nodes = useNodes();
  const liveNode = nodes.find((node) => node.id === id);
  const nodeData = (liveNode?.data ?? data) as PresenterNodeData;
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
  const { setNodes, setEdges, getNode, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const currentNodeFrameSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNodeFrameSnapshot(state, id), [id]),
    shallow,
  );
  const currentNodeFrame = useMemo(() => nodeFrameFromSnapshot(currentNodeFrameSnapshot), [currentNodeFrameSnapshot]);
  const [studioOpen, setStudioOpen] = useState(false);
  const { pages, connected, designerMissing, designerNodeId, designerPreviewUrl } = useDesignerDocumentPages(id);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);

  const slideCount = pages?.length ?? 0;
  const hasSlides = slideCount > 0;
  const overlayCount = nodeData.imageVideoPlacements?.length ?? 0;
  const canOpenStudio = hasSlides && !designerMissing;
  const openStudioDisabledReason = !connected
    ? "Conecta la salida Document del nodo Designer"
    : designerMissing
      ? "La conexión debe venir de un nodo Designer"
      : slideCount === 0
        ? "Añade páginas en Designer primero"
        : undefined;
  const previewPageIndex = pages ? firstPlayableIndex(pages) : null;
  const previewPage = pages && pages.length > 0 ? pages[previewPageIndex ?? 0] : null;
  const previewPageDims = previewPage ? getPageDimensions(previewPage) : null;
  const hasConnections = connected;
  const hasDock = connected;
  const isEmpty = !hasDock;
  const connectedOnly = connected && !designerMissing && !hasSlides && overlayCount === 0 && !studioTouched;
  const showExteriorTile = hasDock;
  const hasExportPreview = Boolean(connected && !designerMissing && hasSlides && designerPreviewUrl && nodeMediaVisible);
  const hasCanvasPreview = Boolean(connected && !designerMissing && hasSlides && previewPage && previewPageDims && !designerPreviewUrl);
  const hasPreviewVisual = hasExportPreview || hasCanvasPreview;

  const refreshHandleGeometry = useCallback(() => {
    const run = () => updateNodeInternals(id);
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 140);
  }, [id, updateNodeInternals]);

  const openStudio = useCallback(() => {
    if (!canOpenStudio) return;
    setStudioOpen(true);
  }, [canOpenStudio]);

  const spawnDesignerAndConnect = useCallback(() => {
    const self = getNode(id);
    if (!self) return;
    const designerId = `designer_${Date.now()}`;
    const position = {
      x: self.position.x - 440,
      y: self.position.y,
    };
    const initialPageId = `dpg_${designerId}_0`;
    setNodes((nds) => [
      ...nds.map((n) => (n.id === id ? { ...n, selected: false } : n)),
      {
        id: designerId,
        type: "designer",
        position,
        selected: true,
        data: {
          label: "Designer",
          pages: [
            {
              id: initialPageId,
              format: DEFAULT_DESIGNER_PAGE_FORMAT,
              objects: [],
            },
          ],
          activePageIndex: 0,
        },
      },
    ]);
    setEdges((eds) => [
      ...eds,
      {
        id: `e_${designerId}_${id}_document`,
        source: designerId,
        target: id,
        sourceHandle: "document",
        targetHandle: "document",
      },
    ]);
    requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: designerId }], duration: 400, padding: 0.75, ...FOLDDER_FIT_VIEW_EASE });
    });
  }, [fitView, getNode, id, setEdges, setNodes]);

  const openConnectedDesigner = useCallback(() => {
    if (!designerNodeId) return;
    requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: designerNodeId }], duration: 400, padding: 0.75, ...FOLDDER_FIT_VIEW_EASE });
    });
    window.dispatchEvent(
      new CustomEvent("foldder:open-studio", { detail: { nodeId: designerNodeId } }),
    );
  }, [designerNodeId, fitView]);

  const handleEmpezar = useCallback(() => {
    if (!connected) {
      spawnDesignerAndConnect();
      return;
    }
    if (slideCount === 0 && designerNodeId) {
      openConnectedDesigner();
      return;
    }
    openStudio();
  }, [connected, designerNodeId, openConnectedDesigner, openStudio, slideCount, spawnDesignerAndConnect]);

  const headerTitle = nodeData.label?.trim() || "Presenter";
  const slidesLabel = `${slideCount} diapositiva${slideCount === 1 ? "" : "s"}`;
  const modeLabel = (nodeData.presenterEditorMode ?? "simple") === "pro" ? "Pro" : "Simple";
  const inputLabel = !connected ? "—" : designerMissing ? "Inválida" : "Designer";
  const overlaysLabel = overlayCount > 0 ? `${overlayCount} vídeo${overlayCount === 1 ? "" : "s"}` : "—";
  const statusLabel = isEmpty
    ? "Vacío"
    : designerMissing
      ? "Conexión inválida"
      : connectedOnly
        ? "Conectado"
        : !hasSlides
          ? "Sin diapositivas"
          : studioTouched
            ? "En edición"
            : "Listo";
  const previewLine = designerMissing
    ? "La conexión debe venir de un nodo Designer."
    : hasPreviewVisual
      ? `${slidesLabel} listas para presentar.`
      : hasSlides
        ? `${slidesLabel} · abre Studio para animar y compartir.`
        : connected
          ? "Designer conectado. Añade páginas en Designer."
          : "Conecta Document del Designer y prepara la presentación.";

  useEffect(() => {
    const raf = requestAnimationFrame(() => refreshHandleGeometry());
    const t = window.setTimeout(() => refreshHandleGeometry(), 160);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [designerPreviewUrl, hasPreviewVisual, previewPageDims?.height, previewPageDims?.width, refreshHandleGeometry, slideCount]);

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("presenter");
    if (!baseFrame) return;

    if (hasSlides && previewPageDims) {
      const syncKey = `${previewPageDims.width}x${previewPageDims.height}:${hasDock ? "dock" : "preview-only"}`;
      if (frameSyncKeyRef.current === syncKey) return;
      const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
      const nextFrame = resolveAspectLockedNodeFrame({
        node: currentNodeFrame,
        contentWidth: previewPageDims.width,
        contentHeight: previewPageDims.height,
        minWidth: 260,
        maxWidth: PRESENTER_NODE_MAX_WIDTH,
        minHeight: 180,
        maxHeight: PRESENTER_NODE_MAX_HEIGHT,
        chromeHeight,
      });
      frameSyncKeyRef.current = syncKey;
      const nextAspectRatio = previewPageDims.width / previewPageDims.height;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          const needsFrameSync = nodeFrameNeedsSync(node, nextFrame);
          const currentAspectRatio =
            typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio === "number"
              ? ((node.data as { _foldderAspectRatio?: number })._foldderAspectRatio ?? null)
              : null;
          const needsAspectSync =
            currentAspectRatio === null || Math.abs(currentAspectRatio - nextAspectRatio) > 0.0001;
          if (!needsFrameSync && !needsAspectSync) return node;
          return {
            ...node,
            ...(needsFrameSync ? { width: nextFrame.width, height: nextFrame.height } : {}),
            data: { ...node.data, _foldderAspectRatio: nextAspectRatio },
            style: needsFrameSync ? { ...node.style, width: nextFrame.width, height: nextFrame.height } : node.style,
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    if (isEmpty) {
      const syncKey = "presenter-base";
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

    const measuredHeight = resolvePresenterNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
    const syncKey = `presenter-content:${hasConnections ? "connected" : "idle"}:${hasSlides ? "slides" : "meta"}:${measuredHeight}`;
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
            maxHeight: PRESENTER_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    connectedOnly,
    currentNodeFrame,
    currentNodeFrameSnapshot.height,
    currentNodeFrameSnapshot.measuredHeight,
    currentNodeFrameSnapshot.measuredWidth,
    currentNodeFrameSnapshot.styleHeight,
    currentNodeFrameSnapshot.styleWidth,
    currentNodeFrameSnapshot.width,
    hasConnections,
    hasDock,
    hasSlides,
    id,
    isEmpty,
    previewPageDims,
    setNodes,
    updateNodeInternals,
  ]);

  const setImageVideoPlacements = useCallback(
    (next: PresenterImageVideoPlacement[]) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && n.type === "presenter"
            ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, { imageVideoPlacements: next }) }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const setTransitionsByPageId = useCallback(
    (next: Record<string, SlideTransitionId>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && n.type === "presenter"
            ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, { transitionsByPageId: next }) }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const setPresenterEditorMode = useCallback(
    (mode: PresenterEditorMode) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && n.type === "presenter"
            ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, { presenterEditorMode: mode }) }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const setProSlideDurationByPageId = useCallback(
    (next: Record<string, number>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && n.type === "presenter"
            ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, { proSlideDurationByPageId: next }) }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const setProLayerTracksByPageId = useCallback(
    (next: Record<string, Record<string, PresenterProLayerTrack>>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && n.type === "presenter"
            ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, { proLayerTracksByPageId: next }) }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const initialTransitions = useMemo(() => {
    const stored = nodeData.transitionsByPageId ?? {};
    const merged: Record<string, SlideTransitionId> = { ...stored };
    for (const p of pages ?? []) {
      if (merged[p.id] === undefined) merged[p.id] = DEFAULT_SLIDE_TRANSITION;
    }
    return merged;
  }, [nodeData.transitionsByPageId, pages]);

  const initialProSlideDurations = useMemo(() => {
    const stored = nodeData.proSlideDurationByPageId ?? {};
    const merged: Record<string, number> = { ...stored };
    for (const p of pages ?? []) {
      if (merged[p.id] === undefined) merged[p.id] = DEFAULT_PRO_SLIDE_DURATION_MS;
    }
    return merged;
  }, [nodeData.proSlideDurationByPageId, pages]);

  const initialProLayerTracks = useMemo(() => {
    return nodeData.proLayerTracksByPageId ?? {};
  }, [nodeData.proLayerTracksByPageId]);

  React.useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      if ((pages?.length ?? 0) === 0) return;
      setStudioOpen(true);
    };
    const onCloseStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId != null && detail.nodeId !== id) return;
      setStudioOpen(false);
    };
    window.addEventListener("foldder:open-studio", onOpenStudio as EventListener);
    window.addEventListener("foldder-open-node-studio", onOpenStudio as EventListener);
    window.addEventListener("foldder:close-studio", onCloseStudio as EventListener);
    window.addEventListener("foldder-close-node-studio", onCloseStudio as EventListener);
    return () => {
      window.removeEventListener("foldder:open-studio", onOpenStudio as EventListener);
      window.removeEventListener("foldder-open-node-studio", onOpenStudio as EventListener);
      window.removeEventListener("foldder:close-studio", onCloseStudio as EventListener);
      window.removeEventListener("foldder-close-node-studio", onCloseStudio as EventListener);
    };
  }, [id, pages?.length]);

  const patchDesignerPage = useCallback(
    (pageId: string, patch: Partial<DesignerPageState>) => {
      if (!designerNodeId) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === designerNodeId && n.type === "designer") {
            const d = n.data as DesignerNodeData;
            const nextPages = (d.pages ?? []).map((p) => (p.id === pageId ? { ...p, ...patch } : p));
            return { ...n, data: { ...d, pages: nextPages } };
          }
          if (n.id === id && n.type === "presenter") {
            return { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, {}) };
          }
          return n;
        }),
      );
    },
    [designerNodeId, id, setNodes],
  );

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="presenter"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Presenter"
      title="PRESENTER"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      studioTouched={showExteriorTile && studioTouched}
      exteriorTileMark={showExteriorTile}
      minWidth={260}
      className={`presenter-node foldder-frameless-label-dark${hasDock ? " presenter-node--has-content" : " presenter-node--empty"}${hasPreviewVisual ? " presenter-node--has-preview" : ""}${connectedOnly ? " presenter-node--connected-only" : ""}${hasConnections ? " presenter-node--connected" : ""}${designerMissing ? " presenter-node--invalid-connection" : ""}`}
      handles={PRESENTER_NODE_HANDLES}
      variant="frameless"
      material="media"
      style={
        {
          minWidth: 260,
          minHeight: hasDock ? PRESENTER_DOCK_MIN_CHROME + PRESENTER_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": PRESENTER_ACCENT,
          "--foldder-frameless-glass-bg": PRESENTER_ACCENT,
          "--foldder-frameless-accent": PRESENTER_ACCENT,
        } as React.CSSProperties
      }
    >
      <PresenterNodeResizer
        minWidth={260}
        minHeight={180}
        maxWidth={PRESENTER_NODE_MAX_WIDTH}
        maxHeight={PRESENTER_NODE_MAX_HEIGHT}
        keepAspectRatio={hasSlides}
        isVisible={selected}
      />

      <div
        className={`node-content foldder-frameless-main presenter-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div
          ref={previewRef}
          className="presenter-node-preview-area foldder-node-content-preview-area"
        >
          {hasExportPreview ? (
            <img
              src={designerPreviewUrl!}
              alt="Presenter preview"
              className="presenter-node-preview-img"
              decoding="async"
              draggable={false}
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          ) : hasCanvasPreview && previewPage && previewPageDims ? (
            <div className="presenter-node-page-preview absolute inset-0 overflow-hidden bg-[#fafafa]">
              <DesignerPagePreview
                objects={previewPage.objects}
                pageWidth={previewPageDims.width}
                pageHeight={previewPageDims.height}
                renderImages={nodeMediaVisible}
              />
            </div>
          ) : (
            <img
              src={PRESENTER_EMPTY_BACKGROUND_SRC}
              alt=""
              className="presenter-node-bg"
              draggable={false}
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          )}

          {isEmpty ? (
            <>
              <div className="presenter-node-empty-hint" aria-hidden>
                <span className="presenter-node-empty-hint__title">Presenter vacío</span>
                <span className="presenter-node-empty-hint__body">
                  Conecta Document del Designer y abre Studio.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Conectar Designer o abrir Presenter"
                onClick={handleEmpezar}
              />
            </>
          ) : null}
        </div>

        {hasDock ? (
          <div className="presenter-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {previewLine}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow
                    label="Slides"
                    value={pages ? <DesignerNodeDockSlideFormats pages={pages} /> : "—"}
                  />
                  <FoldderNodeContentMetaRow label="Diapositivas" value={slidesLabel} />
                  <FoldderNodeContentMetaRow label="Modo" value={modeLabel} />
                  <FoldderNodeContentMetaRow label="Entrada" value={inputLabel} />
                  <FoldderNodeContentMetaRow label="Overlays" value={overlaysLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="presenter-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Abrir Presenter"
                  title={openStudioDisabledReason ?? "Abrir Presenter Studio"}
                  onClick={openStudio}
                  disabled={!canOpenStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {studioOpen && pages && pages.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <PresenterStudio
            pages={pages}
            onClose={() => {
              setStudioOpen(false);
            }}
            onPresenterPagePatch={patchDesignerPage}
            imageVideoPlacements={nodeData.imageVideoPlacements ?? []}
            onImageVideoPlacementsChange={setImageVideoPlacements}
            initialTransitionsByPageId={initialTransitions}
            onTransitionsByPageIdChange={setTransitionsByPageId}
            initialPresenterEditorMode={nodeData.presenterEditorMode ?? "simple"}
            onPresenterEditorModeChange={setPresenterEditorMode}
            initialProSlideDurationByPageId={initialProSlideDurations}
            onProSlideDurationByPageIdChange={setProSlideDurationByPageId}
            initialProLayerTracksByPageId={initialProLayerTracks}
            onProLayerTracksByPageIdChange={setProLayerTracksByPageId}
            shareContext={{
              deckKey: designerNodeId ? `${designerNodeId}::${id}` : `presenter::${id}`,
              deckTitle: nodeData.label?.trim() || "Presentation",
            }}
          />,
          document.body,
        )}
    </StudioCanvasNodeShell>
  );
});

PresenterNode.displayName = "PresenterNode";
