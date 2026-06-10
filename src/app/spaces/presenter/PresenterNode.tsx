"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useReactFlow, useStore, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Presentation } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeLabel, FoldderNodeHeaderTitle } from "../foldder-node-ui";
import { NodeIcon } from "../foldder-icons";
import type { DesignerNodeData, DesignerPageState } from "../designer/DesignerNode";
import type { PresenterImageVideoPlacement } from "./presenter-image-video-types";
import { PresenterStudio } from "./PresenterStudio";
import { FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, type FoldderStudioEventDetail } from "../desktop-studio-events";
import type { StandardStudioShellConfig } from "../StandardStudioShell";
import { useFoldderRenderMetric } from "../use-performance-metrics";

const PRESENTER_NODE_MAX_WIDTH = 960;
const PRESENTER_NODE_MAX_HEIGHT = 2200;

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

  return (
    <div className="custom-node tool-node group/node" style={{ minWidth: 260 }}>
      <PresenterNodeResizer
        minWidth={260}
        minHeight={180}
        maxWidth={PRESENTER_NODE_MAX_WIDTH}
        maxHeight={PRESENTER_NODE_MAX_HEIGHT}
        isVisible={selected}
      />

      <NodeLabel id={id} label={nodeData.label} defaultLabel="Presenter" />

      <div className="node-header">
        <NodeIcon type="presenter" selected={selected} size={16} />
        <FoldderNodeHeaderTitle introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}>
          PRESENTER
        </FoldderNodeHeaderTitle>
        <div className="node-badge">DECK</div>
      </div>

      <div
        className="node-content relative flex min-h-0 min-w-0 flex-col gap-3 px-3 pb-3 pt-2"
        style={{ minHeight: 120 }}
      >
        {!connected && (
          <div className="min-w-0">
            <span className="node-label">Conexión</span>
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[11px] leading-snug text-slate-700 shadow-inner">
              Conecta la salida <span className="font-semibold text-slate-900">Document</span> del nodo{" "}
              <span className="font-medium text-slate-800">Designer</span>.
            </div>
          </div>
        )}
        {connected && designerMissing && (
          <div className="min-w-0">
            <span className="node-label">Conexión</span>
            <div className="rounded-xl border border-rose-200/70 bg-rose-50/80 p-3 text-[11px] leading-snug text-rose-800 shadow-inner">
              La conexión debe venir de un nodo Designer.
            </div>
          </div>
        )}
        {connected && !designerMissing && slideCount === 0 && (
          <div className="min-w-0">
            <span className="node-label">Diapositivas</span>
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[11px] text-slate-600 shadow-inner">
              El Designer no tiene páginas aún.
            </div>
          </div>
        )}
        {connected && !designerMissing && slideCount > 0 && pages && (
          <div className="min-w-0">
            <span className="node-label">Presentación</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStandardShell(null);
                setStudioOpen(true);
              }}
              className="nodrag flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/90 px-3 py-4 text-center shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            >
              <Presentation className="text-slate-600" size={26} strokeWidth={1.5} aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                Abrir presentación
              </span>
              <span className="text-[10px] font-medium text-slate-500">{slideCount} slides</span>
            </button>
          </div>
        )}
      </div>

      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="document" dataType="generic" />
        <span className="handle-label">Document</span>
      </div>

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
    </div>
  );
});

PresenterNode.displayName = "PresenterNode";
