"use client";

import React, { memo, useState, useEffect } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { Maximize2 } from "lucide-react";

const FOLDDER_HEADER_TYPEWRITER_DELAY_MS = 1000;

/** Etiqueta flotante sobre el nodo (doble clic para renombrar). */
export const NodeLabel = ({
  id,
  label,
  defaultLabel,
}: {
  id: string;
  label?: string;
  defaultLabel: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(label || "");
  const { setNodes } = useReactFlow();
  const allNodes = useNodes();

  const nodeType = allNodes.find((n) => n.id === id)?.type;
  const sameTypeNodes = allNodes
    .filter((n) => n.type === nodeType)
    .sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      return a.position.x - b.position.x;
    });

  const index = sameTypeNodes.findIndex((n) => n.id === id) + 1;
  const isSystemLabel = label && (label.startsWith("AI_SPACE_") || label.match(/\.(jpg|jpeg|png|webp|mp4)$/i));
  const displayLabel = label && !isSystemLabel ? label : `${defaultLabel} ${index}`;

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = val.split(" ").slice(0, 5).join(" ");
    setNodes((nds: any) =>
      nds.map((n: any) => (n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n)),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBlur();
    if (e.key === "Escape") {
      setVal(label || "");
      setIsEditing(false);
    }
  };

  return (
    <div className="absolute -top-7 left-0 z-[100] group/label">
      {isEditing ? (
        <input
          autoFocus
          className="min-w-[120px] cursor-text rounded-lg border-0 bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-900 shadow-sm outline-none backdrop-blur-xl placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/40"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          className="flex cursor-pointer select-none items-center gap-2 truncate rounded-lg border-0 bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-800 shadow-sm backdrop-blur-xl transition-all hover:text-cyan-900"
          title="Double click to rename (max 5 words)"
        >
          <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-600" />
          {displayLabel}
        </div>
      )}
    </div>
  );
};

/** Título de cabecera: estilo global + typewriter si intro. */
export const FoldderNodeHeaderTitle = memo(function FoldderNodeHeaderTitle({
  children,
  introActive,
  className,
}: {
  children: string;
  introActive?: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => (introActive ? "" : children));

  useEffect(() => {
    if (!introActive) {
      setDisplay(children);
      return;
    }
    const len = children.length;
    if (len === 0) {
      setDisplay("");
      return;
    }
    setDisplay("");
    let intervalId: number | null = null;
    const startDelay = window.setTimeout(() => {
      const msPerChar = Math.min(45, Math.max(8, 2000 / len));
      let i = 0;
      intervalId = window.setInterval(() => {
        i += 1;
        setDisplay(children.slice(0, i));
        if (i >= len && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, msPerChar);
    }, FOLDDER_HEADER_TYPEWRITER_DELAY_MS);
    return () => {
      window.clearTimeout(startDelay);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [introActive, children]);

  const titleClass = ["min-w-0 flex-1 node-header__title font-light", className].filter(Boolean).join(" ");
  return <span className={titleClass}>{display}</span>;
});

/** Botón central unificado para abrir Studio Mode en previews de nodos. */
export const FoldderStudioModeCenterButton = memo(function FoldderStudioModeCenterButton({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 z-[15] overflow-hidden opacity-0 transition-opacity duration-200 group-hover/node:opacity-100 ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
        <button
          type="button"
          disabled={disabled}
          title="Studio Mode"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onClick();
          }}
          className="pointer-events-auto nodrag flex max-w-[min(100%,220px)] flex-col items-center gap-1.5 rounded-2xl border border-white/30 bg-white/[0.12] px-6 py-3.5 shadow-xl backdrop-blur-xl transition-all duration-300 ease-out hover:scale-[1.03] hover:bg-white/[0.22] hover:shadow-2xl disabled:pointer-events-none disabled:opacity-35"
        >
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Studio
          </span>
          <span className="flex items-center gap-2 font-mono text-[17px] font-black uppercase tracking-wide text-zinc-50">
            <Maximize2 size={22} strokeWidth={2.5} className="shrink-0 text-violet-200" />
            Mode
          </span>
        </button>
      </div>
    </div>
  );
});
