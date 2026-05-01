"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { NODE_REGISTRY } from './nodeRegistry';
import { NodeIcon, NodeIconMono } from './foldder-icons';
import { SIDEBAR_HOVER_HELP } from './sidebarHoverHelp';
import {
  TopbarGlyphBrain,
  TopbarGlyphDesignerStudio,
  TopbarGlyphFoldderApp,
  TopbarGlyphPhotoRoom,
} from './TopbarPinIcons';

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
type SidebarProps = {
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
    <span className="relative z-[1] inline-flex items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
      {type === 'projectBrain' ? (
        <TopbarGlyphBrain size={size} className="shrink-0 text-white" />
      ) : type === 'projectAssets' ? (
        <TopbarGlyphFoldderApp size={size} className="shrink-0" />
      ) : type === 'designer' ? (
        <TopbarGlyphDesignerStudio size={size} className="shrink-0" />
      ) : type === 'photoRoom' ? (
        <TopbarGlyphPhotoRoom size={size} className="shrink-0" />
      ) : (
        <NodeIcon type={type} size={size} colorOverride="#ffffff" />
      )}
    </span>
  );
}

function tileBorderClassForType(type: string, fallback: string): string {
  if (type === 'projectAssets') return 'border-[#b081f1] group-hover/tile:border-[#b081f1]';
  if (type === 'designer') return 'border-[#fdb04b] group-hover/tile:border-[#fdb04b]';
  if (type === 'photoRoom') return 'border-[#63d4fd] group-hover/tile:border-[#63d4fd]';
  if (type === 'projectBrain') return 'border-slate-400/60 group-hover/tile:border-slate-300/80';
  return fallback;
}

const HIGH_END_PRODUCTION_ITEMS: Array<{ type: string; label: string }> = [
  { type: 'projectBrain', label: 'Brain' },
  { type: 'guionista', label: 'Guionista' },
  { type: 'cine', label: 'Cine' },
  { type: 'designer', label: 'Designer' },
  { type: 'photoRoom', label: 'PhotoRoom' },
  { type: 'nanoBanana', label: 'Image Creation' },
  { type: 'geminiVideo', label: 'Video Creation' },
  { type: 'projectAssets', label: 'Foldder' },
  { type: 'presenter', label: 'Presenter' },
];

const TOOL_ITEMS: Array<{ type: string; label: string }> = [
  { type: 'mediaInput', label: 'Asset' },
  { type: 'promptInput', label: 'Prompt' },
  { type: 'urlImage', label: 'Web' },
  { type: 'pinterestSearch', label: 'Pinterest' },
  { type: 'backgroundRemover', label: 'Matting' },
  { type: 'mediaDescriber', label: 'Eye' },
  { type: 'enhancer', label: 'Enhance' },
  { type: 'grokProcessor', label: 'Grok' },
  { type: 'vfxGenerator', label: 'VFX Generator' },
  { type: 'concatenator', label: 'Concat' },
  { type: 'listado', label: 'Listado' },
  { type: 'space', label: 'Space' },
  { type: 'spaceInput', label: 'Entry' },
  { type: 'spaceOutput', label: 'Exit' },
  { type: 'imageExport', label: 'Export' },
  { type: 'notes', label: 'Notes' },
  { type: 'painter', label: 'Painter' },
  { type: 'crop', label: 'Crop' },
];

function toolFallbackBorderClass(type: string): string {
  if (type === 'mediaInput' || type === 'promptInput' || type === 'urlImage' || type === 'pinterestSearch') {
    return 'border-white/25 group-hover/tile:border-emerald-400/50';
  }
  if (type === 'backgroundRemover' || type === 'mediaDescriber' || type === 'enhancer' || type === 'grokProcessor' || type === 'vfxGenerator') {
    return 'border-white/25 group-hover/tile:border-cyan-400/50';
  }
  if (type === 'concatenator' || type === 'listado' || type === 'space' || type === 'spaceInput' || type === 'spaceOutput') {
    return 'border-white/25 group-hover/tile:border-blue-400/50';
  }
  return 'border-white/25 group-hover/tile:border-amber-400/50';
}

const Sidebar = ({
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

  const tileShellStyle: React.CSSProperties = {
    padding: 0,
    background: "transparent",
    border: "none",
    borderRadius: 0,
    gap: 0,
    width: "100%",
    aspectRatio: "1 / 1",
    overflow: "visible",
    boxShadow: "none",
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

  // ── NORMAL MODE: vertical sidebar panel ──────────────────────────────────
  return (
    <>
    <div className="group/sidebar absolute left-0 top-0 h-screen z-[1000]">
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
            : 'absolute left-0 top-0 h-full w-0 overflow-hidden group-hover/sidebar:w-[178px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
        }
        style={{ willChange: 'width' }}
      >
        <div className="h-full w-[178px] bg-transparent border-r border-white/8 flex flex-col min-h-0">
          <div className="px-0 mb-2 pt-20 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {/* 🚀 HIGH END PRODUCTION */}
            <div className="mb-4">
              <div className="mx-auto grid w-full max-w-[164px] grid-cols-2 gap-[8px]">
                {HIGH_END_PRODUCTION_ITEMS.map(item => (
                  <div key={item.type}
                    className="dndnode group/tile relative flex aspect-square w-full flex-col items-center justify-center gap-0 py-1 px-0 cursor-grab active:scale-95 transition-all text-center !bg-transparent !border-0 hover:!bg-transparent hover:!border-transparent hover:!shadow-none"
                    style={tileShellStyle}
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
                    onMouseLeave={onLibraryTileLeave}
                    onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
                    aria-label={`${item.label}. Arrastra al lienzo. Doble clic para añadir.`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute left-1/2 top-1/2 h-[97%] w-[97%] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border bg-black transition-colors ${tileBorderClassForType(item.type, 'border-white/25 group-hover/tile:border-white/45')}`}
                    />
                    <SidebarLibraryNodeIcon type={item.type} />
                    <span className="relative z-[1] text-[7px] font-light text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🛠 TOOLS */}
            <div className="mb-4">
              <div className="mx-auto grid w-full max-w-[164px] grid-cols-3 gap-[1px]">
                {TOOL_ITEMS.map(item => (
                  <div key={item.type}
                    className="dndnode group/tile relative flex aspect-square w-full flex-col items-center justify-center gap-0 py-1 px-0 cursor-grab active:scale-95 transition-all text-center !bg-transparent !border-0 hover:!bg-transparent hover:!border-transparent hover:!shadow-none"
                    style={tileShellStyle}
                    onDragStart={(e) => onDragStart(e, item.type)} onDragEnd={() => onLibraryDragEnd?.()} draggable
                    onMouseEnter={(e) => onLibraryTileEnter(e, item.type)}
                    onMouseLeave={onLibraryTileLeave}
                    onDoubleClick={(e) => handleLibraryTileDoubleClick(e, item.type)}
                    aria-label={`${item.label}. Arrastra al lienzo. Doble clic para añadir.`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute left-1/2 top-1/2 h-[84%] w-[84%] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border bg-black transition-colors ${tileBorderClassForType(item.type, toolFallbackBorderClass(item.type))}`}
                    />
                    <SidebarLibraryNodeIcon type={item.type} />
                    <span className="relative z-[1] text-[7px] font-light text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{item.label}</span>
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
