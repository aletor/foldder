"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { NODE_REGISTRY } from './nodeRegistry';
import { NodeIcon, NodeIconMono } from './foldder-icons';
import { SIDEBAR_HOVER_HELP } from './sidebarHoverHelp';
import { NODE_KEYS } from './node-shortcuts';

const LIBRARY_TIP_WIDTH = 260;
/** Altura aproximada del tooltip para decidir si cabe encima del botón */
const LIBRARY_TIP_EST_HEIGHT = 92;
const LIBRARY_TIP_SHOW_DELAY_MS = 1000;

function libraryTooltipPosition(el: HTMLElement): {
  centerX: number;
  anchorY: number;
  placement: 'above' | 'below';
} {
  const r = el.getBoundingClientRect();
  const gap = 10;
  const halfW = LIBRARY_TIP_WIDTH / 2;
  const pad = 12;
  let centerX = r.left + r.width / 2;
  centerX = Math.max(pad + halfW, Math.min(window.innerWidth - pad - halfW, centerX));

  const spaceAbove = r.top - pad;
  const placement: 'above' | 'below' =
    spaceAbove >= LIBRARY_TIP_EST_HEIGHT + gap ? 'above' : 'below';

  return {
    centerX,
    anchorY: placement === 'above' ? r.top : r.bottom,
    placement,
  };
}
/** Icon-only mark from /public/foldder-logo.svg — shown when sidebar is collapsed */
function FoldderLogoFMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
      aria-hidden
    >
      <path
        d="M4 8 Q4 4 8 4 L48 4 L56 12 L56 52 Q56 56 52 56 L8 56 Q4 56 4 52 Z"
        fill="#6C5CE7"
      />
      <path d="M48 4 L56 12 L48 12 Z" fill="rgba(0,0,0,0.25)" />
      <rect x="17" y="18" width="5" height="24" rx="2" fill="white" />
      <rect x="17" y="18" width="20" height="5" rx="2" fill="white" />
      <rect x="17" y="28" width="15" height="5" rx="2" fill="white" />
    </svg>
  );
}

type SidebarProps = {
  windowMode?: boolean;
  onLibraryDragStart?: (nodeType: string) => void;
  onLibraryDragEnd?: () => void;
  /** Doble clic en un mosaico: mismo comportamiento que doble clic en la barra inferior de accesos */
  onLibraryTileDoubleClick?: (nodeType: string) => void;
  /** Si true, el panel no se abre por hover hasta que el ratón entre en la franja izquierda */
  sidebarLockedCollapsed?: boolean;
  onSidebarStripMouseEnter?: () => void;
  /** Arrastre desde la librería: sin tooltips de ayuda rollover */
  paletteDragActive?: boolean;
};

function SidebarLibraryNodeIcon({ type, size = 25 }: { type: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
      <NodeIcon type={type} size={size} colorOverride="#ffffff" />
    </span>
  );
}

const Sidebar = ({
  windowMode = false,
  onLibraryDragStart,
  onLibraryDragEnd,
  onLibraryTileDoubleClick,
  sidebarLockedCollapsed = false,
  onSidebarStripMouseEnter,
  paletteDragActive = false,
}: SidebarProps) => {
  const [libraryTip, setLibraryTip] = useState<{
    type: string;
    centerX: number;
    anchorY: number;
    placement: 'above' | 'below';
  } | null>(null);

  const libraryTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLibraryTipTimer = useCallback(() => {
    if (libraryTipTimerRef.current !== null) {
      clearTimeout(libraryTipTimerRef.current);
      libraryTipTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLibraryTipTimer(), [clearLibraryTipTimer]);

  useEffect(() => {
    if (!paletteDragActive) return;
    clearLibraryTipTimer();
    setLibraryTip(null);
  }, [paletteDragActive, clearLibraryTipTimer]);

  const onLibraryTileEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, nodeType: string) => {
      if (paletteDragActive) return;
      if (!SIDEBAR_HOVER_HELP[nodeType]) return;
      clearLibraryTipTimer();
      const el = e.currentTarget;
      libraryTipTimerRef.current = setTimeout(() => {
        libraryTipTimerRef.current = null;
        setLibraryTip({ type: nodeType, ...libraryTooltipPosition(el) });
      }, LIBRARY_TIP_SHOW_DELAY_MS);
    },
    [clearLibraryTipTimer, paletteDragActive]
  );

  const onLibraryTileLeave = useCallback(() => {
    clearLibraryTipTimer();
    setLibraryTip(null);
  }, [clearLibraryTipTimer]);

  const handleLibraryTileDoubleClick = useCallback(
    (e: React.MouseEvent, nodeType: string) => {
      e.preventDefault();
      e.stopPropagation();
      clearLibraryTipTimer();
      setLibraryTip(null);
      onLibraryTileDoubleClick?.(nodeType);
    },
    [clearLibraryTipTimer, onLibraryTileDoubleClick]
  );

  const libraryTipPortal =
    libraryTip && SIDEBAR_HOVER_HELP[libraryTip.type]
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[10060] rounded-xl border border-white/45 bg-white/[0.16] px-3.5 py-2.5 shadow-[0_12px_40px_rgba(15,23,42,0.15)] backdrop-blur-2xl"
            style={{
              left: libraryTip.centerX,
              top: libraryTip.anchorY,
              width: LIBRARY_TIP_WIDTH,
              transform:
                libraryTip.placement === 'above'
                  ? 'translate(-50%, calc(-100% - 10px))'
                  : 'translate(-50%, 10px)',
            }}
          >
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-900/85 mb-1">
              {SIDEBAR_HOVER_HELP[libraryTip.type].title}
            </div>
            <p className="text-[11px] leading-snug text-slate-700/95 m-0">
              {SIDEBAR_HOVER_HELP[libraryTip.type].line}
            </p>
          </div>,
          document.body
        )
      : null;

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    onLibraryDragStart?.(nodeType);
    try {
      event.dataTransfer.setData('text/plain', nodeType);
      event.dataTransfer.setData('application/reactflow', nodeType);
      event.dataTransfer.effectAllowed = 'copyMove';
    } catch {
      try {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
      } catch {
        /* Safari / permisos */
      }
    }
  };

  const TypeIndicators = ({ nodeType }: { nodeType: string }) => {
    const meta = NODE_REGISTRY[nodeType];
    if (!meta) return <div className="type-indicator-container"><div className="type-dot" /><div className="type-dot" /></div>;

    return (
      <div className="type-indicator-container">
        <div className="type-group items-start">
          {meta.inputs.length > 0 ? (
            meta.inputs.map((input, idx) => (
              <div key={idx} className={`type-dot ${input.type} active`} aria-hidden />
            ))
          ) : (
            <div className="type-dot" />
          )}
        </div>
        <div className="type-group items-end">
          {meta.outputs.length > 0 ? (
            meta.outputs.map((output, idx) => (
              <div key={idx} className={`type-dot ${output.type} active`} aria-hidden />
            ))
          ) : (
            <div className="type-dot" />
          )}
        </div>
      </div>
    );
  };

  /** Letra de atajo (esquina superior izquierda del botón de la librería) */
  const KeyBadge = ({ nodeType }: { nodeType: string }) => {
    const key = NODE_KEYS[nodeType];
    if (!key) return null;
    return (
      <span
        className="pointer-events-none absolute left-1 top-1 select-none font-mono text-[11px] font-black leading-none tracking-wide text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]"
        aria-hidden
      >
        {key.toUpperCase()}
      </span>
    );
  };

  // ── WINDOW MODE: compact horizontal icon bar ───────────────────────────
  if (windowMode) {
    const allNodes: ({ type: string; label: string } | null)[] = [
      { type: 'mediaInput',        label: 'Asset' },
      { type: 'promptInput',       label: 'Prompt' },
      { type: 'background',        label: 'Canvas' },
      { type: 'urlImage',          label: 'Web' },
      null,
      { type: 'backgroundRemover', label: 'Matting' },
      { type: 'mediaDescriber',    label: 'Eye' },
      { type: 'enhancer',          label: 'Enhance' },
      { type: 'grokProcessor',     label: 'Grok' },
      { type: 'nanoBanana',        label: 'Nano' },
      { type: 'geminiVideo',       label: 'Video Gen' },
      { type: 'vfxGenerator',      label: 'VFX' },
      null,
      { type: 'concatenator',      label: 'Concat' },
      { type: 'listado',           label: 'Listado' },
      { type: 'space',             label: 'Space' },
      null,
      { type: 'imageComposer',     label: 'Layout' },
      { type: 'imageExport',       label: 'Export' },
      { type: 'painter',           label: 'Painter' },
      { type: 'textOverlay',       label: 'Text' },
      { type: 'crop',              label: 'Crop' },
      { type: 'freehand',          label: 'Freehand' },
      { type: 'indesign',          label: 'Indesign' },
    ];

    return (
      <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          overflowX: 'auto',
          padding: '0 8px',
          height: '100%',
          scrollbarWidth: 'none',
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        {allNodes.map((item, idx) =>
          item === null ? (
            <div key={`sep-${idx}`} style={{ width: 1, height: 24, flexShrink: 0, background: 'rgba(255,255,255,0.12)', marginInline: 4 }} />
          ) : (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              onDragEnd={() => onLibraryDragEnd?.()}
              onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
              onMouseLeave={onLibraryTileLeave}
              onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
              aria-label={
                NODE_KEYS[item.type]
                  ? `${item.label}. Arrastra al lienzo. Doble clic para añadir. Atajo ${NODE_KEYS[item.type].toUpperCase()}.`
                  : `${item.label}. Arrastra al lienzo. Doble clic para añadir.`
              }
              style={{
                flexShrink: 0,
                width: 40,
                height: 36,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.04)',
                cursor: 'grab',
                transition: 'all 0.15s',
              }}
              className="relative hover:bg-white/10 hover:border-white/20 active:scale-95"
            >
              <KeyBadge nodeType={item.type} />
              <SidebarLibraryNodeIcon type={item.type} size={28} />
              <span style={{ fontSize: 9.8, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '0.04em', lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
                {item.label}
              </span>
            </div>
          )
        )}
      </div>
      {libraryTipPortal}
      </>
    );
  }

  // ── NORMAL MODE: vertical sidebar panel ──────────────────────────────────
  return (
    <>
    <div className="group/sidebar absolute left-0 top-0 h-screen z-[1000]">
      {/* Collapsed: solo la «F» del logo — misma zona que el antiguo HUD flotante */}
      <div
        className="pointer-events-none fixed left-6 top-6 z-[10004] transition-opacity duration-300 opacity-100 group-hover/sidebar:opacity-0"
        aria-label="Foldder"
      >
        <FoldderLogoFMark size={40} />
      </div>

      {/* Transparent hover trigger zone - wider than the pill */}
      <div
        className="absolute inset-0 w-12 h-full pointer-events-auto"
        onMouseEnter={() => onSidebarStripMouseEnter?.()}
      />

      {/* Collapsed pill — the visible strip when not hovering */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-20 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-full flex items-center justify-center text-slate-400 group-hover/sidebar:opacity-0 transition-opacity duration-300 shadow-lg pointer-events-none">
        <ChevronRight size={14} />
      </div>

      {/* Expanded panel */}
      <aside
        className={
          sidebarLockedCollapsed
            ? 'absolute left-0 top-0 h-full w-0 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
            : 'absolute left-0 top-0 h-full w-0 overflow-hidden group-hover/sidebar:w-[200px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
        }
        style={{ willChange: 'width' }}
      >
        <div className="h-full w-[200px] bg-white/5 backdrop-blur-2xl border-r border-white/8 flex flex-col min-h-0 shadow-[4px_0_40px_rgba(0,0,0,0.4)]">
          <div className="px-3 mb-4 pt-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] font-black text-white/60 uppercase tracking-[3px] mb-5 flex items-center gap-2 px-1">
              <NodeIconMono iconKey="layout" size={13} className="shrink-0 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" /> <span>Node Library</span>
            </div>

            {/* 📥 INGESTA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-white/55 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                <NodeIconMono iconKey="asset" size={10} className="shrink-0 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" /> <span>Ingesta</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'mediaInput',  label: 'Asset' },
                  { type: 'promptInput', label: 'Prompt' },
                  { type: 'background',  label: 'Canvas' },
                  { type: 'urlImage',    label: 'Web' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-emerald-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
                    onMouseLeave={onLibraryTileLeave}
                    onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
                    aria-label={`${item.label}. Arrastra al lienzo. Doble clic para añadir. Atajo ${NODE_KEYS[item.type].toUpperCase()}.`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <SidebarLibraryNodeIcon type={item.type} />
                    <span className="text-[9.8px] font-black text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🧠 INTELIGENCIA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-white/55 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <NodeIconMono iconKey="grok" size={10} className="shrink-0 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" /> <span>Inteligencia</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'backgroundRemover', label: 'Matting' },
                  { type: 'mediaDescriber',    label: 'Eye' },
                  { type: 'enhancer',          label: 'Enhance' },
                  { type: 'grokProcessor',     label: 'Grok' },
                  { type: 'nanoBanana',        label: 'Nano' },
                  { type: 'geminiVideo',       label: 'Video Generator' },
                  { type: 'vfxGenerator',      label: 'VFX Generator' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-cyan-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
                    onMouseLeave={onLibraryTileLeave}
                    onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
                    aria-label={`${item.label}. Arrastra al lienzo. Doble clic para añadir. Atajo ${NODE_KEYS[item.type].toUpperCase()}.`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <SidebarLibraryNodeIcon type={item.type} />
                    <span className="text-[9.8px] font-black text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🧩 LÓGICA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-white/55 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <NodeIconMono iconKey="concat" size={10} className="shrink-0 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" /> <span>Lógica</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'concatenator', label: 'Concat' },
                  { type: 'listado',      label: 'Listado' },
                  { type: 'space',        label: 'Space' },
                  { type: 'spaceInput',   label: 'Entry' },
                  { type: 'spaceOutput',  label: 'Exit' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-blue-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
                    onMouseLeave={onLibraryTileLeave}
                    onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
                    aria-label={`${item.label}. Arrastra al lienzo. Doble clic para añadir. Atajo ${NODE_KEYS[item.type].toUpperCase()}.`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <SidebarLibraryNodeIcon type={item.type} />
                    <span className="text-[9.8px] font-black text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🎨 COMPOSICIÓN */}
            <div className="mb-3">
              <h3 className="text-[8px] font-black text-white/55 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <NodeIconMono iconKey="canvas" size={10} className="shrink-0 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" /> <span>Composición</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'imageComposer', label: 'Layout' },
                  { type: 'imageExport',   label: 'Export' },
                  { type: 'painter',       label: 'Painter' },
                  { type: 'textOverlay',   label: 'Text' },
                  { type: 'crop',          label: 'Crop' },
                  { type: 'bezierMask',    label: 'Bezier' },
                  { type: 'freehand',      label: 'Freehand' },
                  { type: 'indesign',      label: 'Indesign' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-amber-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
                    onMouseLeave={onLibraryTileLeave}
                    onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
                    aria-label={`${item.label}. Arrastra al lienzo. Doble clic para añadir. Atajo ${NODE_KEYS[item.type].toUpperCase()}.`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <SidebarLibraryNodeIcon type={item.type} />
                    <span className="text-[9.8px] font-black text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
    {libraryTipPortal}
    </>
  );
};

export default Sidebar;
