"use client";

import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PageRect } from "./site-creator-coordinate-space";
import type { SectionHeightOpportunity } from "./site-creator-section-height";

function HeightButton({
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
      className="pointer-events-auto absolute z-[40] flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-[#101820] text-white shadow-[0_2px_10px_rgba(0,0,0,0.5)] hover:border-[#A8FF32]/80 hover:text-[#A8FF32]"
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

export function SiteCreatorSectionHeightHandles({
  opportunity,
  displayBounds,
  onChange,
  portalHost = null,
  pageAnchorRef,
  pageWidth,
  pageHeight,
}: {
  opportunity: SectionHeightOpportunity;
  displayBounds: PageRect;
  onChange: (mode: "content" | "viewport") => void;
  portalHost?: HTMLElement | null;
  pageAnchorRef?: React.RefObject<HTMLElement | null>;
  pageWidth?: number;
  pageHeight?: number;
}) {
  const [preview, setPreview] = useState<"expand" | "restore" | null>(null);
  const [frame, setFrame] = useState<DOMRect | null>(null);
  const b = displayBounds;
  const ghost = preview === "restore" ? opportunity.restoreBounds : opportunity.targetBounds;
  const extraTop = b.y + Math.min(b.height, ghost.height);
  const extraHeight = Math.max(0, ghost.height - b.height);
  const showHatch = preview === "expand" && extraHeight > 8;
  const buttonTop = Math.max(4, b.y + b.height - 28);

  useLayoutEffect(() => {
    if (!portalHost || !pageAnchorRef) return;
    const el = pageAnchorRef.current;
    if (!el) return;
    const sync = () => setFrame(el.getBoundingClientRect());
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [pageAnchorRef, portalHost]);

  const overlay = (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      data-testid="site-creator-section-height-handles"
      data-site-creator-floating-ui="true"
    >
      {preview ? (
        <>
          <div
            data-testid="site-creator-section-height-preview"
            className="absolute rounded-sm border border-[#A8FF32]/70 bg-[#A8FF32]/10"
            style={{ left: ghost.x, top: ghost.y, width: ghost.width, height: ghost.height }}
          />
          {showHatch ? (
            <div
              data-testid="site-creator-section-height-hatch"
              className="absolute"
              style={{
                left: ghost.x,
                top: extraTop,
                width: ghost.width,
                height: extraHeight,
                backgroundImage:
                  "repeating-linear-gradient(-45deg, rgba(168,255,50,0.16) 0 8px, transparent 8px 16px)",
              }}
            />
          ) : null}
          <div
            className="absolute left-1/2 z-[41] -translate-x-1/2 rounded-full border border-[#A8FF32]/50 bg-[#101820]/92 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#A8FF32]"
            style={{ top: Math.max(8, ghost.y + ghost.height - 28) }}
          >
            {preview === "restore" ? "Alto real" : "Alto de pantalla"}
          </div>
        </>
      ) : null}

      {opportunity.showExpand ? (
        <HeightButton
          testId="site-creator-section-height-expand"
          label="Alto de pantalla"
          style={{ left: b.x + b.width / 2 - 14, top: buttonTop }}
          onEnter={() => setPreview("expand")}
          onLeave={() => setPreview(null)}
          onClick={() => onChange("viewport")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 4 L6 9 L10 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </HeightButton>
      ) : null}

      {opportunity.showRestore ? (
        <HeightButton
          testId="site-creator-section-height-restore"
          label="Alto real"
          style={{ left: b.x + b.width / 2 - 14, top: buttonTop }}
          onEnter={() => setPreview("restore")}
          onLeave={() => setPreview(null)}
          onClick={() => onChange("content")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 8 L6 3 L10 8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </HeightButton>
      ) : null}
    </div>
  );

  if (portalHost && frame && pageWidth && pageHeight) {
    return createPortal(
      <div
        className="pointer-events-none fixed z-[100070] overflow-visible"
        data-site-creator-floating-ui="true"
        style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      >
        <div
          className="absolute left-0 top-0 overflow-visible"
          style={{
            width: pageWidth,
            height: pageHeight,
            transform: `scale(${frame.width / Math.max(1, pageWidth)}, ${frame.height / Math.max(1, pageHeight)})`,
            transformOrigin: "top left",
          }}
        >
          {overlay}
        </div>
      </div>,
      portalHost,
    );
  }

  return <div className="pointer-events-none absolute inset-0 z-[40] overflow-visible">{overlay}</div>;
}
