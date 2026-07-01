"use client";

import type { ComponentProps } from "react";
import {
  resolveStudioCanvasFormatDisplay,
  resolveStudioCanvasPresetBrand,
  STUDIO_CANVAS_PRESET_BRAND_META,
  type StudioCanvasPresetDef,
  type StudioCanvasPresetIconKind,
} from "../studio-node/studio-canvas-presets";

type Viewport = { x: number; y: number; zoom: number };

function InstagramBrandIcon({ className = "h-3 w-3", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.35" cy="6.65" r="1.25" fill="currentColor" />
    </svg>
  );
}

function TikTokBrandIcon({ className = "h-3 w-3", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.88-2.89 2.89 2.89 0 0 1 2.88 2.89V9.4a6.34 6.34 0 0 0-1-.05 6.34 6.34 0 0 0 0 12.68 6.34 6.34 0 0 0 6.34-6.34V8.69a8.19 8.19 0 0 0 4.88 1.58V6.82a4.85 4.85 0 0 1-1-.13z" />
    </svg>
  );
}

function YouTubeBrandIcon({ className = "h-3 w-3", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function XBrandIcon({ className = "h-3 w-3", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

function FacebookBrandIcon({ className = "h-3 w-3", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function PresetShapeIcon({ kind }: { kind: StudioCanvasPresetIconKind }) {
  const common = "text-current";
  const size = 12;
  switch (kind) {
    case "monitor":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 17.5H4A1.5 1.5 0 0 1 2.5 16v-9A1.5 1.5 0 0 1 4 5.5Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 20.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 17.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "square":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "portrait":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="7" y="4" width="10" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "vertical":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8" y="3" width="8" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "image":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="10.5" r="1.5" fill="currentColor" />
          <path d="M4 16.5 8.5 12l3.5 3L17 10l3 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "panoramic":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="8" width="18" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "landscape":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="7" width="16" height="10" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function DesignerCanvasPresetBadge({ preset }: { preset: StudioCanvasPresetDef }) {
  const brand = resolveStudioCanvasPresetBrand(preset);
  const meta = STUDIO_CANVAS_PRESET_BRAND_META[brand];
  const iconStyle = meta.iconBg.startsWith("linear-gradient")
    ? { background: meta.iconBg, color: meta.iconColor }
    : { backgroundColor: meta.iconBg, color: meta.iconColor };

  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center border border-white/10"
      style={iconStyle}
      aria-hidden
    >
      {brand === "instagram" ? (
        <InstagramBrandIcon />
      ) : brand === "tiktok" ? (
        <TikTokBrandIcon />
      ) : brand === "youtube" ? (
        <YouTubeBrandIcon />
      ) : brand === "x" ? (
        <XBrandIcon />
      ) : brand === "facebook" ? (
        <FacebookBrandIcon />
      ) : (
        <PresetShapeIcon kind={preset.icon} />
      )}
    </span>
  );
}

export function DesignerCanvasFormatSizeInline({
  width,
  height,
  presetId,
  className = "",
}: {
  width: number;
  height: number;
  presetId?: string | null;
  className?: string;
}) {
  const { preset, sizeLabel } = resolveStudioCanvasFormatDisplay({ width, height, presetId });
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`.trim()}>
      {preset ? (
        <>
          <DesignerCanvasPresetBadge preset={preset} />
          <span className="truncate">{preset.title}</span>
          <span className="shrink-0 tabular-nums opacity-70">{sizeLabel}</span>
        </>
      ) : (
        <span className="tabular-nums">{sizeLabel}</span>
      )}
    </span>
  );
}

export function DesignerCanvasFormatLabel({
  width,
  height,
  presetId,
  viewport,
  artboardX,
  artboardY,
}: {
  width: number;
  height: number;
  presetId?: string | null;
  viewport: Viewport;
  artboardX: number;
  artboardY: number;
}) {
  const { preset, sizeLabel } = resolveStudioCanvasFormatDisplay({ width, height, presetId });
  const left = viewport.x + artboardX * viewport.zoom;
  const top = viewport.y + artboardY * viewport.zoom - 22;

  return (
    <div
      className="pointer-events-none absolute z-[30] flex max-w-[min(420px,calc(100%-16px))] items-center gap-1.5 whitespace-nowrap font-sans text-[11px] font-medium tracking-[0.01em] text-zinc-400"
      style={{ left, top }}
      aria-hidden
    >
      {preset ? (
        <>
          <DesignerCanvasPresetBadge preset={preset} />
          <span className="truncate text-zinc-300">{preset.title}</span>
          <span className="text-zinc-600">·</span>
        </>
      ) : null}
      <span className="tabular-nums text-zinc-400">{sizeLabel}</span>
    </div>
  );
}
