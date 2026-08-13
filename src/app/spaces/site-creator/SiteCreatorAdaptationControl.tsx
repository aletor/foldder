"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import type { ResponsiveEditableBand, ResponsiveTargetRef } from "./site-creator-types";
import {
  modeMicrobarLabel,
  modeOptionHint,
  modeOptionLabel,
  type EffectiveResponsiveMode,
} from "./site-creator-responsive-overrides";
import { resolveAdaptationPopoverPlacement } from "./site-creator-floating-placement";
import type { PageRect } from "./site-creator-coordinate-space";
import type { FloatingChromeGeometry } from "./SiteCreatorObjectMicrobar";

export type AdaptationControlModel = {
  band: ResponsiveEditableBand;
  effective: EffectiveResponsiveMode;
  buttonLabel: string;
  target?: ResponsiveTargetRef;
  locked?: boolean;
  lockedReason?: string;
  controlledByLabel?: string | null;
  controller?: ResponsiveTargetRef;
  /** Solo restablecer override inútil. */
  resetOnly?: boolean;
};

export interface SiteCreatorAdaptationControlProps {
  model: AdaptationControlModel | null;
  onSelectMode: (mode: "auto" | "preserve" | "stack") => void;
  onFocusController?: () => void;
  floatingGeometry?: FloatingChromeGeometry | null;
  microbarClientRect?: PageRect | null;
  portalHost?: HTMLElement | null;
}

export function SiteCreatorAdaptationControl({
  model,
  onSelectMode,
  onFocusController,
  floatingGeometry,
  microbarClientRect,
  portalHost,
}: SiteCreatorAdaptationControlProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const isInsideFloatingUi = (e: Event) => {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      for (const n of path) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.dataset?.siteCreatorFloatingUi === "true") return true;
        if (n === triggerRef.current || n === popoverRef.current) return true;
        if (triggerRef.current?.contains(n) || popoverRef.current?.contains(n)) return true;
      }
      return false;
    };
    // Fuera: cerrar en click (no en pointerdown) para no adelantarse a la opción.
    const onDocClick = (e: MouseEvent) => {
      if (isInsideFloatingUi(e)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 1.º Escape: cierra popover; el 2.º sigue a la navegación de selección.
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("click", onDocClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [model?.band, model?.buttonLabel, model?.controlledByLabel, model?.resetOnly]);

  useLayoutEffect(() => {
    if (!open || !model) {
      setPopoverPos(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const triggerRect: PageRect = {
      x: trigger.left,
      y: trigger.top,
      width: trigger.width,
      height: trigger.height,
    };
    const micro =
      microbarClientRect ??
      ({
        x: trigger.left - 8,
        y: trigger.top - 4,
        width: 200,
        height: 32,
      } satisfies PageRect);
    const studio =
      floatingGeometry?.studioViewportRect ??
      ({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      } satisfies PageRect);
    const selection =
      floatingGeometry?.selectionClientRect ?? triggerRect;
    const placed = resolveAdaptationPopoverPlacement({
      triggerRect,
      microbarRect: micro,
      selectionRect: selection,
      studioViewportRect: studio,
    });
    setPopoverPos({ left: placed.left, top: placed.top });
  }, [open, floatingGeometry, microbarClientRect, model]);

  if (!model) return null;

  if (model.resetOnly) {
    return (
      <button
        type="button"
        data-testid="site-creator-adaptation-reset"
        className="h-6 max-w-[220px] truncate rounded px-2 text-[10px] font-semibold"
        style={{
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.65)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        title="Esta excepción ya no tiene efecto. Restablecer la elimina."
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectMode("auto");
        }}
      >
        Adaptación sin efecto · Restablecer
      </button>
    );
  }

  if (model.controlledByLabel) {
    return (
      <button
        type="button"
        data-testid="site-creator-adaptation-controlled"
        className="h-6 max-w-[200px] truncate rounded px-2 text-[10px] font-semibold"
        style={{
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        title={`Adaptación controlada por ${model.controlledByLabel}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFocusController?.();
        }}
      >
        Adaptación · Controlada por {model.controlledByLabel}
      </button>
    );
  }

  if (model.locked) {
    return (
      <span
        data-testid="site-creator-adaptation-locked"
        className="h-6 max-w-[220px] truncate rounded px-2 text-[10px] font-semibold leading-6"
        style={{ color: "rgba(255,255,255,0.45)" }}
        title={model.lockedReason}
      >
        {model.lockedReason ?? "Actualiza el diseño para cambiar la adaptación"}
      </span>
    );
  }

  const active = model.effective.mode;
  const host = portalHost ?? (typeof document !== "undefined" ? document.body : null);

  const stopFloating = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const popover =
    open && host
      ? createPortal(
          <div
            ref={popoverRef}
            data-testid="site-creator-adaptation-popover"
            data-site-creator-floating-ui="true"
            className="fixed z-[100040] w-[240px] rounded-md border p-2 shadow-xl"
            style={{
              left: popoverPos?.left ?? 16,
              top: popoverPos?.top ?? 16,
              background: SC_VISUAL.chipBg,
              borderColor: SC_VISUAL.chipBorder,
              color: SC_VISUAL.chipFg,
            }}
            onPointerDown={stopFloating}
            onMouseDown={stopFloating}
            onClick={stopFloating}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p
              className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-wide"
              style={{ color: SC_VISUAL.chipMuted }}
            >
              Adaptación en {model.band === "mobile" ? "móvil" : "tablet"}
            </p>
            {(["auto", "preserve", "stack"] as const).map((mode) => {
              const selected = active === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  data-testid={`site-creator-adaptation-option-${mode}`}
                  className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left transition hover:bg-white/6"
                  onPointerDown={stopFloating}
                  onMouseDown={stopFloating}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    onSelectMode(mode);
                  }}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className="inline-block w-3 text-center" style={{ color: SC_VISUAL.selection }}>
                      {selected ? "✓" : ""}
                    </span>
                    {modeOptionLabel(mode)}
                  </span>
                  <span
                    className="pl-4 text-[10px] leading-snug"
                    style={{ color: SC_VISUAL.chipMuted }}
                  >
                    {modeOptionHint(mode)}
                  </span>
                </button>
              );
            })}
          </div>,
          host,
        )
      : null;

  return (
    <div className="relative shrink-0" data-testid="site-creator-adaptation">
      <button
        ref={triggerRef}
        type="button"
        data-testid="site-creator-adaptation-trigger"
        className="h-6 max-w-[180px] truncate rounded px-2 text-[10px] font-semibold"
        style={{
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        onPointerDown={stopFloating}
        onMouseDown={stopFloating}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {model.buttonLabel}
      </button>
      {popover}
    </div>
  );
}

export function adaptationButtonLabel(mode: "auto" | "preserve" | "stack"): string {
  return `Adaptación · ${modeMicrobarLabel(mode)}`;
}
