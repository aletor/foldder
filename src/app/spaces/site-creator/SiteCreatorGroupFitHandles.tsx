"use client";

import React, { useState } from "react";
import type { PageRect } from "./site-creator-coordinate-space";
import type { GroupFitOpportunity } from "./site-creator-group-fit";
import type { LayoutGroupFitOrigin } from "./site-creator-types";

export type GroupFitHandleAction = {
  mode: "full" | "scale" | "content";
  origin: LayoutGroupFitOrigin;
};

function FitButton({
  testId,
  label,
  style,
  onEnter,
  onLeave,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  style: React.CSSProperties;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-site-creator-floating-ui="true"
      aria-label={label}
      title={label}
      className="pointer-events-auto absolute z-[6] flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[#101820]/92 text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:border-[#A8FF32]/70 hover:text-[#A8FF32]"
      style={style}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function SiteCreatorGroupFitHandles({
  opportunity,
  displayBounds,
  onFit,
}: {
  opportunity: GroupFitOpportunity;
  displayBounds: PageRect;
  onFit: (action: GroupFitHandleAction) => void;
}) {
  const [preview, setPreview] = useState<"fill" | "scale" | "restore" | null>(null);
  const b = displayBounds;
  const parent = opportunity.parentRect;
  const fillGhost = { x: parent.x, y: b.y, width: parent.width, height: b.height };
  const scaleGhost = {
    x: parent.x,
    y: b.y,
    width: parent.width,
    height: Math.max(1, b.height * (parent.width / Math.max(1, b.width))),
  };
  const restoreGhost = { ...opportunity.previewRestore, y: b.y };
  const ghost = preview === "scale" ? scaleGhost : preview === "restore" ? restoreGhost : fillGhost;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[6]"
      data-testid="site-creator-group-fit-handles"
      data-site-creator-floating-ui="true"
    >
      {preview ? (
        <div
          data-testid="site-creator-group-fit-preview"
          className="absolute rounded-sm border border-[#A8FF32]/70 bg-[#A8FF32]/10"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.width,
            height: ghost.height,
          }}
        />
      ) : null}

      {opportunity.showSideLeft ? (
        <FitButton
          testId="site-creator-fit-left"
          label="Ancho completo hacia la izquierda"
          style={{ left: b.x - 14, top: b.y + b.height / 2 - 12 }}
          onEnter={() => setPreview("fill")}
          onLeave={() => setPreview(null)}
          onClick={() => onFit({ mode: "full", origin: "end" })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M8 2 L3 6 L8 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </FitButton>
      ) : null}

      {opportunity.showSideRight ? (
        <FitButton
          testId="site-creator-fit-right"
          label="Ancho completo hacia la derecha"
          style={{ left: b.x + b.width - 10, top: b.y + b.height / 2 - 12 }}
          onEnter={() => setPreview("fill")}
          onLeave={() => setPreview(null)}
          onClick={() => onFit({ mode: "full", origin: "start" })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M4 2 L9 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </FitButton>
      ) : null}

      {opportunity.showScaleLeft ? (
        <FitButton
          testId="site-creator-fit-scale-left"
          label="Ajustar proporcionalmente a la izquierda"
          style={{ left: b.x - 14, top: b.y + b.height - 10 }}
          onEnter={() => setPreview("scale")}
          onLeave={() => setPreview(null)}
          onClick={() => onFit({ mode: "scale", origin: "end" })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M9 3 L3 9 M3 5 V9 H7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </FitButton>
      ) : null}

      {opportunity.showScaleRight ? (
        <FitButton
          testId="site-creator-fit-scale-right"
          label="Ajustar proporcionalmente a la derecha"
          style={{ left: b.x + b.width - 10, top: b.y + b.height - 10 }}
          onEnter={() => setPreview("scale")}
          onLeave={() => setPreview(null)}
          onClick={() => onFit({ mode: "scale", origin: "start" })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 3 L9 9 M9 5 V9 H5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </FitButton>
      ) : null}
      {opportunity.showRestoreLeft ? (
        <FitButton
          testId="site-creator-fit-restore-left"
          label="Volver al ancho natural desde la izquierda"
          style={{ left: b.x + 6, top: b.y + b.height / 2 - 12 }}
          onEnter={() => setPreview("restore")}
          onLeave={() => setPreview(null)}
          onClick={() => onFit({ mode: "content", origin: "end" })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 2 L8 6 L3 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </FitButton>
      ) : null}

      {opportunity.showRestoreRight ? (
        <FitButton
          testId="site-creator-fit-restore-right"
          label="Volver al ancho natural desde la derecha"
          style={{ left: b.x + b.width - 30, top: b.y + b.height / 2 - 12 }}
          onEnter={() => setPreview("restore")}
          onLeave={() => setPreview(null)}
          onClick={() => onFit({ mode: "content", origin: "start" })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M9 2 L4 6 L9 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </FitButton>
      ) : null}
    </div>
  );
}
