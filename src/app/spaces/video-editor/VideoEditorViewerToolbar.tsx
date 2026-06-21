"use client";

import React from "react";
import { Maximize2, Ruler, Scan } from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function VideoEditorViewerToolbar({
  showGuides,
  onShowGuidesChange,
  onFitViewer,
  onToggleFullscreen,
  isFullscreen,
}: {
  showGuides: boolean;
  onShowGuidesChange: (on: boolean) => void;
  onFitViewer: () => void;
  onToggleFullscreen: () => void;
  isFullscreen?: boolean;
}) {
  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-0.5 border-b border-white/10 pb-1.5">
      <button
        type="button"
        onClick={onFitViewer}
        title="Ajustar visor"
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:bg-white/[0.06] hover:text-white/85"
      >
        <Scan size={12} />
        Fit
      </button>
      <button
        type="button"
        onClick={() => onShowGuidesChange(!showGuides)}
        title="Guías / Safe area"
        className={cx(
          "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition",
          showGuides ? "bg-[#3a8f96]/25 text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
        )}
      >
        <Ruler size={12} />
        Guides
      </button>
      <button
        type="button"
        onClick={onToggleFullscreen}
        title="Pantalla completa (P)"
        className={cx(
          "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition",
          isFullscreen ? "bg-[#3a8f96]/25 text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
        )}
      >
        <Maximize2 size={12} />
        Full
      </button>
    </div>
  );
}
