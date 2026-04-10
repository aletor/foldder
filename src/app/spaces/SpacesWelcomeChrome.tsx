"use client";

import React from "react";
import { EMPTY_CANVAS_SHORTCUT_HINT } from "./spaces-chrome-constants";

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

      {isAuthenticated &&
        showEmptyShortcutsHint &&
        !windowMode &&
        nodeCount === 0 && (
          <div
            className="foldder-empty-shortcuts-anchor pointer-events-none fixed inset-x-0 z-[19950] flex justify-center px-3"
            style={{ bottom: "max(5.25rem, 11vh)" }}
            aria-live="polite"
          >
            <div className="foldder-empty-shortcuts-popover text-black">
              <ul className="m-0 list-none p-0">
                {EMPTY_CANVAS_SHORTCUT_HINT.map(({ label, keyLabel, Icon }) => (
                  <li
                    key={label}
                    className="foldder-empty-shortcuts-row flex items-center gap-2.5 py-1 pl-1 pr-1"
                  >
                    <Icon
                      className="shrink-0 text-black opacity-90"
                      size={12}
                      strokeWidth={1.35}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium tracking-tight text-black/85">
                      {label}
                    </span>
                    <kbd className="foldder-empty-shortcuts-kbd shrink-0 font-mono text-black/80">
                      {keyLabel}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
    </>
  );
}
