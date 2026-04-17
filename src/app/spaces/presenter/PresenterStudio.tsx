"use client";

import React, { useEffect, useState } from "react";
import { X, Presentation } from "lucide-react";
import { getPageDimensions } from "../indesign/page-formats";
import type { DesignerPageState } from "../designer/DesignerNode";
import { DesignerPageCanvasView } from "./DesignerPageCanvasView";

type Props = {
  pages: DesignerPageState[];
  onClose: () => void;
};

/**
 * Fase 1: vista previa por página (slides). Steps y animaciones en fases posteriores.
 */
export function PresenterStudio({ pages, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, []);

  const safeIdx = Math.min(Math.max(0, activeIdx), Math.max(0, pages.length - 1));
  const page = pages[safeIdx];
  const dims = page ? getPageDimensions(page) : { width: 1920, height: 1080 };

  return (
    <div
      className="fixed inset-0 z-[100010] flex flex-col bg-[#0b0d10]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presenter-studio-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#12151a]/95 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <Presentation className="shrink-0 text-amber-400" size={20} strokeWidth={1.75} aria-hidden />
          <h1 id="presenter-studio-title" className="truncate text-sm font-bold tracking-tight text-white">
            Presenter
          </h1>
          <span className="hidden text-[11px] text-zinc-500 sm:inline">
            Vista previa · {pages.length} {pages.length === 1 ? "slide" : "slides"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/[0.06] p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Cerrar"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:gap-4 md:p-4">
        <aside className="flex shrink-0 flex-row gap-2 overflow-x-auto pb-1 md:w-44 md:flex-col md:overflow-y-auto md:pb-0">
          {pages.map((p, i) => {
            const d = getPageDimensions(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`flex shrink-0 flex-col gap-1 rounded-xl border p-2 text-left transition-colors ${
                  i === safeIdx
                    ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30"
                    : "border-white/[0.08] bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
                }`}
              >
                <span className="text-[10px] font-semibold text-zinc-300">
                  {i + 1}. Slide
                </span>
                <div
                  className="w-32 overflow-hidden rounded-md border border-white/10 bg-[#fafafa] md:w-full"
                  style={{
                    aspectRatio: `${Math.max(1, d.width)} / ${Math.max(1, d.height)}`,
                  }}
                >
                  <DesignerPageCanvasView
                    objects={p.objects ?? []}
                    pageWidth={d.width}
                    pageHeight={d.height}
                  />
                </div>
              </button>
            );
          })}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-white/[0.08] bg-[#0e1014] p-3 shadow-inner">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-zinc-400">
              Slide {safeIdx + 1} / {pages.length}
            </p>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-[#fafafa]">
            {page && (
              <div className="absolute inset-0 flex items-center justify-center p-2">
                <div
                  className="h-full w-full max-h-full max-w-full"
                  style={{
                    aspectRatio: `${Math.max(1, dims.width)} / ${Math.max(1, dims.height)}`,
                  }}
                >
                  <DesignerPageCanvasView
                    objects={page.objects ?? []}
                    pageWidth={dims.width}
                    pageHeight={dims.height}
                  />
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            Próximamente: pasos de animación, reproducción con clic y sustitución imagen → vídeo.
          </p>
        </main>
      </div>
    </div>
  );
}
