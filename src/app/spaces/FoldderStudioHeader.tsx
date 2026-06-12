"use client";

import React from "react";
import { X } from "lucide-react";
import { resolveFoldderNodeStudioBackground } from "./studio-node/foldder-studio-node-backgrounds";

export type FoldderStudioHeaderProps = {
  nodeType: string;
  /** Nombre visible del nodo (label del nodo o nombre de la app). */
  nodeLabel: string;
  subtitle?: string;
  onClose?: () => void;
  closeLabel?: string;
  /** Sustituye el bloque título/subtítulo por contenido custom (p. ej. input de título). */
  titleSlot?: React.ReactNode;
  /** Acciones entre título y cerrar (Guardar, Play, Minimizar…). */
  actions?: React.ReactNode;
  className?: string;
};

export function foldderStudioHeaderActionClassName(extra = ""): string {
  return [
    "flex h-10 shrink-0 items-center justify-center gap-1.5 border-l border-white/15 bg-black/30 px-3",
    "text-[10px] font-black uppercase tracking-[0.08em] text-white/80",
    "transition hover:bg-black/45 hover:text-white",
    "disabled:pointer-events-none disabled:opacity-40",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function foldderStudioHeaderIconActionClassName(extra = ""): string {
  return [
    "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/20 bg-black/45",
    "text-white transition hover:bg-black/60 hover:text-white",
    "disabled:pointer-events-none disabled:opacity-40",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function FoldderStudioHeader({
  nodeType,
  nodeLabel,
  subtitle,
  onClose,
  closeLabel = "Cerrar",
  titleSlot,
  actions,
  className = "",
}: FoldderStudioHeaderProps) {
  const backgroundSrc = resolveFoldderNodeStudioBackground(nodeType);

  return (
    <header
      data-foldder-studio-header
      className={`relative z-[100020] flex h-10 shrink-0 items-stretch overflow-hidden border-b border-white/10 bg-white/[0.08] ${className}`.trim()}
    >
      <div className="relative z-10 flex min-w-0 flex-1 items-stretch">
        <div className="flex h-10 w-10 shrink-0 overflow-hidden border-r border-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backgroundSrc} alt="" className="h-full w-full object-cover object-center" draggable={false} />
        </div>

        <div className="flex min-w-0 flex-1 items-stretch border-r border-white/15">
          {titleSlot ? (
            <div className="flex min-w-0 flex-1 items-center px-3">{titleSlot}</div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col justify-center px-3">
              <h1 className="truncate text-[11px] font-black uppercase tracking-[0.1em] text-white">
                {nodeLabel}
              </h1>
              {subtitle ? (
                <p className="truncate text-[9px] font-semibold text-white/72">{subtitle}</p>
              ) : null}
            </div>
          )}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-stretch divide-x divide-white/15">{actions}</div>
        ) : null}

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            data-foldder-studio-header-close
            className={foldderStudioHeaderIconActionClassName()}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
