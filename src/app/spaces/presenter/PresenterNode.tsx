"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, useReactFlow, useStore, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Presentation } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import type { PresenterImageVideoPlacement } from "./presenter-image-video-types";
import { PresenterStudio } from "./PresenterStudio";
import { FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, type FoldderStudioEventDetail } from "../desktop-studio-events";
import type { StandardStudioShellConfig } from "../StandardStudioShell";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import {
  StudioCanvasNodeShell,
  StudioCanvasOpenButton,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";

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
} {
  return useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => {
      const edge = state.edges.find(
        (item) => item.target === presenterId && (item.targetHandle === "document" || item.targetHandle == null),
      );
      if (!edge) {
        return { pages: null, connected: false, designerMissing: false, designerNodeId: null };
      }
      const src = state.nodeLookup.get(edge.source);
      if (!src || src.type !== "designer") {
        return { pages: null, connected: true, designerMissing: true, designerNodeId: null };
      }
      const data = src.data as { pages?: DesignerPageState[] };
      const pages = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : null;
      return { pages, connected: true, designerMissing: false, designerNodeId: src.id };
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
  const nodeData = data as PresenterNodeData;
  const { setNodes } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const [standardShell, setStandardShell] = useState<StandardStudioShellConfig | null>(null);
  const { pages, connected, designerMissing, designerNodeId } = useDesignerDocumentPages(id);

  const slideCount = pages?.length ?? 0;
  const showPresenterEmpty = slideCount === 0;

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
          if (n.id !== designerNodeId || n.type !== "designer") return n;
          const d = n.data as DesignerNodeData;
          const nextPages = (d.pages ?? []).map((p) => (p.id === pageId ? { ...p, ...patch } : p));
          return { ...n, data: { ...d, pages: nextPages } };
        }),
      );
    },
    [designerNodeId, setNodes],
  );

  const setImageVideoPlacements = useCallback(
    (next: PresenterImageVideoPlacement[]) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && n.type === "presenter"
            ? { ...n, data: { ...(n.data as PresenterNodeData), imageVideoPlacements: next } }
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
        <div className="node-content presenter-node-content relative flex min-h-0 min-w-0 flex-col gap-3 px-3 pb-3 pt-2" style={{ minHeight: 120 }}>
          <div className="min-w-0">
            <span className="node-label">Presentación</span>
            <StudioCanvasOpenButton
              onClick={openStudio}
              accent="slate"
              icon={<Presentation className="h-[26px] w-[26px]" strokeWidth={1.5} aria-hidden />}
              className="mt-1 flex-col gap-2 py-4"
            >
              <span>Abrir presentación</span>
              <span className="text-[10px] font-medium normal-case tracking-normal text-slate-500">
                {slideCount} slides
              </span>
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
