"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, useReactFlow, useStore, useNodes, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Presentation } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import { getPageDimensions } from "../indesign/page-formats";
import type { PresenterImageVideoPlacement } from "./presenter-image-video-types";
import { firstPlayableIndex } from "./presenter-skip-slide";
import { PresenterStudio } from "./PresenterStudio";
import { FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, type FoldderStudioEventDetail } from "../desktop-studio-events";
import type { StandardStudioShellConfig } from "../StandardStudioShell";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import {
  StudioCanvasNodeShell,
  StudioCanvasOpenButton,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
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
  const { setNodes } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const [standardShell, setStandardShell] = useState<StandardStudioShellConfig | null>(null);
  const { pages, connected, designerMissing, designerNodeId, designerPreviewUrl } = useDesignerDocumentPages(id);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);

  const slideCount = pages?.length ?? 0;
  const showPresenterEmpty = slideCount === 0;
  const previewPageIndex = pages ? firstPlayableIndex(pages) : null;
  const previewPage =
    pages && pages.length > 0 ? pages[previewPageIndex ?? 0] : null;
  const previewPageDims = previewPage ? getPageDimensions(previewPage) : null;
  const showSlidePreview = Boolean(!showPresenterEmpty && previewPage && previewPageDims);

  const openStudio = useCallback(() => {
    setStandardShell(null);
    setStudioOpen(true);
  }, []);

  React.useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<FoldderStudioEventDetail>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(detail.standardShell ? { ...detail.standardShell, nodeId: id, nodeType: "presenter", fileId: detail.fileId, appId: detail.appId } : null);
      setStudioOpen(true);
    };
    const onCloseStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId !== id) return;
      setStandardShell(null);
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
  }, [id]);

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
          </div>
        </div>
      ) : (
        <div
          className={`node-content presenter-node-content relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 pt-2${showSlidePreview ? " presenter-node-content--media" : ""}`}
          style={{ minHeight: 120 }}
        >
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

          <div className={`min-w-0${showSlidePreview ? " relative z-10 mt-auto" : ""}`}>
            {showSlidePreview ? (
              <div className="presenter-summary-panel mb-3 min-w-0">
                <span className="node-label">Presentación</span>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-900">
                  {slideCount} {slideCount === 1 ? "slide" : "slides"}
                </p>
              </div>
            ) : (
              <>
                <span className="node-label">Presentación</span>
              </>
            )}
            <StudioCanvasOpenButton
              onClick={openStudio}
              accent="slate"
              icon={<Presentation className="h-[26px] w-[26px]" strokeWidth={1.5} aria-hidden />}
              className={`mt-1 flex-col gap-2 py-4${showSlidePreview ? " border-white/20 bg-white/88 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md" : ""}`}
            >
              <span>Abrir presentación</span>
              {!showSlidePreview ? (
                <span className="text-[10px] font-medium normal-case tracking-normal text-slate-500">
                  {slideCount} slides
                </span>
              ) : null}
            </StudioCanvasOpenButton>
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
              setStandardShell(null);
              if (standardShell && typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, {
                  detail: { nodeId: id, nodeType: "presenter", fileId: standardShell.fileId, appId: standardShell.appId },
                }));
              }
            }}
            onPresenterPagePatch={patchDesignerPage}
            imageVideoPlacements={nodeData.imageVideoPlacements ?? []}
            onImageVideoPlacementsChange={setImageVideoPlacements}
            shareContext={{
              deckKey: designerNodeId ? `${designerNodeId}::${id}` : `presenter::${id}`,
              deckTitle: nodeData.label?.trim() || "Presentation",
            }}
            standardShell={standardShell ?? undefined}
          />,
          document.body,
        )}
    </StudioCanvasNodeShell>
  );
});

PresenterNode.displayName = "PresenterNode";
