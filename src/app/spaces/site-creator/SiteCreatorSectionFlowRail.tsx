"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Magnet, UnfoldVertical, Waves } from "lucide-react";
import { floatingPressHandlers, isNodeInsideRefs } from "./site-creator-floating-press";
import type { SiteBlueprintSectionNode, SiteBlueprintV1, SiteSectionScrollKind } from "./site-creator-types";
import {
  SECTION_SCROLL_HINT,
  SECTION_SCROLL_KINDS,
  SECTION_SCROLL_LABEL,
  listDocumentSections,
  listSectionScrollHops,
} from "./site-creator-section-scroll";

export type SiteCreatorSectionFlowRailProps = {
  blueprint: SiteBlueprintV1;
  selectedNodeId?: string | null;
  onSelectSection: (sectionId: string) => void;
  onEntryKindChange: (kind: SiteSectionScrollKind) => void;
  onHopKindChange: (fromId: string, toId: string, kind: SiteSectionScrollKind) => void;
  portalHost?: HTMLElement | null;
};

const HOP_ICON: Record<SiteSectionScrollKind, typeof UnfoldVertical> = {
  natural: UnfoldVertical,
  smooth: Waves,
  snap: Magnet,
};

const HOP_TONE: Record<SiteSectionScrollKind, string> = {
  natural: "border-white/20 bg-[#151c24] text-white/80",
  smooth: "border-[#22d3ee]/40 bg-[#22d3ee]/10 text-[#7dd3fc]",
  snap: "border-[#a3e635]/40 bg-[#a3e635]/10 text-[#bef264]",
};

const HOP_LINE: Record<SiteSectionScrollKind, string> = {
  natural: "bg-white/25",
  smooth: "bg-[#22d3ee]/55",
  snap: "bg-[#a3e635]/70",
};

function hopKey(fromId: string | null, toId: string): string {
  return fromId ? `${fromId}>${toId}` : `__entry__>${toId}`;
}

function HopMenu({
  kind,
  open,
  testId,
  ariaLabel,
  portalHost,
  onToggle,
  onClose,
  onChange,
}: {
  kind: SiteSectionScrollKind;
  open: boolean;
  testId: string;
  ariaLabel: string;
  portalHost?: HTMLElement | null;
  onToggle: () => void;
  onClose: () => void;
  onChange: (kind: SiteSectionScrollKind) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const Icon = HOP_ICON[kind];

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = menu?.width || 228;
      const height = menu?.height || 172;
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 8,
      );
      const above = rect.top - height - 10;
      const top = above >= 8 ? above : Math.min(rect.bottom + 10, window.innerHeight - height - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (isNodeInsideRefs(event.target, [triggerRef, menuRef])) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        id={menuId}
        role="listbox"
        data-site-creator-floating-ui="true"
        className="pointer-events-auto fixed z-[100080] w-[228px] rounded-lg border border-white/15 bg-[#101820] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
      >
        <p className="px-2 pb-1 pt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/35">
          Cómo llega
        </p>
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
              {...floatingPressHandlers(() => onChange(option))}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${HOP_TONE[option]}`}
              >
                <OptionIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              </span>
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
    ) : null;

  return (
    <div className="flex min-w-[72px] flex-1 items-center">
      <span className={`h-px min-w-[12px] flex-1 ${HOP_LINE[kind]}`} aria-hidden />
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        title={SECTION_SCROLL_HINT[kind]}
        onClick={onToggle}
        className={`mx-1 flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${HOP_TONE[kind]} hover:brightness-110`}
      >
        <Icon className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        {SECTION_SCROLL_LABEL[kind]}
        <ChevronUp className={`h-3 w-3 opacity-70 ${open ? "" : "opacity-50"}`} strokeWidth={2.25} aria-hidden />
      </button>
      <span className={`h-px min-w-[12px] flex-1 ${HOP_LINE[kind]}`} aria-hidden />
      {menu ? createPortal(menu, portalHost ?? document.body) : null}
    </div>
  );
}

function OriginMark() {
  return (
    <div className="flex shrink-0 flex-col items-center pr-1">
      <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Inicio</span>
      <span className="mt-1 h-2.5 w-2.5 rounded-full border border-white/35 bg-[#0e141c]" aria-hidden />
    </div>
  );
}

function SectionStation({
  section,
  selected,
  onSelect,
}: {
  section: SiteBlueprintSectionNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const hero = section.sectionType === "hero";
  return (
    <button
      type="button"
      data-testid={`site-creator-section-flow-node-${section.id}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={`relative flex min-w-[108px] max-w-[168px] shrink-0 flex-col rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? "border-white/40 bg-white/12 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          : hero
            ? "border-[#22d3ee]/40 bg-[#0f1c24] text-white hover:border-[#22d3ee]/65"
            : "border-white/12 bg-[#141b22] text-white/90 hover:border-white/28"
      }`}
    >
      <span
        className={`text-[8px] font-black uppercase tracking-[0.16em] ${
          hero ? "text-[#22d3ee]" : "text-white/38"
        }`}
      >
        {hero ? "Hero" : "Sección"}
      </span>
      <span className="truncate text-[12px] font-semibold leading-tight">{section.label}</span>
    </button>
  );
}

export function SiteCreatorSectionFlowRail({
  blueprint,
  selectedNodeId,
  onSelectSection,
  onEntryKindChange,
  onHopKindChange,
  portalHost = null,
}: SiteCreatorSectionFlowRailProps) {
  const sections = listDocumentSections(blueprint);
  const hops = listSectionScrollHops(blueprint);
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div
      data-testid="site-creator-section-flow"
      className="flex min-h-[72px] shrink-0 items-center gap-3 border-t border-white/10 bg-[#0c1218] px-3"
    >
      <div className="hidden shrink-0 flex-col leading-tight sm:flex">
        <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Recorrido</span>
        <span className="text-[10px] text-white/45">Scroll entre secciones</span>
      </div>
      {sections.length === 0 ? (
        <p className="text-[11px] text-white/40">
          Crea un Hero o una sección para definir cómo se recorre la página.
        </p>
      ) : (
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto py-2.5">
          <OriginMark />
          {sections.map((section, index) => {
            const hop = hops[index];
            const key = hop ? hopKey(hop.fromId, hop.toId) : section.id;
            return (
              <React.Fragment key={section.id}>
                {hop ? (
                  <HopMenu
                    kind={hop.kind}
                    open={openKey === key}
                    testId={
                      hop.fromId
                        ? `site-creator-section-flow-hop-${hop.fromId}-${hop.toId}`
                        : "site-creator-section-flow-entry"
                    }
                    ariaLabel={
                      hop.fromId
                        ? `Cómo se llega a ${section.label}`
                        : `Cómo empieza la página en ${section.label}`
                    }
                    portalHost={portalHost}
                    onToggle={() => setOpenKey((current) => (current === key ? null : key))}
                    onClose={() => setOpenKey(null)}
                    onChange={(kind) => {
                      if (hop.fromId) onHopKindChange(hop.fromId, hop.toId, kind);
                      else onEntryKindChange(kind);
                      setOpenKey(null);
                    }}
                  />
                ) : null}
                <SectionStation
                  section={section}
                  selected={selectedNodeId === section.id}
                  onSelect={() => onSelectSection(section.id)}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
