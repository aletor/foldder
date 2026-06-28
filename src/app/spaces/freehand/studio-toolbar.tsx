"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

export const TOOLBAR_ICON_STROKE = 1.75 as const;
/** Pulsación mantenida sobre el icono del grupo para abrir el submenú (rollout). */
const TOOLBAR_FLYOUT_PRESS_MS = 220;

/**
 * Herramienta Pincel — referencia del usuario: mango alargado (arriba-dcha) y cabeza en lágrima (abajo-izq),
 * dos siluetas con hueco entre ellas (como el PNG).
 */
export function PhotoBrushToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <g fill="currentColor">
        <path d="M4.2 18.5C3.75 16.85 4.3 15.1 5.55 13.8 6.8 12.5 8.6 11.65 10.5 11.35 11.9 11.15 13.35 11.35 14.65 11.9 15.1 12.35 14.85 13.1 14.1 13.6 12.35 14.95 9.9 16.15 7.45 16.95 6.25 17.3 5.15 17.85 4.2 18.5z" />
        <path d="M20.9 3.15C21.45 3.6 21.5 4.45 21.1 5.15 20.2 6.95 18.7 8.55 17.05 9.95 16 10.8 14.85 11.5 13.6 12 13.05 12.2 12.45 11.85 12.25 11.25 12.1 10.85 12.25 10.35 12.55 10 14.1 8.2 15.65 6.35 17.1 4.5 17.9 3.5 18.65 2.55 19.75 2.05 20.25 1.85 20.8 2.1 21.05 2.55 21.2 2.85 21.15 3.15 20.9 3.15z" />
      </g>
    </svg>
  );
}

/**
 * Tampón de clonación — silueta de sello manual (mango redondo, cuello, cuerpo, base de goma),
 * alineada con el icono de referencia del usuario.
 */
export function PhotoCloneStampToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <g fill="currentColor">
        <circle cx="12" cy="5.6" r="3.35" />
        <rect x="10.25" y="8.85" width="3.5" height="2.05" rx="0.35" />
        <rect x="4.85" y="10.75" width="14.3" height="6.65" rx="0.45" />
        <rect x="6.1" y="18.05" width="11.8" height="2.35" rx="0.35" />
      </g>
      <g
        stroke="currentColor"
        strokeWidth={1.35}
        strokeLinecap="round"
        fill="none"
      >
        <path d="M8.15 3.35 Q6.9 3.9 6.2 5.15" />
        <path d="M3.6 10.9h2.35" />
        <path d="M20.35 12.9q0.85 1.35 0.35 2.85" />
      </g>
    </svg>
  );
}


export function PhotoGradientToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="2.5" y1="10" x2="17.5" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f2f34" />
          <stop offset="1" stopColor="#d9d9dc" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="3.2" width="15" height="13.6" rx="1.5" fill={`url(#${gid})`} stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

export function TextPathToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M6 4.2h8M10 4.2v7.1" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3.4 15.1 C5.8 12.7 8.1 17.1 10.7 14.4 C12.6 12.4 15 12.7 16.8 14.6"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] transition-all duration-150 ease-out ${
        active
          ? "bg-white/[0.11] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
          : "text-zinc-500 hover:bg-white/[0.06] hover:text-white"
      }`}
    >{children}</button>
  );
}

/** Grupo estilo Photoshop: icono + chevron decorativo; mantén pulsado un instante (rollout). Suelta sobre una opción para elegirla. */
export function ToolFlyoutGroup({
  groupId,
  flyoutOpen,
  setFlyoutOpen,
  active,
  mainTitle,
  onMainClick,
  mainIcon,
  children,
}: {
  groupId: string;
  flyoutOpen: string | null;
  setFlyoutOpen: (id: string | null) => void;
  active: boolean;
  mainTitle: string;
  onMainClick: () => void;
  mainIcon: React.ReactNode;
  children: React.ReactNode;
}) {
  const open = flyoutOpen === groupId;
  const longPressTimerRef = useRef<number | null>(null);
  const skipMainClickRef = useRef(false);
  const rolloutFromMainHoldRef = useRef(false);
  const flyoutPanelRef = useRef<HTMLDivElement | null>(null);
  const mainBtnRef = useRef<HTMLButtonElement | null>(null);
  const [flyoutFixedPos, setFlyoutFixedPos] = useState<{ left: number; top: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleMainPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      skipMainClickRef.current = false;
      rolloutFromMainHoldRef.current = false;
      clearLongPress();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        skipMainClickRef.current = true;
        rolloutFromMainHoldRef.current = true;
        setFlyoutOpen(groupId);
      }, TOOLBAR_FLYOUT_PRESS_MS);
    },
    [clearLongPress, groupId, setFlyoutOpen],
  );

  const handleMainPointerEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  /** Tras abrir el menú manteniendo pulsado: el primer pointerup elige la opción bajo el cursor (rollout), aunque el mousedown fuera en el icono principal. */
  useEffect(() => {
    if (!open) {
      rolloutFromMainHoldRef.current = false;
      return;
    }
    if (!rolloutFromMainHoldRef.current) return;

    const onPointerUpCapture = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const panel = flyoutPanelRef.current;
      if (!panel) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) {
        setFlyoutOpen(null);
        rolloutFromMainHoldRef.current = false;
        return;
      }
      const hitBtn = (el as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (hitBtn && panel.contains(hitBtn)) {
        queueMicrotask(() => hitBtn.click());
      } else {
        setFlyoutOpen(null);
      }
      rolloutFromMainHoldRef.current = false;
    };

    window.addEventListener("pointerup", onPointerUpCapture, true);
    return () => window.removeEventListener("pointerup", onPointerUpCapture, true);
  }, [open, setFlyoutOpen]);

  useLayoutEffect(() => {
    if (!open) {
      setFlyoutFixedPos(null);
      return;
    }
    const update = () => {
      const btn = mainBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const gap = 6;
      setFlyoutFixedPos({ left: r.right + gap, top: r.top });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const handleMainClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (skipMainClickRef.current) {
        skipMainClickRef.current = false;
        e.preventDefault();
        return;
      }
      onMainClick();
    },
    [onMainClick],
  );

  const mainHint = `${mainTitle} — Mantén pulsado un instante y arrastra hasta una herramienta.`;

  return (
    <div className="relative h-9 w-9 shrink-0" data-tool-flyout-root>
      <button
        ref={mainBtnRef}
        type="button"
        title={mainHint}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleMainClick}
        onPointerDown={handleMainPointerDown}
        onPointerUp={handleMainPointerEnd}
        onPointerCancel={handleMainPointerEnd}
        onPointerLeave={handleMainPointerEnd}
        className={`relative flex h-full w-full items-center justify-center rounded-[2px] pr-1.5 pb-1.5 transition-all duration-150 ease-out ${
          active
            ? "bg-white/[0.11] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
            : "text-zinc-500 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        {mainIcon}
        <span
          className="pointer-events-none absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center text-zinc-400"
          aria-hidden
        >
          <ChevronRight className="h-2.5 w-2.5 opacity-90" strokeWidth={2.25} />
        </span>
      </button>
      {open &&
        flyoutFixedPos != null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={flyoutPanelRef}
            className="left-toolbar-flyout-panel fixed z-[100045] flex min-w-[44px] flex-col gap-1 rounded-[2px] border border-white/[0.09] bg-[#15181f] p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.55)]"
            style={{ left: flyoutFixedPos.left, top: flyoutFixedPos.top }}
            data-tool-flyout-panel
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
