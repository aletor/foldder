"use client";

import React from "react";
import { ArrowLeftRight, Copy, Layers, Maximize2, Plus, Trash2 } from "lucide-react";
import type { DesignerPageState } from "./DesignerNode";
import { DesignerPagePreview } from "./DesignerPagePreview";
import { formatById, getPageDimensions } from "../indesign/page-formats";

export type DesignerPagesRailProps = {
  pages: DesignerPageState[];
  activePageIndex: number;
  pageThumbnails: Record<string, string>;
  scrollElRef: React.RefObject<HTMLDivElement | null>;
  onRailScroll: (scrollTop: number) => void;
  suppressPageThumbClickRef: React.MutableRefObject<boolean>;
  goToDesignerPage: (i: number) => void;
  movePage: (fromIndex: number, toIndex: number) => void;
  swapOrientation: (idx: number) => void;
  duplicatePage: (idx: number) => void;
  deletePage: (idx: number) => void;
  onAddPage: () => void;
  onRequestResizePageModal: (pageIndex: number) => void;
};

export function DesignerPagesRail({
  pages,
  activePageIndex,
  pageThumbnails,
  scrollElRef,
  onRailScroll,
  suppressPageThumbClickRef,
  goToDesignerPage,
  movePage,
  swapOrientation,
  duplicatePage,
  deletePage,
  onAddPage,
  onRequestResizePageModal,
}: DesignerPagesRailProps) {
  const mouseDragFromRef = React.useRef<number | null>(null);
  const mouseDragActiveRef = React.useRef(false);
  const [mouseDragHoverIndex, setMouseDragHoverIndex] = React.useState<number | null>(null);

  const endMouseDrag = React.useCallback((commit: boolean) => {
    void commit;
    mouseDragActiveRef.current = false;
    mouseDragFromRef.current = null;
    setMouseDragHoverIndex(null);
  }, []);

  React.useEffect(() => {
    const onMouseUp = () => endMouseDrag(true);
    const onWindowBlur = () => endMouseDrag(false);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [endMouseDrag]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-center border-b border-white/[0.08] py-2">
        <Layers className="h-3.5 w-3.5 text-violet-300/70" strokeWidth={2} />
      </div>
      <div className="shrink-0 border-b border-white/[0.08] px-1 py-1.5">
        <button
          type="button"
          title="Añadir página"
          onClick={onAddPage}
          className="flex w-full items-center justify-center gap-1 rounded-[2px] border border-dashed border-white/18 bg-white/[0.02] py-1.5 text-[10px] font-medium text-zinc-400 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-zinc-200"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Nueva
        </button>
      </div>
      <div
        ref={scrollElRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1.5"
        onScroll={(e) => {
          onRailScroll(e.currentTarget.scrollTop);
        }}
      >
        <div className="flex flex-col gap-2">
          {pages.map((p, i) => {
            const pd = getPageDimensions(p);
            const pf = formatById(p.format);
            const active = i === activePageIndex;
            const resLabel = `${Math.round(pd.width)}×${Math.round(pd.height)}`;
            const railThumb = pageThumbnails[p.id];
            return (
              <div
                key={p.id}
                data-designer-rail-index={i}
                className={`rounded-[2px] border bg-black/15 px-0.5 py-1 ${
                  mouseDragHoverIndex === i ? "border-violet-400/60" : "border-white/[0.08]"
                }`}
                onMouseEnter={() => {
                  if (!mouseDragActiveRef.current) return;
                  const from = mouseDragFromRef.current;
                  if (from == null) return;
                  if (from !== i) {
                    movePage(from, i);
                    mouseDragFromRef.current = i;
                  }
                  setMouseDragHoverIndex(i);
                  suppressPageThumbClickRef.current = true;
                }}
              >
                <div className="flex w-full flex-col gap-0.5">
                  <div
                    role="button"
                    tabIndex={0}
                    title={`${i + 1}. ${pf.label} · ${resLabel} — arrastra para reordenar; clic para ver en pantalla`}
                    className={`relative flex w-full cursor-grab touch-none flex-col items-center gap-0.5 rounded-[2px] border px-0.5 py-0.5 text-left transition active:cursor-grabbing ${
                      active
                        ? "border-violet-400/45 bg-violet-950/35 shadow-[0_0_0_1px_rgba(167,139,250,0.15)]"
                        : "border-white/[0.08] bg-black/20 hover:border-white/15"
                    }`}
                    onClick={() => {
                      if (suppressPageThumbClickRef.current) {
                        suppressPageThumbClickRef.current = false;
                        return;
                      }
                      goToDesignerPage(i);
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      suppressPageThumbClickRef.current = false;
                      goToDesignerPage(i);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToDesignerPage(i);
                      }
                    }}
                  >
                    <div
                      className="absolute inset-0 z-10"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        mouseDragActiveRef.current = true;
                        mouseDragFromRef.current = i;
                        setMouseDragHoverIndex(i);
                      }}
                    />
                    <div className="flex h-[72px] w-full items-stretch justify-center overflow-hidden rounded-[2px] bg-zinc-950/90 ring-1 ring-inset ring-white/[0.06]">
                      {railThumb ? (
                        // Data URL del export del lienzo; `<Image>` no aporta aquí.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={railThumb}
                          alt=""
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <DesignerPagePreview
                          objects={p.objects ?? []}
                          pageWidth={pd.width}
                          pageHeight={pd.height}
                        />
                      )}
                    </div>
                    <span className="font-mono text-[8px] font-bold tabular-nums text-zinc-500">{i + 1}</span>
                    <span className="max-w-full truncate px-0.5 text-center font-mono text-[6px] leading-tight text-zinc-500">
                      {resLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex w-full justify-center gap-0.5">
                  <button
                    type="button"
                    title="Intercambiar orientación"
                    className="rounded-[2px] border border-white/[0.12] bg-white/[0.06] p-0.5 text-white transition hover:bg-white/12"
                    onClick={(e) => {
                      e.stopPropagation();
                      swapOrientation(i);
                    }}
                  >
                    <ArrowLeftRight className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    title="Tamaño del pliego (preset)"
                    className="rounded-[2px] border border-white/[0.12] bg-white/[0.06] p-0.5 text-white transition hover:bg-white/12"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestResizePageModal(i);
                    }}
                  >
                    <Maximize2 className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    title="Duplicar página"
                    className="rounded-[2px] border border-white/25 bg-white/[0.12] p-0.5 text-white transition hover:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicatePage(i);
                    }}
                  >
                    <Copy className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    title="Eliminar página"
                    disabled={pages.length <= 1}
                    className="rounded-[2px] border border-white/25 bg-white/[0.12] p-0.5 text-white transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-35"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(i);
                    }}
                  >
                    <Trash2 className="h-2.5 w-2.5" strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
