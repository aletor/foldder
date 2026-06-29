"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Check,
  Circle,
  FileType2,
  Folder,
  Image as ImageIconLucide,
  Layers,
  Magnet,
  Minus,
  MousePointer2,
  PenTool,
  Scissors,
  Sparkles,
  Square,
  Type,
  Upload,
} from "lucide-react";
import type { FreehandObject, Tool, ToolFlyoutPrimaryState } from "../FreehandStudio";
import type { FreehandStudioCapabilities } from "../freehand/studio-capabilities";
import {
  ColorPickerModal,
  PALETTE_SWATCH_BTN_CLASS,
} from "./FreehandColorPalette";
import {
  MarqueeEllipseToolIcon,
  MarqueeLassoToolIcon,
  MarqueePolygonToolIcon,
  MarqueeRectToolIcon,
} from "../freehand/photo-marquee-toolbar-icons";
import {
  TOOLBAR_ICON_STROKE,
  PhotoBrushToolIcon,
  PhotoCloneStampToolIcon,
  TextPathToolIcon,
  ToolBtn,
  ToolFlyoutGroup,
} from "./studio-toolbar";
import { STUDIO_TOOLBAR_POPOVER_Z } from "./studio-modal-shell";

/** Props for the left tool column — grouped to keep the canvas parent readable. */
export type FreehandStudioLeftToolbarProps = {
  flushAttr: string | undefined;
  flushChrome: boolean;
  flushCtaClass: string;
  flushRangeAccentClass: string;
  flushFocusClass: string;
  objects: FreehandObject[];
  designerMode?: boolean;
  studioCaps: FreehandStudioCapabilities;
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;
  pointerSelectMode: "layer" | "folder";
  setPointerSelectMode: (mode: "layer" | "folder") => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedPoints: React.Dispatch<React.SetStateAction<Map<string, Set<number>>>>;
  leftToolbarToolFlyout: string | null;
  setLeftToolbarToolFlyout: (id: string | null) => void;
  activateSelectTool: () => void;
  primaryPhotoMarqueeTool: Tool;
  primaryPenToolSafe: Tool;
  primaryShapeTool: Tool;
  primaryTextTool: Tool;
  primaryImageTool: ToolFlyoutPrimaryState["tf-img"];
  setToolFlyoutPrimary: React.Dispatch<React.SetStateAction<ToolFlyoutPrimaryState>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  svgInputRef: React.RefObject<HTMLInputElement | null>;
  leftToolbarSwatchDockRef: React.RefObject<HTMLDivElement | null>;
  leftToolbarSwatchPreview: {
    noVectorStyle: boolean;
    hideFillForLine: boolean;
    strokeNone: boolean;
    fillNone: boolean;
    strokeHex: string;
    fillHex: string;
  };
  openLeftToolbarColorPicker: (target: "fill" | "stroke") => (e: React.MouseEvent) => void;
  leftToolbarSwatchDragOver: (e: React.DragEvent) => void;
  leftToolbarDropStroke: (e: React.DragEvent) => void;
  leftToolbarDropFill: (e: React.DragEvent) => void;
  leftToolbarColorTarget: "fill" | "stroke" | null;
  setLeftToolbarColorTarget: React.Dispatch<React.SetStateAction<"fill" | "stroke" | null>>;
  leftToolbarColorPos: { top: number; left: number };
  leftToolbarAdvancedPickerOpen: boolean;
  setLeftToolbarAdvancedPickerOpen: (open: boolean) => void;
  leftToolbarColorPopoverRef: React.RefObject<HTMLDivElement | null>;
  leftToolbarEyeAbortRef: React.MutableRefObject<AbortController | null>;
  setLeftToolbarEyeBusy: (busy: boolean) => void;
  leftToolbarEyeBusy: boolean;
  brainConnected: boolean;
  brainPaletteColors: string[];
  documentColorStats: Array<{ hex: string; count: number }>;
  savedPaletteColors: string[];
  setColorDragData: (e: React.DragEvent, hex: string) => void;
  applyLeftToolbarFill: (hex: string) => void;
  applyLeftToolbarStroke: (hex: string) => void;
  closeLeftToolbarColorUI: () => void;
  applyLeftToolbarTargetHexAndClose: (hex: string) => void;
  leftToolbarPickerInitialHex: string;
  handleLeftToolbarPickerConfirm: (hex: string) => void;
  swapLeftToolbarFillAndStroke: () => void;
  normalizeHexColor: (hex: string) => string | null;
  snapEnabled: boolean;
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

export function FreehandStudioLeftToolbar(p: FreehandStudioLeftToolbarProps) {
  const {
    flushAttr,
    flushChrome,
    flushCtaClass,
    flushRangeAccentClass,
    flushFocusClass,
    objects,
    designerMode,
    studioCaps,
    activeTool,
    setActiveTool,
    pointerSelectMode,
    setPointerSelectMode,
    setSelectedIds,
    setSelectedPoints,
    leftToolbarToolFlyout,
    setLeftToolbarToolFlyout,
    activateSelectTool,
    primaryPhotoMarqueeTool,
    primaryPenToolSafe,
    primaryShapeTool,
    primaryTextTool,
    primaryImageTool,
    setToolFlyoutPrimary,
    fileInputRef,
    svgInputRef,
    leftToolbarSwatchDockRef,
    leftToolbarSwatchPreview,
    openLeftToolbarColorPicker,
    leftToolbarSwatchDragOver,
    leftToolbarDropStroke,
    leftToolbarDropFill,
    leftToolbarColorTarget,
    setLeftToolbarColorTarget,
    leftToolbarColorPos,
    leftToolbarAdvancedPickerOpen,
    setLeftToolbarAdvancedPickerOpen,
    leftToolbarColorPopoverRef,
    leftToolbarEyeAbortRef,
    setLeftToolbarEyeBusy,
    leftToolbarEyeBusy,
    brainConnected,
    brainPaletteColors,
    documentColorStats,
    savedPaletteColors,
    setColorDragData,
    applyLeftToolbarFill,
    applyLeftToolbarStroke,
    closeLeftToolbarColorUI,
    applyLeftToolbarTargetHexAndClose,
    leftToolbarPickerInitialHex,
    handleLeftToolbarPickerConfirm,
    swapLeftToolbarFillAndStroke,
    normalizeHexColor,
    snapEnabled,
    setSnapEnabled,
  } = p;

  return (
      <div
        data-foldder-studio-flush={flushAttr}
        className={`relative z-30 flex w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-white/[0.08] px-1.5 py-2.5 ${
          flushChrome ? "bg-[#0b0f14]" : "bg-[#12151a]"
        }`}
      >
        {objects.some((o) => o.type === "groupContainer") ? (
          <ToolFlyoutGroup
            groupId="tf-select-mode"
            flyoutOpen={leftToolbarToolFlyout}
            setFlyoutOpen={setLeftToolbarToolFlyout}
            active={activeTool === "select"}
            mainTitle={`Selección (V) — clic selecciona ${pointerSelectMode === "folder" ? "la carpeta" : "la capa"}`}
            onMainClick={activateSelectTool}
            mainIcon={<MousePointer2 size={19} strokeWidth={TOOLBAR_ICON_STROKE} />}
          >
            <div className="px-1.5 pb-1 pt-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-500">
              Al hacer clic, seleccionar
            </div>
            {([
              { mode: "layer" as const, label: "Capa", hint: "Selecciona la capa directamente, también dentro de carpetas (sin entrar)", icon: <Layers size={14} strokeWidth={2} /> },
              { mode: "folder" as const, label: "Carpeta", hint: "Selecciona la carpeta entera (mover/opacidad/máscara en conjunto)", icon: <Folder size={14} strokeWidth={2} /> },
            ]).map((opt) => (
              <button
                key={opt.mode}
                type="button"
                title={opt.hint}
                onClick={() => {
                  setActiveTool("select");
                  setSelectedPoints(new Map());
                  setPointerSelectMode(opt.mode);
                  setLeftToolbarToolFlyout(null);
                }}
                className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-[11px] transition ${
                  pointerSelectMode === opt.mode
                    ? "bg-white/[0.15] text-white"
                    : "text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {opt.icon}
                <span className="flex-1 whitespace-nowrap text-left">{opt.label}</span>
                {pointerSelectMode === opt.mode ? (
                  <Check size={13} strokeWidth={2.5} className="text-violet-300" />
                ) : (
                  <span className="inline-flex w-[13px]" aria-hidden />
                )}
              </button>
            ))}
          </ToolFlyoutGroup>
        ) : (
          <ToolBtn active={activeTool === "select"} onClick={activateSelectTool} title="Selection (V)">
            <MousePointer2 size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
          </ToolBtn>
        )}

        {studioCaps.toolGenerativeFill && (
          <ToolBtn
            active={activeTool === "generativeFillSelect"}
            onClick={() => {
              setActiveTool("generativeFillSelect");
              setSelectedIds(new Set());
              setSelectedPoints(new Map());
            }}
            title="Relleno generativo — arrastra para seleccionar zonas (Shift = añadir otra)"
          >
            <Sparkles size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
          </ToolBtn>
        )}

        {studioCaps.toolPhotoMarquee && (
          <ToolFlyoutGroup
            groupId="tf-photo-marquee"
            flyoutOpen={leftToolbarToolFlyout}
            setFlyoutOpen={setLeftToolbarToolFlyout}
            active={
              activeTool === "rectMarquee" ||
              activeTool === "ellipseMarquee" ||
              activeTool === "lassoMarquee" ||
              activeTool === "polygonMarquee"
            }
            mainTitle="Selección raster: rectángulo (M), elipse (O), lazo (L), poligonal (⇧L). Ctrl/⌘ suma; Alt resta."
            onMainClick={() => {
              setActiveTool(primaryPhotoMarqueeTool);
              setLeftToolbarToolFlyout(null);
            }}
            mainIcon={
              primaryPhotoMarqueeTool === "lassoMarquee" ? (
                <MarqueeLassoToolIcon size={19} />
              ) : primaryPhotoMarqueeTool === "polygonMarquee" ? (
                <MarqueePolygonToolIcon size={19} />
              ) : primaryPhotoMarqueeTool === "ellipseMarquee" ? (
                <MarqueeEllipseToolIcon size={19} />
              ) : (
                <MarqueeRectToolIcon size={19} />
              )
            }
          >
            <button
              type="button"
              title="Marco rectangular (M)"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                activeTool === "rectMarquee" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
              }`}
              onClick={() => {
                setActiveTool("rectMarquee");
                setLeftToolbarToolFlyout(null);
              }}
            >
              <MarqueeRectToolIcon size={17} />
            </button>
            <button
              type="button"
              title="Marco elíptico (O). ⇧ al arrastrar = círculo. Ctrl/⌘ suma; Alt resta."
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                activeTool === "ellipseMarquee" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
              }`}
              onClick={() => {
                setActiveTool("ellipseMarquee");
                setLeftToolbarToolFlyout(null);
              }}
            >
              <MarqueeEllipseToolIcon size={17} />
            </button>
            <button
              type="button"
              title="Lazo libre (L)"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                activeTool === "lassoMarquee" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
              }`}
              onClick={() => {
                setActiveTool("lassoMarquee");
                setLeftToolbarToolFlyout(null);
              }}
            >
              <MarqueeLassoToolIcon size={17} />
            </button>
            <button
              type="button"
              title="Lazo poligonal (⇧L)"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                activeTool === "polygonMarquee" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
              }`}
              onClick={() => {
                setActiveTool("polygonMarquee");
                setLeftToolbarToolFlyout(null);
              }}
            >
              <MarqueePolygonToolIcon size={17} />
            </button>
          </ToolFlyoutGroup>
        )}

        <ToolFlyoutGroup
          groupId="tf-pen"
          flyoutOpen={leftToolbarToolFlyout}
          setFlyoutOpen={setLeftToolbarToolFlyout}
          active={activeTool === "directSelect" || activeTool === "pen" || activeTool === "scissors"}
          mainTitle={
            primaryPenToolSafe === "pen"
              ? "Pluma (⇧P)"
              : primaryPenToolSafe === "scissors"
                ? "Tijeras (⇧C)"
                : "Selección directa (A)"
          }
          onMainClick={() => setActiveTool(primaryPenToolSafe)}
          mainIcon={
            primaryPenToolSafe === "pen" ? (
              <PenTool size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
            ) : primaryPenToolSafe === "scissors" ? (
              <Scissors size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
            ) : (
              <MousePointer2 size={19} strokeWidth={TOOLBAR_ICON_STROKE} className="opacity-60" />
            )
          }
        >
          <button
            type="button"
            title="Selección directa (A)"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
              activeTool === "directSelect" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
            }`}
            onClick={() => {
              setActiveTool("directSelect");
              setLeftToolbarToolFlyout(null);
            }}
          >
            <MousePointer2 size={17} strokeWidth={TOOLBAR_ICON_STROKE} className="opacity-60" />
          </button>
          <button
            type="button"
            title="Pluma (⇧P)"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
              activeTool === "pen" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
            }`}
            onClick={() => {
              setActiveTool("pen");
              setLeftToolbarToolFlyout(null);
            }}
          >
            <PenTool size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
          </button>
          {designerMode && (
            <button
              type="button"
              title="Tijeras (⇧C)"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                activeTool === "scissors" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
              }`}
              onClick={() => {
                setActiveTool("scissors");
                setLeftToolbarToolFlyout(null);
              }}
            >
              <Scissors size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
            </button>
          )}
        </ToolFlyoutGroup>

        <ToolFlyoutGroup
          groupId="tf-shape"
          flyoutOpen={leftToolbarToolFlyout}
          setFlyoutOpen={setLeftToolbarToolFlyout}
          active={activeTool === "rect" || activeTool === "line" || activeTool === "ellipse"}
          mainTitle={
            primaryShapeTool === "line"
              ? "Línea"
              : primaryShapeTool === "ellipse"
                ? (designerMode ? "Elipse (E)" : "Elipse (C o E)")
                : "Rectángulo (R)"
          }
          onMainClick={() => setActiveTool(primaryShapeTool)}
          mainIcon={
            primaryShapeTool === "line"
              ? <Minus size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
              : primaryShapeTool === "ellipse"
                ? <Circle size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
                : <Square size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
          }
        >
          <button
            type="button"
            title="Rectángulo (R)"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
              activeTool === "rect" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
            }`}
            onClick={() => {
              setActiveTool("rect");
              setLeftToolbarToolFlyout(null);
            }}
          >
            <Square size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
          </button>
          <button
            type="button"
            title={designerMode ? "Elipse (E)" : "Elipse (C o E)"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
              activeTool === "ellipse" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
            }`}
            onClick={() => {
              setActiveTool("ellipse");
              setLeftToolbarToolFlyout(null);
            }}
          >
            <Circle size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
          </button>
          <button
            type="button"
            title="Línea"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
              activeTool === "line" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
            }`}
            onClick={() => {
              setActiveTool("line");
              setLeftToolbarToolFlyout(null);
            }}
          >
            <Minus size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
          </button>
        </ToolFlyoutGroup>

        {designerMode ? (
          <>
            {studioCaps.toolCloneStamp ? (
              <ToolBtn
                active={activeTool === "cloneStamp"}
                onClick={() => setActiveTool("cloneStamp")}
                title="Tampón de clon (S) — Alt+clic en la imagen = origen"
              >
                <PhotoCloneStampToolIcon size={19} />
              </ToolBtn>
            ) : null}
            {studioCaps.toolBrush ? (
              <ToolBtn
                active={activeTool === "brush"}
                onClick={() => setActiveTool("brush")}
                title="Pincel (B) — pinta en capas imagen o marcos con foto"
              >
                <PhotoBrushToolIcon size={19} />
              </ToolBtn>
            ) : null}
            <ToolFlyoutGroup
              groupId="tf-text"
              flyoutOpen={leftToolbarToolFlyout}
              setFlyoutOpen={setLeftToolbarToolFlyout}
              active={activeTool === "text" || activeTool === "textPath" || activeTool === "textFrame"}
              mainTitle={
                primaryTextTool === "textFrame"
                  ? "Marco de texto encadenado (C)"
                  : primaryTextTool === "textPath"
                    ? "Texto sobre trazo"
                    : "Texto (T)"
              }
              onMainClick={() => setActiveTool(primaryTextTool)}
              mainIcon={
                primaryTextTool === "textFrame" ? (
                  <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={TOOLBAR_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="3" width="15" height="14" rx="1.25" strokeDasharray="2.5 2" />
                    <path d="M6 7.5h8M6 10h8M6 12.5h4" />
                  </svg>
                ) : primaryTextTool === "textPath" ? (
                  <TextPathToolIcon size={19} />
                ) : (
                  <Type size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
                )
              }
            >
              <button
                type="button"
                title="Texto (T)"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                  activeTool === "text" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
                }`}
                onClick={() => {
                  setActiveTool("text");
                  setLeftToolbarToolFlyout(null);
                }}
              >
                <Type size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
              </button>
              <button
                type="button"
                title="Texto sobre trazo"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                  activeTool === "textPath" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
                }`}
                onClick={() => {
                  setActiveTool("textPath");
                  setLeftToolbarToolFlyout(null);
                }}
              >
                <TextPathToolIcon size={17} />
              </button>
              <button
                type="button"
                title="Marco de texto encadenado (C)"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                  activeTool === "textFrame" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
                }`}
                onClick={() => {
                  setActiveTool("textFrame");
                  setLeftToolbarToolFlyout(null);
                }}
              >
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={TOOLBAR_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="3" width="15" height="14" rx="1.25" strokeDasharray="2.5 2" />
                  <path d="M6 7.5h8M6 10h8M6 12.5h4" />
                </svg>
              </button>
            </ToolFlyoutGroup>

            <ToolFlyoutGroup
              groupId="tf-img"
              flyoutOpen={leftToolbarToolFlyout}
              setFlyoutOpen={setLeftToolbarToolFlyout}
              active={activeTool === "imageFrame"}
              mainTitle={primaryImageTool === "imageFrame" ? "Marco de imagen" : "Importar imagen"}
              onMainClick={() => {
                if (primaryImageTool === "imageFrame") setActiveTool("imageFrame");
                else fileInputRef.current?.click();
              }}
              mainIcon={
                primaryImageTool === "imageFrame" ? (
                  <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={TOOLBAR_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="3" width="15" height="14" rx="1.25" />
                    <line x1="2.5" y1="3" x2="17.5" y2="17" opacity={0.45} strokeWidth={1.25} />
                    <line x1="17.5" y1="3" x2="2.5" y2="17" opacity={0.45} strokeWidth={1.25} />
                  </svg>
                ) : (
                  <ImageIconLucide size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
                )
              }
            >
              <button
                type="button"
                title="Importar imagen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-zinc-500 transition hover:bg-white/[0.08] hover:text-white"
                onClick={() => {
                  setToolFlyoutPrimary((prev) => ({ ...prev, "tf-img": "importImage" }));
                  fileInputRef.current?.click();
                  setLeftToolbarToolFlyout(null);
                }}
              >
                <ImageIconLucide size={17} strokeWidth={TOOLBAR_ICON_STROKE} />
              </button>
              <button
                type="button"
                title="Marco de imagen"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] transition ${
                  activeTool === "imageFrame" ? "bg-white/[0.15] text-white" : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
                }`}
                onClick={() => {
                  setActiveTool("imageFrame");
                  setLeftToolbarToolFlyout(null);
                }}
              >
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={TOOLBAR_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="3" width="15" height="14" rx="1.25" />
                  <line x1="2.5" y1="3" x2="17.5" y2="17" opacity={0.45} strokeWidth={1.25} />
                  <line x1="17.5" y1="3" x2="2.5" y2="17" opacity={0.45} strokeWidth={1.25} />
                </svg>
              </button>
            </ToolFlyoutGroup>

            <ToolBtn onClick={() => svgInputRef.current?.click()} title="Importar SVG">
              <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden className="text-current">
                <path
                  d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V5A1.5 1.5 0 0 1 4 3.5Z"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                <text
                  x="10"
                  y="13.2"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="5.2"
                  fontWeight={700}
                  fontFamily='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
                  letterSpacing="-0.04em"
                >
                  SVG
                </text>
              </svg>
            </ToolBtn>
          </>
        ) : (
            <ToolBtn active={activeTool === "text"} onClick={() => setActiveTool("text")} title="Text (T)">
            <Type size={19} strokeWidth={TOOLBAR_ICON_STROKE} />
          </ToolBtn>
        )}

        <div className="my-1 h-px w-6 bg-white/[0.08]" />

        {!designerMode && (
          <>
            <ToolBtn onClick={() => fileInputRef.current?.click()} title="Import image">
              <Upload size={18} strokeWidth={TOOLBAR_ICON_STROKE} />
            </ToolBtn>
            <ToolBtn onClick={() => svgInputRef.current?.click()} title="Import SVG">
              <FileType2 size={18} strokeWidth={TOOLBAR_ICON_STROKE} />
            </ToolBtn>
          </>
        )}

        <div
          ref={leftToolbarSwatchDockRef}
          className="relative mt-1 flex w-full flex-col items-center"
          data-left-toolbar-swatch-dock
        >
          <div className="relative h-[28px] w-[40px] shrink-0">
            <div className="absolute left-[2px] top-[1px] h-[26px] w-[26px]">
              <button
                type="button"
                disabled={leftToolbarSwatchPreview.noVectorStyle}
                onClick={openLeftToolbarColorPicker("stroke")}
                {...(!leftToolbarSwatchPreview.noVectorStyle
                  ? { onDragOver: leftToolbarSwatchDragOver, onDrop: leftToolbarDropStroke }
                  : {})}
                className={`absolute left-0 top-0 z-0 flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border border-white/25 bg-[#2a2d33] shadow-sm transition hover:brightness-110 ${
                  leftToolbarSwatchPreview.noVectorStyle ? "cursor-not-allowed opacity-40" : ""
                }`}
                title="Trazo — elegir color o sin trazo"
                aria-label="Color de trazo"
                aria-expanded={leftToolbarColorTarget === "stroke"}
              >
                {leftToolbarSwatchPreview.strokeNone ? (
                  <span className="relative block h-[14px] w-[14px] overflow-hidden rounded-[2px] bg-white">
                    <span className="absolute inset-y-0.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-red-500" />
                  </span>
                ) : (
                  <span
                    className="block h-[14px] w-[14px] rounded-[2px]"
                    style={{ backgroundColor: leftToolbarSwatchPreview.strokeHex }}
                  />
                )}
              </button>
              {!leftToolbarSwatchPreview.hideFillForLine && (
                <button
                  type="button"
                  disabled={leftToolbarSwatchPreview.noVectorStyle}
                  onClick={openLeftToolbarColorPicker("fill")}
                  {...(!leftToolbarSwatchPreview.noVectorStyle
                    ? { onDragOver: leftToolbarSwatchDragOver, onDrop: leftToolbarDropFill }
                    : {})}
                  className={`absolute bottom-0 right-0 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border-2 border-sky-500/45 bg-[#2a2d33] shadow-md transition hover:brightness-110 ${
                    leftToolbarSwatchPreview.noVectorStyle ? "cursor-not-allowed opacity-40" : ""
                  }`}
                  title="Relleno — elegir color o sin relleno"
                  aria-label="Color de relleno"
                  aria-expanded={leftToolbarColorTarget === "fill"}
                >
                  {leftToolbarSwatchPreview.fillNone ? (
                    <span className="relative block h-[14px] w-[14px] overflow-hidden rounded-[2px] bg-white">
                      <span className="absolute inset-y-0.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-red-500" />
                    </span>
                  ) : (
                    <span
                      className="block h-[14px] w-[14px] rounded-[2px]"
                      style={{ backgroundColor: leftToolbarSwatchPreview.fillHex }}
                    />
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              disabled={leftToolbarSwatchPreview.noVectorStyle || leftToolbarSwatchPreview.hideFillForLine}
              onClick={swapLeftToolbarFillAndStroke}
              className={`absolute right-0 top-[5px] flex h-[16px] w-[16px] items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-zinc-300 shadow-sm transition hover:border-white/25 hover:bg-white/[0.1] hover:text-white ${
                leftToolbarSwatchPreview.noVectorStyle || leftToolbarSwatchPreview.hideFillForLine
                  ? "cursor-not-allowed opacity-35"
                  : ""
              }`}
              title="Intercambiar relleno y trazo"
              aria-label="Intercambiar relleno y trazo"
            >
              <ArrowLeftRight className="h-2.5 w-2.5" strokeWidth={2.6} aria-hidden />
            </button>
          </div>
        </div>

        {leftToolbarColorTarget &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={leftToolbarColorPopoverRef}
              data-left-toolbar-color-popover
              data-foldder-studio-flush={flushAttr}
              className={`fixed max-h-[min(420px,calc(100vh-24px))] w-[232px] overflow-y-auto border border-white/[0.08] p-3.5 ${
                flushChrome ? "bg-[#0b0f14]" : "rounded-[6px] bg-[#12151a] shadow-xl"
              }`}
              style={{ top: leftToolbarColorPos.top, left: leftToolbarColorPos.left, zIndex: STUDIO_TOOLBAR_POPOVER_Z }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => {
                leftToolbarEyeAbortRef.current?.abort();
                leftToolbarEyeAbortRef.current = null;
                setLeftToolbarEyeBusy(false);
              }}
              onMouseLeave={() => {
                if (leftToolbarAdvancedPickerOpen || leftToolbarEyeBusy) return;
                if (typeof window === "undefined" || !(window as any).EyeDropper) return;
                if (!leftToolbarColorTarget) return;
                void (async () => {
                  setLeftToolbarEyeBusy(true);
                  const ac = new AbortController();
                  leftToolbarEyeAbortRef.current = ac;
                  try {
                    const Ctor = (window as any).EyeDropper as new () => {
                      open: (opts?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>;
                    };
                    const ed = new Ctor();
                    const picked = await ed.open({ signal: ac.signal });
                    const hex = normalizeHexColor(picked.sRGBHex) ?? picked.sRGBHex;
                    if (leftToolbarColorTarget === "fill") applyLeftToolbarFill(hex);
                    else applyLeftToolbarStroke(hex);
                    setLeftToolbarAdvancedPickerOpen(false);
                    setLeftToolbarColorTarget(null);
                  } catch {
                    /* cancelado o bloqueado */
                  } finally {
                    if (leftToolbarEyeAbortRef.current === ac) leftToolbarEyeAbortRef.current = null;
                    setLeftToolbarEyeBusy(false);
                  }
                })();
              }}
            >
              <div className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {leftToolbarColorTarget === "fill" ? "Relleno" : "Trazo"}
              </div>

              <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">Sin color</div>
              <button
                type="button"
                title={leftToolbarColorTarget === "fill" ? "Sin relleno" : "Sin trazo"}
                className="relative flex h-[14px] w-[14px] min-h-[14px] min-w-[14px] shrink-0 items-center justify-center rounded-[3px] border border-white/[0.12] bg-white transition hover:border-white/25"
                onClick={() => {
                  if (leftToolbarColorTarget === "fill") applyLeftToolbarFill("none");
                  else applyLeftToolbarStroke("none");
                  closeLeftToolbarColorUI();
                }}
              >
                <span className="absolute inset-y-0.5 left-1/2 w-px -translate-x-1/2 bg-red-500" />
              </button>

              <div className="my-2.5 h-px bg-white/[0.08]" />

              <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">BrandKit</div>
              <div className="flex flex-wrap gap-1">
                {!brainConnected || brainPaletteColors.length === 0 ? (
                  <p className="text-[9px] text-zinc-600">Sin colores de BrandKit conectados.</p>
                ) : (
                  brainPaletteColors.map((hex) => (
                    <button
                      key={`lt-brain-${leftToolbarColorTarget}-${hex}`}
                      type="button"
                      draggable
                      title={`${hex} — clic o arrastrar`}
                      className={PALETTE_SWATCH_BTN_CLASS}
                      style={{ backgroundColor: hex }}
                      onDragStart={(e) => setColorDragData(e, hex)}
                      onClick={() => applyLeftToolbarTargetHexAndClose(hex)}
                    />
                  ))
                )}
              </div>

              <div className="my-2.5 h-px bg-white/[0.08]" />

              <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">En uso</div>
              <div className="flex flex-wrap gap-1">
                {documentColorStats.length === 0 ? (
                  <p className="text-[9px] text-zinc-600">Los colores del lienzo aparecen aquí.</p>
                ) : (
                  documentColorStats.map(({ hex, count }) => (
                    <button
                      key={`lt-inuse-${leftToolbarColorTarget}-${hex}`}
                      type="button"
                      draggable
                      title={`${hex} · ${count}× — clic o arrastrar`}
                      className={PALETTE_SWATCH_BTN_CLASS}
                      style={{ backgroundColor: hex }}
                      onDragStart={(e) => setColorDragData(e, hex)}
                      onClick={() => applyLeftToolbarTargetHexAndClose(hex)}
                    />
                  ))
                )}
              </div>

              <div className="my-2.5 h-px bg-white/[0.08]" />

              <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">Guardados</div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  draggable
                  title="Negro — clic o arrastrar"
                  className={PALETTE_SWATCH_BTN_CLASS}
                  style={{ backgroundColor: "#000000" }}
                  onDragStart={(e) => setColorDragData(e, "#000000")}
                  onClick={() => applyLeftToolbarTargetHexAndClose("#000000")}
                />
                <button
                  type="button"
                  draggable
                  title="Blanco — clic o arrastrar"
                  className={PALETTE_SWATCH_BTN_CLASS}
                  style={{
                    backgroundColor: "#ffffff",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
                  }}
                  onDragStart={(e) => setColorDragData(e, "#ffffff")}
                  onClick={() => applyLeftToolbarTargetHexAndClose("#ffffff")}
                />
                {savedPaletteColors.map((hex, realIndex) => {
                  const n = normalizeHexColor(hex)?.toLowerCase();
                  if (n === "#000000" || n === "#ffffff") return null;
                  return (
                    <button
                      key={`lt-saved-${leftToolbarColorTarget}-${hex}-${realIndex}`}
                      type="button"
                      draggable
                      title={`${hex} — clic o arrastrar`}
                      className={PALETTE_SWATCH_BTN_CLASS}
                      style={{ backgroundColor: hex }}
                      onDragStart={(e) => setColorDragData(e, hex)}
                      onClick={() => applyLeftToolbarTargetHexAndClose(hex)}
                    />
                  );
                })}
                <button
                  type="button"
                  title="Añadir con selector de color"
                  className="flex h-[14px] w-[14px] min-h-[14px] min-w-[14px] shrink-0 items-center justify-center rounded-[3px] border border-dashed border-white/25 bg-white/[0.03] text-[11px] font-light text-zinc-500 hover:border-violet-400/50 hover:bg-white/[0.06] hover:text-white"
                  onClick={() => setLeftToolbarAdvancedPickerOpen(true)}
                >
                  +
                </button>
              </div>
            </div>,
            document.body,
          )}

        {leftToolbarColorTarget ? (
          <ColorPickerModal
            open={leftToolbarAdvancedPickerOpen}
            flush={flushChrome}
            accentClass={flushCtaClass}
            accentRangeClass={flushRangeAccentClass}
            accentFocusClass={flushFocusClass}
            title={leftToolbarColorTarget === "fill" ? "Elegir color de relleno" : "Elegir color de trazo"}
            confirmLabel="Aplicar y guardar"
            initialHex={leftToolbarPickerInitialHex}
            onClose={() => setLeftToolbarAdvancedPickerOpen(false)}
            onConfirm={handleLeftToolbarPickerConfirm}
          />
        ) : null}

        <div className="flex-1 min-h-[8px]" />

        <ToolBtn active={snapEnabled} onClick={() => setSnapEnabled((p) => !p)} title={`Snap ${snapEnabled ? "on" : "off"}`}>
          <Magnet size={18} strokeWidth={1.5} />
        </ToolBtn>
      </div>
  );
}
