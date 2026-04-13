"use client";

import React from 'react';

/** Unified stroke weight — matches Figma/Linear-like thin icons */
export const FOLDDER_ICON_STROKE = 1.5;

export type FoldderNodeIconState = 'idle' | 'active' | 'processing' | 'done' | 'error';

export type FoldderIconKey =
  | 'asset'
  | 'prompt'
  | 'canvas'
  | 'web'
  | 'matting'
  | 'eye'
  | 'enhance'
  | 'grok'
  | 'nano'
  | 'video'
  | 'concat'
  | 'listPick'
  | 'space'
  | 'spaceIn'
  | 'output'
  | 'layout'
  | 'export'
  | 'painter'
  | 'text'
  | 'crop'
  | 'mask'
  | 'freehand';

type GlyphProps = {
  state?: FoldderNodeIconState;
  className?: string;
  size?: number;
};

function shellClass(state: FoldderNodeIconState | undefined, className?: string) {
  const s = state ?? 'idle';
  const base =
    'foldder-node-icon shrink-0 transition-[opacity,transform,filter] duration-200 ease-out';
  const op =
    s === 'idle'
      ? 'opacity-[0.72]'
      : 'opacity-100';
  const err = s === 'error' ? 'text-rose-400' : '';
  return [base, op, err, className].filter(Boolean).join(' ');
}

function shellFilter(state: FoldderNodeIconState | undefined): React.CSSProperties {
  const s = state ?? 'idle';
  if (s === 'error') {
    return {
      filter: 'drop-shadow(0 0 5px rgba(251,113,133,0.35))',
    };
  }
  if (s === 'active' || s === 'processing' || s === 'done') {
    return {
      filter: 'drop-shadow(0 0 6px color-mix(in srgb, currentColor 45%, transparent))',
    };
  }
  return {
    filter: 'drop-shadow(0 0 3px color-mix(in srgb, currentColor 22%, transparent))',
  };
}

/** Shared SVG frame — all glyphs use 16×16, round caps, geometric joins */
export function FoldderIcon({
  children,
  state,
  className,
  size = 16,
  style,
}: {
  children: React.ReactNode;
  state?: FoldderNodeIconState;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const s = state ?? 'idle';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={shellClass(s, className)}
      style={{ ...shellFilter(s), ...style }}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth={FOLDDER_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
      {s === 'processing' && (
        <circle
          cx="13"
          cy="3"
          r="1.15"
          className="foldder-icon-pulse fill-current text-inherit"
          fill="currentColor"
          stroke="none"
        />
      )}
      {s === 'done' && (
        <circle cx="12.8" cy="3.2" r="1.1" fill="currentColor" stroke="none" opacity={0.92} />
      )}
      {s === 'error' && (
        <path
          d="M2.5 13.5 L4.5 11.5 M4.5 13.5 L2.5 11.5"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          opacity={0.55}
        />
      )}
    </svg>
  );
}

/* ── Foundational four: Prompt, Asset, Space, Output ───────────────────── */

/** Letra “P” en serif — reconocible en topbar / nodos Prompt */
export function FoldderPrompt({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <text
        x="8"
        y="11.25"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="11"
        fontWeight={700}
        style={{ letterSpacing: '-0.02em' }}
      >
        P
      </text>
    </FoldderIcon>
  );
}

/** Media frame: outer container + inner tile — “machine-readable” asset slot */
export function FoldderAsset({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1.35" />
      <rect x="8" y="8" width="4.75" height="4.75" rx="0.65" opacity={0.92} />
      <path d="M4 5.25 H7.25" opacity={0.55} strokeWidth={1.25} />
      <path d="M4 6.75 H6.5" opacity={0.4} strokeWidth={1.25} />
    </FoldderIcon>
  );
}

/** Nested subgraph: two rounded frames */
export function FoldderSpace({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.4" />
      <rect x="5" y="5" width="6" height="6" rx="1" />
    </FoldderIcon>
  );
}

/** Strong exit port: closed panel + forward gate */
export function FoldderOutput({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.5" y="3.25" width="7.25" height="9.5" rx="1.35" />
      <path d="M11.25 6.5 L14.25 8 L11.25 9.5" />
      <path d="M6.25 12.85 H11.5" opacity={0.55} strokeWidth={1.25} />
    </FoldderIcon>
  );
}

/* ── Rest of family (same hand, same primitives) ────────────────────────── */

export function FoldderCanvas({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.35" />
      <path d="M3.25 6.25 H12.75" opacity={0.45} strokeWidth={1.25} />
      <circle cx="5.1" cy="9.4" r="0.55" fill="currentColor" stroke="none" strokeWidth={0} />
      <circle cx="7.35" cy="9.4" r="0.55" fill="currentColor" stroke="none" strokeWidth={0} />
      <circle cx="9.6" cy="9.4" r="0.55" fill="currentColor" stroke="none" strokeWidth={0} />
      <circle cx="11.85" cy="9.4" r="0.55" fill="currentColor" stroke="none" strokeWidth={0} />
    </FoldderIcon>
  );
}

export function FoldderWeb({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <circle cx="8" cy="8" r="4.75" />
      <ellipse cx="8" cy="8" rx="2.25" ry="4.75" opacity={0.55} />
      <path d="M8 3.25 V12.75" opacity={0.45} />
    </FoldderIcon>
  );
}

export function FoldderMatting({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="3" y="4" width="8.5" height="8" rx="1.2" opacity={0.35} />
      <rect x="4.75" y="3" width="8.5" height="8" rx="1.2" />
      <path d="M3.5 12.5 L12.5 4.5" opacity={0.65} />
    </FoldderIcon>
  );
}

/** System vision: frame + focal cross, not a literal eye */
export function FoldderEye({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="4" y="4" width="8" height="8" rx="1.1" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" strokeWidth={0} />
      <path d="M8 4.85 V5.85 M8 10.15 V11.15 M4.85 8 H5.85 M10.15 8 H11.15" strokeWidth={1.25} opacity={0.55} />
    </FoldderIcon>
  );
}

export function FoldderEnhance({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="4.75" y="5.75" width="6.5" height="6.5" rx="1" />
      <path d="M11.75 3.25 L12.85 4.35" opacity={0.85} />
      <path d="M12.85 3.25 L11.75 4.35" opacity={0.85} />
      <path d="M3.25 11.25 L4.15 10.35" opacity={0.55} strokeWidth={1.25} />
    </FoldderIcon>
  );
}

/** Structural intelligence — lattice / reasoning */
export function FoldderGrok({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <circle cx="5.25" cy="5.25" r="1.1" fill="currentColor" stroke="none" strokeWidth={0} />
      <circle cx="10.75" cy="5.25" r="1.1" fill="currentColor" stroke="none" strokeWidth={0} />
      <circle cx="8" cy="10.25" r="1.1" fill="currentColor" stroke="none" strokeWidth={0} />
      <path d="M6.1 5.6 L7.4 9.35 M9.9 5.6 L8.6 9.35 M5.9 5.9 H10.1" opacity={0.65} strokeWidth={1.25} />
    </FoldderIcon>
  );
}

/** Nano Banana — solo “imagen” (marco + sol + sierra), sin plátano */
export function FoldderNano({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.5" y="2.75" width="11" height="10.5" rx="1.35" />
      <circle cx="5.4" cy="5.85" r="0.9" fill="currentColor" stroke="none" strokeWidth={0} />
      <path
        d="M3.35 12.45 L6.15 9.15 L8.35 10.85 L10.55 8.55 L12.65 12.45"
        opacity={0.92}
        strokeWidth={1.25}
      />
    </FoldderIcon>
  );
}

/** Marco de vídeo + triángulo play (lectura inmediata) */
export function FoldderVideo({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.35" y="3.35" width="11.3" height="9.3" rx="1.65" />
      <path
        d="M6.85 6.15 L6.85 10.85 L10.85 8.5 Z"
        fill="currentColor"
        stroke="none"
        strokeWidth={0}
      />
    </FoldderIcon>
  );
}

export function FoldderConcat({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="2.5" y="5" width="4.75" height="6" rx="1" />
      <rect x="8.75" y="5" width="4.75" height="6" rx="1" />
      <path d="M7.25 8 H8.75" strokeWidth={1.35} />
    </FoldderIcon>
  );
}

/** Lista + desplegable — elige una entrada entre varias */
export function FoldderListPick({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <path d="M2.5 4.25 H9.25" strokeWidth={1.35} />
      <path d="M2.5 7.25 H9.25" strokeWidth={1.35} />
      <path d="M2.5 10.25 H7" strokeWidth={1.35} />
      <path d="M11.25 5.25 L13.5 8 L11.25 10.75" strokeWidth={1.25} fill="none" />
    </FoldderIcon>
  );
}

export function FoldderSpaceIn({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="4.5" y="3.75" width="9" height="8.5" rx="1.2" />
      <rect x="6.75" y="6" width="4.5" height="4.5" rx="0.85" />
      <path d="M3.25 8 L5.75 6.35 V9.65 Z" />
    </FoldderIcon>
  );
}

export function FoldderLayout({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="3" y="3" width="10" height="3" rx="0.75" />
      <rect x="4.25" y="6.75" width="10" height="3" rx="0.75" opacity={0.85} />
      <rect x="5.5" y="10.5" width="10" height="3" rx="0.75" opacity={0.65} />
    </FoldderIcon>
  );
}

/** Descarga — flecha hacia bandeja (export imagen) */
export function FoldderExport({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <path d="M3.25 13.25 H12.75" strokeWidth={1.35} strokeLinecap="round" />
      <path d="M8 3.25 V10.5" strokeWidth={1.35} strokeLinecap="round" />
      <path d="M5.1 7.6 L8 10.5 L10.9 7.6" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" />
    </FoldderIcon>
  );
}

export function FoldderPainter({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <path d="M4.5 11.5 L11.5 4.5" />
      <path d="M11.5 4.5 L12.85 3.15 L12.2 5.15 Z" fill="currentColor" stroke="none" strokeWidth={0} />
      <rect x="3.25" y="11.75" width="3.5" height="1.25" rx="0.35" opacity={0.45} strokeWidth={1.25} />
    </FoldderIcon>
  );
}

export function FoldderText({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <path d="M4 5.5 H12" />
      <path d="M5.25 8.25 H11" opacity={0.75} />
      <path d="M4 11 H9.5" opacity={0.55} />
    </FoldderIcon>
  );
}

export function FoldderCrop({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <path d="M4.5 3.25 V5.75 H3.25" />
      <path d="M11.5 3.25 V5.75 H12.75" />
      <path d="M4.5 12.75 V10.25 H3.25" />
      <path d="M11.5 12.75 V10.25 H12.75" />
    </FoldderIcon>
  );
}

export function FoldderMask({ state, className, size }: GlyphProps) {
  return (
    <FoldderIcon state={state} className={className} size={size}>
      <rect x="3.25" y="3.75" width="9.5" height="8.5" rx="1.2" opacity={0.35} />
      <path d="M3.5 9.5 C5.5 6.5 8 14 12.5 7" />
    </FoldderIcon>
  );
}

/** Raster logo (fh monogram) — crisp at any node size */
export function FoldderFreehand({ state, className, size = 16 }: GlyphProps) {
  const s = state ?? 'idle';
  return (
    <span
      className={shellClass(s, `${className ?? ''} relative inline-flex items-center justify-center`)}
      style={{ ...shellFilter(s), width: size, height: size }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/freehand-node-icon.png"
        alt=""
        width={size}
        height={size}
        className="h-full w-full select-none rounded-[3px] object-contain pointer-events-none"
        draggable={false}
      />
      {s === 'processing' && (
        <span
          className="foldder-icon-pulse absolute right-px top-px block h-[5px] w-[5px] rounded-full bg-current opacity-95"
          aria-hidden
        />
      )}
      {s === 'done' && (
        <span className="absolute right-px top-px block h-[4px] w-[4px] rounded-full bg-current opacity-95" aria-hidden />
      )}
      {s === 'error' && (
        <span className="absolute -bottom-px -right-px text-[8px] leading-none text-rose-400 opacity-90" aria-hidden>
          ×
        </span>
      )}
    </span>
  );
}

/** Category colors — stroke-driven; no icon backgrounds */
export const FOLDDER_ICON_COLORS: Record<FoldderIconKey, string> = {
  asset: '#22d3ee',
  prompt: '#38bdf8',
  canvas: '#06b6d4',
  web: '#2dd4bf',
  matting: '#5eead4',
  eye: '#14b8a6',
  enhance: '#a78bfa',
  grok: '#8b5cf6',
  nano: '#c4b5fd',
  video: '#a855f7',
  concat: '#fdba74',
  listPick: '#a5b4fc',
  space: '#fb923c',
  spaceIn: '#fdba74',
  output: '#fbbf24',
  layout: '#fed7aa',
  export: '#f59e0b',
  painter: '#fcd34d',
  text: '#e9d5ff',
  crop: '#fde68a',
  mask: '#99f6e4',
  freehand: '#22d3ee',
};

export const FOLDDER_NODE_ICONS: Record<FoldderIconKey, React.FC<GlyphProps>> = {
  asset: FoldderAsset,
  prompt: FoldderPrompt,
  canvas: FoldderCanvas,
  web: FoldderWeb,
  matting: FoldderMatting,
  eye: FoldderEye,
  enhance: FoldderEnhance,
  grok: FoldderGrok,
  nano: FoldderNano,
  video: FoldderVideo,
  concat: FoldderConcat,
  listPick: FoldderListPick,
  space: FoldderSpace,
  spaceIn: FoldderSpaceIn,
  output: FoldderOutput,
  layout: FoldderLayout,
  export: FoldderExport,
  painter: FoldderPainter,
  text: FoldderText,
  crop: FoldderCrop,
  mask: FoldderMask,
  freehand: FoldderFreehand,
};

/** React Flow node `type` → icon grammar */
export const NODE_TYPE_TO_FOLDDER_ICON: Record<string, FoldderIconKey> = {
  mediaInput: 'asset',
  promptInput: 'prompt',
  background: 'canvas',
  urlImage: 'web',
  backgroundRemover: 'matting',
  mediaDescriber: 'eye',
  enhancer: 'enhance',
  grokProcessor: 'grok',
  nanoBanana: 'nano',
  geminiVideo: 'video',
  vfxGenerator: 'video',
  concatenator: 'concat',
  listado: 'listPick',
  space: 'space',
  spaceInput: 'spaceIn',
  spaceOutput: 'output',
  imageComposer: 'layout',
  imageExport: 'export',
  painter: 'painter',
  textOverlay: 'text',
  crop: 'crop',
  bezierMask: 'mask',
  canvasGroup: 'layout',
  freehand: 'freehand',
};

export function resolveFoldderNodeState(opts: {
  selected?: boolean;
  loading?: boolean;
  error?: boolean;
  done?: boolean;
}): FoldderNodeIconState {
  if (opts.error) return 'error';
  if (opts.loading) return 'processing';
  if (opts.done) return 'done';
  if (opts.selected) return 'active';
  return 'idle';
}

/** Space node “blueprint” strip — internal category → same grammar */
export const FOLDDER_INTERNAL_CATEGORY_TO_ICON: Record<string, FoldderIconKey> = {
  ai: 'grok',
  image: 'asset',
  canvas: 'canvas',
  prompt: 'prompt',
  logic: 'concat',
  video: 'video',
  tool: 'matting',
};

export function foldderIconKeyForSpaceOutputType(t?: string): FoldderIconKey {
  switch (t) {
    case 'image':
      return 'asset';
    case 'video':
      return 'video';
    case 'prompt':
      return 'prompt';
    case 'mask':
      return 'matting';
    case 'url':
      return 'web';
    case 'json':
      return 'grok';
    default:
      return 'space';
  }
}

export type NodeIconProps = {
  /** React Flow node `type` */
  type: string;
  state?: FoldderNodeIconState;
  className?: string;
  size?: number;
  colorOverride?: string;
  /** Override lookup from `type` (e.g. Space node by output) */
  iconKey?: FoldderIconKey;
  selected?: boolean;
  loading?: boolean;
  error?: boolean;
  done?: boolean;
};

export function NodeIcon({
  type,
  state,
  className,
  size = 16,
  colorOverride,
  iconKey: iconKeyProp,
  selected,
  loading,
  error,
  done,
}: NodeIconProps) {
  const resolvedState =
    state ?? resolveFoldderNodeState({ selected, loading, error, done });
  const key = iconKeyProp ?? NODE_TYPE_TO_FOLDDER_ICON[type] ?? 'asset';
  const Cmp = FOLDDER_NODE_ICONS[key] ?? FoldderAsset;
  const color = colorOverride ?? FOLDDER_ICON_COLORS[key] ?? FOLDDER_ICON_COLORS.asset;
  return (
    <span
      className={`inline-flex items-center justify-center foldder-node-icon-wrap ${className ?? ''}`}
      style={{ color }}
    >
      <Cmp state={resolvedState} size={size} />
    </span>
  );
}

/** HUD / breadcrumbs: monochrome glyph */
export function NodeIconMono({
  iconKey,
  className,
  size = 14,
  state = 'idle',
}: {
  iconKey: FoldderIconKey;
  className?: string;
  size?: number;
  state?: FoldderNodeIconState;
}) {
  const Cmp = FOLDDER_NODE_ICONS[iconKey] ?? FoldderAsset;
  return (
    <span className={`inline-flex items-center justify-center text-current ${className ?? ''}`}>
      <Cmp state={state} size={size} />
    </span>
  );
}
