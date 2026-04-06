"use client";

import React from 'react';
import { X } from 'lucide-react';
import { NODE_REGISTRY } from './nodeRegistry';
import { NodeIcon } from './foldder-icons';

export const MAX_PINNED_NODES = 5;
export const PINNED_NODES_STORAGE_KEY = "foldder-pinned-node-types";

/** Orden por defecto: prompt, nano, export, canvas (background), video (gemini) */
export const DEFAULT_PINNED_NODE_TYPES: string[] = [
  "promptInput",
  "nanoBanana",
  "imageExport",
  "background",
  "geminiVideo",
];

type PinnedNodeToolbarProps = {
  pinnedTypes: string[];
  onUnpin: (nodeType: string) => void;
  onLibraryDragStart?: (nodeType: string) => void;
  onLibraryDragEnd?: () => void;
  /** Soltar un tipo desde la barra lateral sobre el rectángulo */
  onDropPinFromSidebar?: (nodeType: string) => void;
};

/** Accesos rápidos: rectángulo con mismo radio que los botones de acción (rounded-xl) */
export function PinnedNodeToolbar({
  pinnedTypes,
  onUnpin,
  onLibraryDragStart,
  onLibraryDragEnd,
  onDropPinFromSidebar,
}: PinnedNodeToolbarProps) {
  return (
    <div
      data-foldder-pins
      className="shrink-0 flex items-center max-w-[min(520px,46vw)]"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = e.dataTransfer.getData("application/reactflow");
        if (t && NODE_REGISTRY[t]) {
          onDropPinFromSidebar?.(t);
        }
      }}
    >
      <div
        className="flex flex-wrap items-center gap-1 min-h-[40px] w-full px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/[0.07] backdrop-blur-md border border-white/10 shadow-sm"
        title="Accesos rápidos — arrastra nodos desde la librería (máx. 5)"
      >
        {pinnedTypes.length === 0 && (
          <span className="text-[8px] font-bold text-white/35 uppercase tracking-widest px-1 py-0.5">
            Arrastra aquí desde la librería (máx. 5)
          </span>
        )}
        {pinnedTypes.map((type) => {
          const meta = NODE_REGISTRY[type];
          if (!meta) return null;
          const short =
            meta.label.length > 16 ? `${meta.label.slice(0, 14)}…` : meta.label;

          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => {
                onLibraryDragStart?.(type);
                e.dataTransfer.setData("application/reactflow", type);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => onLibraryDragEnd?.()}
              className="group/pin flex items-center gap-1 shrink-0 pl-1 pr-0.5 py-0.5 rounded-lg bg-white/[0.08] hover:bg-white/15 border border-white/10 hover:border-white/20 cursor-grab active:cursor-grabbing active:scale-[0.98] transition-all max-w-[118px]"
              title={`${meta.label} — arrastra al lienzo`}
            >
              <NodeIcon type={type} size={15} className="shrink-0 text-white/90" />
              <span className="text-[7px] font-bold text-white/85 uppercase tracking-[0.06em] truncate leading-none">
                {short}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin(type);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover/pin:opacity-100 p-0.5 rounded hover:bg-white/15 shrink-0 transition-opacity"
                title="Quitar de la barra"
              >
                <X size={10} className="text-white/45 hover:text-white/80" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
