"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  SiteCreatorContextualModel,
  SiteCreatorPrimaryAction,
} from "./site-creator-contextual-actions";

export interface SiteCreatorHeaderActionsProps {
  model: SiteCreatorContextualModel;
  onAction: (id: SiteCreatorPrimaryAction["id"], action?: SiteCreatorPrimaryAction) => void;
  sectionMenuOpen: boolean;
  onSectionMenuOpenChange: (open: boolean) => void;
  onChooseSectionType: (type: "hero" | "generic") => void;
  heroDisabled?: boolean;
  parentChoiceOpen: boolean;
  parentChoices: { id: string | null; label: string }[];
  onChooseParent: (id: string | null) => void;
  onCancelParentChoice: () => void;
  multiSelectHint?: string | null;
  onChooseAddTarget?: (id: string) => void;
}

export function SiteCreatorHeaderActions({
  model,
  onAction,
  sectionMenuOpen,
  onSectionMenuOpenChange,
  onChooseSectionType,
  heroDisabled = false,
  parentChoiceOpen,
  parentChoices,
  onChooseParent,
  onCancelParentChoice,
  multiSelectHint = null,
  onChooseAddTarget,
}: SiteCreatorHeaderActionsProps) {
  const sectionBtnRef = useRef<HTMLButtonElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuPos, setAddMenuPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!sectionMenuOpen || !sectionBtnRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = sectionBtnRef.current.getBoundingClientRect();
    const width = 260;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 180);
    setMenuPos({ left, top });
  }, [sectionMenuOpen]);

  useLayoutEffect(() => {
    if (!addMenuOpen || !addBtnRef.current) {
      setAddMenuPos(null);
      return;
    }
    const rect = addBtnRef.current.getBoundingClientRect();
    const width = 220;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 160);
    setAddMenuPos({ left, top });
  }, [addMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || addBtnRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (!sectionMenuOpen && !parentChoiceOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onSectionMenuOpenChange(false);
        onCancelParentChoice();
      }
    };
    window.addEventListener("keydown", onKey);

    let removeDoc: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      const onDoc = (event: MouseEvent) => {
        const target = event.target as Node;
        if (sectionMenuOpen) {
          if (menuRef.current?.contains(target) || sectionBtnRef.current?.contains(target)) return;
          onSectionMenuOpenChange(false);
        }
      };
      document.addEventListener("mousedown", onDoc);
      removeDoc = () => document.removeEventListener("mousedown", onDoc);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      removeDoc?.();
    };
  }, [onCancelParentChoice, onSectionMenuOpenChange, parentChoiceOpen, sectionMenuOpen]);

  if (!model.summary && model.primaryActions.length === 0 && !multiSelectHint) return null;

  return (
    <div
      className="site-creator-header-actions relative flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2"
      data-site-creator-header-actions
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {model.summary ? (
        <span className="max-w-[200px] truncate text-[11px] font-medium text-white/70" data-site-creator-selection-summary>
          {model.summary}
        </span>
      ) : null}

      {multiSelectHint ? (
        <span className="hidden text-[10px] text-white/35 sm:inline">{multiSelectHint}</span>
      ) : null}

      {model.primaryActions.map((action) => {
        if (action.id === "createSection") {
          return (
            <HeaderActionButton
              key={action.id}
              ref={sectionBtnRef}
              label={action.label}
              primary={Boolean(action.primary)}
              aria-expanded={sectionMenuOpen}
              aria-haspopup="menu"
              data-testid="site-creator-create-section"
              onClick={() => onSectionMenuOpenChange(!sectionMenuOpen)}
            />
          );
        }
        if (action.id === "chooseAddTarget") {
          return (
            <HeaderActionButton
              key={action.id}
              ref={addBtnRef}
              label={action.label}
              primary
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
              data-testid="site-creator-action-chooseAddTarget"
              onClick={() => setAddMenuOpen((o) => !o)}
            />
          );
        }
        return (
          <HeaderActionButton
            key={action.id}
            label={action.label}
            primary={Boolean(action.primary) || action.id === "createButton" || action.id === "addToContainer" || action.id === "editContent"}
            data-testid={`site-creator-action-${action.id}`}
            onClick={() => onAction(action.id, action)}
          />
        );
      })}

      {addMenuOpen && addMenuPos && model.addTargetCandidates && typeof document !== "undefined"
        ? createPortal(
            <div
              role="menu"
              aria-label="Añadir a"
              data-testid="site-creator-add-target-menu"
              className="fixed z-[100060] w-[220px] rounded-md border border-white/15 bg-[#101820] p-2 shadow-2xl"
              style={{ left: addMenuPos.left, top: addMenuPos.top, WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              {model.addTargetCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white hover:bg-white/10"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onChooseAddTarget?.(c.id);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      {sectionMenuOpen && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Crear sección"
              data-testid="site-creator-section-menu"
              className="fixed z-[100060] w-[260px] rounded-md border border-white/15 bg-[#101820] p-2 shadow-2xl"
              style={{ left: menuPos.left, top: menuPos.top, WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
                Crear sección
              </p>
              <button
                type="button"
                role="menuitem"
                data-testid="site-creator-section-hero"
                disabled={heroDisabled}
                className="flex w-full flex-col rounded px-2 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  if (heroDisabled) return;
                  onSectionMenuOpenChange(false);
                  onChooseSectionType("hero");
                }}
              >
                <span className="text-[12px] font-semibold text-white">Hero</span>
                <span className="text-[10px] text-white/45">
                  {heroDisabled ? "Ya existe un Hero" : "Sección principal de la landing"}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="site-creator-section-generic"
                className="flex w-full flex-col rounded px-2 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onSectionMenuOpenChange(false);
                  onChooseSectionType("generic");
                }}
              >
                <span className="text-[12px] font-semibold text-white">Sección</span>
                <span className="text-[10px] text-white/45">Bloque normal de contenido</span>
              </button>
            </div>,
            document.body,
          )
        : null}

      {parentChoiceOpen ? (
        <div
          className="absolute left-1/2 top-full z-[100035] mt-2 w-56 -translate-x-1/2 rounded-md border border-white/10 bg-[#101820] p-2 shadow-xl"
          data-testid="site-creator-parent-choice"
        >
          <p className="px-2 pb-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
            ¿Dónde quieres crearlo?
          </p>
          {parentChoices.map((choice) => (
            <button
              key={String(choice.id)}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white hover:bg-white/10"
              onClick={() => onChooseParent(choice.id)}
            >
              {choice.label}
            </button>
          ))}
          <button
            type="button"
            className="mt-1 w-full px-2 py-1 text-left text-[10px] text-white/40"
            onClick={onCancelParentChoice}
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  );
}

const HeaderActionButton = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    primary: boolean;
    onClick: () => void;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: "menu";
    "data-testid"?: string;
  }
>(function HeaderActionButton(
  { label, primary, onClick, "aria-expanded": ariaExpanded, "aria-haspopup": ariaHaspopup, "data-testid": testId },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      data-testid={testId}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={
        primary
          ? "pointer-events-auto h-7 rounded-md border border-[#a3e635]/40 bg-[#a3e635]/20 px-3 text-[11px] font-semibold text-[#a3e635] outline-none hover:bg-[#a3e635]/30 focus-visible:ring-2 focus-visible:ring-[#a3e635]/50 active:bg-[#a3e635]/35"
          : "pointer-events-auto h-7 rounded-md border border-white/20 bg-white/5 px-3 text-[11px] font-medium text-white/90 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30 active:bg-white/15"
      }
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {label}
    </button>
  );
});
