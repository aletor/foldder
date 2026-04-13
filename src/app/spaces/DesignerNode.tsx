"use client";

import React, { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeIcon } from "./foldder-icons";
import type { IndesignPageFormatId } from "./indesign/page-formats";
import type { Story, TextFrame } from "./indesign/text-model";
import type { ImageFrameRecord } from "./indesign/image-frame-model";
import type { FreehandObject, LayoutGuide } from "./FreehandStudio";

export type DesignerPageState = {
  id: string;
  format: IndesignPageFormatId;
  customWidth?: number;
  customHeight?: number;
  objects: FreehandObject[];
  layoutGuides?: LayoutGuide[];
  stories?: Story[];
  textFrames?: TextFrame[];
  imageFrames?: ImageFrameRecord[];
};

export type DesignerNodeData = {
  label?: string;
  value?: string;
  pages?: DesignerPageState[];
  activePageIndex?: number;
};

function DesignerNodeResizer(props: React.ComponentProps<typeof NodeResizer>) {
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

export const DesignerNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as DesignerNodeData;
  const { setNodes } = useReactFlow();
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const pages: DesignerPageState[] =
    Array.isArray(nodeData.pages) && nodeData.pages.length > 0
      ? nodeData.pages
      : [
          {
            id: `dpg_${id}_0`,
            format: "a4v",
            objects: [],
            layoutGuides: [],
            stories: [],
            textFrames: [],
            imageFrames: [],
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

  const onUpdatePages = useCallback(
    (next: DesignerPageState[], nextActiveIdx?: number) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  pages: next,
                  ...(nextActiveIdx !== undefined ? { activePageIndex: nextActiveIdx } : {}),
                },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const onExport = useCallback(
    (dataUrl: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, value: dataUrl } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <div className="custom-node tool-node group/node" style={{ minWidth: 280 }}>
      <DesignerNodeResizer minWidth={280} minHeight={200} maxWidth={520} maxHeight={420} isVisible={selected} />

      <div className="node-header border-b border-violet-500/15 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-900/90">
        <NodeIcon type="designer" selected={selected} size={16} />
        <span className="flex-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-zinc-100">
          Designer
        </span>
        <div className="node-badge">DESIGN</div>
      </div>

      <div className="node-content relative" style={{ minHeight: 120 }}>
        {nodeData.value ? (
          <img
            src={nodeData.value}
            alt="Designer preview"
            className="w-full rounded-lg"
            style={{ maxHeight: 180, objectFit: "contain" }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 opacity-40">
            <Pencil size={28} className="text-violet-400" strokeWidth={1.5} />
            <span className="text-[7px] font-black uppercase tracking-widest text-zinc-500">
              Open Studio to design
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsStudioOpen(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 hover:bg-black/40 hover:opacity-100 group-hover/node:opacity-100"
        >
          <span className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg">
            Open Studio
          </span>
        </button>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label">Image</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {isStudioOpen &&
        createPortal(
          <DesignerStudioLazy
            initialPages={pages}
            activePageIndex={activeIdx}
            onClose={() => setIsStudioOpen(false)}
            onExport={onExport}
            onUpdatePages={onUpdatePages}
          />,
          document.body,
        )}
    </div>
  );
});

function DesignerStudioLazy(props: {
  initialPages: DesignerPageState[];
  activePageIndex: number;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onUpdatePages: (pages: DesignerPageState[], activeIdx?: number) => void;
}) {
  const [Studio, setStudio] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import("./DesignerStudio").then((m) => setStudio(() => m.default));
  }, []);
  if (!Studio) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0b0d10]">
        <span className="animate-pulse text-sm text-zinc-500">Loading Designer Studio…</span>
      </div>
    );
  }
  return <Studio {...props} />;
}
