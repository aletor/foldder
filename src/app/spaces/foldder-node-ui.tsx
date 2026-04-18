"use client";

import React, { memo, useState, useEffect } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";

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
