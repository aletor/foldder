"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, useReactFlow, useStore, useNodes, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Presentation, Plus } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import { getPageDimensions, DEFAULT_DESIGNER_PAGE_FORMAT } from "../indesign/page-formats";
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
  StudioCanvasOpenButton,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { FoldderStudioModeCenterButton } from "../foldder-node-ui";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";

const PRESENTER_NODE_MAX_WIDTH = 960;
const PRESENTER_NODE_MAX_HEIGHT = 2200;
const PRESENTER_EMPTY_BACKGROUND_SRC = "/assets/nodes/presenter-empty-yellow.jpg";

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
  const { fitView } = useReactFlow();
  const { onResizeEnd, ...rest } = props;
  return (
    <NodeResizer
      {...rest}
      onResizeEnd={(e, p) => {
        onResizeEnd?.(e, p);
        requestAnimationFrame(() => {
          void fitView({ padding: 0.75, duration: 400, interpolate: "smooth", ...FOLDDER_FIT_VIEW_EASE });
        });
      }}
    />
  );
}

export const PresenterNode = memo(({ id, data, selected }: NodeProps<any>) => {
  useFoldderRenderMetric("PresenterNode", id);
  const nodes = useNodes();
  const liveNode = nodes.find((node) => node.id === id);
  const nodeData = (liveNode?.data ?? data) as PresenterNodeData;
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);
  const { setNodes, setEdges, getNode, fitView } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const { pages, connected, designerMissing, designerNodeId, designerPreviewUrl } = useDesignerDocumentPages(id);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);

  const slideCount = pages?.length ?? 0;
  const showPresenterEmpty = slideCount === 0;
  const canOpenStudio = slideCount > 0;
  const openStudioDisabledReason = !connected
    ? "Conecta la salida Document del nodo Designer"
    : designerMissing
      ? "La conexión debe venir de un nodo Designer"
      : slideCount === 0
        ? "Añade páginas en Designer primero"
        : undefined;
  const previewPageIndex = pages ? firstPlayableIndex(pages) : null;
  const previewPage =
    pages && pages.length > 0 ? pages[previewPageIndex ?? 0] : null;
  const previewPageDims = previewPage ? getPageDimensions(previewPage) : null;
  const showSlidePreview = Boolean(!showPresenterEmpty && previewPage && previewPageDims);

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

  const statusPanel = useMemo(() => {
    if (!connected) {
      return (
        <div className="presenter-summary-panel min-w-0">
          <span className="node-label">Conexión</span>
          <p className="mt-1 text-[11px] font-light leading-relaxed text-slate-800">
            Conecta la salida <span className="font-semibold">Document</span> del nodo{" "}
            <span className="font-medium">Designer</span>.
          </p>
        </div>
      );
    }
    if (designerMissing) {
      return (
        <div className="presenter-summary-panel min-w-0">
          <span className="node-label">Conexión</span>
          <p className="mt-1 text-[11px] font-light leading-relaxed text-rose-900">
            La conexión debe venir de un nodo Designer.
          </p>
        </div>
      );
    }
    if (slideCount === 0) {
      return (
        <div className="presenter-summary-panel min-w-0">
          <span className="node-label">Diapositivas</span>
          <p className="mt-1 text-[11px] font-light leading-relaxed text-slate-800">
            El Designer no tiene páginas aún.
          </p>
        </div>
      );
    }
    return null;
  }, [connected, designerMissing, slideCount]);

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="presenter"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Presenter"
      title="PRESENTER"
      badge="DECK"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      studioTouched={studioTouched}
      minWidth={260}
      className={
        showPresenterEmpty
          ? "presenter-node presenter-node--empty foldder-frameless-label-dark"
          : "presenter-node"
      }
      handles={PRESENTER_NODE_HANDLES}
      variant="frameless"
      material="media"
    >
      <PresenterNodeResizer
        minWidth={260}
        minHeight={180}
        maxWidth={PRESENTER_NODE_MAX_WIDTH}
        maxHeight={PRESENTER_NODE_MAX_HEIGHT}
        isVisible={selected}
      />

      {showPresenterEmpty ? (
        <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="presenter-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={PRESENTER_EMPTY_BACKGROUND_SRC}
              alt=""
              className="h-full w-full object-contain object-bottom"
              draggable={false}
            />
          </div>
          <div className="node-content presenter-node-content relative z-10 mt-auto flex flex-col gap-3 px-3 pb-3 pt-2">
            {statusPanel}
            {!connected ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  spawnDesignerAndConnect();
                }}
                className="execute-btn nodrag flex items-center justify-center gap-1.5 py-2.5 text-[10px]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Añadir Designer
              </button>
            ) : null}
            {connected && !designerMissing && slideCount === 0 && designerNodeId ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openConnectedDesigner();
                }}
                className="execute-btn nodrag py-2.5 text-[10px]"
              >
                Abrir Designer
              </button>
            ) : null}
            <StudioCanvasOpenButton
              onClick={openStudio}
              disabled={!canOpenStudio}
              title={openStudioDisabledReason}
              accent="slate"
              icon={<Presentation className="h-[26px] w-[26px]" strokeWidth={1.5} aria-hidden />}
              className="flex-col gap-2 py-4 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>Abrir presentación</span>
            </StudioCanvasOpenButton>
          </div>
        </div>
      ) : (
        <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {showSlidePreview ? (
            <div className="absolute inset-0 overflow-hidden" aria-hidden>
              {designerPreviewUrl && nodeMediaVisible ? (
                <img
                  src={designerPreviewUrl}
                  alt=""
                  className="h-full w-full object-cover bg-zinc-950/80"
                  draggable={false}
                />
              ) : previewPage && previewPageDims ? (
                <div className="h-full w-full bg-[#fafafa]">
                  <DesignerPagePreview
                    objects={previewPage.objects}
                    pageWidth={previewPageDims.width}
                    pageHeight={previewPageDims.height}
                    renderImages={nodeMediaVisible}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="relative z-10 flex min-h-0 flex-1 flex-col pointer-events-none">
            <div className="flex-1" />
            {showSlidePreview ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-11 pt-10"
                aria-hidden
              >
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
                  {slideCount} {slideCount === 1 ? "diapositiva" : "diapositivas"}
                </p>
              </div>
            ) : null}
            <FoldderStudioModeCenterButton
              onClick={openStudio}
              disabled={!canOpenStudio}
              label="Abrir presentación"
              title={openStudioDisabledReason ?? "Abrir presentación"}
            />
          </div>
        </div>
      )}

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
