"use client";

import React from "react";
import { ArrowLeftRight, Copy, Layers, Maximize2, Plus, Repeat, Trash2 } from "lucide-react";
import type { DesignerPageState } from "./DesignerNode";
import { DesignerPagePreview } from "./DesignerPagePreview";
import { designerPageThumbContentKey } from "./designer-studio-pure";
import { formatById, getPageDimensions } from "../indesign/page-formats";

export type DesignerLoopListOption = {
  id: string;
  name: string;
  cardCount: number;
};

export type DesignerPagesRailProps = {
  pages: DesignerPageState[];
  activePageIndex: number;
  pageThumbnails: Record<string, string>;
  /** Clave de contenido al capturar cada raster; si no coincide con la página actual, se usa la vista previa vectorial. */
  pageThumbnailContentKeys: Record<string, string>;
  scrollElRef: React.RefObject<HTMLDivElement | null>;
  onRailScroll: (scrollTop: number) => void;
  suppressPageThumbClickRef: React.MutableRefObject<boolean>;
  goToDesignerPage: (i: number) => void;
  movePage: (fromIndex: number, toIndex: number) => void;
  swapOrientation: (idx: number) => void;
  duplicatePage: (idx: number) => void;
  onRequestDeletePages: (indices: number[]) => void;
  onAddPage: () => void;
  /** Renombra la slide (nombre legible que heredan las columnas del Dataset al popular). */
  onRenameSlide?: (index: number, name: string) => void;
  /** Listados disponibles para "+ Bucle" (vacío = sin Dataset conectado). */
  datasetLoopLists?: DesignerLoopListOption[];
  /** Genera una página por fila del listado elegido. */
  onGenerateLoop?: (listId: string) => void;
  /** Hay un bucle ya generado (el deck está enlazado a un listado del Dataset). */
  loopActive?: boolean;
  onRequestResizePageModal: (pageIndex: number) => void;
};

export function DesignerPagesRail({
  pages,
  activePageIndex,
  pageThumbnails,
  pageThumbnailContentKeys,
  scrollElRef,
  onRailScroll,
  suppressPageThumbClickRef,
  goToDesignerPage,
  movePage,
  swapOrientation,
  duplicatePage,
  onRequestDeletePages,
  onAddPage,
  onRenameSlide,
  datasetLoopLists = [],
  onGenerateLoop,
  loopActive = false,
  onRequestResizePageModal,
}: DesignerPagesRailProps) {
  const mouseDragFromRef = React.useRef<number | null>(null);
  const mouseDragActiveRef = React.useRef(false);
  const [mouseDragHoverIndex, setMouseDragHoverIndex] = React.useState<number | null>(null);
  const [loopPickerOpen, setLoopPickerOpen] = React.useState(false);
  const loopWrapRef = React.useRef<HTMLDivElement | null>(null);
  const railRootRef = React.useRef<HTMLDivElement | null>(null);
  const selectionAnchorRef = React.useRef(0);
  const [selectedIndices, setSelectedIndices] = React.useState<Set<number>>(() => new Set([activePageIndex]));
  const datasetConnected = datasetLoopLists.length > 0;

  React.useEffect(() => {
    setSelectedIndices((prev) => {
      if (prev.size > 1 && prev.has(activePageIndex)) return prev;
      return new Set([activePageIndex]);
    });
    selectionAnchorRef.current = activePageIndex;
  }, [activePageIndex]);

  const handleSlideSelect = React.useCallback(
    (index: number, e: React.MouseEvent) => {
      railRootRef.current?.focus({ preventScroll: true });
      if (e.shiftKey) {
        const anchor = selectionAnchorRef.current;
        const from = Math.min(anchor, index);
        const to = Math.max(anchor, index);
        const next = new Set<number>();
        for (let i = from; i <= to; i++) next.add(i);
        setSelectedIndices(next);
        goToDesignerPage(index);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        setSelectedIndices((prev) => {
          const next = new Set(prev);
          if (next.has(index)) {
            if (next.size <= 1) return prev;
            next.delete(index);
            if (index === activePageIndex) {
              const remaining = [...next].sort((a, b) => a - b);
              const fallback = remaining.filter((i) => i < index).pop() ?? remaining[0] ?? 0;
              queueMicrotask(() => goToDesignerPage(fallback));
            }
          } else {
            next.add(index);
            queueMicrotask(() => goToDesignerPage(index));
          }
          return next;
        });
        selectionAnchorRef.current = index;
        return;
      }
      selectionAnchorRef.current = index;
      setSelectedIndices(new Set([index]));
      goToDesignerPage(index);
    },
    [goToDesignerPage],
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedIndices.size === 0) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const railFocused = railRootRef.current?.contains(document.activeElement) ?? false;
      if (selectedIndices.size === 1 && !railFocused) return;
      e.preventDefault();
      e.stopPropagation();
      onRequestDeletePages([...selectedIndices].sort((a, b) => a - b));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onRequestDeletePages, selectedIndices]);

  React.useEffect(() => {
    if (!loopPickerOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (loopWrapRef.current && !loopWrapRef.current.contains(e.target as Node)) {
        setLoopPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [loopPickerOpen]);

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
    <div
      ref={railRootRef}
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col outline-none"
      onMouseDown={() => {
        railRootRef.current?.focus({ preventScroll: true });
      }}
    >
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
        {datasetConnected && (
          <div ref={loopWrapRef} className="relative mt-1.5">
            <button
              type="button"
              title={
                loopActive
                  ? "Conectado a Dataset · recalcular el bucle con las filas actuales"
                  : "Generar una página por fila del listado"
              }
              onClick={() => setLoopPickerOpen((v) => !v)}
              className={`flex w-full items-center justify-center gap-1 rounded-[2px] border py-1.5 text-[10px] font-medium transition ${
                loopActive
                  ? "border-teal-400/50 bg-teal-500/15 text-teal-100 hover:bg-teal-500/25"
                  : "border-dashed border-teal-400/30 bg-teal-500/[0.06] text-teal-200/90 hover:border-teal-400/50 hover:bg-teal-500/15 hover:text-teal-100"
              }`}
            >
              <Repeat className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {loopActive ? (
                <span className="flex min-w-0 flex-col items-center leading-tight">
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-teal-300/80">
                    Conectado a Dataset
                  </span>
                  <span>Recalcular</span>
                </span>
              ) : (
                "Bucle"
              )}
            </button>
            {loopPickerOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-[4px] border border-white/[0.12] bg-[#15181e] shadow-xl">
                <div className="border-b border-white/[0.08] px-2 py-1.5 text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
                  Elegir listado
                </div>
                {datasetLoopLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    disabled={list.cardCount <= 0}
                    onClick={() => {
                      setLoopPickerOpen(false);
                      onGenerateLoop?.(list.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[10px] text-zinc-200 transition hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="truncate">{list.name}</span>
                    <span className="shrink-0 font-mono text-[9px] text-zinc-500">{list.cardCount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
            const selected = selectedIndices.has(i);
            const resLabel = `${Math.round(pd.width)}×${Math.round(pd.height)}`;
            const thumbContentKey = designerPageThumbContentKey(p);
            const railThumb =
              pageThumbnails[p.id] && pageThumbnailContentKeys[p.id] === thumbContentKey
                ? pageThumbnails[p.id]
                : null;
            return (
              <div
                key={p.id}
                data-designer-rail-index={i}
                className={`rounded-[2px] border bg-black/15 px-0.5 py-1 ${
                  mouseDragHoverIndex === i
                    ? "border-violet-400/60"
                    : selected
                      ? "border-sky-400/50"
                      : "border-white/[0.08]"
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
                    title={`${i + 1}. ${pf.label} · ${resLabel} — clic para ver; ⇧ clic rango; ⌘/Ctrl clic varias; Supr para eliminar`}
                    className={`relative flex w-full cursor-grab touch-none flex-col items-center gap-0.5 rounded-[2px] border px-0.5 py-0.5 text-left transition active:cursor-grabbing ${
                      active
                        ? "border-violet-400/45 bg-violet-950/35 shadow-[0_0_0_1px_rgba(167,139,250,0.15)]"
                        : selected
                          ? "border-sky-400/40 bg-sky-950/25 shadow-[0_0_0_1px_rgba(56,189,248,0.12)]"
                          : "border-white/[0.08] bg-black/20 hover:border-white/15"
                    }`}
                    onClick={(e) => {
                      if (suppressPageThumbClickRef.current) {
                        suppressPageThumbClickRef.current = false;
                        return;
                      }
                      handleSlideSelect(i, e);
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      suppressPageThumbClickRef.current = false;
                      handleSlideSelect(i, e);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSlideSelect(i, e as unknown as React.MouseEvent);
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
                  <input
                    type="text"
                    value={p.slideName ?? ""}
                    placeholder={`Slide ${i + 1}`}
                    title="Nombre de la slide (lo heredan las columnas del Dataset al popular)"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onRenameSlide?.(i, e.target.value)}
                    className="nodrag mt-0.5 w-full rounded-[2px] border border-white/[0.08] bg-black/30 px-1 py-0.5 text-center text-[7px] leading-tight text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-sky-400/40"
                  />
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
                      onRequestDeletePages([i]);
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
