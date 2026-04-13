"use client";

import React, { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { FileText, Sparkles } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeIcon } from "./foldder-icons";
import { resolveFoldderNodeState } from "./foldder-icons";
import { IndesignStudio } from "./IndesignStudio";
import type { IndesignPageState } from "./indesign/types";

function IndesignNodeResizer(props: React.ComponentProps<typeof NodeResizer>) {
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

type BaseNodeData = { label?: string; value?: string; type?: string };

export type IndesignNodeData = BaseNodeData & {
  pages?: IndesignPageState[];
  activePageIndex?: number;
};

export const IndesignNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as IndesignNodeData;
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const pages: IndesignPageState[] =
    Array.isArray(nodeData.pages) && nodeData.pages.length > 0
      ? nodeData.pages
      : [
          {
            id: `pg_${id}_0`,
            format: "a4v",
            fabricJSON: null,
            stories: [],
            textFrames: [],
          },
        ];

  const activeIdx = Math.min(
    Math.max(0, nodeData.activePageIndex ?? 0),
    Math.max(0, pages.length - 1),
  );

  useEffect(() => {
    if (isStudioOpen) document.body.classList.add("nb-studio-open");
    else document.body.classList.remove("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [isStudioOpen]);

  const { setNodes } = useReactFlow();

  const onUpdatePages = useCallback(
    (next: IndesignPageState[]) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, pages: next } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <div className="custom-node tool-node group/node" style={{ minWidth: 280 }}>
      <IndesignNodeResizer minWidth={280} minHeight={200} maxWidth={520} maxHeight={420} isVisible={selected} />

      <div className="node-header border-b border-amber-500/15 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-900/90">
        <NodeIcon
          type="indesign"
          selected={selected}
          state={resolveFoldderNodeState({ loading: false, done: false, error: false })}
          size={16}
        />
        <span className="flex-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-zinc-100">
          Indesign
        </span>
        <div className="node-badge max-w-[5rem] truncate border border-amber-400/25 bg-amber-500/10 text-amber-100/95">
          LAYOUT
        </div>
      </div>

      <div
        className="node-content relative flex min-h-[152px] flex-col items-center justify-center gap-3 overflow-hidden rounded-b-[20px] bg-[#0c0c12] px-3 py-5"
        style={{ minHeight: 152 }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
            backgroundSize: "14px 14px",
          }}
        />
        <div className="relative flex flex-col items-center gap-2.5">
          <div className="relative flex h-[4.5rem] w-[3.25rem] items-center justify-center rounded-lg border border-white/12 bg-gradient-to-b from-zinc-800/90 to-zinc-950/95 shadow-[0_12px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.06]">
            <div className="absolute inset-x-2 top-2 h-[72%] rounded-sm bg-white shadow-inner shadow-black/20" />
            <FileText
              className="relative z-[1] h-7 w-7 text-amber-200/75"
              strokeWidth={1.35}
            />
            <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-300/80" strokeWidth={1.5} />
          </div>
          <span className="text-center text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Maquetación editorial
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsStudioOpen(true);
          }}
          className="nodrag relative z-[1] rounded-xl border border-amber-400/35 bg-gradient-to-b from-amber-500/25 to-orange-600/15 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-50 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:border-amber-300/50 hover:from-amber-500/35 hover:to-orange-600/25"
        >
          Open Studio
        </button>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label text-amber-200/90">PDF</span>
        <FoldderDataHandle type="source" position={Position.Right} id="pdf" dataType="pdf" />
      </div>

      {isStudioOpen &&
        createPortal(
          <IndesignStudio
            onClose={() => setIsStudioOpen(false)}
            initialPages={pages}
            activePageIndex={activeIdx}
            onUpdatePages={onUpdatePages}
          />,
          document.body,
        )}
    </div>
  );
});

IndesignNode.displayName = "IndesignNode";
