"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Magnet,
  Maximize2,
  MoveVertical,
  Pin,
  Square,
  UnfoldVertical,
  Waves,
  X,
} from "lucide-react";
import { floatingPressHandlers, isNodeInsideRefs } from "./site-creator-floating-press";
import type { SiteSectionHeightMode, SiteSectionScrollKind } from "./site-creator-types";
import {
  SECTION_SCROLL_HINT,
  SECTION_SCROLL_KINDS,
  SECTION_SCROLL_LABEL,
} from "./site-creator-section-scroll";

const ACCENT = "#c4a882";

/** Ancho del margen izquierdo (px de pantalla) donde vive el spine, fuera de la página. */
export const SITE_CREATOR_SECTION_SPINE_GUTTER_PX = 280;
/** Separación entre la línea de secciones y el borde del lienzo. */
export const SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX = 40;

const HOP_ICON: Record<SiteSectionScrollKind, typeof UnfoldVertical> = {
  natural: UnfoldVertical,
  smooth: Waves,
  snap: Magnet,
};

const HEIGHT_ICON = {
  content: Square,
  viewport: Maximize2,
  custom: MoveVertical,
} as const;

const CHIP_BUTTON =
  "pointer-events-auto flex h-6 w-6 items-center justify-center border border-white/18 bg-[#151c24] text-white/85 hover:border-white/35";

export type SectionSpineStation = {
  sectionId: string;
  label: string;
  /** Y del borde inferior de la sección (espacio de página). */
  bottom: number;
  top: number;
  height: number;
  designedHeight: number;
  /** Alto mínimo al estirar el marco (unión de capas). Original. */
  contentHeight?: number;
  /** Tope inferior: inicio de la siguiente sección o alto de página. */
  maxBottom?: number;
  heightMode: SiteSectionHeightMode;
  customHeight: number | null;
  selected: boolean;
  /** Primera sección: puede fijarse como cabecera al hacer scroll. */
  canPinToTop?: boolean;
  /** Cabecera fija activa. */
  pinToTop?: boolean;
  /** Tramo que sale de esta sección hacia la siguiente. La última no tiene. */
  outgoing: { fromId: string; toId: string; kind: SiteSectionScrollKind } | null;
};

export type SiteCreatorSectionSpineProps = {
  pageHeight: number;
  /** Escala página → pantalla (mismo zoom del preview). */
  scale: number;
  stations: SectionSpineStation[];
  /** Y del borde inferior de la selección (Add sección), espacio de página. */
  addSectionY: number | null;
  canAddSection: boolean;
  portalHost?: HTMLElement | null;
  onSelectSection: (sectionId: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onAddSection: () => void;
  onScrollChange: (fromId: string | null, toId: string, kind: SiteSectionScrollKind) => void;
  onHeightModeChange: (sectionId: string, mode: SiteSectionHeightMode) => void;
  onCustomHeightChange: (sectionId: string, heightPx: number) => void;
  /** Original: estira sourceRange.bottom (padding inferior). */
  onSourceRangeBottomChange?: (sectionId: string, bottom: number) => void;
  /** Dispositivo: fija la primera sección arriba al hacer scroll. */
  onPinToTopChange?: (sectionId: string, pinToTop: boolean) => void;
  /** Original: marcas de sección. Dispositivo: alto, recorrido y raya. */
  mode?: "structure" | "device";
};

function heightLabel(station: SectionSpineStation, liveCustom: number | null): string {
  if (station.heightMode === "viewport") return "Toda la página";
  if (station.heightMode === "custom" || liveCustom != null) {
    const px = liveCustom ?? station.customHeight ?? Math.round(station.height);
    return `Custom ${px} px`;
  }
  return "Actual";
}

function MenuPortal({
  open,
  triggerRef,
  onClose,
  portalHost,
  width,
  children,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  portalHost?: HTMLElement | null;
  width: number;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const host = portalHost;
    const tr = trigger.getBoundingClientRect();
    if (host) {
      const hr = host.getBoundingClientRect();
      setPos({
        top: tr.bottom - hr.top + 4,
        left: Math.min(Math.max(0, tr.left - hr.left), Math.max(0, hr.width - width)),
      });
    } else {
      setPos({ top: tr.bottom + 4, left: tr.left });
    }
  }, [open, portalHost, triggerRef, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const t = event.target as Node | null;
      if (isNodeInsideRefs(t, [triggerRef, menuRef])) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose, open, triggerRef]);

  if (!open || !pos) return null;
  const node = (
    <div
      ref={menuRef}
      role="presentation"
      data-site-creator-floating-ui="true"
      className="pointer-events-auto z-[80] rounded-lg border border-white/15 bg-[#121820] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
      style={{
        position: portalHost ? "absolute" : "fixed",
        top: pos.top,
        left: pos.left,
        width,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
  if (portalHost) return createPortal(node, portalHost);
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function ScrollChip({
  kind,
  testId,
  portalHost,
  onChange,
}: {
  kind: SiteSectionScrollKind;
  testId: string;
  portalHost?: HTMLElement | null;
  onChange: (kind: SiteSectionScrollKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const Icon = HOP_ICON[kind];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Scroll: ${SECTION_SCROLL_LABEL[kind]}`}
        title={`Scroll · ${SECTION_SCROLL_LABEL[kind]}`}
        onClick={() => setOpen((v) => !v)}
        className={CHIP_BUTTON}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
      <MenuPortal
        open={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        portalHost={portalHost}
        width={220}
      >
        <p className="px-2 pb-1 pt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/35">
          Cómo sigue esta sección
        </p>
        <div id={menuId} role="listbox">
          {SECTION_SCROLL_KINDS.map((option) => {
            const OptionIcon = HOP_ICON[option];
            const selected = option === kind;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                data-testid={`${testId}-${option}`}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/8 ${
                  selected ? "bg-white/10" : ""
                }`}
                {...floatingPressHandlers(() => {
                  onChange(option);
                  setOpen(false);
                })}
              >
                <OptionIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" strokeWidth={2.2} />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-white">
                    {SECTION_SCROLL_LABEL[option]}
                  </span>
                  <span className="block text-[10px] leading-snug text-white/45">
                    {SECTION_SCROLL_HINT[option]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </MenuPortal>
    </>
  );
}

function PinChip({
  pinned,
  testId,
  onToggle,
}: {
  pinned: boolean;
  testId: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pinned}
      aria-label={pinned ? "Cabecera fija: activada" : "Fijar cabecera arriba"}
      title={pinned ? "Cabecera fija · clic para soltar" : "Fijar arriba al hacer scroll"}
      onClick={() => onToggle(!pinned)}
      className={`${CHIP_BUTTON} ${pinned ? "border-white/45 bg-white/12 text-white" : ""}`}
    >
      <Pin className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
    </button>
  );
}

function HeightChip({
  station,
  liveCustom,
  portalHost,
  onModeChange,
}: {
  station: SectionSpineStation;
  liveCustom: number | null;
  portalHost?: HTMLElement | null;
  onModeChange: (mode: SiteSectionHeightMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = heightLabel(station, liveCustom);
  const isCustom = station.heightMode === "custom" || liveCustom != null;
  const HeightIcon =
    HEIGHT_ICON[isCustom ? "custom" : station.heightMode === "viewport" ? "viewport" : "content"];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid={`site-creator-section-spine-height-${station.sectionId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Alto: ${label}`}
        title={`Alto · ${label}`}
        onClick={() => setOpen((v) => !v)}
        className={CHIP_BUTTON}
      >
        <HeightIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
      <MenuPortal
        open={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        portalHost={portalHost}
        width={200}
      >
        {(
          [
            { mode: "content" as const, title: "Actual", hint: "Alto del diseño" },
            { mode: "viewport" as const, title: "Toda la página", hint: "Al menos el alto de la ventana" },
            { mode: "custom" as const, title: "Custom", hint: "Alto fijo en píxeles; también arrastrando la raya" },
          ] as const
        ).map((option) => {
          const selected =
            option.mode === "custom"
              ? isCustom
              : !isCustom && station.heightMode === option.mode;
          const OptionIcon = HEIGHT_ICON[option.mode];
          return (
            <button
              key={option.mode}
              type="button"
              role="option"
              aria-selected={selected}
              data-testid={`site-creator-section-spine-height-${station.sectionId}-${option.mode}`}
              className={`flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-white/8 ${
                selected ? "bg-white/10" : ""
              }`}
              {...floatingPressHandlers(() => {
                if (option.mode === "custom") {
                  onModeChange("custom");
                } else {
                  onModeChange(option.mode);
                }
                setOpen(false);
              })}
            >
              <OptionIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" strokeWidth={2.2} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-white">{option.title}</span>
                <span className="block text-[10px] text-white/45">{option.hint}</span>
              </span>
            </button>
          );
        })}
        {isCustom ? (
          <div className="mt-1 border-t border-white/10 px-2 py-1.5 text-[11px] text-white/70">
            Custom {liveCustom ?? station.customHeight ?? Math.round(station.height)} px
            <span className="mt-0.5 block text-[10px] text-white/40">
              Arrastra la raya inferior para cambiar el valor
            </span>
          </div>
        ) : null}
      </MenuPortal>
    </>
  );
}

function StationModule({
  station,
  scale,
  portalHost,
  onSelect,
  onRemove,
  onScrollChange,
  onHeightModeChange,
  onCustomHeightChange,
  onSourceRangeBottomChange,
  onPinToTopChange,
  mode = "device",
}: {
  station: SectionSpineStation;
  scale: number;
  portalHost?: HTMLElement | null;
  onSelect: () => void;
  onRemove: () => void;
  onScrollChange: (fromId: string | null, toId: string, kind: SiteSectionScrollKind) => void;
  onHeightModeChange: (mode: SiteSectionHeightMode) => void;
  onCustomHeightChange: (heightPx: number) => void;
  onSourceRangeBottomChange?: (bottom: number) => void;
  onPinToTopChange?: (pinToTop: boolean) => void;
  mode?: "structure" | "device";
}) {
  const [liveCustom, setLiveCustom] = useState<number | null>(null);
  const dragRef = useRef<{
    kind: "custom" | "range";
    startClientY: number;
    startHeight: number;
    startTop: number;
    startScale: number;
    minimumHeight: number;
    maximumHeight: number;
    pointerId: number;
    lastClientY: number;
    lastSent: number;
    pending: number | null;
    raf: number;
  } | null>(null);
  const onCustomRef = useRef(onCustomHeightChange);
  const onRangeRef = useRef(onSourceRangeBottomChange);

  useEffect(() => {
    onCustomRef.current = onCustomHeightChange;
    onRangeRef.current = onSourceRangeBottomChange;
  }, [onCustomHeightChange, onSourceRangeBottomChange]);

  useEffect(() => {
    const emit = (kind: "custom" | "range", height: number, top: number) => {
      if (kind === "range") {
        onRangeRef.current?.(top + height);
        return;
      }
      onCustomRef.current(height);
    };
    const flush = () => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.raf = 0;
      const next = drag.pending;
      if (next == null || next === drag.lastSent) return;
      drag.lastSent = next;
      // Solo preview local: emitir al soltar evita bucles layout → pointermove.
      setLiveCustom(next);
    };
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (event.clientY === drag.lastClientY) return;
      drag.lastClientY = event.clientY;
      const deltaPage =
        (event.clientY - drag.startClientY) / Math.max(0.0001, drag.startScale);
      drag.pending = Math.min(
        drag.maximumHeight,
        Math.max(drag.minimumHeight, Math.round(drag.startHeight + deltaPage)),
      );
      if (drag.raf) return;
      drag.raf = window.requestAnimationFrame(flush);
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.raf) {
        window.cancelAnimationFrame(drag.raf);
        drag.raf = 0;
      }
      const deltaPage =
        (event.clientY - drag.startClientY) / Math.max(0.0001, drag.startScale);
      const next = Math.min(
        drag.maximumHeight,
        Math.max(drag.minimumHeight, Math.round(drag.startHeight + deltaPage)),
      );
      const kind = drag.kind;
      const top = drag.startTop;
      dragRef.current = null;
      emit(kind, next, top);
      setLiveCustom(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      const drag = dragRef.current;
      if (drag?.raf) window.cancelAnimationFrame(drag.raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onDragPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: "custom" | "range",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragRef.current?.pointerId === event.pointerId) return;
    if (kind === "range" && !onRangeRef.current) return;
    const configuredHeight =
      kind === "custom" && station.heightMode === "custom" && station.customHeight != null
        ? station.customHeight
        : Math.round(station.height);
    const minHeight =
      kind === "range"
        ? Math.max(1, Math.round(station.contentHeight ?? station.designedHeight))
        : station.designedHeight;
    const maxHeight =
      kind === "range"
        ? Math.max(
            minHeight,
            Math.round((station.maxBottom ?? Number.POSITIVE_INFINITY) - station.top),
          )
        : Number.POSITIVE_INFINITY;
    const startHeight = Math.min(maxHeight, Math.max(minHeight, configuredHeight));
    dragRef.current = {
      kind,
      startClientY: event.clientY,
      startHeight,
      startTop: station.top,
      startScale: scale,
      minimumHeight: minHeight,
      maximumHeight: maxHeight,
      pointerId: event.pointerId,
      lastClientY: event.clientY,
      lastSent: startHeight,
      pending: null,
      raf: 0,
    };
    setLiveCustom(startHeight);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };

  const displayHeight =
    liveCustom != null ? liveCustom : station.height;

  const structure = mode === "structure";

  return (
    <>
      {structure ? null : (
      <div
        className="pointer-events-none absolute right-[32px] flex -translate-y-1/2 items-center gap-1.5"
        style={{ top: (station.top + displayHeight / 2) * scale }}
        data-testid={`site-creator-section-spine-station-${station.sectionId}`}
      >
        {station.outgoing ? (
          <ScrollChip
            kind={station.outgoing.kind}
            testId={`site-creator-section-spine-hop-${station.outgoing.fromId}-${station.outgoing.toId}`}
            portalHost={portalHost}
            onChange={(kind) =>
              onScrollChange(station.outgoing!.fromId, station.outgoing!.toId, kind)
            }
          />
        ) : null}

        <HeightChip
          station={station}
          liveCustom={station.heightMode === "custom" ? liveCustom : null}
          portalHost={portalHost}
          onModeChange={(next) => {
            if (next !== "custom") setLiveCustom(null);
            onHeightModeChange(next);
          }}
        />

        {station.canPinToTop && onPinToTopChange ? (
          <PinChip
            pinned={Boolean(station.pinToTop)}
            testId={`site-creator-section-spine-pin-${station.sectionId}`}
            onToggle={onPinToTopChange}
          />
        ) : null}
      </div>
      )}

      <div
        className="pointer-events-none absolute right-[10px] flex -translate-y-1/2 items-center gap-1.5"
        style={{ top: (station.top + displayHeight) * scale }}
        data-testid={`site-creator-section-spine-boundary-${station.sectionId}`}
      >
        <button
          type="button"
          aria-label={`Quitar ${station.label}`}
          data-testid={`site-creator-section-spine-remove-${station.sectionId}`}
          className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full text-[#1a1510] hover:brightness-110"
          style={{ background: ACCENT }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        </button>
        <button
          type="button"
          data-testid={`site-creator-section-spine-drag-${station.sectionId}`}
          aria-label={station.label}
          aria-current={station.selected ? "true" : undefined}
          title={
            structure
              ? "Arrastra para incluir margen debajo · clic para seleccionar"
              : "Arrastra para altura custom"
          }
          className={
            structure
              ? "pointer-events-auto h-2.5 w-2.5 cursor-ns-resize rounded-full"
              : "pointer-events-auto flex h-2.5 w-10 cursor-ns-resize items-center justify-center rounded-full"
          }
          style={{
            background: ACCENT,
            boxShadow: station.selected ? "0 0 0 2px rgba(255,255,255,0.7)" : "none",
          }}
          onPointerDown={(event) => onDragPointerDown(event, structure ? "range" : "custom")}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {structure ? null : <span className="block h-px w-5 bg-[#1a1510]" aria-hidden />}
        </button>
      </div>
    </>
  );
}

export function SiteCreatorSectionSpine({
  pageHeight,
  scale,
  stations,
  addSectionY,
  canAddSection,
  portalHost = null,
  onSelectSection,
  onRemoveSection,
  onAddSection,
  onScrollChange,
  onHeightModeChange,
  onCustomHeightChange,
  onSourceRangeBottomChange,
  onPinToTopChange,
  mode = "device",
}: SiteCreatorSectionSpineProps) {
  const lineBottom = Math.max(
    pageHeight * scale,
    ...stations.map((s) => s.bottom * scale + 24),
    addSectionY != null ? addSectionY * scale + 48 : 0,
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[45] overflow-visible"
      data-testid="site-creator-section-spine"
      data-site-creator-spine-root="true"
      data-spine-mode={mode}
      data-site-creator-floating-ui="true"
      data-page-height={pageHeight}
      data-spine-scale={scale}
    >
      <div
        className="absolute right-[14px] top-0 w-px"
        style={{
          height: lineBottom,
          backgroundImage: `repeating-linear-gradient(to bottom, ${ACCENT} 0 5px, transparent 5px 11px)`,
        }}
        aria-hidden
      />
      <span
        className="absolute right-[10px] top-2 h-2.5 w-2.5 rounded-full"
        style={{ background: ACCENT }}
        aria-hidden
      />

      {stations.map((station) => (
        <StationModule
          key={station.sectionId}
          station={station}
          scale={scale}
          portalHost={portalHost}
          onSelect={() => onSelectSection(station.sectionId)}
          onRemove={() => onRemoveSection(station.sectionId)}
          onScrollChange={onScrollChange}
          onHeightModeChange={(next) => onHeightModeChange(station.sectionId, next)}
          onCustomHeightChange={(px) => onCustomHeightChange(station.sectionId, px)}
          onSourceRangeBottomChange={
            onSourceRangeBottomChange
              ? (bottom) => onSourceRangeBottomChange(station.sectionId, bottom)
              : undefined
          }
          onPinToTopChange={
            onPinToTopChange ? (pin) => onPinToTopChange(station.sectionId, pin) : undefined
          }
          mode={mode}
        />
      ))}

      {canAddSection && addSectionY != null ? (
        <div
          className="pointer-events-none absolute right-0 flex -translate-y-1/2 items-center gap-2 pr-1"
          style={{ top: addSectionY * scale }}
        >
          <button
            type="button"
            data-testid="site-creator-section-spine-add"
            className="pointer-events-auto flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold text-[#1a1510] shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:brightness-110"
            style={{ background: ACCENT, borderColor: ACCENT }}
            onClick={(e) => {
              e.stopPropagation();
              onAddSection();
            }}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1510]/15 text-[14px] leading-none"
              aria-hidden
            >
              +
            </span>
            Add sección
          </button>
        </div>
      ) : null}
    </div>
  );
}
