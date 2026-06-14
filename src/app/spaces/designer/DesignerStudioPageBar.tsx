"use client";

import React from "react";
import type { DesignerPageState } from "./DesignerNode";

type Props = {
  pages: DesignerPageState[];
  activePageIndex: number;
  onGoToPage: (index: number) => void;
};

/** Barra inferior fija: accesos rápidos al número de página (misma interacción que el rail). */
export function DesignerStudioPageBar({ pages, activePageIndex, onGoToPage }: Props) {
  return (
    <div className="pointer-events-auto fixed bottom-0 left-1/2 z-[10001] -translate-x-1/2 flex items-center gap-1 rounded-none border border-b-0 border-white/[0.08] bg-[#0e1015]/90 px-3 py-1.5 backdrop-blur-md">
      {pages.map((p, i) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            onGoToPage(i);
          }}
          className={`min-w-[1.75rem] rounded-none px-2 py-1 text-[10px] font-bold tabular-nums transition ${
            i === activePageIndex
              ? "bg-[#534AB7] text-white"
              : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
          }`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
