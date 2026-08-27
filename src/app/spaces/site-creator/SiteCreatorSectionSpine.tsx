"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Magnet,
  Maximize2,
  MoveVertical,
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
  heightMode: SiteSectionHeightMode;
  customHeight: number | null;
  selected: boolean;
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
}: {
  station: SectionSpineStation;
  scale: number;
  portalHost?: HTMLElement | null;
  onSelect: () => void;
  onRemove: () => void;
  onScrollChange: (fromId: string | null, toId: string, kind: SiteSectionScrollKind) => void;
  onHeightModeChange: (mode: SiteSectionHeightMode) => void;
  onCustomHeightChange: (heightPx: number) => void;
}) {
  const [liveCustom, setLiveCustom] = useState<number | null>(null);
  const dragRef = useRef<{
    startClientY: number;
    startHeight: number;
    startScale: number;
    minimumHeight: number;
    pointerId: number;
    lastSent: number;
  } | null>(null);
  const onCustomRef = useRef(onCustomHeightChange);

  useEffect(() => {
    onCustomRef.current = onCustomHeightChange;
  }, [onCustomHeightChange]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaPage =
        (event.clientY - drag.startClientY) / Math.max(0.0001, drag.startScale);
      const next = Math.max(
        drag.minimumHeight,
        Math.round(drag.startHeight + deltaPage),
      );
      if (next === drag.lastSent) return;
      drag.lastSent = next;
      setLiveCustom(next);
      onCustomRef.current(next);
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaPage =
        (event.clientY - drag.startClientY) / Math.max(0.0001, drag.startScale);
      const next = Math.max(
        drag.minimumHeight,
        Math.round(drag.startHeight + deltaPage),
      );
      dragRef.current = null;
      if (next !== drag.lastSent) onCustomRef.current(next);
      setLiveCustom(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onDragPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const configuredHeight =
      station.heightMode === "custom" && station.customHeight != null
        ? station.customHeight
        : Math.round(station.height);
    const startHeight = Math.max(station.designedHeight, configuredHeight);
    dragRef.current = {
      startClientY: event.clientY,
      startHeight,
      startScale: scale,
      minimumHeight: station.designedHeight,
      pointerId: event.pointerId,
      lastSent: startHeight,
    };
    setLiveCustom(startHeight);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };

  const displayHeight =
    station.heightMode === "custom" && liveCustom != null ? liveCustom : station.height;

  return (
    <>
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
          onModeChange={(mode) => {
            if (mode !== "custom") setLiveCustom(null);
            onHeightModeChange(mode);
          }}
        />
      </div>

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
          title="Arrastra para altura custom"
          className="pointer-events-auto flex h-2.5 w-10 cursor-ns-resize items-center justify-center rounded-full"
          style={{
            background: ACCENT,
            boxShadow: station.selected ? "0 0 0 2px rgba(255,255,255,0.7)" : "none",
          }}
          onPointerDown={onDragPointerDown}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <span className="block h-px w-5 bg-[#1a1510]" aria-hidden />
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
          onHeightModeChange={(mode) => onHeightModeChange(station.sectionId, mode)}
          onCustomHeightChange={(px) => onCustomHeightChange(station.sectionId, px)}
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
