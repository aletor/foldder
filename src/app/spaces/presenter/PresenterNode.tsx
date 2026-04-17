"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useEdges, useNodes, useReactFlow, type NodeProps } from "@xyflow/react";
import { Presentation } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon } from "../foldder-icons";
import type { DesignerPageState } from "../designer/DesignerNode";
import { PresenterStudio } from "./PresenterStudio";

export type PresenterNodeData = {
  label?: string;
};

function useDesignerDocumentPages(presenterId: string): {
  pages: DesignerPageState[] | null;
  connected: boolean;
  designerMissing: boolean;
} {
  const edges = useEdges();
  const nodes = useNodes();

  return useMemo(() => {
    const incoming = edges.filter(
      (e) => e.target === presenterId && (e.targetHandle === "document" || e.targetHandle == null),
    );
    const edge = incoming[0];
    if (!edge) {
      return { pages: null, connected: false, designerMissing: false };
    }
    const src = nodes.find((n) => n.id === edge.source);
    if (!src || src.type !== "designer") {
      return { pages: null, connected: true, designerMissing: true };
    }
    const data = src.data as { pages?: DesignerPageState[] };
    const pages = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : null;
    return { pages, connected: true, designerMissing: false };
  }, [edges, nodes, presenterId]);
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
  const nodeData = data as PresenterNodeData;
  const { setNodes } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const { pages, connected, designerMissing } = useDesignerDocumentPages(id);

  const slideCount = pages?.length ?? 0;

  const updateLabel = useCallback(
    (label: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
      );
    },
    [id, setNodes],
  );

  return (
    <div className="custom-node tool-node group/node" style={{ minWidth: 260 }}>
      <PresenterNodeResizer minWidth={260} minHeight={180} maxWidth={480} maxHeight={360} isVisible={selected} />

      <div className="node-header border-b border-amber-500/15 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-900/90">
        <NodeIcon type="presenter" selected={selected} size={16} />
        <input
          type="text"
          className="nodrag min-w-0 flex-1 bg-transparent text-[10px] font-black uppercase tracking-[0.12em] text-zinc-100 outline-none placeholder:text-zinc-600"
          value={nodeData.label ?? ""}
          placeholder="Presenter"
          onChange={(e) => updateLabel(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div className="node-badge border-amber-500/30 text-[8px] text-amber-200/90">DECK</div>
      </div>

      <div className="node-content relative flex flex-col gap-2" style={{ minHeight: 120 }}>
        {!connected && (
          <p className="text-[10px] leading-snug text-zinc-500">
            Conecta la salida <span className="font-semibold text-amber-200/90">Document</span> del nodo{" "}
            <span className="text-zinc-300">Designer</span>.
          </p>
        )}
        {connected && designerMissing && (
          <p className="text-[10px] leading-snug text-rose-400/90">
            La conexión debe venir de un nodo Designer.
          </p>
        )}
        {connected && !designerMissing && slideCount === 0 && (
          <p className="text-[10px] text-zinc-500">El Designer no tiene páginas aún.</p>
        )}
        {connected && !designerMissing && slideCount > 0 && pages && (
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] py-6 transition-colors hover:border-amber-400/40 hover:bg-amber-500/12"
          >
            <Presentation className="text-amber-400" size={28} strokeWidth={1.5} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-200">
              Abrir presentación
            </span>
            <span className="text-[9px] text-zinc-500">{slideCount} slides</span>
          </button>
        )}
      </div>

      <div className="handle-wrapper handle-left" style={{ top: "50%", transform: "translateY(-50%)" }}>
        <span className="handle-label">Document</span>
        <FoldderDataHandle type="target" position={Position.Left} id="document" dataType="generic" />
      </div>

      {studioOpen && pages && pages.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(<PresenterStudio pages={pages} onClose={() => setStudioOpen(false)} />, document.body)}
    </div>
  );
});