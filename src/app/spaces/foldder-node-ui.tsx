"use client";

import React, { memo, useCallback, useState, useEffect } from "react";
import { useReactFlow, useStore, useNodeId, type Node } from "@xyflow/react";
import { Maximize2 } from "lucide-react";
import { useFoldderCanvasIntroContext } from "./foldder-canvas-intro-context";
import { useInputMode } from "./input-mode-context";

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
  const nodeType = useStore(
    useCallback((state: { nodes: Node[] }) => state.nodes.find((n) => n.id === id)?.type, [id]),
  );
  const isSystemLabel = label && (label.startsWith("AI_SPACE_") || label.match(/\.(jpg|jpeg|png|webp|mp4)$/i));
  // Etiqueta auto-generada antigua ("<type> node"): tratar como no-personalizada y usar el nombre amigable.
  const isGenericTypeLabel = Boolean(
    label && nodeType && label.trim().toLowerCase() === `${nodeType.toLowerCase()} node`,
  );
  const hasCustomLabel = Boolean(label) && !isSystemLabel && !isGenericTypeLabel;
  const needsGeneratedIndex = !label || Boolean(isSystemLabel);
  const index = useStore(
    useCallback((state: { nodes: Node[] }) => {
      if (!needsGeneratedIndex) return 0;
      const t = state.nodes.find((n) => n.id === id)?.type;
      const sameTypeNodes = state.nodes
        .filter((n) => n.type === t)
        .sort((a, b) => {
          if (a.position.y !== b.position.y) return a.position.y - b.position.y;
          return a.position.x - b.position.x;
        });
      return sameTypeNodes.findIndex((n) => n.id === id) + 1;
    }, [id, needsGeneratedIndex]),
  );
  const displayLabel: string = hasCustomLabel
    ? (label as string)
    : isGenericTypeLabel
      ? defaultLabel
      : `${defaultLabel} ${index}`;

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = val.split(" ").slice(0, 5).join(" ");
    setNodes((nds: Node[]) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data ?? {}), label: trimmed } } : n)),
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
          className="nodrag min-w-[120px] cursor-text rounded-none border-0 bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-900 shadow-sm outline-none backdrop-blur-xl placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/40"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            e.currentTarget.select();
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setVal(displayLabel);
            setIsEditing(true);
          }}
          className="nodrag flex cursor-pointer select-none items-center gap-2 truncate rounded-none border-0 bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-800 shadow-sm backdrop-blur-xl transition-all hover:text-cyan-900"
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
  introActive: introActiveProp,
  className,
}: {
  children: string;
  introActive?: boolean;
  className?: string;
}) {
  const nodeId = useNodeId();
  const { isTouchUI } = useInputMode();
  const { isNodeInCanvasIntro } = useFoldderCanvasIntroContext();
  const introActive =
    !isTouchUI &&
    ((nodeId ? isNodeInCanvasIntro(nodeId) : false) || !!introActiveProp);
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

/** Botón unificado para abrir Studio Mode desde el overlay del nodo. */
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
    <div className={`pointer-events-none absolute bottom-3 right-3 z-[15] ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        title="Open Studio"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
        className="foldder-node-footer-button pointer-events-auto nodrag inline-flex items-center gap-1.5 rounded-none border-0 bg-white px-3 py-1.5 text-[11px] font-semibold text-black shadow-none transition hover:scale-[1.02] hover:bg-[#f7f7f4] disabled:pointer-events-none disabled:opacity-35"
      >
        <Maximize2 size={13} strokeWidth={2.4} className="shrink-0" />
        Open Studio
      </button>
    </div>
  );
});
