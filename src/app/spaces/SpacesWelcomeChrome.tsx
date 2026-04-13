"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EMPTY_CANVAS_SHORTCUT_HINT } from "./spaces-chrome-constants";
import { TOPBAR_GLYPH_BY_NODE_TYPE } from "./TopbarPinIcons";

/** Portal a `body` evita stacking contexts del lienzo. */
const EMPTY_SHORTCUTS_Z = 20100;

/**
 * Borde inferior del popover (`fixed`): debe quedar por encima del recuadro de la barra de accesos
 * sin solaparse. Coincide con `page.tsx` (`bottom-6` = 1.5rem) + `TopbarPins` embebido (`py-1.5` + chips `min-h-[3.85rem]`).
 * +1.25rem ≈ 20px de hueco entre el techo de la barra y la base del modal (incl. pico del popover).
 */
const EMPTY_SHORTCUTS_BOTTOM =
  "calc(1.5rem + 0.75rem + 3.85rem + 1.25rem + env(safe-area-inset-bottom, 0px))";

type Props = {
  showWelcome: boolean;
  onWelcomeAnimationEnd: () => void;
  isAuthenticated: boolean;
  showEmptyShortcutsHint: boolean;
  windowMode: boolean;
  nodeCount: number;
};

export function SpacesWelcomeChrome({
  showWelcome,
  onWelcomeAnimationEnd,
  isAuthenticated,
  showEmptyShortcutsHint,
  windowMode,
  nodeCount,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const emptyShortcutsHint =
    isAuthenticated &&
    showEmptyShortcutsHint &&
    !windowMode &&
    nodeCount === 0 ? (
      <div
        className="foldder-empty-shortcuts-anchor pointer-events-none fixed inset-x-0 flex justify-center px-3"
        style={{ bottom: EMPTY_SHORTCUTS_BOTTOM, zIndex: EMPTY_SHORTCUTS_Z }}
        aria-live="polite"
      >
        <div className="foldder-empty-shortcuts-popover text-black">
          <ul className="m-0 list-none p-0">
            {EMPTY_CANVAS_SHORTCUT_HINT.map(({ label, keyLabel, nodeType }) => {
              const Glyph = TOPBAR_GLYPH_BY_NODE_TYPE[nodeType];
              return (
                <li
                  key={nodeType}
                  className="foldder-empty-shortcuts-row flex items-center gap-2.5 py-1 pl-1 pr-1"
                >
                  <Glyph className="shrink-0 text-black opacity-90" size={14} />
                  <span className="min-w-0 flex-1 truncate font-medium tracking-tight text-black/85">
                    {label}
                  </span>
                  <kbd className="foldder-empty-shortcuts-kbd shrink-0 font-mono text-black/80">
                    {keyLabel}
                  </kbd>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    ) : null;

  return (
    <>
      {showWelcome && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            animation: "welcomeFade 4s ease forwards",
          }}
          onAnimationEnd={onWelcomeAnimationEnd}
        >
          <style>{`
            @keyframes welcomeFade {
              0%   { opacity: 0; transform: scale(0.94); }
              15%  { opacity: 1; transform: scale(1); }
              80%  { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.03); }
            }
          `}</style>
          <span
            style={{
              fontSize: "clamp(48px,8vw,96px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              color: "transparent",
              backgroundImage: "linear-gradient(135deg,#fff 0%,rgba(255,255,255,0.35) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              userSelect: "none",
            }}
          >
            Bienvenido
          </span>
        </div>
      )}

      {portalReady && emptyShortcutsHint
        ? createPortal(emptyShortcutsHint, document.body)
        : null}
    </>
  );
}
