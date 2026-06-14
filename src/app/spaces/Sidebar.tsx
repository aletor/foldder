"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { NODE_REGISTRY } from './nodeRegistry';
import { NODE_SIDEBAR_TILE_BACKGROUND_SRC } from './node-sidebar-tile-bg';
import { NodeIcon } from './foldder-icons';
import { SIDEBAR_HOVER_HELP } from './sidebarHoverHelp';
import { setLibraryDragPreviewImage } from './library-drag-preview';
import { getNodeCardBackgroundColor } from './node-card-palette';
import { useInputMode } from './input-mode-context';
import {
  TopbarGlyphBrain,
} from './TopbarPinIcons';

const LIBRARY_TIP_WIDTH = 190;
const LIBRARY_TIP_SHOW_DELAY_MS = 250;

function libraryTooltipPosition(el: HTMLElement): {
  x: number;
  y: number;
} {
  const r = el.getBoundingClientRect();
  const gap = 12;
  const pad = 12;
  const x = Math.min(r.right + gap, window.innerWidth - LIBRARY_TIP_WIDTH - pad);
  const y = Math.max(pad, Math.min(r.top + r.height / 2, window.innerHeight - pad));
  return {
    x,
    y,
  };
}
type SidebarProps = {
  onLibraryDragStart?: (nodeType: string) => void;
  onLibraryDragEnd?: () => void;
  /** Doble clic en un mosaico: mismo comportamiento que doble clic en la barra inferior de accesos */
  onLibraryTileDoubleClick?: (nodeType: string) => void;
  /** Tap en mosaico (modo touch): añadir nodo al lienzo */
  onLibraryTileClick?: (nodeType: string) => void;
  /** Si true, el panel no se abre por hover hasta que el ratón entre en la franja izquierda */
  sidebarLockedCollapsed?: boolean;
  /** Tras bienvenida: sidebar expandido hasta que el usuario haga rollover y salga */
  sidebarPinnedOpen?: boolean;
  onSidebarPinnedOpenDismiss?: () => void;
  onSidebarStripMouseEnter?: () => void;
  /** Arrastre desde la librería: sin tooltips de ayuda rollover */
  paletteDragActive?: boolean;
};

const SIDEBAR_TILE_BACKGROUND_SRC = NODE_SIDEBAR_TILE_BACKGROUND_SRC;

const SIDEBAR_RASTER_ICON_SRC: Record<string, string> = {
  designer: '/designer_icon.svg',
  guionista: '/guionista_icon.svg',
  cine: '/cine_icon.svg',
  nanoBanana: '/image_icon.svg',
  geminiVideo: '/video_icon.svg',
  presenter: '/presenter_icon.svg',
  video_editor: '/video_edition_icon.svg',
  videoEditor: '/video_edition_icon.svg',
};

function SidebarRasterIcon({ src, size }: { src: string; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="block select-none object-contain pointer-events-none"
      style={{ height: size, width: 'auto', maxWidth: size * 1.25 }}
      draggable={false}
      aria-hidden
    />
  );
}

function SidebarLibraryNodeIcon({ type, size = 25 }: { type: string; size?: number }) {
  const rasterSrc = SIDEBAR_RASTER_ICON_SRC[type];
  return (
    <span
      className="relative z-[1] inline-flex items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
      style={{ width: size * 1.35, height: size }}
    >
      {rasterSrc ? (
        <SidebarRasterIcon src={rasterSrc} size={size} />
      ) : type === 'projectBrain' ? (
        <TopbarGlyphBrain size={size} className="shrink-0 text-white" />
      ) : (
        <NodeIcon type={type} size={size} colorOverride="#ffffff" />
      )}
    </span>
  );
}

function tileBorderClassForType(type: string, fallback: string): string {
  if (type === 'designer') return 'border-[#fdb04b] group-hover/tile:border-[#fdb04b]';
  if (type === 'guionista') return 'border-[#37f1e8] group-hover/tile:border-[#37f1e8]';
  if (type === 'cine') return 'border-[#b48689] group-hover/tile:border-[#b48689]';
  if (type === 'photoRoom') return 'border-[#63d4fd] group-hover/tile:border-[#63d4fd]';
  if (type === 'nanoBanana') return 'border-[#e0dc52] group-hover/tile:border-[#e0dc52]';
  if (type === 'inspiration') return 'border-emerald-400/70 group-hover/tile:border-emerald-300/90';
  if (type === 'imageCreationAdvanced') return 'border-[#f6e56e] group-hover/tile:border-[#f6e56e]';
  if (type === 'geminiVideo') return 'border-[#ed9ae0] group-hover/tile:border-[#ed9ae0]';
  if (type === 'video_editor' || type === 'videoEditor') return 'border-[#5ec4cc] group-hover/tile:border-[#7dd8df]';
  if (type === 'presenter') return 'border-[#8ac091] group-hover/tile:border-[#8ac091]';
  if (type === 'projectBrain') return 'border-slate-400/60 group-hover/tile:border-slate-300/80';
  return fallback;
}

const HIGH_END_PRODUCTION_ITEMS: Array<{ type: string; label: string }> = [
  { type: 'projectBrain', label: 'Brain' },
  { type: 'guionista', label: 'Guionista' },
  { type: 'cine', label: 'Cine' },
  { type: 'designer', label: 'Designer' },
  { type: 'inspiration', label: 'Inspiration' },
  { type: 'photoRoom', label: 'PhotoRoom' },
  { type: 'nanoBanana', label: 'Image Creation' },
  { type: 'geminiVideo', label: 'Video Creation' },
  { type: 'presenter', label: 'Presenter' },
  { type: 'video_editor', label: 'Video Editor' },
];

const TOOL_ITEMS: Array<{ type: string; label: string }> = [
  { type: 'promptInput', label: 'Prompt' },
  { type: 'urlImage', label: 'URL Image' },
  { type: 'backgroundRemover', label: 'BG Remover' },
  { type: 'mediaDescriber', label: 'Image Describer' },
  { type: 'enhancer', label: 'Enhance' },
  { type: 'imageCreationAdvanced', label: 'Image Advanced' },
  { type: 'export_multimedia', label: 'Export Multimedia' },
  { type: 'concatenator', label: 'Concat' },
  { type: 'imageExport', label: 'Export' },
  { type: 'notes', label: 'Notes' },
  { type: 'painter', label: 'Painter' },
  { type: 'crop', label: 'Crop' },
];

function toolFallbackBorderClass(type: string): string {
  if (type === 'promptInput' || type === 'urlImage') {
    return 'border-white/25 group-hover/tile:border-emerald-400/50';
  }
  if (type === 'backgroundRemover' || type === 'mediaDescriber' || type === 'enhancer') {
    return 'border-white/25 group-hover/tile:border-cyan-400/50';
  }
  if (type === 'concatenator') {
    return 'border-white/25 group-hover/tile:border-blue-400/50';
  }
  return 'border-white/25 group-hover/tile:border-amber-400/50';
}

function resolveSidebarHoverHelp(nodeType: string, label?: string): { title: string; line: string } | null {
  const explicit = SIDEBAR_HOVER_HELP[nodeType];
  if (explicit) return explicit;
  const meta = NODE_REGISTRY[nodeType];
  if (meta) {
    return {
      title: meta.label || label || nodeType,
      line: meta.description || 'Arrastra al lienzo o doble clic para añadir.',
    };
  }
  if (label) {
    return {
      title: label,
      line: 'Arrastra al lienzo o doble clic para añadir.',
    };
  }
  return null;
}

function SidebarTileInfoButton({
  label,
  onEnter,
  onLeave,
}: {
  label?: string;
  onEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onLeave: () => void;
}) {
  return (
    <button
      type="button"
      className="foldder-sidebar-tile__info nodrag"
      draggable={false}
      aria-label={label ? `Información sobre ${label}` : 'Información'}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span aria-hidden>i</span>
    </button>
  );
}

const Sidebar = ({
  onLibraryDragStart,
  onLibraryDragEnd,
  onLibraryTileDoubleClick,
  onLibraryTileClick,
  sidebarLockedCollapsed = false,
  sidebarPinnedOpen = false,
  onSidebarPinnedOpenDismiss,
  onSidebarStripMouseEnter,
  paletteDragActive = false,
}: SidebarProps) => {
  const { isTouchUI } = useInputMode();
  const [sidebarTouchOpen, setSidebarTouchOpen] = useState(false);
  const [libraryTip, setLibraryTip] = useState<{
    type: string;
    x: number;
    y: number;
  } | null>(null);

  const libraryTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarPinnedRolloverRef = useRef(false);

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
  }, [paletteDragActive, clearLibraryTipTimer]);

  const visibleLibraryTip = paletteDragActive ? null : libraryTip;

  const onLibraryTileEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>, nodeType: string, label?: string) => {
      if (paletteDragActive) return;
      if (!resolveSidebarHoverHelp(nodeType, label)) return;
      clearLibraryTipTimer();
      const tile =
        (e.currentTarget.closest('.foldder-sidebar-tile') as HTMLElement | null) ??
        e.currentTarget;
      libraryTipTimerRef.current = setTimeout(() => {
        libraryTipTimerRef.current = null;
        setLibraryTip({ type: nodeType, ...libraryTooltipPosition(tile) });
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

  const handleLibraryTileTap = useCallback(
    (e: React.MouseEvent | React.PointerEvent, nodeType: string) => {
      if (!isTouchUI || !onLibraryTileClick) return;
      e.preventDefault();
      e.stopPropagation();
      clearLibraryTipTimer();
      setLibraryTip(null);
      onLibraryTileClick(nodeType);
      setSidebarTouchOpen(false);
    },
    [clearLibraryTipTimer, isTouchUI, onLibraryTileClick]
  );

  const sidebarExpanded =
    sidebarPinnedOpen || (isTouchUI && sidebarTouchOpen) || (!isTouchUI && !sidebarLockedCollapsed);

  const sidebarOuterClass = sidebarPinnedOpen
    ? "group/sidebar absolute left-0 top-0 z-[1000] h-screen w-[178px]"
    : isTouchUI
      ? sidebarTouchOpen
        ? "group/sidebar absolute left-0 top-0 z-[1000] h-screen w-[178px]"
        : "group/sidebar absolute left-0 top-0 z-[1000] h-screen w-12"
      : sidebarLockedCollapsed
        ? "group/sidebar absolute left-0 top-0 z-[1000] h-screen w-12"
        : "group/sidebar absolute left-0 top-0 z-[1000] h-screen w-12 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:w-[178px]";

  const sidebarAsideClass = sidebarPinnedOpen
    ? "absolute left-0 top-0 h-full w-[178px] overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
    : isTouchUI
      ? sidebarTouchOpen
        ? "absolute left-0 top-0 h-full w-[178px] overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        : "absolute left-0 top-0 h-full w-0 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      : sidebarLockedCollapsed
        ? "absolute left-0 top-0 h-full w-0 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        : "absolute left-0 top-0 h-full w-0 overflow-hidden group-hover/sidebar:w-[178px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]";

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    setLibraryDragPreviewImage(event, nodeType, {
      backgroundImage: SIDEBAR_TILE_BACKGROUND_SRC[nodeType],
    });
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

  const renderTileHandlers = (nodeType: string) =>
    isTouchUI
      ? {
          draggable: false as const,
          onClick: (e: React.MouseEvent) => handleLibraryTileTap(e, nodeType),
        }
      : {
          draggable: true as const,
          onDragStart: (e: React.DragEvent) => onDragStart(e, nodeType),
          onDragEnd: () => onLibraryDragEnd?.(),
          onDoubleClick: (e: React.MouseEvent) => handleLibraryTileDoubleClick(e, nodeType),
        };

  const visibleLibraryHelp = visibleLibraryTip
    ? resolveSidebarHoverHelp(visibleLibraryTip.type)
    : null;

  const libraryTipPortal =
    visibleLibraryTip && visibleLibraryHelp
      ? createPortal(
          <div
            role="tooltip"
            key={`${visibleLibraryTip.type}-${visibleLibraryTip.x}-${visibleLibraryTip.y}`}
            className="foldder-sidebar-library-tip pointer-events-none fixed z-[10060]"
            style={{
              left: visibleLibraryTip.x,
              top: visibleLibraryTip.y,
              width: LIBRARY_TIP_WIDTH,
              '--foldder-tip-color': getNodeCardBackgroundColor(visibleLibraryTip.type),
            } as React.CSSProperties}
          >
            <div className="foldder-sidebar-library-tip__fill" aria-hidden />
            <div className="foldder-sidebar-library-tip__content rounded-none border border-white/12 bg-black/88 px-2.5 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.42)] backdrop-blur-md">
              <div className="foldder-sidebar-library-tip__text">
                <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/70 mb-1">
                  {visibleLibraryHelp.title}
                </div>
                <p className="text-[10px] leading-snug text-white m-0">
                  {visibleLibraryHelp.line}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

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

  useEffect(() => {
    if (!sidebarPinnedOpen) {
      sidebarPinnedRolloverRef.current = false;
    }
  }, [sidebarPinnedOpen]);

  const handleSidebarMouseEnter = useCallback(() => {
    onSidebarStripMouseEnter?.();
    if (sidebarPinnedOpen) {
      sidebarPinnedRolloverRef.current = true;
    }
  }, [onSidebarStripMouseEnter, sidebarPinnedOpen]);

  const handleSidebarMouseLeave = useCallback(() => {
    if (sidebarPinnedOpen && sidebarPinnedRolloverRef.current) {
      sidebarPinnedRolloverRef.current = false;
      onSidebarPinnedOpenDismiss?.();
    }
  }, [onSidebarPinnedOpenDismiss, sidebarPinnedOpen]);

  const handleSidebarTouchStripTap = useCallback(() => {
    if (!isTouchUI || sidebarPinnedOpen) return;
    setSidebarTouchOpen((open) => !open);
  }, [isTouchUI, sidebarPinnedOpen]);

  // ── NORMAL MODE: vertical sidebar panel ──────────────────────────────────
  return (
    <>
    <div
      className={sidebarOuterClass}
      data-foldder-sidebar
      data-sidebar-pinned={sidebarPinnedOpen ? "true" : undefined}
      data-sidebar-touch-open={isTouchUI && sidebarTouchOpen ? "true" : undefined}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
      onClick={isTouchUI && !sidebarExpanded ? handleSidebarTouchStripTap : undefined}
    >

      {/* Collapsed pill — the visible strip when not hovering */}
      <div
        className={[
          "foldder-sidebar-collapsed-pill absolute left-2 top-1/2 -translate-y-1/2 w-6 h-20 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-none flex items-center justify-center text-slate-400 transition-opacity duration-300 shadow-lg",
          sidebarExpanded ? "opacity-0 pointer-events-none" : isTouchUI ? "pointer-events-auto cursor-pointer" : "pointer-events-none group-hover/sidebar:opacity-0",
        ].join(" ")}
        onClick={isTouchUI && !sidebarExpanded ? (e) => { e.stopPropagation(); handleSidebarTouchStripTap(); } : undefined}
        role={isTouchUI && !sidebarExpanded ? "button" : undefined}
        aria-label={isTouchUI && !sidebarExpanded ? "Abrir librería de nodos" : undefined}
      >
        <ChevronRight size={14} />
      </div>

      {/* Expanded panel */}
      <aside
        className={sidebarAsideClass}
        style={{ willChange: 'width' }}
      >
        <div className="h-full w-[178px] bg-transparent border-r border-white/8 flex flex-col min-h-0">
          <div className="foldder-sidebar-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="foldder-sidebar-scroll-inner">
            <div className="foldder-sidebar-grid foldder-sidebar-grid--production">
              {HIGH_END_PRODUCTION_ITEMS.map((item) => {
                const tileBackground = SIDEBAR_TILE_BACKGROUND_SRC[item.type];
                return (
                  <div
                    key={item.type}
                    className={[
                      "foldder-sidebar-tile foldder-sidebar-tile--production group/tile",
                      tileBackground ? "foldder-sidebar-tile--image-bg" : "",
                      tileBorderClassForType(item.type, "border-white/25 group-hover/tile:border-white/45"),
                    ].join(" ")}
                    data-tile-type={tileBackground ? item.type : undefined}
                    style={
                      tileBackground
                        ? { backgroundImage: `url(${tileBackground})` }
                        : undefined
                    }
                    {...renderTileHandlers(item.type)}
                    aria-label={
                      isTouchUI
                        ? `${item.label}. Toca para añadir al lienzo.`
                        : `${item.label}. Arrastra al lienzo. Doble clic para añadir.`
                    }
                  >
                    <SidebarTileInfoButton
                      label={item.label}
                      onEnter={(e) => onLibraryTileEnter(e, item.type, item.label)}
                      onLeave={onLibraryTileLeave}
                    />
                    {!tileBackground ? (
                      <>
                        <SidebarLibraryNodeIcon type={item.type} size={26} />
                        <span className="foldder-sidebar-tile__label">{item.label}</span>
                      </>
                    ) : null}
                    <TypeIndicators nodeType={item.type} />
                  </div>
                );
              })}
            </div>

            <div className="foldder-sidebar-grid foldder-sidebar-grid--tools">
              {TOOL_ITEMS.map((item) => (
                <div
                  key={item.type}
                  className={`foldder-sidebar-tile foldder-sidebar-tile--tool group/tile ${tileBorderClassForType(item.type, toolFallbackBorderClass(item.type))}`}
                  {...renderTileHandlers(item.type)}
                  aria-label={
                    isTouchUI
                      ? `${item.label}. Toca para añadir al lienzo.`
                      : `${item.label}. Arrastra al lienzo. Doble clic para añadir.`
                  }
                >
                  <SidebarTileInfoButton
                    label={item.label}
                    onEnter={(e) => onLibraryTileEnter(e, item.type, item.label)}
                    onLeave={onLibraryTileLeave}
                  />
                  <SidebarLibraryNodeIcon type={item.type} size={15} />
                  <span className="foldder-sidebar-tile__label">{item.label}</span>
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
