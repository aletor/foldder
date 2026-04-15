"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePreventBrowserPinchZoom } from "@/lib/use-prevent-browser-pinch-zoom";
import { useClampedFixedPosition } from "@/lib/use-clamped-fixed-position";
import { fireAndForgetDeleteS3Keys } from "@/lib/s3-delete-client";
import {
  X,
  MousePointer2,
  Square,
  Circle,
  PenTool,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Download,
  Undo2,
  Redo2,
  Upload,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  Group,
  Ungroup,
  Minus,
  RectangleHorizontal,
  Triangle,
  Diamond,
  Layers,
  Crop,
  Split,
  Spline,
  Unlink2,
  Type,
  Magnet,
  Image as ImageIconLucide,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  FileType2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  CaseSensitive,
  Link2,
  Weight,
  BetweenVerticalStart,
  BetweenHorizontalStart,
  IndentIncrease,
} from "lucide-react";
import { ScrubNumberInput } from "./ScrubNumberInput";
import { FreehandExportModal, type ProfessionalExportOptions } from "./freehand/FreehandExportModal";
import {
  type Artboard,
  artboardToRect,
  createArtboard,
  pickPrimaryArtboard,
  unionRects,
} from "./freehand/artboard";
import {
  buildStandaloneSvgFromCanvasDom,
  expandExportIds,
  type Rect as ExportRect,
} from "./freehand/freehand-export";
import {
  type FillAppearance,
  migrateFill,
  solidFill,
  cloneFill,
  defaultLinearGradient,
  defaultRadialGradient,
  fillPaintValue,
  renderFillDef,
  fillDefSvgString,
  gradientDefId,
  fillHasPaint,
  linearGradientFromAngle,
  angleFromLinearGradient,
  reverseGradientStops,
  addMidStop,
  textFillCssProperties,
} from "./freehand/fill";
import {
  FONT_CONVERSION_UNAVAILABLE,
  loadFontForTextConversion,
  parsePrimaryFontFamily,
  registerUserFontBuffer,
  substituteTextWithOutlinedPathsInSvg,
  textToGlyphPathPayloads,
} from "./freehand/text-outline";
import { GOOGLE_FONTS_POPULAR, googleFontStylesheetHref } from "./freehand/google-fonts";
import { sanitizeStoryLinkHref, type SpanStyle } from "./indesign/text-model";
import { extractDocumentColorStats, replaceHexEverywhere } from "./freehand/extract-document-colors";
import { FreehandColorPalette, loadSavedPaletteFromStorage, persistSavedPalette } from "./freehand/FreehandColorPalette";
import type { SvgImportShape } from "./freehand/svg-import";
import { offsetAndScaleShapes, parseSvgToShapes } from "./freehand/svg-import";
import {
  DESIGNER_RULER_THICKNESS,
  DesignerRulerCorner,
  DesignerRulerHorizontal,
  DesignerRulerVertical,
} from "./DesignerCanvasRulers";

/** Iconos para la botonera de modos de ajuste del marco de imagen (panel Designer). */
function ImageFrameFittingGlyph({ mode, className }: { mode: string; className?: string }) {
  const cn = className ?? "h-[18px] w-[18px]";
  const stroke = "currentColor";
  switch (mode) {
    case "fit-proportional":
      /* Contener: imagen completa con bandas */
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="6" y="7.5" width="12" height="9" rx="0.75" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "fill-proportional":
      /* Cubrir: recorte, imagen más grande que el marco */
      return (
        <svg viewBox="0 0 24 24" className={cn} style={{ overflow: "hidden" }} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="-1" y="5" width="26" height="14" rx="1" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "fit-stretch":
      /* Estirar a la caja (proporción del marco) */
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="3.5" y="3.5" width="17" height="17" rx="1" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "center-content":
      /* Centrar sin escalar */
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="8.5" y="9.5" width="7" height="5" rx="0.5" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "fill-stretch":
      /* Rellenar sin proporción — forma distorsionada */
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <path d="M4 4.5 L20 3.5 L19.5 20.5 L3.5 19.5 Z" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "frame-to-content":
      /* Marco encoge al contenido */
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="1.5" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="2.5 2" opacity={0.28} />
          <rect x="7" y="8.5" width="10" height="7" rx="0.75" fill={stroke} opacity={0.92} />
          <rect x="6.5" y="8" width="11" height="8" rx="1" fill="none" stroke={stroke} strokeWidth="1.1" opacity={0.55} />
        </svg>
      );
    default:
      return <ImageIconLucide className={cn} aria-hidden />;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Tool =
  | "select"
  | "directSelect"
  | "pen"
  | "rect"
  | "ellipse"
  | "text"
  | "textFrame"
  | "imageFrame"
  | "eyedropper"
  | "handTool"
  | "zoomTool";

interface Point { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }

/** Illustrator-style: smooth = symmetric tangents; cusp = G1 continuous, independent lengths; corner = independent handles (sharp). */
type VertexMode = "smooth" | "cusp" | "corner";

interface BezierPoint {
  anchor: Point;
  handleIn: Point;
  handleOut: Point;
  /** @deprecated Prefer `vertexMode`. Kept for older saved paths. */
  cornerMode?: boolean;
  vertexMode?: VertexMode;
}

function getVertexMode(pt: BezierPoint): VertexMode {
  if (pt.vertexMode) return pt.vertexMode;
  if (pt.cornerMode) return "corner";
  return "smooth";
}

/** Apply drag to one handle according to vertex mode (see Adobe Illustrator anchor point types). */
function applyVertexHandleDrag(pt: BezierPoint, ht: "handleIn" | "handleOut", newPos: Point): BezierPoint {
  const mode = getVertexMode(pt);
  if (mode === "corner") {
    return { ...pt, [ht]: newPos };
  }
  if (mode === "smooth") {
    if (ht === "handleOut") {
      const handleIn = { x: 2 * pt.anchor.x - newPos.x, y: 2 * pt.anchor.y - newPos.y };
      return { ...pt, handleOut: newPos, handleIn };
    }
    const handleOut = { x: 2 * pt.anchor.x - newPos.x, y: 2 * pt.anchor.y - newPos.y };
    return { ...pt, handleIn: newPos, handleOut };
  }
  // cusp: opposite tangent directions, preserve each side's handle length (asymmetric smooth / "broken" handles)
  if (ht === "handleOut") {
    const dx = newPos.x - pt.anchor.x, dy = newPos.y - pt.anchor.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / len, uy = dy / len;
    const lenIn = Math.max(1e-6, dist(pt.anchor, pt.handleIn));
    return {
      ...pt,
      handleOut: newPos,
      handleIn: { x: pt.anchor.x - ux * lenIn, y: pt.anchor.y - uy * lenIn },
    };
  }
  const dx = newPos.x - pt.anchor.x, dy = newPos.y - pt.anchor.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  const ux = dx / len, uy = dy / len;
  const lenOut = Math.max(1e-6, dist(pt.anchor, pt.handleOut));
  return {
    ...pt,
    handleIn: newPos,
    handleOut: { x: pt.anchor.x - ux * lenOut, y: pt.anchor.y - uy * lenOut },
  };
}

/** When switching mode from UI: normalize handles to a valid state for that mode. */
function normalizeBezierPointForVertexMode(pt: BezierPoint, mode: VertexMode): BezierPoint {
  const a = pt.anchor;
  if (mode === "corner") {
    return { ...pt, vertexMode: "corner", cornerMode: true };
  }
  let out = pt.handleOut;
  let inn = pt.handleIn;
  if (dist(a, out) < 1e-6 && dist(a, inn) < 1e-6) {
    out = { x: a.x + 48, y: a.y };
    inn = { x: a.x - 48, y: a.y };
  }
  if (mode === "smooth") {
    const handleIn = { x: 2 * a.x - out.x, y: 2 * a.y - out.y };
    return { ...pt, vertexMode: "smooth", cornerMode: false, handleOut: out, handleIn };
  }
  const dx = out.x - a.x, dy = out.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const ux = dx / L, uy = dy / L;
  const lenIn = Math.max(1e-6, dist(a, inn));
  const lenOut = Math.max(1e-6, dist(a, out));
  return {
    ...pt,
    vertexMode: "cusp",
    cornerMode: false,
    handleOut: { x: a.x + ux * lenOut, y: a.y + uy * lenOut },
    handleIn: { x: a.x - ux * lenIn, y: a.y - uy * lenIn },
  };
}

interface FreehandObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: FillAppearance;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "butt" | "round" | "square";
  strokeLinejoin: "miter" | "round" | "bevel";
  strokeDasharray: string;
  opacity: number;
  rotation: number;
  /** Espejo horizontal/vertical (escala −1 en el eje local respecto al centro del recto de selección). */
  flipX?: boolean;
  flipY?: boolean;
  visible: boolean;
  locked: boolean;
  name: string;
  groupId?: string;
  clipMaskId?: string;
  isClipMask?: boolean;
  /** Designer mode: text frame linked to a story for threaded text flow. */
  storyId?: string;
  /** Designer mode: marks this text as a threaded text frame (vs regular text). */
  isTextFrame?: boolean;
  /** Designer mode: marks this rect as an image frame container. */
  isImageFrame?: boolean;
  /** Designer mode: image content inside an image frame. */
  imageFrameContent?: {
    src: string;
    /** Persistido en proyecto; URL en `src` se renueva al cargar con hydrate S3. */
    s3Key?: string;
    originalWidth: number;
    originalHeight: number;
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
    fittingMode: "fit-proportional" | "fill-proportional" | "fit-stretch" | "fill-stretch" | "center-content" | "frame-to-content";
  } | null;
  imageFrameAutoFit?: boolean;
  imageFrameContentAlignment?: "top-left" | "top-center" | "top-right" | "middle-left" | "center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
  _designerOverflow?: boolean;
  _designerThreadInfo?: { index: number; total: number };
  _designerRichSpans?: Array<{
    text: string;
    style?: {
      fontWeight?: string;
      fontStyle?: string;
      textUnderline?: boolean;
      textStrikethrough?: boolean;
      fontSize?: number;
      color?: string;
      fontFamily?: string;
      letterSpacing?: number;
      linkHref?: string;
    };
  }>;
}

export interface RectObject extends FreehandObjectBase { type: "rect"; rx: number }
export interface EllipseObject extends FreehandObjectBase { type: "ellipse" }
export interface PathObject extends FreehandObjectBase {
  type: "path";
  points: BezierPoint[];
  closed: boolean;
  /** Índices donde empieza cada subtrazo cerrado (p. ej. marco + agujero). Si falta, un solo anillo = `points`. */
  contourStarts?: number[];
  /** Contornos múltiples (p. ej. conversión desde tipografía). Si existe, tiene prioridad en `d` SVG. */
  svgPathD?: string;
  /** Import SVG: escala + traslación del lote aplicados al `d` en espacio parse (no reescribir `d`). */
  svgPathMatrix?: { a: number; b: number; c: number; d: number; e: number; f: number };
  /** `svgPathD` en coords locales 0…intrinsic; en pantalla: translate(x,y) scale(w/iw, h/ih). */
  svgPathIntrinsicW?: number;
  svgPathIntrinsicH?: number;
}
interface ImageObject extends FreehandObjectBase {
  type: "image";
  src: string;
  /** Natural aspect w/h for proportional scaling */
  intrinsicRatio?: number;
}

interface TextObject extends FreehandObjectBase {
  type: "text";
  textMode: "point" | "area";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  /** Tracking (CSS em); pair kerning via OpenType features. */
  fontKerning?: "auto" | "none";
  fontFeatureSettings?: string;
  fontVariantLigatures?: string;
  paragraphIndent?: number;
  textAlign: "left" | "center" | "right" | "justify";
  fontStyle?: "normal" | "italic";
  fontVariantCaps?: "normal" | "small-caps";
  textUnderline?: boolean;
  textStrikethrough?: boolean;
  /** Trazo del texto encima o debajo del relleno (vista + export). Por defecto `over`. */
  strokePosition?: "over" | "under";
  /** Escala no uniforme del bloque de texto (handles de transformación); por defecto 1. */
  scaleX?: number;
  scaleY?: number;
}

/** Texto siguiendo un PathObject por id; geometría de guía en tiempo de render. */
interface TextOnPathObject extends Omit<FreehandObjectBase, "fill"> {
  type: "textOnPath";
  guidePathId: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  /** Color de relleno del texto (hex/nombre); distinto de `FillAppearance` en otros tipos. */
  fill: string;
  letterSpacing: number;
  /** 0–100 (% de longitud del path). */
  startOffset: number;
  side: "above" | "below";
  /** Separación adicional respecto al trazado (px). */
  baselineShift: number;
  textAnchor: "start" | "middle" | "end";
  /** Espaciado extra entre caracteres sobre la curva (además del letter-spacing base si aplica). */
  charSpacing: number;
  pathVisible: boolean;
  pathColor: string;
  pathWidth: number;
  overflow: "hidden" | "visible" | "scale";
}

type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";

interface BooleanGroupObject extends FreehandObjectBase {
  type: "booleanGroup";
  operation: BooleanOperation;
  children: FreehandObject[];
  cachedResult?: string;
}

/** Máscara para Pegar dentro: vector cerrado o imagen (p. ej. boolean rasterizado con transparencia). */
export type ClipMaskShape = RectObject | EllipseObject | PathObject | ImageObject;

/** Non-destructive clip: vector mask + nested content (supports nesting). */
export interface ClippingContainerObject extends FreehandObjectBase {
  type: "clippingContainer";
  mask: ClipMaskShape;
  content: FreehandObject[];
}

export type FreehandObject =
  | RectObject
  | EllipseObject
  | PathObject
  | ImageObject
  | TextObject
  | TextOnPathObject
  | BooleanGroupObject
  | ClippingContainerObject;

interface FreehandStudioProps {
  nodeId: string;
  initialObjects: FreehandObject[];
  /** Pliego único (tamaño de página / área de exportación); no hay UI de “artboards”. */
  initialArtboards?: Artboard[];
  /** Guías de alineación (persistidas en el nodo). */
  initialLayoutGuides?: LayoutGuide[];
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onUpdateObjects: (objects: FreehandObject[]) => void;
  onUpdateLayoutGuides?: (guides: LayoutGuide[]) => void;
  /** Designer mode: text frame, image frame tools; pliego viene del documento de páginas. */
  designerMode?: boolean;
  /** Called when a text frame is created/modified in designer mode. */
  onDesignerTextFrameCreate?: (frameObj: FreehandObject) => void;
  /** Called when an image frame needs image placement in designer mode. */
  onDesignerImageFramePlace?: (frameId: string) => void;
  /** Imperative API ref for external object mutations (DesignerStudio ↔ FreehandStudio). */
  studioApiRef?: React.MutableRefObject<DesignerStudioApi | null>;
  /** Called when text editing ends on a text frame (blur). */
  onDesignerTextFrameEdit?: (frameId: string, storyId: string, newText: string, richHtml?: string) => void;
  /** Called when user requests a threaded continuation frame from an overflowing text frame. */
  onDesignerAppendThreadedFrame?: (sourceFrameId: string) => void;
  /** Serialized story content by storyId, for panel display. */
  designerStoryMap?: Map<string, string>;
  /** Rich HTML story content by storyId, for panel rich editor. */
  designerStoryHtmlMap?: Map<string, string>;
  /** Called when the full story text is changed from the panel textarea. */
  onDesignerStoryTextChange?: (storyId: string, newText: string) => void;
  /** Called when rich HTML story content changes from the panel editor. */
  onDesignerStoryRichChange?: (storyId: string, richHtml: string) => void;
  /** Called when user unlinks a text frame from its thread chain. */
  onDesignerUnlinkTextFrame?: (frameId: string) => void;
  /** Called when typography properties change on a text frame (to sync back to Story model). */
  onDesignerTypographyChange?: (storyId: string, patch: Record<string, unknown>) => void;
  /**
   * Designer: capture/restore full document state (pages, stories, textFrames) alongside canvas objects for undo.
   */
  designerHistoryBridge?: {
    capture: (canvasObjects: FreehandObject[]) => unknown;
    restore: (snap: unknown) => void;
  };
  /** Designer: shared clipboard across page switches (same ref for all FreehandStudio mounts). */
  designerClipboardRef?: React.MutableRefObject<FreehandObject[] | null>;
  /** Designer: narrow page rail (~110px) rendered to the right of the properties panel. */
  designerPagesRail?: React.ReactNode;
  /** Designer: bump to request fit-to-viewport after the active page canvas is shown (e.g. user picked a page). */
  designerFitToViewNonce?: number;
  /** Designer: multipage vector PDF export (shown in Export modal). */
  designerMultipageVectorPdfExport?: {
    pageCount: number;
    busy: boolean;
    onExport: () => void | Promise<void>;
  } | null;
  /**
   * Designer: el padre (DesignerStudio) genera la miniatura de la 1.ª página al cerrar.
   * Si true, no se ejecuta el PNG automático del lienzo actual en `handleCloseStudio`.
   */
  designerSkipAutoNodeExportOnClose?: boolean;
}

export interface DesignerStudioApi {
  patchObject: (id: string, patch: Partial<FreehandObject>) => void;
  addObject: (obj: FreehandObject) => void;
  getObjects: () => FreehandObject[];
  getTextEditingId: () => string | null;
  setSelectedIds: (ids: Set<string>) => void;
  /** Returns SVG string prepared for vector PDF (text as paths). Designer multi-page export. */
  getVectorPdfMarkupForCurrentPage?: () => Promise<string>;
  /** Same value as `nodeId` / studio key — used to wait until export API matches the active page after remount. */
  getExportSessionKey?: () => string;
  /** PNG data URL del pliego actual (miniatura escalada) para preview del nodo / rail de páginas. */
  getNodePreviewPngDataUrl?: (opts?: { maxSide?: number }) => Promise<string | null>;
}

interface ContextMenuItem {
  label: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

type IsolationFrame =
  | {
      kind: "boolean";
      groupId: string;
      parentObjects: FreehandObject[];
      parentSelectedIds: Set<string>;
      parentHistory: { objects: FreehandObject[]; sel: string[] }[];
      parentHistoryIdx: number;
    }
  | {
      kind: "vectorGroup";
      groupId: string;
      parentObjects: FreehandObject[];
      parentSelectedIds: Set<string>;
      parentHistory: { objects: FreehandObject[]; sel: string[] }[];
      parentHistoryIdx: number;
    }
  | {
      kind: "clipping";
      containerId: string;
      editMode: "content" | "mask";
      /** When editing mask, clipboard for content. */
      storedContent: FreehandObject[] | null;
      parentObjects: FreehandObject[];
      parentSelectedIds: Set<string>;
      parentHistory: { objects: FreehandObject[]; sel: string[] }[];
      parentHistoryIdx: number;
    };

type SnapVisual =
  | { type: "line"; axis: "x" | "y"; pos: number }
  | { type: "anchor"; x: number; y: number }
  | { type: "cross"; cx: number; cy: number };

/** Guías de diseño (coordenadas mundo): vertical = posición X; horizontal = posición Y. */
export interface LayoutGuide {
  id: string;
  orientation: "vertical" | "horizontal";
  position: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let _idC = 0;
function uid() { return `fh_${Date.now()}_${_idC++}`; }

let _lgSeq = 0;
function layoutGuideUid() {
  return `lg_${Date.now()}_${++_lgSeq}`;
}

function createLayoutGuide(orientation: "vertical" | "horizontal", position: number): LayoutGuide {
  return { id: layoutGuideUid(), orientation, position };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function escapeHtmlStr(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }

/** Barra + contentEditable compartidos entre el panel de propiedades y el modal ampliado (marco de texto). */
function DesignerStoryRichEditorBlock({
  storyId,
  storyText,
  storyHtml,
  onRichChange,
  editorClassName,
  compactMaxLines,
  onRequestOpenFull,
  enableHyperlink,
}: {
  storyId: string;
  storyText: string;
  storyHtml: string;
  onRichChange?: (sid: string, html: string) => void;
  editorClassName: string;
  /** Si se define, limita la altura del editor a N líneas (panel); si el texto supera, muestra «abrir completo». */
  compactMaxLines?: number;
  onRequestOpenFull?: () => void;
  /** Solo en el modal ampliado: insertar / quitar hipervínculos. */
  enableHyperlink?: boolean;
}) {
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const [showOpenFull, setShowOpenFull] = useState(false);

  const remeasureOverflow = useCallback(() => {
    if (!compactMaxLines) {
      setShowOpenFull(false);
      return;
    }
    const el = richEditorRef.current;
    if (!el) return;
    setShowOpenFull(el.scrollHeight > el.clientHeight + 1);
  }, [compactMaxLines]);

  useLayoutEffect(() => {
    remeasureOverflow();
  }, [storyHtml, storyText, compactMaxLines, remeasureOverflow]);

  useLayoutEffect(() => {
    const el = richEditorRef.current;
    if (!el || !compactMaxLines) return;
    const ro = new ResizeObserver(() => remeasureOverflow());
    ro.observe(el);
    return () => ro.disconnect();
  }, [compactMaxLines, remeasureOverflow]);

  const applyRichCmd = (cmd: string) => {
    const el = richEditorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false);
    if (onRichChange) onRichChange(storyId, el.innerHTML);
    queueMicrotask(remeasureOverflow);
  };

  const applyStoryHyperlink = () => {
    const el = richEditorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      window.alert("Selecciona el texto al que quieres aplicar el enlace.");
      return;
    }
    const raw = window.prompt("URL del enlace", "https://");
    if (raw == null) return;
    const url = sanitizeStoryLinkHref(raw);
    if (!url) return;
    document.execCommand("createLink", false, url);
    if (onRichChange) onRichChange(storyId, el.innerHTML);
    queueMicrotask(remeasureOverflow);
  };

  const removeStoryHyperlink = () => {
    const el = richEditorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("unlink", false);
    if (onRichChange) onRichChange(storyId, el.innerHTML);
    queueMicrotask(remeasureOverflow);
  };
  const compactStyle =
    compactMaxLines != null
      ? ({
          maxHeight: `calc(${compactMaxLines} * 0.75rem * 1.625 + 1rem)`,
          overflow: "hidden",
        } as const)
      : undefined;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 rounded-t-[5px] border border-b-0 border-white/[0.08] bg-white/[0.04] px-1.5 py-1">
        <button type="button" title="Bold (Ctrl+B)" className="rounded px-1.5 py-0.5 text-[11px] font-bold text-zinc-400 hover:bg-white/10 hover:text-white" onMouseDown={(e) => { e.preventDefault(); applyRichCmd("bold"); }}><b>B</b></button>
        <button type="button" title="Italic (Ctrl+I)" className="rounded px-1.5 py-0.5 text-[11px] italic text-zinc-400 hover:bg-white/10 hover:text-white" onMouseDown={(e) => { e.preventDefault(); applyRichCmd("italic"); }}><i>I</i></button>
        <button type="button" title="Underline (Ctrl+U)" className="rounded px-1.5 py-0.5 text-[11px] underline text-zinc-400 hover:bg-white/10 hover:text-white" onMouseDown={(e) => { e.preventDefault(); applyRichCmd("underline"); }}><u>U</u></button>
        <button type="button" title="Strikethrough" className="rounded px-1.5 py-0.5 text-[11px] line-through text-zinc-400 hover:bg-white/10 hover:text-white" onMouseDown={(e) => { e.preventDefault(); applyRichCmd("strikeThrough"); }}><s>S</s></button>
        {enableHyperlink && (
          <>
            <div className="mx-1 h-4 w-px bg-white/10" />
            <button
              type="button"
              title="Añadir hipervínculo (selecciona texto antes)"
              className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-white/10 hover:text-sky-300"
              onMouseDown={(e) => {
                e.preventDefault();
                applyStoryHyperlink();
              }}
            >
              <Link2 size={14} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title="Quitar enlace"
              className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-white/10 hover:text-sky-300"
              onMouseDown={(e) => {
                e.preventDefault();
                removeStoryHyperlink();
              }}
            >
              <Unlink2 size={14} strokeWidth={2} aria-hidden />
            </button>
          </>
        )}
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button type="button" title="Remove formatting" className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white" onMouseDown={(e) => { e.preventDefault(); applyRichCmd("removeFormat"); }}>T̈</button>
      </div>
      <div
        ref={(el) => {
          richEditorRef.current = el;
          if (el && !el.dataset.init) {
            el.dataset.init = "1";
            el.innerHTML = storyHtml || escapeHtmlStr(storyText) || "";
          }
        }}
        contentEditable
        suppressContentEditableWarning
        style={compactStyle}
        className={editorClassName}
        onInput={(e) => {
          if (onRichChange) onRichChange(storyId, (e.target as HTMLElement).innerHTML);
          queueMicrotask(remeasureOverflow);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        spellCheck={false}
      />
      {compactMaxLines != null && showOpenFull && onRequestOpenFull && (
        <button
          type="button"
          className="mt-1.5 w-full rounded-md border border-sky-500/25 bg-sky-500/10 py-1.5 text-[11px] font-semibold text-sky-200/95 transition hover:bg-sky-500/20"
          onClick={onRequestOpenFull}
        >
          abrir completo
        </button>
      )}
    </div>
  );
}

function dist(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Geometría del bitmap dentro de un marco de imagen (coordenadas mundo). */
function getImageFrameContentGeom(o: FreehandObject): {
  fx: number; fy: number; fw: number; fh: number;
  L: number; T: number; R: number; B: number;
  iw: number; ih: number;
  ow: number; oh: number;
  ifc: NonNullable<FreehandObjectBase["imageFrameContent"]>;
} | null {
  if (o.type !== "rect" || !o.isImageFrame) return null;
  const ifc = o.imageFrameContent;
  if (!ifc?.src) return null;
  const fx = o.x, fy = o.y, fw = o.width, fh = o.height;
  const iw = ifc.originalWidth * ifc.scaleX;
  const ih = ifc.originalHeight * ifc.scaleY;
  const L = fx + ifc.offsetX, T = fy + ifc.offsetY, R = L + iw, B = T + ih;
  return { fx, fy, fw, fh, L, T, R, B, iw, ih, ow: ifc.originalWidth, oh: ifc.originalHeight, ifc };
}

function hitTestImageContentEdit(
  pos: Point,
  o: FreehandObject,
  zoom: number,
): "nw" | "ne" | "sw" | "se" | "pan" | null {
  const g = getImageFrameContentGeom(o);
  if (!g) return null;
  let lp: Point = pos;
  if (o.rotation || o.flipX || o.flipY) {
    const inv = inverseObjMatrix(o);
    if (inv) {
      const t = inv.transformPoint(new DOMPoint(pos.x, pos.y));
      lp = { x: t.x, y: t.y };
    }
  }
  const hs = 10 / zoom;
  const corners: { id: "nw" | "ne" | "sw" | "se"; x: number; y: number }[] = [
    { id: "nw", x: g.L, y: g.T },
    { id: "ne", x: g.R, y: g.T },
    { id: "sw", x: g.L, y: g.B },
    { id: "se", x: g.R, y: g.B },
  ];
  for (const c of corners) {
    if (dist(lp, { x: c.x, y: c.y }) <= hs) return c.id;
  }
  if (lp.x >= g.L && lp.x <= g.R && lp.y >= g.T && lp.y <= g.B) return "pan";
  return null;
}

/** Mismo criterio que el bitmap en marco de imagen: esquinas + pan sobre el interior (AABB mundo). */
function hitTestInnerContentHandles(
  pos: Point,
  aabb: Rect,
  zoom: number,
): "nw" | "ne" | "sw" | "se" | "pan" | null {
  const { x, y, w, h } = aabb;
  const L = x, T = y, R = x + w, B = y + h;
  const hs = 10 / zoom;
  const corners: { id: "nw" | "ne" | "sw" | "se"; x: number; y: number }[] = [
    { id: "nw", x: L, y: T },
    { id: "ne", x: R, y: T },
    { id: "sw", x: L, y: B },
    { id: "se", x: R, y: B },
  ];
  for (const c of corners) {
    if (dist(pos, { x: c.x, y: c.y }) <= hs) return c.id;
  }
  if (pos.x >= L && pos.x <= R && pos.y >= T && pos.y <= B) return "pan";
  return null;
}

/** Normalized 0–1 in object box → world (respects rotation). */
function localBoxToWorld(o: FreehandObject, lx: number, ly: number): Point {
  const p = { x: o.x + lx * o.width, y: o.y + ly * o.height };
  const c = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
  return rotatePointAround(p, c, o.rotation);
}

function worldToLocalBox(o: FreehandObject, p: Point): { lx: number; ly: number } {
  const c = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
  const u = rotatePointAround(p, c, -o.rotation);
  return { lx: (u.x - o.x) / Math.max(o.width, 1e-9), ly: (u.y - o.y) / Math.max(o.height, 1e-9) };
}

function supportsGradientFill(o: FreehandObject): boolean {
  if (!o.visible || o.locked) return false;
  if (o.type === "image" || o.type === "booleanGroup" || o.type === "clippingContainer") return false;
  if (o.type === "textOnPath") return false;
  if (o.type === "path" && !(o as PathObject).closed) return false;
  return true;
}

const DEFAULT_STROKE_PROPS = {
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeDasharray: "",
};

function defaultObj(partial: Partial<FreehandObjectBase>): FreehandObjectBase {
  return {
    id: uid(),
    type: "rect",
    x: 0, y: 0, width: 100, height: 100,
    fill: solidFill("#6366f1"),
    stroke: "#ffffff",
    strokeWidth: 2,
    ...DEFAULT_STROKE_PROPS,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    name: "Object",
    ...partial,
  } as FreehandObjectBase;
}

/**
 * Une un TextObject y un PathObject de la selección en un `TextOnPathObject`.
 * Pura: no actualiza estado ni historial. Si la selección no es exactamente path+text, devuelve `objects` sin cambios.
 */
function linkTextToPath(objects: FreehandObject[], selectedIds: Set<string>): FreehandObject[] {
  const selObjs = objects.filter((o) => selectedIds.has(o.id));
  const paths = selObjs.filter((o) => o.type === "path");
  const texts = selObjs.filter((o) => o.type === "text");
  if (paths.length !== 1 || texts.length !== 1) return objects;
  const path = paths[0] as PathObject;
  const text = texts[0] as TextObject;

  const mf = migrateFill(text.fill);
  const fillStr =
    mf.type === "solid"
      ? mf.color === "none"
        ? "transparent"
        : mf.color
      : mf.stops[0]?.color ?? "#000000";
  const textAnchor: TextOnPathObject["textAnchor"] =
    text.textAlign === "center" ? "middle" : text.textAlign === "right" ? "end" : "start";

  const base = defaultObj({
    name: "Text on path",
    x: path.x,
    y: path.y,
    width: path.width,
    height: path.height,
    opacity: text.opacity,
    rotation: text.rotation,
    stroke: text.stroke,
    strokeWidth: text.strokeWidth,
    strokeLinecap: text.strokeLinecap,
    strokeLinejoin: text.strokeLinejoin,
    strokeDasharray: text.strokeDasharray,
    visible: text.visible,
    locked: text.locked,
    groupId: text.groupId,
    clipMaskId: text.clipMaskId,
  });

  const newObj: TextOnPathObject = {
    ...(base as FreehandObjectBase),
    type: "textOnPath",
    guidePathId: path.id,
    text: text.text,
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    fontWeight: text.fontWeight,
    fontStyle: "normal",
    fill: fillStr,
    letterSpacing: text.letterSpacing,
    startOffset: 0,
    side: "above",
    baselineShift: 0,
    textAnchor,
    charSpacing: 0,
    pathVisible: true,
    pathColor: path.stroke,
    pathWidth: Math.max(path.strokeWidth, 0.5),
    overflow: "visible",
  };

  let replaced = false;
  const next: FreehandObject[] = [];
  for (const o of objects) {
    if (o.id === text.id) {
      next.push(newObj);
      replaced = true;
    } else {
      next.push(o);
    }
  }
  return replaced ? next : objects;
}

// ── Geometry ────────────────────────────────────────────────────────────

/** Dimensiones del `foreignObject` del texto (coinciden con `renderObj` / export). */
function textLayoutDims(t: TextObject): { w: number; h: number } {
  const w = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
  const h = t.textMode === "point" ? Math.max(t.height, t.fontSize * t.lineHeight + 4) : t.height;
  return { w, h };
}

/** Entrada para PDF/SVG vectorial: incluye `richRuns` si el texto viene de Designer. */
function textObjectToVectorPdfOutlineItem(tx: TextObject) {
  const f = migrateFill(tx.fill);
  const fillColor = f.type === "solid" && f.color !== "none" ? f.color : "#000000";
  const richRuns =
    tx._designerRichSpans && tx._designerRichSpans.length > 0
      ? tx._designerRichSpans.map((s) => ({
          text: s.text,
          style: s.style as SpanStyle | undefined,
        }))
      : undefined;
  return {
    id: tx.id,
    name: tx.name,
    text: tx.text,
    textMode: tx.textMode,
    x: tx.x,
    y: tx.y,
    width: tx.width,
    height: tx.height,
    fontSize: tx.fontSize,
    fontWeight: tx.fontWeight,
    lineHeight: tx.lineHeight,
    letterSpacing: tx.letterSpacing,
    fontKerning: tx.fontKerning,
    textAlign: tx.textAlign,
    paragraphIndent: tx.paragraphIndent,
    fontFamily: tx.fontFamily,
    fillColor,
    stroke: tx.stroke,
    strokeWidth: tx.strokeWidth,
    opacity: tx.opacity,
    richRuns,
  };
}

/** Rectángulo visual (tras escala) para AABB, marco de selección y hit-test. */
function textVisualRectLike(t: TextObject): { x: number; y: number; width: number; height: number } {
  const { w, h } = textLayoutDims(t);
  const sx = t.scaleX ?? 1, sy = t.scaleY ?? 1;
  const ew = w * Math.abs(sx), eh = h * Math.abs(sy);
  const cx = t.x + w / 2, cy = t.y + h / 2;
  return { x: cx - ew / 2, y: cy - eh / 2, width: ew, height: eh };
}

function textSvgTransform(t: TextObject): string | undefined {
  const { w, h } = textLayoutDims(t);
  const cx = t.x + w / 2, cy = t.y + h / 2;
  const sx = t.scaleX ?? 1, sy = t.scaleY ?? 1;
  const r = t.rotation || 0;
  const parts: string[] = [];
  if (sx !== 1 || sy !== 1 || r) {
    parts.push(`translate(${cx} ${cy})`);
    if (r) parts.push(`rotate(${r})`);
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx} ${sy})`);
    parts.push(`translate(${-cx} ${-cy})`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

/** Rotación + espejo alrededor del centro del bounding box (mismo espíritu que el texto con scale). */
function buildObjTransform(o: FreehandObject): string | undefined {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const fx = o.flipX ? -1 : 1;
  const fy = o.flipY ? -1 : 1;
  const r = o.rotation || 0;
  const parts: string[] = [];
  if (fx !== 1 || fy !== 1 || r) {
    parts.push(`translate(${cx} ${cy})`);
    if (r) parts.push(`rotate(${r})`);
    if (fx !== 1 || fy !== 1) parts.push(`scale(${fx} ${fy})`);
    parts.push(`translate(${-cx} ${-cy})`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

/** Inversa del transform del objeto (hit-test de paths con el mismo `d` que en pantalla). */
function inverseObjMatrix(o: FreehandObject): DOMMatrix | null {
  if (typeof DOMMatrix === "undefined") return null;
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const m = new DOMMatrix();
  m.translateSelf(cx, cy);
  if (o.rotation) m.rotateSelf(0, 0, o.rotation);
  const fx = o.flipX ? -1 : 1;
  const fy = o.flipY ? -1 : 1;
  if (fx !== 1 || fy !== 1) m.scaleSelf(fx, fy);
  m.translateSelf(-cx, -cy);
  return m.inverse();
}

/** Mundo → coordenadas locales del objeto (antes de rotación/espejo del `<g>`). */
function worldPointToObjLocal(world: Point, o: FreehandObject): Point {
  const inv = inverseObjMatrix(o);
  if (!inv) return world;
  const t = inv.transformPoint(new DOMPoint(world.x, world.y));
  return { x: t.x, y: t.y };
}

/** Local del objeto → mundo (para dibujar overlays alineados con el marco). */
function objLocalToWorldPoint(local: Point, o: FreehandObject): Point {
  const inv = inverseObjMatrix(o);
  if (!inv) return local;
  const fwd = inv.inverse();
  const t = fwd.transformPoint(new DOMPoint(local.x, local.y));
  return { x: t.x, y: t.y };
}

function pointInRotatedRect(px: number, py: number, obj: FreehandObject): boolean {
  const rad = (-obj.rotation * Math.PI) / 180;
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const dx = px - cx, dy = py - cy;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + obj.width / 2;
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad) + obj.height / 2;
  return rx >= 0 && rx <= obj.width && ry >= 0 && ry <= obj.height;
}

function pointInEllipse(px: number, py: number, obj: FreehandObject): boolean {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const rad = (-obj.rotation * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  const rx2 = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry2 = dx * Math.sin(rad) + dy * Math.cos(rad);
  const a = obj.width / 2, b = obj.height / 2;
  return (rx2 * rx2) / (a * a) + (ry2 * ry2) / (b * b) <= 1;
}

function cubicBezierAt(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function distToSegmentBezier(pos: Point, p0: Point, cp1: Point, cp2: Point, p3: Point, samples = 24): number {
  let minD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const pt = cubicBezierAt(i / samples, p0, cp1, cp2, p3);
    minD = Math.min(minD, dist(pos, pt));
  }
  return minD;
}

function distToPathSegments(
  pos: Point,
  path: PathObject,
): { dist: number; segIdx: number; t: number; ringIdx: number } {
  let best = { dist: Infinity, segIdx: -1, t: 0, ringIdx: 0 };
  const rings = getPathRings(path);
  for (let ri = 0; ri < rings.length; ri++) {
    const pts = rings[ri]!;
    if (!pts || pts.length === 0) continue;
    const segCount = pts.length;
    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % pts.length;
      const p0 = pts[i]!.anchor;
      const cp1 = pts[i]!.handleOut;
      const cp2 = pts[j]!.handleIn;
      const p3 = pts[j]!.anchor;
      const samples = 24;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const pt = cubicBezierAt(t, p0, cp1, cp2, p3);
        const d = dist(pos, pt);
        if (d < best.dist) best = { dist: d, segIdx: i, t, ringIdx: ri };
      }
    }
  }
  return best;
}

function hitTestObject(
  pos: Point,
  obj: FreehandObject,
  threshold: number,
  allObjects?: FreehandObject[],
): boolean {
  if (!obj.visible || obj.locked) return false;
  if (obj.isClipMask) return false;
  switch (obj.type) {
    case "text": {
      const t = obj as TextObject;
      const v = textVisualRectLike(t);
      return pointInRotatedRect(pos.x, pos.y, { ...t, ...v } as FreehandObject);
    }
    case "ellipse": return pointInEllipse(pos.x, pos.y, obj);
    case "textOnPath": {
      const tp = obj as TextOnPathObject;
      if (!allObjects) return pointInRotatedRect(pos.x, pos.y, tp);
      const g = allObjects.find((x) => x.id === tp.guidePathId);
      if (!g || g.type !== "path") return false;
      return hitTestObject(pos, g, threshold, allObjects);
    }
    case "path": {
      const pathObj = obj as PathObject;
      let hp = pos;
      if (obj.rotation || obj.flipX || obj.flipY) {
        const inv = inverseObjMatrix(obj);
        if (inv) {
          const t = inv.transformPoint(new DOMPoint(pos.x, pos.y));
          hp = { x: t.x, y: t.y };
        }
      }
      // Import SVG / texto a contornos: solo `svgPathD`, sin puntos Bézier → distToPathSegments no aplica.
      if (pathObj.svgPathD && (!pathObj.points || pathObj.points.length < 2)) {
        const pad = Math.max(threshold * 2, (pathObj.strokeWidth || 0) / 2 + threshold);
        return pointInRotatedRect(pos.x, pos.y, {
          ...obj,
          x: obj.x - pad,
          y: obj.y - pad,
          width: obj.width + 2 * pad,
          height: obj.height + 2 * pad,
        } as FreehandObject);
      }
      if (pathObj.closed && pointInRotatedRect(pos.x, pos.y, obj)) return true;
      return distToPathSegments(hp, pathObj).dist < threshold;
    }
    case "booleanGroup":
    case "rect":
    case "image":
      return pointInRotatedRect(pos.x, pos.y, obj);
    case "clippingContainer": {
      const c = obj as ClippingContainerObject;
      const lp = worldPointToLocal(c, pos);
      const m = c.mask;
      const maskHit = (() => {
        if (m.type === "ellipse") {
          const pseudo = { ...m, rotation: 0 } as EllipseObject;
          return pointInEllipse(lp.x, lp.y, pseudo);
        }
        if (m.type === "rect") {
          const pseudo = { ...m, rotation: 0 } as RectObject;
          return pointInRotatedRect(lp.x, lp.y, pseudo);
        }
        if (m.type === "image") {
          const im = m as ImageObject;
          return pointInRotatedRect(lp.x, lp.y, { ...im, rotation: 0 } as FreehandObject);
        }
        const pathObj = m as PathObject;
        if (pathObj.svgPathD && (!pathObj.points || pathObj.points.length < 2)) {
          const pad = Math.max(threshold * 2, (pathObj.strokeWidth || 0) / 2 + threshold);
          return pointInRotatedRect(lp.x, lp.y, {
            ...pathObj,
            x: pathObj.x - pad,
            y: pathObj.y - pad,
            width: pathObj.width + 2 * pad,
            height: pathObj.height + 2 * pad,
            rotation: 0,
          } as FreehandObject);
        }
        if (pathObj.closed && pointInRotatedRect(lp.x, lp.y, { ...pathObj, rotation: 0 })) return true;
        return distToPathSegments(lp, pathObj).dist < threshold;
      })();
      // No usar el bbox del contenido pegado (p. ej. imagen): puede cubrir todo el pliego y bloquear deseleccionar.
      // Sí incluir el rect del contenedor: misma caja que el envolvente de la máscara al crear el clip; permite acertar
      // en agujeros de máscara / marco y tras cambios de zoom (modo P) sin depender solo del trazo fino de la máscara.
      return maskHit || pointInRotatedRect(pos.x, pos.y, c as FreehandObject);
    }
    default: return pointInRotatedRect(pos.x, pos.y, obj);
  }
}

/** En aislamiento de grupo vectorial, no expandir selección a todos los miembros con el mismo `groupId`. */
function vectorIsolationGroupId(stack: IsolationFrame[]): string | undefined {
  const top = stack[stack.length - 1];
  return top?.kind === "vectorGroup" ? top.groupId : undefined;
}

/** Objetos del mismo grupo lógico que `resolveSelection`, o `[obj.id]` si no hay grupo. */
function groupMemberIdsForSelection(
  obj: FreehandObject,
  objs: FreehandObject[],
  vecIsoGid?: string,
): string[] {
  const gid = obj.groupId;
  if (gid && vecIsoGid && gid === vecIsoGid) return [obj.id];
  return gid ? objs.filter((o) => o.groupId === gid).map((o) => o.id) : [obj.id];
}

/**
 * `hits`: de frente a fondo (índice 0 = más encima). Con Mayús/Cmd y solape, si el de arriba
 * ya está entero en la selección, usar el siguiente bajo el puntero para poder añadir otro objeto.
 */
function pickHitForExtendSelection(
  hits: FreehandObject[],
  extend: boolean,
  sel: Set<string>,
  objs: FreehandObject[],
  vecIsoGid?: string,
): FreehandObject | undefined {
  if (hits.length === 0) return undefined;
  if (!extend || hits.length === 1) return hits[0];
  const addable = hits.find((h) => {
    const m = groupMemberIdsForSelection(h, objs, vecIsoGid);
    return !m.every((id) => sel.has(id));
  });
  return addable ?? hits[0];
}

function getPathBoundsFromPoints(points: BezierPoint[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const pt of points) {
    for (const p of [pt.anchor, pt.handleIn, pt.handleOut]) {
      x1 = Math.min(x1, p.x);
      y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x);
      y2 = Math.max(y2, p.y);
    }
  }
  // Also sample curve segments for tighter bounds
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      const pt = cubicBezierAt(t, a.anchor, a.handleOut, b.handleIn, b.anchor);
      x1 = Math.min(x1, pt.x); y1 = Math.min(y1, pt.y);
      x2 = Math.max(x2, pt.x); y2 = Math.max(y2, pt.y);
    }
  }
  if (points.length > 1) {
    const last = points[points.length - 1], first = points[0];
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      const pt = cubicBezierAt(t, last.anchor, last.handleOut, first.handleIn, first.anchor);
      x1 = Math.min(x1, pt.x); y1 = Math.min(y1, pt.y);
      x2 = Math.max(x2, pt.x); y2 = Math.max(y2, pt.y);
    }
  }
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

function degToRad(d: number) { return (d * Math.PI) / 180; }

/** Mayús durante arrastre = control fino (mover / escalar). */
/**
 * Pantalla → espacio mundo del SVG: el grupo del lienzo aplica `scale(zoom)`, así que 1 px de pantalla
 * = 1/zoom unidades de mundo. Mismo factor en mover y redimensionar para que handles y cursor coincidan.
 */
function canvasScaleFromPointer(zoom: number): number {
  return 1 / zoom;
}

function isShiftHeld(e: ReactMouseEvent): boolean {
  return e.shiftKey || (typeof e.getModifierState === "function" && e.getModifierState("Shift"));
}

/** Mayús al crear rectángulo/elipse: segunda esquina para un cuadrado / círculo perfecto (lado = max(|dx|,|dy|)). */
function oppositeCornerForSquareDrag(origin: Point, pointer: Point): Point {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  if (s === 0) return { ...origin };
  const signX = dx !== 0 ? Math.sign(dx) : Math.sign(dy);
  const signY = dy !== 0 ? Math.sign(dy) : Math.sign(dx);
  return { x: origin.x + signX * s, y: origin.y + signY * s };
}

/** Delta angular más corto entre dos ángulos (rad), evita saltos de atan2 al cruzar ±π. */
function shortestAngleDeltaRad(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Rotate point around center (degrees, SVG-style). */
function rotatePointAround(p: Point, c: Point, deg: number): Point {
  if (!deg) return p;
  const r = degToRad(deg);
  const dx = p.x - c.x, dy = p.y - c.y;
  return {
    x: c.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: c.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

function aabbFromPoints(pts: Point[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

/** Four corners of the object's local rect in world space (after rotation). */
function rectWorldCorners(o: FreehandObject): Point[] {
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
  const pts: Point[] = [
    { x: o.x, y: o.y },
    { x: o.x + o.width, y: o.y },
    { x: o.x + o.width, y: o.y + o.height },
    { x: o.x, y: o.y + o.height },
  ];
  if (!o.rotation) return pts;
  return pts.map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
}

/** Axis-aligned bounding box of the painted shape (accounts for rotation). */
function getVisualAABB(o: FreehandObject, allObjects?: FreehandObject[]): Rect {
  switch (o.type) {
    case "path": {
      const po = o as PathObject;
      if (po.svgPathD && po.points.length < 2) {
        const r = { x: o.x, y: o.y, w: o.width, h: o.height };
        const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
        if (!o.rotation) return r;
        const corners = [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ].map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
        return aabbFromPoints(corners);
      }
      const pb = getPathBoundsFromPoints((o as PathObject).points);
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
      if (!o.rotation) return pb;
      const corners = [
        { x: pb.x, y: pb.y },
        { x: pb.x + pb.w, y: pb.y },
        { x: pb.x + pb.w, y: pb.y + pb.h },
        { x: pb.x, y: pb.y + pb.h },
      ].map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
      return aabbFromPoints(corners);
    }
    case "textOnPath": {
      const tp = o as TextOnPathObject;
      if (!allObjects) return aabbFromPoints(rectWorldCorners(tp));
      const g = allObjects.find((x) => x.id === tp.guidePathId);
      if (!g || g.type !== "path") return { x: 0, y: 0, w: 0, h: 0 };
      return getVisualAABB(g, allObjects);
    }
    case "clippingContainer":
      return clippingContainerMaskWorldBoundsAabb(o as ClippingContainerObject);
    case "text": {
      const t = o as TextObject;
      const v = textVisualRectLike(t);
      return aabbFromPoints(rectWorldCorners({ ...t, ...v } as FreehandObject));
    }
    case "ellipse":
    case "rect":
    case "image":
    case "booleanGroup":
    default:
      return aabbFromPoints(rectWorldCorners(o));
  }
}

function getObjBounds(o: FreehandObject, allObjects?: FreehandObject[]): Rect {
  return getVisualAABB(o, allObjects);
}

function isClosedPathForMask(p: PathObject): boolean {
  return p.closed && p.points.length >= 3;
}

/** Single closed shape usable as Paste Inside mask. */
function isValidPasteInsideMask(o: FreehandObject): boolean {
  if (!o.visible || o.locked) return false;
  if (o.type === "rect" || o.type === "ellipse") return true;
  if (o.type === "path") {
    const p = o as PathObject;
    if (p.svgPathD && p.svgPathD.trim().length > 0) {
      const d = p.svgPathD.trim();
      return /z\s*$/i.test(d) || p.closed === true;
    }
    return isClosedPathForMask(p);
  }
  if (o.type === "image") {
    const im = o as ImageObject;
    return Boolean(im.src && im.src.trim().length > 0);
  }
  return false;
}

function translateBezierPoints(pts: BezierPoint[], dx: number, dy: number): BezierPoint[] {
  return pts.map((p) => ({
    ...p,
    anchor: { x: p.anchor.x + dx, y: p.anchor.y + dy },
    handleIn: { x: p.handleIn.x + dx, y: p.handleIn.y + dy },
    handleOut: { x: p.handleOut.x + dx, y: p.handleOut.y + dy },
  }));
}

function translateMaskShape(m: ClipMaskShape, dx: number, dy: number): ClipMaskShape {
  if (m.type === "image" || m.type === "rect" || m.type === "ellipse") return { ...m, x: m.x + dx, y: m.y + dy };
  if (m.type === "path") {
    const p = m as PathObject;
    if (p.svgPathD && (!p.points || p.points.length < 2)) return { ...p, x: p.x + dx, y: p.y + dy };
  }
  return { ...m, points: translateBezierPoints((m as PathObject).points, dx, dy) };
}

/** Mask + content live in container local space (origin top-left of unrotated box). */
function offsetShapeWorldToLocal(m: ClipMaskShape, ox: number, oy: number): ClipMaskShape {
  if (m.type === "image") {
    const im = m as ImageObject;
    return { ...im, x: im.x - ox, y: im.y - oy };
  }
  if (m.type === "rect" || m.type === "ellipse") return { ...m, x: m.x - ox, y: m.y - oy };
  if (m.type === "path") {
    const p = m as PathObject;
    if (p.svgPathD && (!p.points || p.points.length < 2)) {
      return { ...p, x: p.x - ox, y: p.y - oy };
    }
  }
  return { ...m, points: translateBezierPoints((m as PathObject).points, -ox, -oy) };
}

function offsetShapeLocalToWorld(m: ClipMaskShape, ox: number, oy: number): ClipMaskShape {
  if (m.type === "image") {
    const im = m as ImageObject;
    return { ...im, x: im.x + ox, y: im.y + oy };
  }
  if (m.type === "rect" || m.type === "ellipse") return { ...m, x: m.x + ox, y: m.y + oy };
  if (m.type === "path") {
    const p = m as PathObject;
    if (p.svgPathD && (!p.points || p.points.length < 2)) {
      return { ...p, x: p.x + ox, y: p.y + oy };
    }
  }
  return { ...m, points: translateBezierPoints((m as PathObject).points, ox, oy) };
}

function offsetObjectWorldToLocal(o: FreehandObject, ox: number, oy: number): FreehandObject {
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return {
      ...c,
      x: c.x - ox,
      y: c.y - oy,
      mask: offsetShapeWorldToLocal(c.mask, ox, oy),
      content: c.content.map((ch) => offsetObjectWorldToLocal(ch, ox, oy)),
    };
  }
  if (o.type === "booleanGroup") {
    return { ...o, children: o.children.map((ch) => offsetObjectWorldToLocal(ch, ox, oy)) };
  }
  if (o.type === "path") {
    const p = o as PathObject;
    const pts = translateBezierPoints(p.points, -ox, -oy);
    const pb = getPathBoundsFromPoints(pts);
    return { ...p, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: pts };
  }
  if (o.type === "rect" || o.type === "ellipse" || o.type === "image" || o.type === "text" || o.type === "textOnPath") {
    return { ...o, x: o.x - ox, y: o.y - oy };
  }
  return o;
}

function localPointToWorld(c: ClippingContainerObject, lp: Point): Point {
  const cx = c.width / 2, cy = c.height / 2;
  const r = rotatePointAround(lp, { x: cx, y: cy }, c.rotation);
  return { x: c.x + r.x, y: c.y + r.y };
}

function worldPointToLocal(c: ClippingContainerObject, wp: Point): Point {
  const cx = c.width / 2, cy = c.height / 2;
  const rel = { x: wp.x - c.x, y: wp.y - c.y };
  return rotatePointAround(rel, { x: cx, y: cy }, -c.rotation);
}

/** Rectángulo de la máscara en coordenadas locales del clip (área recortada visible). */
function clippingContainerMaskLocalBounds(c: ClippingContainerObject): Rect {
  return getObjBounds(c.mask as FreehandObject);
}

/** AABB en mundo del envolvente de la máscara — el centro sirve de pivote natural al escalar. */
function clippingContainerMaskWorldBoundsAabb(c: ClippingContainerObject): Rect {
  const b = clippingContainerMaskLocalBounds(c);
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  return aabbFromPoints(corners.map((p) => localPointToWorld(c, p)));
}

/** Cuatro esquinas en mundo del rectángulo de máscara (para marco de selección / OBB). */
function clippingContainerMaskWorldCorners(c: ClippingContainerObject): Point[] {
  const b = clippingContainerMaskLocalBounds(c);
  return [
    localPointToWorld(c, { x: b.x, y: b.y }),
    localPointToWorld(c, { x: b.x + b.w, y: b.y }),
    localPointToWorld(c, { x: b.x + b.w, y: b.y + b.h }),
    localPointToWorld(c, { x: b.x, y: b.y + b.h }),
  ];
}

/** Máscara en espacio local del clip → anclas en mundo (handles de selección directa / hit-test). */
function clipMaskPathAnchorsToWorld(c: ClippingContainerObject, p: PathObject): PathObject {
  const map = (pt: Point) => localPointToWorld(c, pt);
  const pts = p.points.map((bp) => ({
    ...bp,
    anchor: map(bp.anchor),
    handleIn: map(bp.handleIn),
    handleOut: map(bp.handleOut),
  }));
  const pb = getPathBoundsFromPoints(pts);
  return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
}

/** Doble clic (A): ancla bajo el cursor, frente a fondo. Solo `pathId` + índice global en `points`. */
function findTopAnchorHitForDirectSelectDelete(
  pos: Point,
  threshold: number,
  objects: FreehandObject[],
): { pathId: string; gIdx: number } | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.locked || !obj.visible || obj.type !== "path") continue;
    const p = obj as PathObject;
    if (!p.points || p.points.length < 2) continue;
    const rings = getPathRings(p);
    let gBase = 0;
    for (const ring of rings) {
      for (let pi = 0; pi < ring.length; pi++) {
        const pt = ring[pi]!;
        const gIdx = gBase + pi;
        if (dist(pos, pt.anchor) < threshold) return { pathId: p.id, gIdx };
      }
      gBase += ring.length;
    }
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.locked || !obj.visible || obj.type !== "clippingContainer") continue;
    const cc = obj as ClippingContainerObject;
    if (cc.mask.type !== "path") continue;
    const raw = cc.mask as PathObject;
    if (!raw.points || raw.points.length < 2) continue;
    const pWorld = clipMaskPathAnchorsToWorld(cc, raw);
    const ringsW = getPathRings(pWorld);
    let gBase = 0;
    for (const ringW of ringsW) {
      for (let pi = 0; pi < ringW.length; pi++) {
        const ptW = ringW[pi]!;
        const gIdx = gBase + pi;
        if (dist(pos, ptW.anchor) < threshold) return { pathId: raw.id, gIdx };
      }
      gBase += ringW.length;
    }
  }
  return null;
}

function applyDeletePathPointIndicesToObjects(
  prev: FreehandObject[],
  sp: Map<string, Set<number>>,
): FreehandObject[] {
  return prev
    .map((o) => {
      if (o.type === "clippingContainer") {
        const c = o as ClippingContainerObject;
        if (c.mask.type !== "path") return o;
        const p = c.mask as PathObject;
        const ptIdxs = sp.get(p.id);
        if (!ptIdxs || ptIdxs.size === 0) return o;
        const newPts = p.points.filter((_, i) => !ptIdxs.has(i));
        if (newPts.length < 1) return null;
        const pb = getPathBoundsFromPoints(newPts);
        return {
          ...c,
          mask: { ...p, points: newPts, x: pb.x, y: pb.y, width: pb.w, height: pb.h },
        };
      }
      if (o.type !== "path") return o;
      const ptIdxs = sp.get(o.id);
      if (!ptIdxs || ptIdxs.size === 0) return o;
      const p = o as PathObject;
      const newPts = p.points.filter((_, i) => !ptIdxs.has(i));
      if (newPts.length < 1) return null;
      return { ...p, points: newPts };
    })
    .filter(Boolean) as FreehandObject[];
}

function translateFreehandObject(o: FreehandObject, dx: number, dy: number): FreehandObject {
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return { ...c, x: c.x + dx, y: c.y + dy };
  }
  if (o.type === "booleanGroup") {
    return { ...o, children: o.children.map((ch) => translateFreehandObject(ch, dx, dy)) };
  }
  if (o.type === "path") {
    const p = o as PathObject;
    if (p.svgPathD && (!p.points || p.points.length < 2)) {
      if (p.svgPathIntrinsicW != null && p.svgPathIntrinsicH != null) {
        return { ...p, x: p.x + dx, y: p.y + dy };
      }
      const m = p.svgPathMatrix ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      return {
        ...p,
        x: p.x + dx,
        y: p.y + dy,
        svgPathMatrix: { ...m, e: m.e + dx, f: m.f + dy },
      };
    }
    const newPts = translateBezierPoints(p.points, dx, dy);
    const pb = getPathBoundsFromPoints(newPts);
    return { ...p, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: newPts };
  }
  if (o.type === "rect" || o.type === "ellipse" || o.type === "image" || o.type === "text" || o.type === "textOnPath") {
    return { ...o, x: o.x + dx, y: o.y + dy };
  }
  return o;
}

/** Outer box of a clipping container = mask bounds only. Content may extend outside; it is clipped visually. */
function clipContainerOuterBoundsFromMask(mask: ClipMaskShape): Rect {
  return getObjBounds(mask as FreehandObject);
}

function deepCloneFreehandObject(o: FreehandObject, newId: () => string): FreehandObject {
  const id = newId();
  if (o.type === "path") {
    const p = o as PathObject;
    return {
      ...p,
      id,
      points: p.points.map((pt) => ({
        ...pt,
        anchor: { ...pt.anchor },
        handleIn: { ...pt.handleIn },
        handleOut: { ...pt.handleOut },
      })),
    };
  }
  if (o.type === "booleanGroup") {
    const g = o as BooleanGroupObject;
    return {
      ...g,
      id,
      children: g.children.map((ch) => deepCloneFreehandObject(ch, newId)),
      cachedResult: g.cachedResult,
    };
  }
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return {
      ...c,
      id,
      mask: deepCloneFreehandObject(c.mask, newId) as ClipMaskShape,
      content: c.content.map((ch) => deepCloneFreehandObject(ch, newId)),
    };
  }
  if (o.type === "textOnPath") {
    const t = o as TextOnPathObject;
    return { ...t, id };
  }
  if (o.type === "text") {
    const t = o as TextObject;
    return { ...t, id, fill: cloneFill(migrateFill(t.fill)) };
  }
  return { ...o, id, fill: cloneFill(migrateFill(o.fill)) };
}

function deepCloneFreehandObjectKeepIds(o: FreehandObject): FreehandObject {
  return deepCloneFreehandObject(o, () => o.id);
}

function flattenObjectsForGradientDefs(list: FreehandObject[]): FreehandObject[] {
  const out: FreehandObject[] = [];
  for (const o of list) {
    out.push(o);
    if (o.type === "clippingContainer") {
      const c = o as ClippingContainerObject;
      out.push(c.mask as FreehandObject);
      out.push(...flattenObjectsForGradientDefs(c.content));
    }
    if (o.type === "booleanGroup") out.push(...flattenObjectsForGradientDefs((o as BooleanGroupObject).children));
  }
  return out;
}

function mapMaskShapeWithWorldMap(m: ClipMaskShape, mapWorld: (p: Point) => Point): ClipMaskShape {
  if (m.type === "image") {
    const im = m as ImageObject;
    const c1 = mapWorld({ x: im.x, y: im.y });
    const c2 = mapWorld({ x: im.x + im.width, y: im.y + im.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...im, x, y, width: w, height: h };
  }
  if (m.type === "rect" || m.type === "ellipse") {
    const c1 = mapWorld({ x: m.x, y: m.y });
    const c2 = mapWorld({ x: m.x + m.width, y: m.y + m.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...m, x, y, width: w, height: h };
  }
  const p = m as PathObject;
  if (p.svgPathD && (!p.points || p.points.length < 2)) {
    const c1 = mapWorld({ x: p.x, y: p.y });
    const c2 = mapWorld({ x: p.x + p.width, y: p.y + p.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...p, x, y, width: w, height: h };
  }
  const pts = p.points.map((pt) => ({
    ...pt,
    anchor: mapWorld(pt.anchor),
    handleIn: mapWorld(pt.handleIn),
    handleOut: mapWorld(pt.handleOut),
  }));
  const pb = getPathBoundsFromPoints(pts);
  return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
}

/** Inversa de `mapMaskShapeWithWorldMap` cuando la forma está en mundo y `mapWorldToLocal` lleva cada punto a local. */
function mapMaskShapeWorldToLocalMap(m: ClipMaskShape, mapWorldToLocal: (wp: Point) => Point): ClipMaskShape {
  if (m.type === "image") {
    const im = m as ImageObject;
    const c1 = mapWorldToLocal({ x: im.x, y: im.y });
    const c2 = mapWorldToLocal({ x: im.x + im.width, y: im.y + im.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...im, x, y, width: w, height: h };
  }
  if (m.type === "rect" || m.type === "ellipse") {
    const c1 = mapWorldToLocal({ x: m.x, y: m.y });
    const c2 = mapWorldToLocal({ x: m.x + m.width, y: m.y + m.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...m, x, y, width: w, height: h };
  }
  const p = m as PathObject;
  if (p.svgPathD && (!p.points || p.points.length < 2)) {
    const c1 = mapWorldToLocal({ x: p.x, y: p.y });
    const c2 = mapWorldToLocal({ x: p.x + p.width, y: p.y + p.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...p, x, y, width: w, height: h };
  }
  const pts = p.points.map((pt) => ({
    ...pt,
    anchor: mapWorldToLocal(pt.anchor),
    handleIn: mapWorldToLocal(pt.handleIn),
    handleOut: mapWorldToLocal(pt.handleOut),
  }));
  const pb = getPathBoundsFromPoints(pts);
  return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
}

function mapObjectPointsWithWorld(
  o: FreehandObject,
  mapWorld: (p: Point) => Point,
): FreehandObject {
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    /** Máscara/contenido están en local del clip; `mapWorld` opera en mundo (p. ej. OBB al redimensionar). */
    const chain = (lp: Point) => mapWorld(localPointToWorld(c, lp));
    const newMask = mapMaskShapeWithWorldMap(c.mask, chain);
    const newContent = c.content.map((ch) => mapObjectPointsWithWorld(ch, chain));
    const ub = clipContainerOuterBoundsFromMask(newMask);
    return {
      ...c,
      x: ub.x,
      y: ub.y,
      width: ub.w,
      height: ub.h,
      mask: offsetShapeWorldToLocal(newMask, ub.x, ub.y),
      content: newContent.map((ch) => offsetObjectWorldToLocal(ch, ub.x, ub.y)),
    };
  }
  if (o.type === "booleanGroup") {
    return {
      ...o,
      children: o.children.map((ch) => mapObjectPointsWithWorld(ch, mapWorld)),
    };
  }
  if (o.type === "path") {
    const p = o as PathObject;
    const pts = p.points.map((pt) => ({
      ...pt,
      anchor: mapWorld(pt.anchor),
      handleIn: mapWorld(pt.handleIn),
      handleOut: mapWorld(pt.handleOut),
    }));
    const pb = getPathBoundsFromPoints(pts);
    return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
  }
  if (o.type === "rect" || o.type === "ellipse" || o.type === "image" || o.type === "text") {
    const c1 = mapWorld({ x: o.x, y: o.y });
    const c2 = mapWorld({ x: o.x + o.width, y: o.y + o.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...o, x, y, width: w, height: h };
  }
  return o;
}

/** Rotación rígida en torno al pivote de selección: mueve el centro del objeto y suma el ángulo. */
function rotateRectLikeAroundPivot(init: FreehandObject, pivot: Point, angleDeltaDeg: number): FreehandObject {
  const C0 = { x: init.x + init.width / 2, y: init.y + init.height / 2 };
  const newCenter = rotatePointAround(C0, pivot, angleDeltaDeg);
  return {
    ...init,
    x: newCenter.x - init.width / 2,
    y: newCenter.y - init.height / 2,
    rotation: init.rotation + angleDeltaDeg,
  };
}

/**
 * Path: controles a mundo con el giro del objeto, luego rotación rígida alrededor del pivote de selección;
 * se guardan coordenadas absolutas con rotation=0.
 */
function rotatePathAroundSelectionPivot(init: PathObject, pivot: Point, angleDeltaDeg: number): PathObject {
  const C0 = { x: init.x + init.width / 2, y: init.y + init.height / 2 };
  const r0 = init.rotation;
  const toWorld = (p: Point) => rotatePointAround(p, C0, r0);
  const mapP = (p: Point) => rotatePointAround(toWorld(p), pivot, angleDeltaDeg);
  const newPts = init.points.map((pt) => ({
    ...pt,
    anchor: mapP(pt.anchor),
    handleIn: mapP(pt.handleIn),
    handleOut: mapP(pt.handleOut),
  }));
  const pb = getPathBoundsFromPoints(newPts);
  return { ...init, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: newPts, rotation: 0 };
}

function applyRotateAroundSelectionPivot(init: FreehandObject, pivot: Point, angleDeltaDeg: number): FreehandObject {
  if (init.type === "path") {
    const p = init as PathObject;
    if (p.svgPathD && (!p.points || p.points.length < 2)) {
      return rotateRectLikeAroundPivot(init, pivot, angleDeltaDeg);
    }
    return rotatePathAroundSelectionPivot(p, pivot, angleDeltaDeg);
  }
  /** Clip: máscara + contenido giran como un solo cuerpo rígido (solo `rotation` del contenedor). */
  if (init.type === "clippingContainer") {
    const c = init as ClippingContainerObject;
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const newCenter = rotatePointAround({ x: cx, y: cy }, pivot, angleDeltaDeg);
    return {
      ...c,
      x: newCenter.x - c.width / 2,
      y: newCenter.y - c.height / 2,
      rotation: c.rotation + angleDeltaDeg,
    };
  }
  if (init.type === "booleanGroup") {
    const mapWorld = (p: Point) => rotatePointAround(p, pivot, angleDeltaDeg);
    return mapObjectPointsWithWorld(init, mapWorld) as FreehandObject;
  }
  return rotateRectLikeAroundPivot(init, pivot, angleDeltaDeg);
}

/** Map nested content to world by composing parent → child local transforms. */
function mapChildToWorldWithChain(outerChain: (p: Point) => Point, o: FreehandObject): FreehandObject {
  if (o.type === "clippingContainer") {
    const inner = o as ClippingContainerObject;
    const chain = (p: Point) => outerChain(localPointToWorld(inner, p));
    const maskW = mapMaskShapeWithWorldMap(inner.mask, chain);
    const contentW = inner.content.map((ch) => mapChildToWorldWithChain(chain, ch));
    const ub = clipContainerOuterBoundsFromMask(maskW);
    return {
      ...inner,
      x: ub.x,
      y: ub.y,
      width: ub.w,
      height: ub.h,
      mask: offsetShapeWorldToLocal(maskW, ub.x, ub.y),
      content: contentW.map((ch) => offsetObjectWorldToLocal(ch, ub.x, ub.y)),
    } as ClippingContainerObject;
  }
  return mapObjectPointsWithWorld(o, outerChain);
}

/** Inversa de `mapChildToWorldWithChain` (aislamiento contenido → coordenadas locales del clip). */
function mapChildFromWorldWithChain(outerWorldToLocal: (wp: Point) => Point, o: FreehandObject): FreehandObject {
  if (o.type === "clippingContainer") {
    const inner = o as ClippingContainerObject;
    const chainInv = (wp: Point) => worldPointToLocal(inner, outerWorldToLocal(wp));
    const maskL = mapMaskShapeWorldToLocalMap(inner.mask, chainInv);
    const contentL = inner.content.map((ch) => mapChildFromWorldWithChain(chainInv, ch));
    const ub = clipContainerOuterBoundsFromMask(maskL);
    return {
      ...inner,
      x: ub.x,
      y: ub.y,
      width: ub.w,
      height: ub.h,
      mask: offsetShapeWorldToLocal(maskL, ub.x, ub.y),
      content: contentL.map((ch) => offsetObjectWorldToLocal(ch, ub.x, ub.y)),
    } as ClippingContainerObject;
  }
  return mapObjectPointsWithWorld(o, outerWorldToLocal);
}

function releaseClippingContainerToObjects(c: ClippingContainerObject): FreehandObject[] {
  const root = (p: Point) => localPointToWorld(c, p);
  const maskW = mapMaskShapeWithWorldMap(c.mask, root);
  const contentW = c.content.map((ch) => mapChildToWorldWithChain(root, ch));
  return [maskW as FreehandObject, ...contentW];
}

/** All world-space corners contributing to selection bounds. */
function objectWorldCorners(o: FreehandObject, allObjects?: FreehandObject[]): Point[] {
  if (o.type === "path") {
    const po = o as PathObject;
    // Import / forma definitiva: solo `svgPathD` y `points` vacíos — el AABB real está en x,y,width,height (no en points).
    const pb =
      po.svgPathD && (!po.points || po.points.length < 2)
        ? { x: o.x, y: o.y, w: o.width, h: o.height }
        : getPathBoundsFromPoints(po.points);
    const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
    if (!o.rotation) {
      return [
        { x: pb.x, y: pb.y },
        { x: pb.x + pb.w, y: pb.y },
        { x: pb.x + pb.w, y: pb.y + pb.h },
        { x: pb.x, y: pb.y + pb.h },
      ];
    }
    return [
      { x: pb.x, y: pb.y },
      { x: pb.x + pb.w, y: pb.y },
      { x: pb.x + pb.w, y: pb.y + pb.h },
      { x: pb.x, y: pb.y + pb.h },
    ].map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
  }
  if (o.type === "textOnPath") {
    const tp = o as TextOnPathObject;
    if (!allObjects) return rectWorldCorners(tp);
    const g = allObjects.find((x) => x.id === tp.guidePathId);
    if (!g || g.type !== "path") {
      return [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ];
    }
    return objectWorldCorners(g, allObjects);
  }
  if (o.type === "text") {
    const t = o as TextObject;
    /** Marco encadenado: caja = tamaño del marco (como hasta ahora). Texto suelto: mismo rect que `textVisualRectLike` / `foreignObject` / escala. */
    if (t.isTextFrame) return rectWorldCorners(o);
    const v = textVisualRectLike(t);
    return rectWorldCorners({ ...t, ...v } as FreehandObject);
  }
  if (o.type === "clippingContainer") {
    return clippingContainerMaskWorldCorners(o as ClippingContainerObject);
  }
  return rectWorldCorners(o);
}

interface OrientedSelectionFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angleDeg: number;
}

/** Oriented box aligned with mean rotation that tightly wraps all selected corners. */
function computeOrientedSelectionFrame(objs: FreehandObject[]): OrientedSelectionFrame | null {
  if (objs.length === 0) return null;
  const angleDeg = objs.reduce((s, o) => s + o.rotation, 0) / objs.length;
  const allCorners: Point[] = [];
  for (const o of objs) allCorners.push(...objectWorldCorners(o, objs));
  const gb = aabbFromPoints(allCorners);
  const C = { x: gb.x + gb.w / 2, y: gb.y + gb.h / 2 };
  const r = degToRad(-angleDeg);
  const cos = Math.cos(r), sin = Math.sin(r);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allCorners) {
    const dx = p.x - C.x, dy = p.y - C.y;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
    minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
  }
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const lc = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const th = degToRad(angleDeg);
  const cx = C.x + lc.x * Math.cos(th) - lc.y * Math.sin(th);
  const cy = C.y + lc.x * Math.sin(th) + lc.y * Math.cos(th);
  return { cx, cy, w, h, angleDeg };
}

function worldToLocalOBB(p: Point, cx: number, cy: number, angleDeg: number): Point {
  const dx = p.x - cx, dy = p.y - cy;
  const r = degToRad(-angleDeg);
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

function localToWorldOBB(p: Point, cx: number, cy: number, angleDeg: number): Point {
  const th = degToRad(angleDeg);
  return {
    x: cx + p.x * Math.cos(th) - p.y * Math.sin(th),
    y: cy + p.x * Math.sin(th) + p.y * Math.cos(th),
  };
}

/** Rotate a direction vector by -angleDeg (same basis as worldToLocalOBB). */
function worldDeltaToLocal(delta: Point, angleDeg: number): Point {
  const r = degToRad(-angleDeg);
  return {
    x: delta.x * Math.cos(r) - delta.y * Math.sin(r),
    y: delta.x * Math.sin(r) + delta.y * Math.cos(r),
  };
}

function getGroupBounds(objs: FreehandObject[]): Rect {
  if (objs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of objs) {
    const b = getObjBounds(o, objs);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Snap ────────────────────────────────────────────────────────────────

const SNAP_SCREEN_PX = 8;

function collectPathAnchorPoints(allObjects: FreehandObject[], excludeIds: Set<string>): Point[] {
  const out: Point[] = [];
  for (const o of allObjects) {
    if (excludeIds.has(o.id) || !o.visible || o.locked) continue;
    if (o.type !== "path") continue;
    for (const pt of (o as PathObject).points) out.push(pt.anchor);
  }
  return out;
}

function snapDeltaTo45(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: 0 };
  const a = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(a / step) * step;
  return { x: Math.cos(snapped) * len, y: Math.sin(snapped) * len };
}

function computeSnap(
  movingBounds: Rect,
  allObjects: FreehandObject[],
  excludeIds: Set<string>,
  zoom: number,
  layoutGuideSnap?: { vertical: number[]; horizontal: number[] },
): { dx: number; dy: number; guides: SnapVisual[] } {
  const thr = SNAP_SCREEN_PX / zoom;
  const guides: SnapVisual[] = [];
  const mcx = movingBounds.x + movingBounds.w / 2;
  const mcy = movingBounds.y + movingBounds.h / 2;

  const anchors = collectPathAnchorPoints(allObjects, excludeIds);
  let bestPd = thr + 1;
  let pdx = 0, pdy = 0;
  let anchorHit: Point | null = null;
  for (const ap of anchors) {
    const d = Math.hypot(mcx - ap.x, mcy - ap.y);
    if (d < bestPd) {
      bestPd = d;
      pdx = ap.x - mcx;
      pdy = ap.y - mcy;
      anchorHit = ap;
    }
  }
  if (bestPd <= thr && anchorHit) {
    guides.push({ type: "anchor", x: anchorHit.x, y: anchorHit.y });
    return { dx: pdx, dy: pdy, guides };
  }

  let snapDx = 0, snapDy = 0;
  let bestDx = thr + 1, bestDy = thr + 1;
  let usedMidX = false, usedMidY = false;
  const mxs = [movingBounds.x, mcx, movingBounds.x + movingBounds.w];
  const mys = [movingBounds.y, mcy, movingBounds.y + movingBounds.h];

  for (const obj of allObjects) {
    if (excludeIds.has(obj.id) || !obj.visible || obj.isClipMask) continue;
    const vb = getVisualAABB(obj, allObjects);
    const oxs = [vb.x, vb.x + vb.w / 2, vb.x + vb.w];
    for (let xi = 0; xi < mxs.length; xi++) {
      for (let xj = 0; xj < oxs.length; xj++) {
        const d = Math.abs(mxs[xi] - oxs[xj]);
        if (d < bestDx) {
          bestDx = d;
          snapDx = oxs[xj] - mxs[xi];
          usedMidX = xi === 1 && xj === 1;
        }
      }
    }
  }
  for (const gx of layoutGuideSnap?.vertical ?? []) {
    for (let xi = 0; xi < mxs.length; xi++) {
      const d = Math.abs(mxs[xi] - gx);
      if (d < bestDx) {
        bestDx = d;
        snapDx = gx - mxs[xi];
        usedMidX = xi === 1;
      }
    }
  }
  for (const obj of allObjects) {
    if (excludeIds.has(obj.id) || !obj.visible || obj.isClipMask) continue;
    const vb = getVisualAABB(obj, allObjects);
    const oys = [vb.y, vb.y + vb.h / 2, vb.y + vb.h];
    for (let yi = 0; yi < mys.length; yi++) {
      for (let yj = 0; yj < oys.length; yj++) {
        const d = Math.abs(mys[yi] - oys[yj]);
        if (d < bestDy) {
          bestDy = d;
          snapDy = oys[yj] - mys[yi];
          usedMidY = yi === 1 && yj === 1;
        }
      }
    }
  }
  for (const gy of layoutGuideSnap?.horizontal ?? []) {
    for (let yi = 0; yi < mys.length; yi++) {
      const d = Math.abs(mys[yi] - gy);
      if (d < bestDy) {
        bestDy = d;
        snapDy = gy - mys[yi];
        usedMidY = yi === 1;
      }
    }
  }
  if (bestDx > thr) snapDx = 0;
  else guides.push({ type: "line", axis: "x", pos: mxs[0] + snapDx });
  if (bestDy > thr) snapDy = 0;
  else guides.push({ type: "line", axis: "y", pos: mys[0] + snapDy });
  if (usedMidX && usedMidY && bestDx <= thr && bestDy <= thr) {
    guides.push({ type: "cross", cx: mcx + snapDx, cy: mcy + snapDy });
  }
  return { dx: snapDx, dy: snapDy, guides };
}

/** Snap de bordes al redimensionar (rect alineado a ejes) contra guías de diseño. */
function snapAxisAlignedResizeToGuides(
  rect: { x: number; y: number; w: number; h: number },
  handle: string,
  verticalGuides: number[],
  horizontalGuides: number[],
  zoom: number,
): { rect: { x: number; y: number; w: number; h: number }; guides: SnapVisual[] } {
  const thr = SNAP_SCREEN_PX / zoom;
  let { x, y, w, h } = rect;
  const guides: SnapVisual[] = [];

  const nearest = (val: number, targets: number[]): number | undefined => {
    let best = thr + 1;
    let hit: number | undefined;
    for (const t of targets) {
      const d = Math.abs(val - t);
      if (d < best) {
        best = d;
        hit = t;
      }
    }
    return best <= thr ? hit : undefined;
  };

  if (handle.includes("e")) {
    const sx = nearest(x + w, verticalGuides);
    if (sx != null) {
      w = Math.max(10, sx - x);
      guides.push({ type: "line", axis: "x", pos: sx });
    }
  }
  if (handle.includes("w")) {
    const sx = nearest(x, verticalGuides);
    if (sx != null) {
      const right = x + w;
      x = sx;
      w = Math.max(10, right - x);
      guides.push({ type: "line", axis: "x", pos: sx });
    }
  }
  if (handle.includes("s")) {
    const sy = nearest(y + h, horizontalGuides);
    if (sy != null) {
      h = Math.max(10, sy - y);
      guides.push({ type: "line", axis: "y", pos: sy });
    }
  }
  if (handle.includes("n")) {
    const sy = nearest(y, horizontalGuides);
    if (sy != null) {
      const bottom = y + h;
      y = sy;
      h = Math.max(10, bottom - y);
      guides.push({ type: "line", axis: "y", pos: sy });
    }
  }

  return { rect: { x, y, w, h }, guides };
}

// ── SVG Path ────────────────────────────────────────────────────────────

/** Particiones de `points` en subtrazos cerrados (p. ej. marco + agujero). Sin `contourStarts`, un solo anillo. */
function getPathRings(p: PathObject): BezierPoint[][] {
  const cs = p.contourStarts;
  if (!cs || cs.length <= 1) return [p.points];
  const rings: BezierPoint[][] = [];
  for (let r = 0; r < cs.length; r++) {
    const a = cs[r]!;
    const b = r + 1 < cs.length ? cs[r + 1]! : p.points.length;
    rings.push(p.points.slice(a, b));
  }
  return rings;
}

/** Pixels / zoom: misma distancia que el hit-test al hacer clic para cerrar el trazo en el primer ancla. */
const PEN_CLOSE_TO_START_PX = 12;

function bezierToSvgD(points: BezierPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].anchor.x} ${points[0].anchor.y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    d += ` C ${prev.handleOut.x} ${prev.handleOut.y} ${curr.handleIn.x} ${curr.handleIn.y} ${curr.anchor.x} ${curr.anchor.y}`;
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1], first = points[0];
    d += ` C ${last.handleOut.x} ${last.handleOut.y} ${first.handleIn.x} ${first.handleIn.y} ${first.anchor.x} ${first.anchor.y} Z`;
  }
  return d;
}

/**
 * Siguiente tramo de la pluma antes de colocar el ancla: mismo esquema que une vértices en `bezierToSvgD`
 * (`C prev.handleOut … next.handleIn … next.anchor`). La posición `handleIn` del vértice futuro se estima
 * (suave/cúspide: reflejo del control saliente respecto al cursor; esquina: control entrante colapsado en el cursor).
 */
function penRubberBandSegmentD(last: BezierPoint, cursor: Point): string {
  const p0 = last.anchor;
  const p1 = last.handleOut;
  const p3 = cursor;
  if (dist(p0, p1) < 1) {
    return `M ${p0.x} ${p0.y} L ${p3.x} ${p3.y}`;
  }
  const mode = getVertexMode(last);
  if (mode === "corner") {
    return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p3.x} ${p3.y} ${p3.x} ${p3.y}`;
  }
  const p2 = { x: 2 * p3.x - p1.x, y: 2 * p3.y - p1.y };
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}

function pathObjToD(obj: PathObject): string {
  if (obj.svgPathD && String(obj.svgPathD).trim().length > 0 && (!obj.points || obj.points.length < 2)) {
    return obj.svgPathD;
  }
  const rings = getPathRings(obj);
  if (rings.length === 1) return bezierToSvgD(rings[0]!, obj.closed);
  return rings.map((r) => bezierToSvgD(r, true)).join(" ");
}

/** evenodd solo con varios contornos / subpaths (agujeros); en trazos simples nonzero evita regiones raras en clipPath. */
function clipMaskFillRuleForPath(p: PathObject): "evenodd" | "nonzero" {
  const cs = p.contourStarts;
  if (cs && cs.length > 1) return "evenodd";
  if (p.svgPathD && String(p.svgPathD).trim().length > 0 && (!p.points || p.points.length < 2)) {
    const d = String(p.svgPathD);
    const mCount = (d.match(/\b[mM]/g) ?? []).length;
    return mCount > 1 ? "evenodd" : "nonzero";
  }
  return getPathRings(p).length > 1 ? "evenodd" : "nonzero";
}

/** Misma jerarquía que `renderObj` → `path`: intrínseco, svgPathMatrix o trazo; si no, el clip no coincide con lo dibujado. */
function renderPathClipMaskGeometry(p: PathObject): React.ReactNode {
  const d = pathObjToD(p);
  const fr = clipMaskFillRuleForPath(p);
  const pathClipProps = { fill: "#000" as const, fillRule: fr };
  const transform = buildObjTransform(p);
  const hasIntrinsic =
    p.svgPathIntrinsicW != null &&
    p.svgPathIntrinsicH != null &&
    p.svgPathD &&
    (!p.points || p.points.length < 2);
  if (hasIntrinsic) {
    const iw = p.svgPathIntrinsicW!;
    const ih = p.svgPathIntrinsicH!;
    const sx = p.width / Math.max(iw, 1e-9);
    const sy = p.height / Math.max(ih, 1e-9);
    const inner = (
      <g transform={`translate(${p.x} ${p.y}) scale(${sx} ${sy})`}>
        <path d={d} {...pathClipProps} />
      </g>
    );
    return transform ? <g transform={transform}>{inner}</g> : inner;
  }
  const imp = p.svgPathMatrix;
  const innerM = imp
    ? `matrix(${imp.a},${imp.b},${imp.c},${imp.d},${imp.e},${imp.f})`
    : undefined;
  if (innerM) {
    const inner = (
      <g transform={innerM}>
        <path d={d} {...pathClipProps} />
      </g>
    );
    return transform ? <g transform={transform}>{inner}</g> : inner;
  }
  return <path d={d} {...pathClipProps} transform={transform} />;
}

function renderMaskShapeClipInner(m: ClipMaskShape): React.ReactNode {
  if (m.type === "image") {
    const im = m as ImageObject;
    const transform = buildObjTransform(im);
    return (
      <image
        href={im.src}
        x={im.x}
        y={im.y}
        width={im.width}
        height={im.height}
        preserveAspectRatio="xMidYMid meet"
        transform={transform}
      />
    );
  }
  if (m.type === "rect") {
    const r = m as RectObject;
    const transform = buildObjTransform(r);
    return (
      <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} fill="#000" transform={transform} />
    );
  }
  if (m.type === "ellipse") {
    const e = m as EllipseObject;
    const transform = buildObjTransform(e);
    return (
      <ellipse
        cx={e.x + e.width / 2}
        cy={e.y + e.height / 2}
        rx={e.width / 2}
        ry={e.height / 2}
        fill="#000"
        transform={transform}
      />
    );
  }
  return renderPathClipMaskGeometry(m as PathObject);
}

/** Silueta de la máscara en local del clip; se compone con el mismo `transform` que el contenedor. Solo guía visual. */
function renderClipContentIsolationMaskGuide(m: ClipMaskShape, zoom: number): React.ReactNode {
  const sw = 1 / zoom;
  const stroke = "rgba(148,163,184,0.5)";
  const fill = "rgba(148,163,184,0.06)";
  const common = { fill, stroke, strokeWidth: sw };
  if (m.type === "image") {
    const im = m as ImageObject;
    const transform = buildObjTransform(im);
    return (
      <rect
        x={im.x}
        y={im.y}
        width={im.width}
        height={im.height}
        {...common}
        transform={transform}
      />
    );
  }
  if (m.type === "rect") {
    const r = m as RectObject;
    const transform = buildObjTransform(r);
    return (
      <rect
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        rx={r.rx ?? 0}
        {...common}
        transform={transform}
      />
    );
  }
  if (m.type === "ellipse") {
    const e = m as EllipseObject;
    const transform = buildObjTransform(e);
    return (
      <ellipse
        cx={e.x + e.width / 2}
        cy={e.y + e.height / 2}
        rx={e.width / 2}
        ry={e.height / 2}
        {...common}
        transform={transform}
      />
    );
  }
  const p = m as PathObject;
  const d = pathObjToD(p);
  const fr = clipMaskFillRuleForPath(p);
  const transform = buildObjTransform(p);
  const hasIntrinsic =
    p.svgPathIntrinsicW != null &&
    p.svgPathIntrinsicH != null &&
    p.svgPathD &&
    (!p.points || p.points.length < 2);
  if (hasIntrinsic) {
    const iw = p.svgPathIntrinsicW!;
    const ih = p.svgPathIntrinsicH!;
    const sx = p.width / Math.max(iw, 1e-9);
    const sy = p.height / Math.max(ih, 1e-9);
    const inner = (
      <g transform={`translate(${p.x} ${p.y}) scale(${sx} ${sy})`}>
        <path d={d} {...common} fillRule={fr} />
      </g>
    );
    return transform ? <g transform={transform}>{inner}</g> : inner;
  }
  const imp = p.svgPathMatrix;
  const innerM = imp ? `matrix(${imp.a},${imp.b},${imp.c},${imp.d},${imp.e},${imp.f})` : undefined;
  if (innerM) {
    const inner = (
      <g transform={innerM}>
        <path d={d} {...common} fillRule={fr} />
      </g>
    );
    return transform ? <g transform={transform}>{inner}</g> : inner;
  }
  return <path d={d} {...common} fillRule={fr} transform={transform} />;
}

function splitBezierSegment(pts: BezierPoint[], segIdx: number, t: number): BezierPoint[] {
  const j = (segIdx + 1) % pts.length;
  const p0 = pts[segIdx].anchor, cp1 = pts[segIdx].handleOut;
  const cp2 = pts[j].handleIn, p3 = pts[j].anchor;

  const a = lerp2(p0, cp1, t);
  const b = lerp2(cp1, cp2, t);
  const c = lerp2(cp2, p3, t);
  const d = lerp2(a, b, t);
  const e = lerp2(b, c, t);
  const f = lerp2(d, e, t);

  const newPts = [...pts];
  newPts[segIdx] = { ...newPts[segIdx], handleOut: a };
  const newPt: BezierPoint = { anchor: f, handleIn: d, handleOut: e, vertexMode: "smooth" };
  newPts[j] = { ...newPts[j], handleIn: c };
  newPts.splice(segIdx + 1, 0, newPt);
  return newPts;
}

function lerp2(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Normalize dash input: commas → spaces (e.g. "4,2" or "4 2") for valid SVG stroke-dasharray. */
function svgStrokeDashArray(raw: string | undefined): string | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const n = String(raw).trim().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return undefined;
  const parts = n.split(" ");
  if (!parts.every((p) => p !== "" && !Number.isNaN(Number(p)))) return undefined;
  return parts.join(" ");
}

// ── Render SVG object ───────────────────────────────────────────────────

type RenderObjOpts = { /** Modo P: sin borde punteado ni «cromo» extra de marcos de texto encadenados. */ canvasZenMode?: boolean };

function renderObj(
  obj: FreehandObject,
  allObjects: FreehandObject[],
  selectedIds?: Set<string>,
  opts?: RenderObjOpts,
): React.ReactNode {
  if (!obj.visible || obj.isClipMask) return null;
  const transform = buildObjTransform(obj);
  const fill = migrateFill(obj.fill);
  const gid = gradientDefId(obj.id);
  const fillAttr = fillPaintValue(fill, gid);
  const strokeProps = {
    stroke: obj.stroke,
    strokeWidth: obj.strokeWidth,
    strokeLinecap: obj.strokeLinecap,
    strokeLinejoin: obj.strokeLinejoin,
    strokeDasharray: svgStrokeDashArray(obj.strokeDasharray),
    opacity: obj.opacity,
  };

  switch (obj.type) {
    case "rect": {
      const rObj = obj as RectObject;
      if (rObj.isImageFrame) {
        const ifc = rObj.imageFrameContent;
        const cid = `imf-clip-${rObj.id}`;
        const frameSelected = selectedIds == null || selectedIds.has(rObj.id);
        return (
          <g key={rObj.id} transform={transform} opacity={rObj.opacity}>
            <defs>
              <clipPath id={cid}>
                <rect x={rObj.x} y={rObj.y} width={rObj.width} height={rObj.height} rx={rObj.rx} />
              </clipPath>
            </defs>
            <rect
              x={rObj.x}
              y={rObj.y}
              width={rObj.width}
              height={rObj.height}
              rx={rObj.rx}
              fill={fillAttr}
              stroke={frameSelected ? rObj.stroke : "none"}
              strokeWidth={frameSelected ? rObj.strokeWidth : 0}
              strokeDasharray={frameSelected ? svgStrokeDashArray(rObj.strokeDasharray) : undefined}
            />
            {ifc?.src ? (
              <image
                clipPath={`url(#${cid})`}
                href={ifc.src}
                x={rObj.x + ifc.offsetX}
                y={rObj.y + ifc.offsetY}
                width={ifc.originalWidth * ifc.scaleX}
                height={ifc.originalHeight * ifc.scaleY}
                preserveAspectRatio={
                  Math.abs(ifc.scaleX - ifc.scaleY) < 1e-5 ? "xMidYMid meet" : "none"
                }
              />
            ) : (
              <g clipPath={`url(#${cid})`} opacity={0.3}>
                <line x1={rObj.x} y1={rObj.y} x2={rObj.x + rObj.width} y2={rObj.y + rObj.height} stroke={rObj.stroke || "#888"} strokeWidth={0.5} />
                <line x1={rObj.x + rObj.width} y1={rObj.y} x2={rObj.x} y2={rObj.y + rObj.height} stroke={rObj.stroke || "#888"} strokeWidth={0.5} />
              </g>
            )}
          </g>
        );
      }
      return <rect key={obj.id} x={obj.x} y={obj.y} width={obj.width} height={obj.height} rx={rObj.rx} fill={fillAttr} transform={transform} {...strokeProps} />;
    }
    case "ellipse":
      return <ellipse key={obj.id} cx={obj.x + obj.width / 2} cy={obj.y + obj.height / 2} rx={obj.width / 2} ry={obj.height / 2} fill={fillAttr} transform={transform} {...strokeProps} />;
    case "path": {
      const p = obj as PathObject;
      const fp = p.closed && fillHasPaint(fill) ? fillAttr : "none";
      const d = pathObjToD(p);
      const hasIntrinsic =
        p.svgPathIntrinsicW != null &&
        p.svgPathIntrinsicH != null &&
        p.svgPathD &&
        (!p.points || p.points.length < 2);
      if (hasIntrinsic) {
        const iw = p.svgPathIntrinsicW!;
        const ih = p.svgPathIntrinsicH!;
        const sx = obj.width / Math.max(iw, 1e-9);
        const sy = obj.height / Math.max(ih, 1e-9);
        return (
          <g key={obj.id} transform={transform}>
            <g transform={`translate(${obj.x} ${obj.y}) scale(${sx} ${sy})`}>
              <path d={d} fill={fp} {...strokeProps} />
            </g>
          </g>
        );
      }
      const imp = p.svgPathMatrix;
      const innerM = imp
        ? `matrix(${imp.a},${imp.b},${imp.c},${imp.d},${imp.e},${imp.f})`
        : undefined;
      if (innerM) {
        return (
          <g key={obj.id} transform={transform}>
            <g transform={innerM}>
              <path d={d} fill={fp} {...strokeProps} />
            </g>
          </g>
        );
      }
      return <path key={obj.id} d={d} fill={fp} transform={transform} {...strokeProps} />;
    }
    case "text": {
      const t = obj as TextObject;
      const foW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
      const foH = t.textMode === "point" ? Math.max(t.height, t.fontSize * t.lineHeight + 4) : t.height;
      const ta = t.textAlign === "justify" ? "justify" : t.textAlign;
      const pad = t.textMode === "area" ? 4 : 0;
      const padL = pad + (t.paragraphIndent ?? 0);
      const fillCss = textFillCssProperties(fill);
      const hasStroke = t.strokeWidth > 0 && t.stroke && t.stroke !== "none";
      const strokePos = t.strokePosition ?? "over";
      const strokeCss: React.CSSProperties = hasStroke
        ? { WebkitTextStroke: `${t.strokeWidth}px ${t.stroke}` }
        : {};
      const baseTypography: React.CSSProperties = {
        margin: 0,
        padding: pad,
        paddingLeft: padL,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        fontStyle: t.fontStyle ?? "normal",
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        fontKerning: t.fontKerning === "none" ? "none" : "auto",
        fontFeatureSettings: t.fontFeatureSettings ?? '"kern" 1, "liga" 1, "calt" 1',
        fontVariantLigatures: t.fontVariantLigatures ?? "common-ligatures",
        ...(t.fontVariantCaps === "small-caps" ? { fontVariantCaps: "small-caps" as const } : {}),
        textDecoration: [t.textUnderline && "underline", t.textStrikethrough && "line-through"].filter(Boolean).join(" ") || undefined,
        textAlign: ta,
        whiteSpace: t.textMode === "point" ? "pre" : "pre-wrap",
        wordBreak: t.textMode === "area" ? ("break-word" as const) : "normal",
        opacity: t.opacity,
        userSelect: "none",
      };
      const richSpans = t._designerRichSpans;
      const hasRich = richSpans && richSpans.length > 0 && richSpans.some(s => s.style && Object.keys(s.style).length > 0);
      const renderRichContent = (): React.ReactNode => {
        if (!richSpans || richSpans.length === 0) return t.text || "\u00a0";
        return richSpans.map((span, si) => {
          if (!span.style || Object.keys(span.style).length === 0) {
            return <React.Fragment key={si}>{span.text}</React.Fragment>;
          }
          const st = span.style;
          const ss: React.CSSProperties = {};
          if (st.fontWeight) ss.fontWeight = st.fontWeight;
          if (st.fontStyle) ss.fontStyle = st.fontStyle;
          if (st.textUnderline || st.textStrikethrough) {
            ss.textDecoration = [st.textUnderline && "underline", st.textStrikethrough && "line-through"].filter(Boolean).join(" ");
          }
          if (st.fontSize != null) ss.fontSize = st.fontSize;
          if (st.color) ss.color = st.color;
          if (st.fontFamily) ss.fontFamily = st.fontFamily;
          if (st.letterSpacing != null) ss.letterSpacing = st.letterSpacing;
          if (st.linkHref) {
            return (
              <a
                key={si}
                href={st.linkHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...ss,
                  color: (ss.color as string) || "#38bdf8",
                  textDecoration: ss.textDecoration ?? "underline",
                  pointerEvents: "auto",
                }}
              >
                {span.text}
              </a>
            );
          }
          return (
            <span key={si} style={ss}>
              {span.text}
            </span>
          );
        });
      };
      const content = hasRich ? renderRichContent() : (t.text || "\u00a0");
      const solidFillHex =
        fill.type === "solid" && fill.color !== "none" ? fill.color : undefined;
      let inner: React.ReactNode;
      if (!hasStroke) {
        inner = (
          <div {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)} style={{ ...baseTypography, ...fillCss }}>
            {content}
          </div>
        );
      } else if (strokePos === "under") {
        inner = (
          <div
            {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)}
            style={{ position: "relative", width: "100%", height: "100%", margin: 0, boxSizing: "border-box" }}
          >
            <div
              style={{
                ...baseTypography,
                position: "absolute",
                inset: 0,
                ...strokeCss,
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              {content}
            </div>
            <div
              style={{
                ...baseTypography,
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                ...fillCss,
              }}
            >
              {content}
            </div>
          </div>
        );
      } else {
        inner = (
          <div
            {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)}
            style={{
              ...baseTypography,
              ...fillCss,
              ...strokeCss,
              ...(solidFillHex ? { WebkitTextFillColor: solidFillHex } : {}),
            }}
          >
            {content}
          </div>
        );
      }
      const textT = textSvgTransform(t);
      return (
        <g key={obj.id} data-fh-text={t.id} transform={textT}>
          {t.isTextFrame && !opts?.canvasZenMode && (
            <rect
              x={t.x} y={t.y} width={foW} height={foH}
              fill="none" stroke="#38bdf8" strokeWidth={0.75}
              strokeDasharray="4 3" opacity={0.5}
              pointerEvents="none"
            />
          )}
          <foreignObject x={t.x} y={t.y} width={foW} height={foH} style={{ overflow: t.isTextFrame ? "hidden" : "visible" }}>
            {inner}
          </foreignObject>
          {/* Text frame ports rendered in overlay layer above selection box */}
        </g>
      );
    }
    case "image":
      return (
        <image
          href={(obj as ImageObject).src}
          x={obj.x}
          y={obj.y}
          width={obj.width}
          height={obj.height}
          preserveAspectRatio="xMidYMid meet"
          transform={transform}
          opacity={obj.opacity}
        />
      );
    case "booleanGroup": {
      const bg = obj as BooleanGroupObject;
      if (bg.cachedResult) {
        return (
          <image
            href={bg.cachedResult}
            x={bg.x}
            y={bg.y}
            width={bg.width}
            height={bg.height}
            preserveAspectRatio="none"
            transform={transform}
            opacity={bg.opacity}
          />
        );
      }
      return null;
    }
    case "clippingContainer": {
      const cc = obj as ClippingContainerObject;
      const cid = `clip-cc-${cc.id}`;
      const innerT = `translate(${cc.x} ${cc.y}) rotate(${cc.rotation} ${cc.width / 2} ${cc.height / 2})`;
      return (
        <g key={cc.id} opacity={cc.opacity}>
          <g transform={innerT}>
            {/* clipPath fuera de <defs>: dentro de <defs> bajo un <g transform> algunos motores aplican mal el sistema de coordenadas al recorte. */}
            <clipPath id={cid} clipPathUnits="userSpaceOnUse">
              {renderMaskShapeClipInner(cc.mask)}
            </clipPath>
            <g clipPath={`url(#${cid})`}>
              {cc.content.map((ch, idx) => (
                <g key={`${cc.id}-clipc-${idx}-${ch.id}`}>{renderObj(ch, allObjects, selectedIds, opts)}</g>
              ))}
            </g>
          </g>
        </g>
      );
    }
    case "textOnPath": {
      const tp = obj as TextOnPathObject;
      const guide = allObjects.find((o) => o.id === tp.guidePathId);
      if (!guide || guide.type !== "path") {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[Freehand] TextOnPath "${tp.id}" orphan: guidePathId "${tp.guidePathId}" does not resolve to a PathObject.`,
          );
        }
        return null;
      }
      const gp = guide as PathObject;
      const d = pathObjToD(gp);
      const pathRefId = `tp-${tp.id}`;
      const dy = tp.side === "above" ? -tp.fontSize * 0.2 + tp.baselineShift : tp.fontSize * 0.2 + tp.baselineShift;
      const clipOverflowId = `tp-overflow-${tp.id}`;
      return (
        <g key={tp.id} data-fh-obj={tp.id} transform={transform} opacity={tp.opacity}>
          <defs>
            <path id={pathRefId} d={d} fill="none" stroke="none" />
            {tp.overflow === "hidden" && (
              <clipPath id={clipOverflowId} clipPathUnits="userSpaceOnUse">
                <rect x={tp.x} y={tp.y} width={tp.width} height={tp.height} />
              </clipPath>
            )}
          </defs>
          {tp.pathVisible ? (
            <path d={d} fill="none" stroke={tp.pathColor} strokeWidth={tp.pathWidth} />
          ) : null}
          {/* TODO: overflow "scale" — auto-fit text length (next iteration) */}
          <g clipPath={tp.overflow === "hidden" ? `url(#${clipOverflowId})` : undefined}>
            <text
              fontFamily={tp.fontFamily}
              fontSize={tp.fontSize}
              fontWeight={tp.fontWeight}
              fontStyle={tp.fontStyle as "normal" | "italic" | "oblique"}
              fill={tp.fill}
              letterSpacing={tp.letterSpacing + tp.charSpacing}
              textAnchor={tp.textAnchor}
            >
              <textPath href={`#${pathRefId}`} startOffset={`${tp.startOffset}%`}>
                <tspan dy={dy}>{tp.text || "\u00a0"}</tspan>
              </textPath>
            </text>
          </g>
        </g>
      );
    }
    default: return null;
  }
}

function renderClipDef(clipObj: FreehandObject): React.ReactNode {
  if (!clipObj.isClipMask) return null;
  let shape: React.ReactNode = null;
  switch (clipObj.type) {
    case "rect":
      shape = <rect x={clipObj.x} y={clipObj.y} width={clipObj.width} height={clipObj.height} rx={(clipObj as RectObject).rx} />;
      break;
    case "ellipse":
      shape = <ellipse cx={clipObj.x + clipObj.width / 2} cy={clipObj.y + clipObj.height / 2} rx={clipObj.width / 2} ry={clipObj.height / 2} />;
      break;
    case "path": {
      const p = clipObj as PathObject;
      shape = <path d={bezierToSvgD(p.points, p.closed)} />;
      break;
    }
  }
  return <clipPath key={`clip-${clipObj.id}`} id={`clip-${clipObj.id}`}>{shape}</clipPath>;
}

// ── Boolean rendering helpers ───────────────────────────────────────────

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function measureExportLineWidth(s: string, ctx: CanvasRenderingContext2D, letterSpacingPx: number): number {
  if (s.length === 0) return 0;
  let w = ctx.measureText(s).width;
  if (letterSpacingPx && s.length > 1) {
    w += letterSpacingPx * (s.length - 1);
  }
  return w;
}

/** Parte palabras largas como hace `word-break: break-word` en el foreignObject. */
function breakLongWordForExport(
  word: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D,
  letterSpacingPx: number,
): string[] {
  if (measureExportLineWidth(word, ctx, letterSpacingPx) <= maxWidth) return [word];
  const chunks: string[] = [];
  let rest = word;
  while (rest.length > 0) {
    let lo = 0;
    let hi = rest.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const sub = rest.slice(0, mid);
      if (measureExportLineWidth(sub, ctx, letterSpacingPx) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    const n = Math.max(1, lo);
    chunks.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  return chunks;
}

/**
 * Replica de forma aproximada el ajuste de líneas del lienzo (foreignObject: pre-wrap + break-word).
 * Sin esto, el PNG de preview usa solo `\n` explícitos y el texto sale en una sola línea larga.
 */
function wrapAreaTextToLinesForExport(
  raw: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D,
  letterSpacingPx: number,
): string[] {
  const paragraphs = raw.split("\n");
  const out: string[] = [];
  const ws = /\s+/;
  for (const para of paragraphs) {
    if (para === "") {
      out.push("");
      continue;
    }
    const words = para.split(ws).filter((w) => w.length > 0);
    let line = "";
    const pushWords = (wlist: string[]) => {
      for (const word of wlist) {
        if (!line) {
          if (measureExportLineWidth(word, ctx, letterSpacingPx) <= maxWidth) {
            line = word;
          } else {
            const parts = breakLongWordForExport(word, maxWidth, ctx, letterSpacingPx);
            for (let i = 0; i < parts.length - 1; i++) {
              out.push(parts[i]!);
            }
            line = parts[parts.length - 1]!;
          }
          continue;
        }
        const trial = `${line} ${word}`;
        if (measureExportLineWidth(trial, ctx, letterSpacingPx) <= maxWidth) {
          line = trial;
        } else {
          out.push(line);
          if (measureExportLineWidth(word, ctx, letterSpacingPx) <= maxWidth) {
            line = word;
          } else {
            const parts = breakLongWordForExport(word, maxWidth, ctx, letterSpacingPx);
            for (let i = 0; i < parts.length - 1; i++) {
              out.push(parts[i]!);
            }
            line = parts[parts.length - 1]!;
          }
        }
      }
    };
    pushWords(words);
    if (line) {
      out.push(line);
      line = "";
    }
  }
  return out.length > 0 ? out : [""];
}

/** Raster export strips `foreignObject` (tainted canvas); emit native SVG text so PNG/node preview shows copy. */
function textObjectToNativeSvgMarkup(t: TextObject): string {
  const fill = migrateFill(t.fill);
  const gid = gradientDefId(t.id);
  const fillAttr = escapeXmlAttr(fillPaintValue(fill, gid));
  const raw = t.text || "\u00a0";
  const pad = t.textMode === "area" ? 4 : 0;
  const indent = t.paragraphIndent ?? 0;
  const boxW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;

  let lines: string[];
  if (t.textMode === "area" && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const fst = t.fontStyle && t.fontStyle !== "normal" ? `${t.fontStyle} ` : "";
      ctx.font = `${fst}${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
      const innerW = Math.max(1, boxW - 2 * pad - indent);
      lines = wrapAreaTextToLinesForExport(raw, innerW, ctx, t.letterSpacing ?? 0);
    } else {
      lines = raw.split("\n");
    }
  } else {
    lines = raw.split("\n");
  }
  const lhPx = t.fontSize * t.lineHeight;
  const ta = t.textAlign === "justify" ? "left" : t.textAlign;
  let textAnchor: "start" | "middle" | "end" = "start";
  let baseX = t.x + pad;
  if (ta === "center") {
    textAnchor = "middle";
    baseX = t.x + boxW / 2;
  } else if (ta === "right") {
    textAnchor = "end";
    baseX = t.x + boxW - pad;
  } else {
    baseX = t.x + pad + indent;
  }
  const firstY = t.y + pad + t.fontSize;
  const sp = t.strokePosition ?? "over";
  // TODO: validar paint-order en canvas raster cross-browser;
  // si el orden no coincide con la vista en vivo, sustituir
  // por doble <text> (una pasada stroke, otra fill)
  const strokePart =
    t.strokeWidth > 0 && t.stroke && t.stroke !== "none"
      ? ` stroke="${escapeXmlAttr(t.stroke)}" stroke-width="${t.strokeWidth}" paint-order="${sp === "under" ? "fill stroke" : "stroke fill"}"`
      : "";
  const tspans = lines.map((line, i) => {
    // Mismo borde izquierdo del contenido que `paddingLeft: pad + indent` en el foreignObject.
    const xLine =
      ta === "center" || ta === "right"
        ? baseX
        : t.x + pad + indent;
    const lt = line.length === 0 ? "\u00a0" : line;
    if (i === 0) {
      return `<tspan x="${xLine}" y="${firstY}">${escapeXmlText(lt)}</tspan>`;
    }
    return `<tspan x="${xLine}" dy="${lhPx}">${escapeXmlText(lt)}</tspan>`;
  });
  const fs = t.fontStyle && t.fontStyle !== "normal" ? ` font-style="${escapeXmlAttr(t.fontStyle)}"` : "";
  const inner =
    `<text font-family="${escapeXmlAttr(t.fontFamily)}" font-size="${t.fontSize}" font-weight="${t.fontWeight}"${fs} ` +
    `fill="${fillAttr}" text-anchor="${textAnchor}" opacity="${t.opacity}" ` +
    `letter-spacing="${t.letterSpacing}"${strokePart}>${tspans.join("")}</text>`;
  const tt = textSvgTransform(t);
  return tt ? `<g transform="${escapeXmlAttr(tt)}">${inner}</g>` : inner;
}

/** Serializa `textFillCssProperties` + extras para atributo `style` en foreignObject estático. */
function textFillStyleAttrFromAppearance(fill: FillAppearance): string {
  const o = textFillCssProperties(fill);
  const parts: string[] = [];
  const mapKey = (k: string): string => {
    if (k === "WebkitBackgroundClip") return "-webkit-background-clip";
    if (k === "WebkitTextFillColor") return "-webkit-text-fill-color";
    if (k === "WebkitTextStroke") return "-webkit-text-stroke";
    return k.replace(/([A-Z])/g, "-$1").toLowerCase();
  };
  for (const [k, val] of Object.entries(o)) {
    if (val == null || val === "") continue;
    const v = String(val).replace(/"/g, "&quot;");
    parts.push(`${mapKey(k)}:${v}`);
  }
  return parts.join(";");
}

function textForeignObjectStaticInnerXml(t: TextObject, fillAp: FillAppearance): string {
  const raw = escapeXmlAttr(t.text || " ").replace(/\n/g, "&#10;");
  const pad = t.textMode === "area" ? 4 : 0;
  const padL = pad + (t.paragraphIndent ?? 0);
  const ta = t.textAlign === "justify" ? "justify" : t.textAlign;
  const fst = t.fontStyle && t.fontStyle !== "normal" ? `font-style:${t.fontStyle};` : "";
  const fcaps = t.fontVariantCaps === "small-caps" ? "font-variant-caps:small-caps;" : "";
  const deco = [t.textUnderline && "underline", t.textStrikethrough && "line-through"].filter(Boolean).join(" ");
  const tdeco = deco ? `text-decoration:${deco};` : "";
  const base = `margin:0;padding:${pad}px;padding-left:${padL}px;width:100%;height:100%;box-sizing:border-box;font-family:${escapeXmlAttr(t.fontFamily)};font-size:${t.fontSize}px;font-weight:${t.fontWeight};${fst}line-height:${t.lineHeight};letter-spacing:${t.letterSpacing}px;font-kerning:${t.fontKerning === "none" ? "none" : "auto"};${fcaps}${tdeco}text-align:${ta};white-space:${t.textMode === "point" ? "pre" : "pre-wrap"};word-break:${t.textMode === "area" ? "break-word" : "normal"};opacity:${t.opacity};user-select:none`;
  const fillStr = textFillStyleAttrFromAppearance(fillAp);
  const hasStroke = t.strokeWidth > 0 && t.stroke && t.stroke !== "none";
  const strokePos = t.strokePosition ?? "over";
  if (!hasStroke) {
    return `<div xmlns="http://www.w3.org/1999/xhtml" style="${base};${fillStr}">${raw}</div>`;
  }
  const wts = `-webkit-text-stroke:${t.strokeWidth}px ${escapeXmlAttr(t.stroke)}`;
  if (strokePos === "under") {
    return (
      `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%;margin:0;box-sizing:border-box">` +
      `<div style="position:absolute;inset:0;${base};${wts};color:transparent;-webkit-text-fill-color:transparent">${raw}</div>` +
      `<div style="position:absolute;inset:0;pointer-events:none;${base};${fillStr}">${raw}</div>` +
      `</div>`
    );
  }
  const solidHex = fillAp.type === "solid" && fillAp.color !== "none" ? fillAp.color : "";
  const fillPart = solidHex ? `;-webkit-text-fill-color:${escapeXmlAttr(solidHex)}` : "";
  return `<div xmlns="http://www.w3.org/1999/xhtml" style="${base};${fillStr};${wts}${fillPart}">${raw}</div>`;
}

function substituteNativeTextForRasterExport(svgXml: string, objects: FreehandObject[]): string {
  const texts = objects.filter((o): o is TextObject => o.type === "text" && o.visible && !o.isClipMask);
  if (texts.length === 0) return svgXml;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgXml;
  for (const t of texts) {
    const g = doc.querySelector(`g[data-fh-text="${t.id}"]`);
    if (!g) continue;
    g.querySelectorAll("foreignObject").forEach((el) => el.remove());
    const wrap = parser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${textObjectToNativeSvgMarkup(t)}</svg>`,
      "image/svg+xml",
    );
    const root = wrap.documentElement;
    while (root.firstChild) g.appendChild(root.firstChild);
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function objToSvgStringStatic(obj: FreehandObject, w: number, h: number, ox: number, oy: number): string {
  const parts: string[] = [];
  const fill = migrateFill(obj.fill);
  const gid = gradientDefId(obj.id);
  const fillAttr = fillPaintValue(fill, gid);
  const defStr = fill.type === "solid" ? "" : fillDefSvgString(fill, gid);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${ox} ${oy} ${w} ${h}">`);
  if (defStr) parts.push(`<defs>${defStr}</defs>`);
  const tf = buildObjTransform(obj);
  const transform = tf ? ` transform="${escapeXmlAttr(tf)}"` : "";
  const dash = svgStrokeDashArray(obj.strokeDasharray);
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  const capJoin = ` stroke-linecap="${obj.strokeLinecap}" stroke-linejoin="${obj.strokeLinejoin}"`;
  switch (obj.type) {
    case "rect":
      parts.push(`<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="${(obj as RectObject).rx}" fill="${escapeXmlAttr(fillAttr)}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr} ${transform}/>`);
      break;
    case "ellipse":
      parts.push(`<ellipse cx="${obj.x + obj.width / 2}" cy="${obj.y + obj.height / 2}" rx="${obj.width / 2}" ry="${obj.height / 2}" fill="${escapeXmlAttr(fillAttr)}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr} ${transform}/>`);
      break;
    case "path": {
      const p = obj as PathObject;
      const fp = p.closed && fillHasPaint(fill) ? escapeXmlAttr(fillAttr) : "none";
      const dStr = escapeXmlAttr(pathObjToD(p));
      if (
        p.svgPathIntrinsicW != null &&
        p.svgPathIntrinsicH != null &&
        p.svgPathD &&
        (!p.points || p.points.length < 2)
      ) {
        const iw = p.svgPathIntrinsicW;
        const ih = p.svgPathIntrinsicH;
        const sx = obj.width / Math.max(iw, 1e-9);
        const sy = obj.height / Math.max(ih, 1e-9);
        const inner = `translate(${obj.x} ${obj.y}) scale(${sx} ${sy})`;
        parts.push(
          `<g${transform}><g transform="${escapeXmlAttr(inner)}"><path d="${dStr}" fill="${fp}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr}/></g></g>`,
        );
      } else {
        parts.push(`<path d="${dStr}" fill="${fp}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr} ${transform}/>`);
      }
      break;
    }
    case "text": {
      const t = obj as TextObject;
      const foW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
      const foH = t.textMode === "point" ? Math.max(t.height, t.fontSize * t.lineHeight + 4) : t.height;
      const innerFo = textForeignObjectStaticInnerXml(t, fill);
      const tt = textSvgTransform(t);
      const gtr = tt ? ` transform="${escapeXmlAttr(tt)}"` : "";
      parts.push(`<g${gtr}><foreignObject x="${t.x}" y="${t.y}" width="${foW}" height="${foH}">${innerFo}</foreignObject></g>`);
      break;
    }
    case "image":
      parts.push(`<image href="${(obj as ImageObject).src}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="none" ${transform}/>`);
      break;
    case "booleanGroup": {
      const bg = obj as BooleanGroupObject;
      if (bg.cachedResult) {
        parts.push(`<image href="${bg.cachedResult}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="none"/>`);
      }
      break;
    }
  }
  parts.push(`</svg>`);
  return parts.join("");
}

async function computeBooleanCachedResult(children: FreehandObject[], operation: BooleanOperation): Promise<{ dataUrl: string; bounds: Rect }> {
  const visible = children.filter((o) => o.visible);
  if (visible.length === 0) return { dataUrl: "", bounds: { x: 0, y: 0, w: 1, h: 1 } };
  const bounds = getGroupBounds(visible);
  const pad = 4;
  const w = Math.ceil(bounds.w + pad * 2);
  const h = Math.ceil(bounds.h + pad * 2);
  const ox = bounds.x - pad;
  const oy = bounds.y - pad;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < visible.length; i++) {
    let svgStr = objToSvgStringStatic(visible[i], w, h, ox, oy);
    svgStr = await inlineSvgRasterImagesToDataUrls(svgStr);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(im);
      im.src = url;
    });
    if (i === 0) {
      ctx.drawImage(img, 0, 0);
    } else {
      switch (operation) {
        case "union": ctx.globalCompositeOperation = "source-over"; break;
        case "subtract": ctx.globalCompositeOperation = "destination-out"; break;
        case "intersect": ctx.globalCompositeOperation = "destination-in"; break;
        case "exclude": ctx.globalCompositeOperation = "xor"; break;
      }
      ctx.drawImage(img, 0, 0);
    }
    URL.revokeObjectURL(url);
  }
  ctx.globalCompositeOperation = "source-over";

  return { dataUrl: canvasToPngDataUrlSafe(canvas), bounds: { x: ox, y: oy, w, h } };
}

// ── Export helpers ──────────────────────────────────────────────────────

function buildExportBounds(objects: FreehandObject[]): Rect {
  const visible = objects.filter((o) => o.visible && !o.isClipMask);
  if (visible.length === 0) return { x: 0, y: 0, w: 1920, h: 1080 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of visible) {
    const vb = getVisualAABB(o, objects);
    x1 = Math.min(x1, vb.x);
    y1 = Math.min(y1, vb.y);
    x2 = Math.max(x2, vb.x + vb.w);
    y2 = Math.max(y2, vb.y + vb.h);
  }
  const pad = 20;
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}

function resolveSceneExportBounds(objects: FreehandObject[], artboards: Artboard[]): Rect {
  const ab = pickPrimaryArtboard(artboards, null);
  if (ab) return artboardToRect(ab);
  return buildExportBounds(objects);
}

function resolveFitViewBounds(objects: FreehandObject[], artboards: Artboard[]): Rect {
  const visible = objects.filter((o) => o.visible && !o.isClipMask);
  const abRects = artboards.map(artboardToRect);

  // Sin contenido, no usar el placeholder 1920×1080 de buildExportBounds: al unirlo con un
  // pliego vertical domina el ancho y el encuadre deja la página como una franja pequeña.
  if (visible.length === 0) {
    if (abRects.length > 0) {
      const u = unionRects(abRects);
      if (u) return u;
    }
    return { x: 0, y: 0, w: 1920, h: 1080 };
  }

  const ob = buildExportBounds(objects);
  if (artboards.length === 0) return ob;
  return unionRects([ob, ...abRects]) ?? ob;
}

/** Evita canvas “tainted” al exportar: las <image> con http(s) deben ir como data URLs antes de rasterizar. */
const TRANSPARENT_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function rasterHrefToSafeDataUrl(href: string, cache: Map<string, string>): Promise<string> {
  const raw = href.trim();
  if (!raw) return TRANSPARENT_PIXEL_PNG;
  if (raw.startsWith("data:")) return raw;

  let resolved: string;
  try {
    resolved = new URL(raw, document.baseURI).href;
  } catch {
    return TRANSPARENT_PIXEL_PNG;
  }

  const cached = cache.get(resolved);
  if (cached) return cached;

  const fetchToDataUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await blobToDataUrl(blob);
    } catch {
      return null;
    }
  };

  let dataUrl = await fetchToDataUrl(resolved);

  // S3 u orígenes sin CORS: mismo proxy que el PDF vectorial (`download-vector-pdf.ts`).
  if (
    !dataUrl &&
    (resolved.startsWith("http://") || resolved.startsWith("https://")) &&
    !resolved.includes("/api/spaces/proxy")
  ) {
    const proxy = `/api/spaces/proxy?url=${encodeURIComponent(resolved)}`;
    dataUrl = await fetchToDataUrl(proxy);
  }

  if (dataUrl) {
    cache.set(resolved, dataUrl);
    return dataUrl;
  }

  try {
    const fromImg = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = Math.max(1, img.naturalWidth);
          c.height = Math.max(1, img.naturalHeight);
          c.getContext("2d")!.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch {
          resolve(TRANSPARENT_PIXEL_PNG);
        }
      };
      img.onerror = () => resolve(TRANSPARENT_PIXEL_PNG);
      img.src = resolved;
    });
    cache.set(resolved, fromImg);
    return fromImg;
  } catch {
    cache.set(resolved, TRANSPARENT_PIXEL_PNG);
    return TRANSPARENT_PIXEL_PNG;
  }
}

async function freehandObjectsFromSvgImportShapes(shapes: SvgImportShape[]): Promise<FreehandObject[]> {
  const cache = new Map<string, string>();
  const out: FreehandObject[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i]!;
    const n = i + 1;
    const gid = s.groupId ? { groupId: s.groupId } : {};
    if (s.kind === "rect") {
      const fill = typeof s.fill === "string" ? migrateFill(solidFill(s.fill)) : migrateFill(s.fill);
      out.push({
        ...defaultObj({ name: `Rectangle ${n}`, ...gid }),
        type: "rect",
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rx: s.rx,
        fill,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        opacity: s.opacity,
        rotation: s.rotation,
      } as RectObject);
      continue;
    }
    if (s.kind === "ellipse") {
      const fill = typeof s.fill === "string" ? migrateFill(solidFill(s.fill)) : migrateFill(s.fill);
      out.push({
        ...defaultObj({ name: `Ellipse ${n}`, ...gid }),
        type: "ellipse",
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        fill,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        opacity: s.opacity,
        rotation: s.rotation,
      } as EllipseObject);
      continue;
    }
    if (s.kind === "path") {
      const fill = typeof s.fill === "string" ? migrateFill(solidFill(s.fill)) : migrateFill(s.fill);
      out.push({
        ...defaultObj({ name: `Path ${n}`, ...gid }),
        type: "path",
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        points: [],
        closed: s.closed,
        svgPathD: s.svgPathD,
        ...(s.svgPathMatrix ? { svgPathMatrix: s.svgPathMatrix } : {}),
        fill,
        stroke: s.stroke,
        strokeWidth: Math.max(0, s.strokeWidth),
        opacity: s.opacity,
        rotation: s.rotation,
      } as PathObject);
      continue;
    }
    if (s.kind === "text") {
      const fill = typeof s.fill === "string" ? migrateFill(solidFill(s.fill)) : migrateFill(s.fill);
      out.push({
        ...defaultObj({ name: `Text ${n}`, ...gid }),
        type: "text",
        textMode: "point",
        text: s.text,
        x: s.x,
        y: s.y,
        width: Math.max(40, s.width),
        height: Math.max(12, s.height),
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: 1.35,
        letterSpacing: 0,
        fontKerning: "auto",
        fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
        fontVariantLigatures: "common-ligatures",
        paragraphIndent: 0,
        textAlign: "left",
        fill,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokePosition: "over",
        scaleX: 1,
        scaleY: 1,
        opacity: s.opacity,
        rotation: s.rotation,
      } as TextObject);
      continue;
    }
    if (s.kind === "image") {
      const src = await rasterHrefToSafeDataUrl(s.href, cache);
      const ratio = s.width / Math.max(s.height, 1);
      out.push({
        ...defaultObj({ name: `Image ${n}`, ...gid }),
        type: "image",
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        fill: solidFill("none"),
        stroke: "none",
        strokeWidth: 0,
        src,
        intrinsicRatio: ratio,
        opacity: s.opacity,
        rotation: s.rotation,
      } as ImageObject);
    }
  }
  return out;
}

async function inlineSvgRasterImagesToDataUrls(svgXml: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgXml;
  const images = doc.getElementsByTagNameNS("http://www.w3.org/2000/svg", "image");
  if (images.length === 0) return svgXml;

  const cache = new Map<string, string>();
  await Promise.all(
    Array.from(images).map(async (el) => {
      const href =
        el.getAttribute("href") ||
        el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        el.getAttributeNS("http://www.w3.org/2000/svg", "href");
      if (!href) return;
      const safe = await rasterHrefToSafeDataUrl(href, cache);
      el.setAttribute("href", safe);
      el.setAttributeNS("http://www.w3.org/1999/xlink", "href", safe);
    }),
  );
  return new XMLSerializer().serializeToString(doc.documentElement);
}

/** El HTML dentro de foreignObject puede contaminar el canvas al rasterizar el SVG. */
function stripForeignObjectElements(svgXml: string): string {
  if (!/foreignObject/i.test(svgXml)) return svgXml;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgXml;
  doc.querySelectorAll("foreignObject").forEach((el) => el.remove());
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function isCanvasExportReadable(canvas: HTMLCanvasElement): boolean {
  try {
    void canvas.toDataURL("image/png");
    return true;
  } catch {
    return false;
  }
}

/** `toDataURL` tras rasterizar SVG; nunca lanza SecurityError al nodo padre. */
function canvasToPngDataUrlSafe(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/png");
  } catch {
    console.warn("Freehand: canvas export tainted after sanitization; using placeholder.");
    return TRANSPARENT_PIXEL_PNG;
  }
}

async function svgStringToCanvasSafe(
  svgStr: string,
  w: number,
  h: number,
  bgColor?: string,
): Promise<HTMLCanvasElement> {
  const tryPipeline = async (raw: string) => {
    const inlined = await inlineSvgRasterImagesToDataUrls(raw);
    return svgStringToCanvas(inlined, w, h, bgColor);
  };

  let canvas = await tryPipeline(svgStr);
  if (isCanvasExportReadable(canvas)) return canvas;

  const stripped = stripForeignObjectElements(svgStr);
  if (stripped !== svgStr) {
    canvas = await tryPipeline(stripped);
    if (isCanvasExportReadable(canvas)) return canvas;
  }

  const strippedInlined = stripForeignObjectElements(await inlineSvgRasterImagesToDataUrls(svgStr));
  canvas = await svgStringToCanvas(strippedInlined, w, h, bgColor);
  if (isCanvasExportReadable(canvas)) return canvas;

  const fallback = document.createElement("canvas");
  fallback.width = Math.max(1, Math.round(w));
  fallback.height = Math.max(1, Math.round(h));
  const fx = fallback.getContext("2d");
  if (fx) {
    if (bgColor) {
      fx.fillStyle = bgColor;
      fx.fillRect(0, 0, fallback.width, fallback.height);
    }
  }
  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function svgStringToCanvas(svgStr: string, w: number, h: number, bgColor?: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d")!;
      if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-150 ease-out ${
        active
          ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
          : "text-zinc-500 hover:bg-white/[0.06] hover:text-white"
      }`}
    >{children}</button>
  );
}

function CtxMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const remeasureKey = items.map((i) => `${i.label}\0${!!i.disabled}\0${!!i.separator}`).join("|");
  const { ref, style } = useClampedFixedPosition(x, y, true, remeasureKey);

  useEffect(() => {
    const h = () => {
      onClose();
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu !z-[100001] min-w-[220px] max-h-[min(70vh,calc(100vh-24px))] overflow-y-auto overflow-x-hidden"
      style={{ ...style, position: "fixed", zIndex: 100001 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 shrink-0 border-b border-white/5 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-white/30">
        Acciones
      </div>
      {items.map((item, i) => {
        const isDanger = item.label === "Delete" || item.label.startsWith("Eliminar");
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {item.separator ? <div className="context-menu-separator" /> : null}
            <button
              type="button"
              disabled={item.disabled}
              className={`context-menu-item w-full justify-between border-0 bg-transparent font-[inherit] ${
                isDanger ? "danger" : ""
              }`}
              onClick={() => {
                item.action();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut ? (
                <span className="shrink-0 font-mono text-[9px] font-normal normal-case tracking-normal text-white/35 tabular-nums">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function clipMapFromObjects(objs: FreehandObject[]): Map<string, FreehandObject[]> {
  const map = new Map<string, FreehandObject[]>();
  for (const o of objs) {
    if (o.clipMaskId) {
      const arr = map.get(o.clipMaskId) || [];
      arr.push(o);
      map.set(o.clipMaskId, arr);
    }
  }
  return map;
}

function layerRowIcon(o: FreehandObject) {
  const cls = "shrink-0 text-zinc-500";
  switch (o.type) {
    case "rect": {
      if (o.isImageFrame) return <ImageIconLucide size={12} className={`${cls} text-amber-400/60`} />;
      return <Square size={12} className={cls} />;
    }
    case "ellipse": return <Circle size={12} className={cls} />;
    case "path": return <PenTool size={12} className={cls} />;
    case "text": {
      if (o.isTextFrame) return <Type size={12} className={`${cls} text-sky-400/60`} />;
      return <Type size={12} className={cls} />;
    }
    case "image": return <ImageIconLucide size={12} className={cls} />;
    case "booleanGroup": return <Layers size={12} className={cls} />;
    case "clippingContainer": return <Crop size={12} className={cls} />;
    default: return <Square size={12} className={cls} />;
  }
}

/** Relleno/trazo para la siguiente forma o trazo a pluma, deducidos de un objeto con estilo vectorial. */
function creationStyleSnapshotFromObject(o: FreehandObject): {
  fillColor: string | null;
  strokeColor: string | null;
  strokeWidth: number;
  strokeLinecap: FreehandObjectBase["strokeLinecap"];
  strokeLinejoin: FreehandObjectBase["strokeLinejoin"];
  strokeDasharray: string;
} | null {
  if (o.type === "image" || o.type === "booleanGroup" || o.type === "clippingContainer") return null;

  let fillColor: string | null = null;
  if (o.type === "textOnPath") {
    const c = (o as TextOnPathObject).fill;
    if (c && c !== "none" && c !== "transparent" && /^#[0-9A-Fa-f]{6}$/i.test(c)) fillColor = c;
  } else {
    const mf = migrateFill(o.fill);
    if (mf.type === "solid" && mf.color !== "none") fillColor = mf.color;
    else if (mf.type === "gradient-linear" || mf.type === "gradient-radial") {
      const h = mf.stops[0]?.color;
      if (h && /^#[0-9A-Fa-f]{6}$/i.test(h)) fillColor = h;
    }
  }

  const strokeColor = o.stroke && o.stroke !== "none" ? o.stroke : null;
  return {
    fillColor,
    strokeColor,
    strokeWidth: o.strokeWidth,
    strokeLinecap: o.strokeLinecap,
    strokeLinejoin: o.strokeLinejoin,
    strokeDasharray: o.strokeDasharray ?? "",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function FreehandStudio({
  nodeId,
  initialObjects,
  initialArtboards,
  initialLayoutGuides,
  onClose,
  onExport,
  onUpdateObjects,
  onUpdateLayoutGuides,
  designerMode,
  onDesignerTextFrameCreate,
  onDesignerImageFramePlace,
  studioApiRef,
  onDesignerTextFrameEdit,
  onDesignerAppendThreadedFrame,
  designerStoryMap,
  designerStoryHtmlMap,
  onDesignerStoryTextChange,
  onDesignerStoryRichChange,
  onDesignerUnlinkTextFrame,
  onDesignerTypographyChange,
  designerHistoryBridge,
  designerClipboardRef,
  designerPagesRail,
  designerMultipageVectorPdfExport,
  designerFitToViewNonce = 0,
  designerSkipAutoNodeExportOnClose = false,
}: FreehandStudioProps) {

  // ── Core state ─────────────────────────────────────────────────────
  const [objects, setObjects] = useState<FreehandObject[]>(() =>
    initialObjects.length > 0
      ? (initialObjects.map((o) => ({ ...o, fill: migrateFill((o as FreehandObject).fill as unknown) })) as FreehandObject[])
      : [],
  );
  /** Un solo pliego por instancia; tamaño lo define el padre (Designer: página activa). */
  const artboards = useMemo((): Artboard[] => {
    const raw = initialArtboards ?? [];
    if (raw.length === 0) {
      return [createArtboard({ name: "Page 1", x: 0, y: 0, width: 595, height: 842, background: "#ffffff" })];
    }
    return raw.map((a) => createArtboard(a));
  }, [initialArtboards]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const studioShellRef = useRef<HTMLDivElement>(null);
  usePreventBrowserPinchZoom(studioShellRef);

  // Pen tool
  const [penPoints, setPenPoints] = useState<BezierPoint[]>([]);
  const [isPenDrawing, setIsPenDrawing] = useState(false);
  const [penDragging, setPenDragging] = useState(false);
  /** Posición en lienzo del cursor para la línea guía (tramo siguiente antes de clic). */
  const [penHoverCanvas, setPenHoverCanvas] = useState<Point | null>(null);
  /** Cursor dentro del radio de cierre sobre el primer ancla (mismo criterio que el clic). */
  const penHoverNearPathStart = useMemo(() => {
    if (!penHoverCanvas || penDragging || !isPenDrawing || penPoints.length < 2) return false;
    return dist(penHoverCanvas, penPoints[0]!.anchor) < PEN_CLOSE_TO_START_PX / viewport.zoom;
  }, [penHoverCanvas, penDragging, isPenDrawing, penPoints, viewport.zoom]);

  /** Modal ampliado para editar historia del marco de texto (oculta el panel Propiedades mientras está abierto). */
  const [designerStoryModalOpen, setDesignerStoryModalOpen] = useState(false);
  const [designerStoryModalObjectId, setDesignerStoryModalObjectId] = useState<string | null>(null);
  const [designerStoryModalRect, setDesignerStoryModalRect] = useState({ x: 48, y: 64, w: 760, h: 560 });

  // Drag state
  const [dragState, setDragState] = useState<{
    type: "move" | "resize" | "pan" | "create" | "createText" | "createTextFrame" | "createImageFrame" | "directSelect" | "marquee" | "penHandle" | "rotate" | "gradient" | "guideMove" | "guidePull" | "imageContentPan" | "imageContentResize";
    startX: number;
    startY: number;
    startCanvas?: Point;
    currentCanvas?: Point;
    svpX?: number; svpY?: number;
    positions?: Map<string, Point>;
    pathPointsMap?: Map<string, BezierPoint[]>;
    handle?: string;
    bounds?: Rect;
    /** Initial OBB when resize/rotate started (for oriented transform UI). */
    initialOrientedFrame?: OrientedSelectionFrame;
    /** Deep copy of selected objects at resize start — transforms must not compound per frame. */
    resizeSnapshot?: Map<string, FreehandObject>;
    allBounds?: Map<string, Rect>;
    createType?: "rect" | "ellipse";
    createOrigin?: Point;
    gradientHandle?: "linA" | "linB" | "radC" | "radR" | "stop";
    gradientPrimaryId?: string;
    gradientStopIndex?: number;
    dsObjId?: string;
    /** Si el path editado es la máscara de un `clippingContainer`, el id del contenedor (puntos en local). */
    dsClipContainerId?: string;
    dsPtIdx?: number;
    dsHtType?: "anchor" | "handleIn" | "handleOut";
    dsStartPt?: Point;
    marqueeOrigin?: Point;
    snapDelta?: Point;
    shiftKey?: boolean;
    rotateCenter?: Point;
    rotateStartAngle?: number;
    rotateInitialRotations?: Map<string, number>;
    /** Copia profunda al inicio del gesto; la rotación se calcula desde aquí (pivote = centro de selección). */
    rotateInitialSnapshots?: Map<string, FreehandObject>;
    /** Alt+arrastre: al soltar, memorizar el delta para ⌘D (paso repetido). */
    duplicateMove?: boolean;
    /** Inicio de `e,f` en paths importados (matrix) para arrastre sin acumular mal. */
    pathSvgMatrixStart?: Map<string, { e: number; f: number }>;
    guideId?: string;
    guideOrientation?: "vertical" | "horizontal";
    guideStartPos?: number;
    /** Arrastre desde regla (Designer): posición borrador en mundo antes de soltar. */
    draftPos?: number;
    /** Designer: arrastrar bitmap dentro del marco. */
    imageFrameId?: string;
    startOffsetX?: number;
    startOffsetY?: number;
    imageCorner?: "nw" | "ne" | "sw" | "se";
  } | null>(null);

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  /** Gesto de guía activo (refs síncronos; no depender de que React haya hecho commit de dragState). */
  type GuideGestureRefState =
    | { kind: "pull"; orientation: "vertical" | "horizontal" }
    | {
        kind: "move";
        guideId: string;
        orientation: "vertical" | "horizontal";
        startWorld: number;
        startClientX: number;
        startClientY: number;
      };
  const guideGestureRef = useRef<GuideGestureRefState | null>(null);
  /** Borrador / soltar: posición en mundo para guía nueva desde regla. */
  const guidePullDraftRef = useRef<{ orientation: "vertical" | "horizontal"; draftPos: number } | null>(null);
  const guideWindowListenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

  /** Designer: edición en lienzo del contenido (límites visibles, pan/escala). */
  const [imageFrameContentEditId, setImageFrameContentEditId] = useState<string | null>(null);
  /** Pegar dentro / aislamiento de contenido: transformar objeto como bitmap en marco de imagen. */
  const [clipContentEditId, setClipContentEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFrameContentEditId) return;
    if (!selectedIds.has(imageFrameContentEditId)) setImageFrameContentEditId(null);
  }, [selectedIds, imageFrameContentEditId]);

  useEffect(() => {
    if (!clipContentEditId) return;
    if (!selectedIds.has(clipContentEditId)) setClipContentEditId(null);
  }, [selectedIds, clipContentEditId]);

  /** Paso de duplicado (⌘D): por defecto 20×20 px mundo; tras Alt+arrastre copia = último desplazamiento. */
  const duplicateStepRef = useRef({ dx: 20, dy: 20 });

  /** Atajo de teclado → herramienta de creación: tiempo del keydown (`e.code`) para “mantener = temporal, soltar → V”. */
  const shapeShortcutKeyDownAtRef = useRef<Partial<Record<string, number>>>({});
  const SHAPE_SHORTCUT_HOLD_MS = 200;

  // Layer drag reorder
  const [layerDragId, setLayerDragId] = useState<string | null>(null);
  const [layerDropTarget, setLayerDropTarget] = useState<string | null>(null);

  /** Multi-select: object that gets primary handles / full opacity. */
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  /** Object under cursor (canvas). */
  const [hoverCanvasId, setHoverCanvasId] = useState<string | null>(null);
  /** Layer row hover (panel). */
  const [layerHoverId, setLayerHoverId] = useState<string | null>(null);
  /** Panel de capas: plegado por defecto abajo en la columna derecha. */
  const [layersPanelExpanded, setLayersPanelExpanded] = useState(false);
  /** Quick fill/stroke popover: which channel is being edited from canvas. */
  const [quickEditMode, setQuickEditMode] = useState<"fill" | "stroke" | null>(null);
  /** Lienzo a pantalla completa: solo caja de transformación en el SVG; P alterna. */
  const [canvasZenMode, setCanvasZenMode] = useState(false);

  // Live boolean preview during isolation editing
  const [livePreview, setLivePreview] = useState<{ dataUrl: string; bounds: Rect } | null>(null);

  // Direct-select: selected anchor points
  const [selectedPoints, setSelectedPoints] = useState<Map<string, Set<number>>>(new Map());

  // History (optional designerSnap = full Designer document for undo with threaded text / image frames)
  type HistoryEntry = { objects: FreehandObject[]; sel: string[]; designerSnap?: unknown };
  const historyRef = useRef<HistoryEntry[]>([
    {
      objects:
        initialObjects.length > 0
          ? (initialObjects.map((o) => ({ ...o, fill: migrateFill((o as FreehandObject).fill as unknown) })) as FreehandObject[])
          : [],
      sel: [],
    },
  ]);
  const historyIdxRef = useRef(0);
  const designerHistoryInitRef = useRef(false);
  const [, forceRender] = useState(0);

  // Próxima forma / pluma: se actualiza al cambiar la selección primaria (o al editar ese objeto)
  const [fillColor, setFillColor] = useState("#6366f1");
  const [strokeColor, setStrokeColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeLinecap, setStrokeLinecap] = useState<"butt" | "round" | "square">("round");
  const [strokeLinejoin, setStrokeLinejoin] = useState<"miter" | "round" | "bevel">("round");
  const [strokeDasharray, setStrokeDasharray] = useState("");

  const [paletteTarget, setPaletteTarget] = useState<"fill" | "stroke">("fill");
  const [savedPaletteColors, setSavedPaletteColors] = useState<string[]>([]);

  useEffect(() => {
    setSavedPaletteColors(loadSavedPaletteFromStorage());
  }, []);

  useEffect(() => {
    persistSavedPalette(savedPaletteColors);
  }, [savedPaletteColors]);

  const documentColorStats = useMemo(
    () => extractDocumentColorStats(objects, artboards.map((a) => a.background)),
    [objects, artboards],
  );

  // UI state
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; canvas?: Point } | null>(null);
  const [textEditingId, setTextEditingId] = useState<string | null>(null);
  const textEditingIdRef = useRef(textEditingId);
  textEditingIdRef.current = textEditingId;
  const [showGrid, setShowGrid] = useState(true);
  const [layoutGuides, setLayoutGuides] = useState<LayoutGuide[]>(() => initialLayoutGuides ?? []);
  const [showLayoutGuides, setShowLayoutGuides] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalScope, setExportModalScope] = useState<"selection" | "full">("selection");
  const [toast, setToast] = useState<string | null>(null);
  const [exportFlash, setExportFlash] = useState<ExportRect | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState<SnapVisual[]>([]);

  // Isolation mode for BooleanGroups
  const [isolationDepth, setIsolationDepth] = useState(0);
  const isolationStackRef = useRef<IsolationFrame[]>([]);

  const isClipContentIsolation = useMemo(() => {
    if (isolationDepth === 0) return false;
    const top = isolationStackRef.current[isolationStackRef.current.length - 1];
    return !!(top && top.kind === "clipping" && top.editMode === "content");
  }, [isolationDepth, objects]);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Último tamaño del contenedor del lienzo (recentrar vista al redimensionar / modo P). */
  const lastCanvasContainerSizeRef = useRef({ w: 0, h: 0 });
  /** Hit-test para soltar guías sobre las reglas (Designer). */
  const designerRulerHorizRef = useRef<HTMLDivElement | null>(null);
  const designerRulerVertRef = useRef<HTMLDivElement | null>(null);
  const designerRulerCornerRef = useRef<HTMLDivElement | null>(null);
  /** Tamaño del viewport del lienzo (para reglas en px, solo designer). */
  const [designerCanvasViewportSize, setDesignerCanvasViewportSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!designerMode) return;
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      setDesignerCanvasViewportSize({ w: el.clientWidth, h: el.clientHeight });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designerMode]);
  /** Designer: sección «Marco de imagen» en el panel derecho (scroll en doble clic). */
  const designerImageFramePropsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const customFontInputRef = useRef<HTMLInputElement>(null);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const selectedPointsRef = useRef(selectedPoints);
  selectedPointsRef.current = selectedPoints;
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const artboardsRef = useRef(artboards);
  artboardsRef.current = artboards;
  const layoutGuidesRef = useRef<LayoutGuide[]>(layoutGuides);
  layoutGuidesRef.current = layoutGuides;

  // ── History helpers (using refs to avoid stale closures) ──────────

  const pushHistory = useCallback(
    (newObjects: FreehandObject[], newSel: Set<string>) => {
      const h = historyRef.current;
      const idx = historyIdxRef.current;
      let designerSnap: unknown = undefined;
      if (designerHistoryBridge) {
        try {
          designerSnap = designerHistoryBridge.capture(newObjects);
        } catch {
          /* noop */
        }
      }
      historyRef.current = [
        ...h.slice(0, idx + 1),
        { objects: [...newObjects], sel: Array.from(newSel), designerSnap },
      ];
      historyIdxRef.current = idx + 1;
    },
    [designerHistoryBridge],
  );

  const pushHistoryRef = useRef(pushHistory);
  pushHistoryRef.current = pushHistory;

  const directSelectBakeKey = useMemo(() => Array.from(selectedIds).sort().join(","), [selectedIds]);

  /** Trazo solo-`svgPathD`, rectángulo o elipse → puntos Bézier al usar Selección directa (A). */
  useLayoutEffect(() => {
    if (activeTool !== "directSelect") return;
    const sel = selectedIdsRef.current;
    void Promise.all([import("./freehand/svg-path-bake-paper"), import("./freehand/primitive-shape-bake-paper")]).then(
      ([{ bakeSvgPathObjectToBezier }, { bakeRectToPath, bakeEllipseToPath }]) => {
        setObjects((prev) => {
          const next = prev.map((o) => {
            if (!sel.has(o.id)) return o;
            if (o.type === "path") {
              const po = o as PathObject;
              if (!po.svgPathD || (po.points && po.points.length >= 2)) return o;
              const baked = bakeSvgPathObjectToBezier(po as unknown as import("./freehand/svg-path-bake-paper").SvgPathBakeInput);
              return (baked as PathObject | null) ?? o;
            }
            if (o.type === "rect") {
              const r = o as RectObject;
              if (r.isImageFrame) return o;
              return bakeRectToPath(r) ?? o;
            }
            if (o.type === "ellipse") {
              return bakeEllipseToPath(o as EllipseObject) ?? o;
            }
            return o;
          });
          if (next.every((o, i) => o === prev[i])) return prev;
          pushHistoryRef.current(next, sel);
          return next;
        });
      },
    );
  }, [activeTool, directSelectBakeKey]);

  useEffect(() => {
    if (!designerHistoryBridge || designerHistoryInitRef.current) return;
    designerHistoryInitRef.current = true;
    const h0 = historyRef.current[0];
    if (h0) {
      try {
        h0.designerSnap = designerHistoryBridge.capture(h0.objects);
      } catch {
        /* noop */
      }
    }
  }, [designerHistoryBridge]);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const entry = historyRef.current[historyIdxRef.current]!;
    if (entry.designerSnap != null && designerHistoryBridge) {
      designerHistoryBridge.restore(entry.designerSnap);
    }
    setObjects([...entry.objects]);
    setSelectedIds(new Set(entry.sel));
    forceRender((n) => n + 1);
  }, [designerHistoryBridge]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const entry = historyRef.current[historyIdxRef.current]!;
    if (entry.designerSnap != null && designerHistoryBridge) {
      designerHistoryBridge.restore(entry.designerSnap);
    }
    setObjects([...entry.objects]);
    setSelectedIds(new Set(entry.sel));
    forceRender((n) => n + 1);
  }, [designerHistoryBridge]);

  useEffect(() => {
    if (!studioApiRef) return;
    studioApiRef.current = {
      patchObject: (id, patch) => {
        queueMicrotask(() => {
          setObjects((prev) => {
            const idx = prev.findIndex((o) => o.id === id);
            if (idx < 0) return prev;
            const obj = prev[idx]!;
            let changed = false;
            for (const k of Object.keys(patch)) {
              if ((obj as any)[k] !== (patch as any)[k]) {
                changed = true;
                break;
              }
            }
            if (!changed) return prev;
            const next = [...prev];
            next[idx] = { ...obj, ...patch } as FreehandObject;
            return next;
          });
        });
      },
      addObject: (obj) => {
        queueMicrotask(() => {
          setObjects((prev) => {
            if (prev.some((o) => o.id === obj.id)) return prev;
            const next = [...prev, obj];
            pushHistoryRef.current(next, new Set([obj.id]));
            return next;
          });
        });
      },
      getObjects: () => objectsRef.current,
      getTextEditingId: () => textEditingIdRef.current,
      setSelectedIds: (ids: Set<string>) => {
        queueMicrotask(() => setSelectedIds(ids));
      },
      getExportSessionKey: () => nodeId,
      getVectorPdfMarkupForCurrentPage: async () => {
        const svg = svgRef.current;
        if (!svg) return "";
        const objs = objectsRef.current;
        const abs = artboardsRef.current;
        const bounds = resolveSceneExportBounds(objs, abs);
        const ab = pickPrimaryArtboard(abs, null);
        const bg: "transparent" | string = ab?.background ?? "transparent";
        let strRaw = buildStandaloneSvgFromCanvasDom(svg, {
          exportIds: null,
          bounds,
          scale: 1,
          background: bg,
        });
        const textObjs = objs.filter((o): o is TextObject => o.type === "text" && o.visible && !o.isClipMask);
        if (textObjs.length > 0) {
          strRaw = await substituteTextWithOutlinedPathsInSvg(
            strRaw,
            textObjs.map(textObjectToVectorPdfOutlineItem),
          );
        }
        return strRaw;
      },
      getNodePreviewPngDataUrl: async (opts?: { maxSide?: number }) => {
        const svg = svgRef.current;
        if (!svg) return null;
        const objs = objectsRef.current;
        const abs = artboardsRef.current;
        const bounds = resolveSceneExportBounds(objs, abs);
        if (bounds.w < 1 || bounds.h < 1) return null;
        const ab = pickPrimaryArtboard(abs, null);
        const bg: "transparent" | string = ab?.background ?? "transparent";
        const maxSide = opts?.maxSide ?? 800;
        const scale = Math.min(1, maxSide / Math.max(bounds.w, bounds.h));
        const strRaw = buildStandaloneSvgFromCanvasDom(svg, {
          exportIds: null,
          bounds,
          scale,
          background: bg,
        });
        const str = substituteNativeTextForRasterExport(strRaw, objs);
        const cw = Math.max(1, Math.round(bounds.w * scale));
        const ch = Math.max(1, Math.round(bounds.h * scale));
        const canvas = await svgStringToCanvasSafe(str, cw, ch);
        return canvasToPngDataUrlSafe(canvas);
      },
    };
    return () => {
      if (studioApiRef) studioApiRef.current = null;
    };
  }, [studioApiRef, nodeId]);

  // ── Sync to node ──────────────────────────────────────────────────

  const syncRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => {
      let fullObjects = objects;
      for (let i = isolationStackRef.current.length - 1; i >= 0; i--) {
        const frame = isolationStackRef.current[i];
        if (frame.kind === "clipping") {
          const parentC = frame.parentObjects.find((o) => o.id === frame.containerId) as ClippingContainerObject | undefined;
          if (!parentC) continue;
          let mask = parentC.mask;
          let contentLayers = fullObjects;
          if (frame.editMode === "mask") {
            const m = fullObjects[0] as ClipMaskShape | undefined;
            if (m) mask = m;
            contentLayers = frame.storedContent ?? [];
          }
          const ub = clipContainerOuterBoundsFromMask(mask);
          const merged: ClippingContainerObject = {
            ...parentC,
            width: ub.w,
            height: ub.h,
            mask: offsetShapeWorldToLocal(mask, ub.x, ub.y),
            content: contentLayers.map((c) => offsetObjectWorldToLocal(c, ub.x, ub.y)),
          };
          fullObjects = frame.parentObjects.map((o) =>
            o.id === frame.containerId ? merged : o
          );
        } else if (frame.kind === "vectorGroup") {
          fullObjects = frame.parentObjects.map((o) => {
            const u = fullObjects.find((c) => c.id === o.id);
            return u ? u : o;
          });
        } else {
          fullObjects = frame.parentObjects.map((o) =>
            o.id === frame.groupId ? { ...o, children: fullObjects } : o
          );
        }
      }
      onUpdateObjects(fullObjects);
    }, 500);
    return () => clearTimeout(syncRef.current);
  }, [objects, onUpdateObjects]);

  /** Sincronizar guías al documento padre sin debounce (pocas actualizaciones; evita perder guías al cambiar de página). */
  useEffect(() => {
    if (!onUpdateLayoutGuides) return;
    onUpdateLayoutGuides(layoutGuides);
  }, [layoutGuides, onUpdateLayoutGuides]);

  // ── Live boolean preview during isolation ───────────────────────

  const livePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (isolationDepth === 0) {
      setLivePreview(null);
      return;
    }
    const stack = isolationStackRef.current;
    if (stack.length === 0) return;
    const frame = stack[stack.length - 1];
    if (frame.kind === "clipping" || frame.kind === "vectorGroup") {
      setLivePreview(null);
      return;
    }
    const parentGroup = frame.parentObjects.find((o) => o.id === frame.groupId) as BooleanGroupObject | undefined;
    if (!parentGroup) return;

    clearTimeout(livePreviewTimerRef.current);
    livePreviewTimerRef.current = setTimeout(async () => {
      try {
        const result = await computeBooleanCachedResult(objects, parentGroup.operation);
        setLivePreview(result);
      } catch { /* ignore compute errors */ }
    }, 300);
    return () => clearTimeout(livePreviewTimerRef.current);
  }, [objects, isolationDepth]);

  // ── Coordinate transform ──────────────────────────────────────────

  const screenToCanvas = useCallback((sx: number, sy: number): Point => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return { x: sx, y: sy };
    return { x: (sx - r.left - viewport.x) / viewport.zoom, y: (sy - r.top - viewport.y) / viewport.zoom };
  }, [viewport]);

  const screenToCanvasRef = useRef(screenToCanvas);
  screenToCanvasRef.current = screenToCanvas;

  const isClientInDesignerRulerZones = useCallback((clientX: number, clientY: number) => {
    if (!designerMode) return false;
    const inR = (el: HTMLDivElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    };
    return inR(designerRulerHorizRef.current) || inR(designerRulerVertRef.current) || inR(designerRulerCornerRef.current);
  }, [designerMode]);

  const teardownGuideWindowListeners = useCallback(() => {
    const L = guideWindowListenersRef.current;
    if (!L) return;
    window.removeEventListener("pointermove", L.move, true);
    window.removeEventListener("pointerup", L.up, true);
    window.removeEventListener("pointercancel", L.up, true);
    guideWindowListenersRef.current = null;
  }, []);

  const applyGuidePointer = useCallback((clientX: number, clientY: number) => {
    const gg = guideGestureRef.current;
    if (!gg) return;
    const p = screenToCanvasRef.current(clientX, clientY);
    if (gg.kind === "pull") {
      const next = gg.orientation === "vertical" ? p.x : p.y;
      guidePullDraftRef.current = { orientation: gg.orientation, draftPos: next };
      setDragState((prev) => {
        if (prev?.type === "guidePull") return { ...prev, draftPos: next };
        return {
          type: "guidePull",
          startX: clientX,
          startY: clientY,
          guideOrientation: gg.orientation,
          draftPos: next,
        };
      });
      return;
    }
    const z = viewportRef.current.zoom;
    const ddx = (clientX - gg.startClientX) / z;
    const ddy = (clientY - gg.startClientY) / z;
    const id = gg.guideId;
    const start = gg.startWorld;
    const orient = gg.orientation;
    setLayoutGuides((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        if (orient === "vertical") return { ...g, position: start + ddx };
        return { ...g, position: start + ddy };
      }),
    );
  }, []);

  const finishGuideGesture = useCallback(
    (clientX: number, clientY: number) => {
      setSnapGuides([]);
      const gg = guideGestureRef.current;
      const draftSnapshot = guidePullDraftRef.current;

      if (!gg) {
        teardownGuideWindowListeners();
        const ds = dragStateRef.current;
        if (ds?.type === "guidePull" || ds?.type === "guideMove") {
          guidePullDraftRef.current = null;
          setDragState(null);
        }
        return;
      }

      guideGestureRef.current = null;
      guidePullDraftRef.current = null;
      teardownGuideWindowListeners();

      if (gg.kind === "pull") {
        if (designerMode && isClientInDesignerRulerZones(clientX, clientY)) {
          /* soltar sobre reglas: descartar */
        } else if (draftSnapshot !== null) {
          setLayoutGuides((p) => [...p, createLayoutGuide(draftSnapshot.orientation, draftSnapshot.draftPos)]);
          setShowLayoutGuides(true);
        }
        setDragState(null);
        return;
      }

      if (gg.kind === "move" && designerMode && isClientInDesignerRulerZones(clientX, clientY)) {
        setLayoutGuides((prev) => prev.filter((x) => x.id !== gg.guideId));
      }
      setDragState(null);
    },
    [designerMode, isClientInDesignerRulerZones, teardownGuideWindowListeners],
  );

  const setupGuideWindowListeners = useCallback(() => {
    teardownGuideWindowListeners();
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      applyGuidePointer(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      finishGuideGesture(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    guideWindowListenersRef.current = { move: onMove, up: onUp };
  }, [teardownGuideWindowListeners, applyGuidePointer, finishGuideGesture]);

  useEffect(
    () => () => {
      teardownGuideWindowListeners();
    },
    [teardownGuideWindowListeners],
  );

  const handleDesignerGuidePullStart = useCallback(
    (orientation: "vertical" | "horizontal", e: React.PointerEvent) => {
      if (e.button !== 0) return;
      guideGestureRef.current = { kind: "pull", orientation };
      const p = screenToCanvas(e.clientX, e.clientY);
      const draftPos = orientation === "vertical" ? p.x : p.y;
      guidePullDraftRef.current = { orientation, draftPos };
      setDragState({
        type: "guidePull",
        startX: e.clientX,
        startY: e.clientY,
        guideOrientation: orientation,
        draftPos,
      });
      setupGuideWindowListeners();
    },
    [screenToCanvas, setupGuideWindowListeners],
  );

  // ── Derived ───────────────────────────────────────────────────────

  const selectedObjects = useMemo(() => objects.filter((o) => selectedIds.has(o.id)), [objects, selectedIds]);
  const firstSelected = selectedObjects[0] ?? null;

  const styleSourceForCreation = useMemo((): FreehandObject | null => {
    if (selectedObjects.length === 0) return null;
    if (primarySelectedId) {
      const p = selectedObjects.find((x) => x.id === primarySelectedId);
      if (p) return p;
    }
    return selectedObjects[0] ?? null;
  }, [selectedObjects, primarySelectedId]);

  useEffect(() => {
    const o = styleSourceForCreation;
    if (!o) return;
    const snap = creationStyleSnapshotFromObject(o);
    if (!snap) return;
    if (snap.fillColor) setFillColor(snap.fillColor);
    if (snap.strokeColor) setStrokeColor(snap.strokeColor);
    setStrokeWidth(snap.strokeWidth);
    setStrokeLinecap(snap.strokeLinecap);
    setStrokeLinejoin(snap.strokeLinejoin);
    setStrokeDasharray(snap.strokeDasharray);
  }, [styleSourceForCreation]);

  const canLinkTextToPath = useMemo(
    () =>
      selectedIds.size === 2 &&
      selectedObjects.filter((o) => o.type === "path").length === 1 &&
      selectedObjects.filter((o) => o.type === "text").length === 1,
    [selectedIds, selectedObjects],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const t =
      firstSelected?.type === "text"
        ? (firstSelected as TextObject)
        : firstSelected?.type === "textOnPath"
          ? (firstSelected as TextOnPathObject)
          : null;
    if (!t) return;
    const fam = t.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
    if (!fam) return;
    let el = document.getElementById("fh-gfont-active") as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement("link");
      el.id = "fh-gfont-active";
      el.rel = "stylesheet";
      document.head.appendChild(el);
    }
    el.href = googleFontStylesheetHref(fam);
  }, [firstSelected]);

  useEffect(() => {
    if (selectedIds.size === 0) setPrimarySelectedId(null);
    else if (selectedIds.size === 1) setPrimarySelectedId(Array.from(selectedIds)[0] ?? null);
  }, [selectedIds]);

  useEffect(() => {
    if (dragState) setHoverCanvasId(null);
  }, [dragState]);

  useEffect(() => {
    if (quickEditMode && selectedIds.size !== 1) setQuickEditMode(null);
  }, [selectedIds, quickEditMode]);

  useEffect(() => {
    if (!designerStoryModalOpen || !designerStoryModalObjectId) return;
    if (!firstSelected || firstSelected.id !== designerStoryModalObjectId) {
      setDesignerStoryModalOpen(false);
      setDesignerStoryModalObjectId(null);
    }
  }, [designerStoryModalOpen, designerStoryModalObjectId, firstSelected]);

  useEffect(() => {
    if (!designerStoryModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDesignerStoryModalOpen(false);
        setDesignerStoryModalObjectId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [designerStoryModalOpen]);

  const groupBounds = useMemo(() => getGroupBounds(selectedObjects), [selectedObjects]);
  const selectionFrame = useMemo(() => computeOrientedSelectionFrame(selectedObjects), [selectedObjects]);

  /** Ocultar caja blanca de selección cuando editamos solo el contenido del marco de imagen (overlay ámbar). */
  const suppressSelectionForImageContentEdit = useMemo(
    () =>
      designerMode &&
      imageFrameContentEditId != null &&
      (activeTool === "select" || activeTool === "directSelect") &&
      selectedObjects.length === 1 &&
      selectedObjects[0]?.id === imageFrameContentEditId &&
      Boolean(selectedObjects[0]?.isImageFrame) &&
      Boolean((selectedObjects[0] as RectObject | undefined)?.imageFrameContent?.src),
    [designerMode, imageFrameContentEditId, activeTool, selectedObjects],
  );

  /** Mismo patrón que marco de imagen: contenido pegado dentro de clip (aislamiento contenido). */
  const suppressSelectionForClipContentEdit = useMemo(
    () =>
      isClipContentIsolation &&
      clipContentEditId != null &&
      (activeTool === "select" || activeTool === "directSelect") &&
      selectedObjects.length === 1 &&
      selectedObjects[0]?.id === clipContentEditId,
    [isClipContentIsolation, clipContentEditId, activeTool, selectedObjects],
  );

  const suppressOuterTransformHandles =
    suppressSelectionForImageContentEdit || suppressSelectionForClipContentEdit;

  /** Vertex modes of currently selected anchors (direct select). */
  const selectedAnchorVertexHint = useMemo(() => {
    if (selectedPoints.size === 0) return null;
    const modes = new Set<VertexMode>();
    const pathForPointsId = (oid: string): PathObject | undefined => {
      const root = objects.find((x) => x.id === oid);
      if (root?.type === "path") return root as PathObject;
      for (const x of objects) {
        if (x.type !== "clippingContainer") continue;
        const c = x as ClippingContainerObject;
        if (c.mask.type === "path" && (c.mask as PathObject).id === oid) return c.mask as PathObject;
      }
      return undefined;
    };
    selectedPoints.forEach((idxs, oid) => {
      const po = pathForPointsId(oid);
      if (!po) return;
      idxs.forEach((pi) => modes.add(getVertexMode(po.points[pi])));
    });
    if (modes.size === 0) return null;
    const unified = modes.size === 1 ? [...modes][0]! : null;
    return { modes: [...modes], unified };
  }, [selectedPoints, objects]);

  // Resolve group: if an object has a groupId, selecting it selects the whole group (except inside vector-group isolation)
  const resolveSelection = useCallback((objId: string, shiftKey: boolean): Set<string> => {
    const objs = objectsRef.current;
    const sel = selectedIdsRef.current;
    const obj = objs.find((o) => o.id === objId);
    if (!obj) return sel;
    const vecIsoGid = vectorIsolationGroupId(isolationStackRef.current);
    const gid = obj.groupId;
    const expandGroup = Boolean(gid && !(vecIsoGid && gid === vecIsoGid));
    const groupMembers = expandGroup
      ? objs.filter((o) => o.groupId === gid).map((o) => o.id)
      : [objId];

    if (shiftKey) {
      const s = new Set(sel);
      const allIn = groupMembers.every((id) => s.has(id));
      if (allIn) groupMembers.forEach((id) => s.delete(id));
      else groupMembers.forEach((id) => s.add(id));
      return s;
    }
    return new Set(groupMembers);
  }, []);

  const fitAllCanvas = useCallback(() => {
    const b = resolveFitViewBounds(objects, artboards);
    const el = containerRef.current;
    if (!el) return;
    const rw = el.clientWidth, rh = el.clientHeight;
    if (b.w < 2 || b.h < 2) return;
    const margin = 40;
    const zx = (rw - margin * 2) / b.w, zy = (rh - margin * 2) / b.h;
    const z = clamp(Math.min(zx, zy), 0.05, 8);
    setViewport({
      zoom: z,
      x: margin - b.x * z + (rw - margin * 2 - b.w * z) / 2,
      y: margin - b.y * z + (rh - margin * 2 - b.h * z) / 2,
    });
  }, [objects, artboards]);

  const fitAllCanvasRef = useRef(fitAllCanvas);
  fitAllCanvasRef.current = fitAllCanvas;

  /** Tras mostrar de nuevo paneles (salir de modo P), el contenedor cambia de tamaño; re-encajar el pliego como tras "Fit all". */
  const scheduleFitAllAfterLayout = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAllCanvasRef.current();
      });
    });
  }, []);

  useEffect(() => {
    if (!designerMode) return;
    if (designerFitToViewNonce === 0) return;
    const id = requestAnimationFrame(() => {
      fitAllCanvasRef.current();
    });
    return () => cancelAnimationFrame(id);
  }, [designerMode, designerFitToViewNonce]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const applyResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w < 4 || h < 4) return;
      const prev = lastCanvasContainerSizeRef.current;
      if (prev.w >= 4 && (prev.w !== w || prev.h !== h)) {
        setViewport((v) => {
          const worldCx = (prev.w / 2 - v.x) / v.zoom;
          const worldCy = (prev.h / 2 - v.y) / v.zoom;
          return { ...v, x: w / 2 - worldCx * v.zoom, y: h / 2 - worldCy * v.zoom };
        });
      }
      lastCanvasContainerSizeRef.current = { w, h };
    };
    applyResize();
    const ro = new ResizeObserver(applyResize);
    ro.observe(el);
    window.addEventListener("resize", applyResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", applyResize);
    };
  }, []);

  /** Entrar en modo P: el área del lienzo crece; centrar el pliego/contenido en pantalla (no solo el píxel que estaba en el centro). */
  useLayoutEffect(() => {
    if (!canvasZenMode) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;
        const rw = el.clientWidth, rh = el.clientHeight;
        if (rw < 4 || rh < 4) return;
        const b = resolveFitViewBounds(objectsRef.current, artboardsRef.current);
        if (b.w < 2 || b.h < 2) return;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        setViewport((v) => ({
          ...v,
          x: rw / 2 - cx * v.zoom,
          y: rh / 2 - cy * v.zoom,
        }));
        lastCanvasContainerSizeRef.current = { w: rw, h: rh };
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [canvasZenMode]);

  // ── Image import from file / drop / paste ─────────────────────────

  const importImageFile = useCallback((file: File, at?: Point) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 600;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w *= scale; h *= scale;
        }
        const ox = at?.x ?? 200;
        const oy = at?.y ?? 200;
        const newObj: ImageObject = {
          ...defaultObj({ name: `Image ${objectsRef.current.length + 1}` }),
          type: "image",
          x: ox - w / 2,
          y: oy - h / 2,
          width: w,
          height: h,
          fill: solidFill("none"), stroke: "none", strokeWidth: 0,
          src,
          intrinsicRatio: img.width / Math.max(img.height, 1),
        } as ImageObject;
        setObjects((prev) => {
          const next = [...prev, newObj];
          pushHistory(next, new Set([newObj.id]));
          return next;
        });
        setSelectedIds(new Set([newObj.id]));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [pushHistory]);

  const importSvgFile = useCallback(
    async (file: File, at?: Point) => {
      try {
        const text = await file.text();
        const { shapes, skipped } = parseSvgToShapes(text);
        if (shapes.length === 0) {
          setToast("No se pudo leer el SVG.");
          window.setTimeout(() => setToast(null), 3200);
          return;
        }
        const ab = pickPrimaryArtboard(artboardsRef.current, null);
        const fitInside = ab ? artboardToRect(ab) : null;
        let center: Point;
        if (at) center = at;
        else {
          const r = containerRef.current?.getBoundingClientRect();
          center = r ? screenToCanvas(r.left + r.width / 2, r.top + r.height / 2) : { x: 400, y: 300 };
        }
        const scaled = offsetAndScaleShapes(shapes, {
          newId: uid,
          targetCenter: center,
          fitInside,
        });
        const newObjs = await freehandObjectsFromSvgImportShapes(scaled);
        const ids = newObjs.map((o) => o.id);
        setObjects((prev) => {
          const next = [...prev, ...newObjs];
          pushHistory(next, new Set(ids));
          return next;
        });
        setSelectedIds(new Set(ids));
        if (skipped > 0) {
          setToast("Algunos elementos no pudieron importarse como vectores editables.");
          window.setTimeout(() => setToast(null), 4200);
        }
        window.setTimeout(() => {
          fitAllCanvas();
        }, 0);
      } catch {
        setToast("Error al importar el SVG.");
        window.setTimeout(() => setToast(null), 3200);
      }
    },
    [pushHistory, screenToCanvas, fitAllCanvas],
  );

  const handleDrop = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = screenToCanvas(e.clientX, e.clientY);
    for (const f of Array.from(e.dataTransfer.files)) {
      const lower = f.name.toLowerCase();
      if (f.type === "image/svg+xml" || lower.endsWith(".svg")) {
        void importSvgFile(f, pos);
      } else if (f.type.startsWith("image/")) {
        importImageFile(f, pos);
      }
    }
  }, [importImageFile, importSvgFile, screenToCanvas]);

  const handleDragOver = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) importImageFile(file);
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importImageFile]);

  // ── Pen finish ────────────────────────────────────────────────────

  const finishPenPath = useCallback((closed: boolean) => {
    setPenHoverCanvas(null);
    if (penPoints.length < 2) { setPenPoints([]); setIsPenDrawing(false); return; }
    const bounds = getPathBoundsFromPoints(penPoints);
    const pathObj: PathObject = {
      ...defaultObj({ name: `Path ${objects.length + 1}` }),
      type: "path",
      x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h,
      fill: closed ? solidFill(fillColor) : solidFill("none"),
      stroke: strokeColor, strokeWidth,
      strokeLinecap, strokeLinejoin, strokeDasharray,
      points: penPoints.map((p) => ({ ...p, vertexMode: p.vertexMode ?? "smooth" })),
      closed,
    } as PathObject;
    const next = [...objects, pathObj];
    setObjects(next);
    setSelectedIds(new Set([pathObj.id]));
    setPenPoints([]); setIsPenDrawing(false);
    if (closed) setActiveTool("select");
    pushHistory(next, new Set([pathObj.id]));
  }, [penPoints, objects, fillColor, strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray, pushHistory, setActiveTool]);

  // ── Object mutations ──────────────────────────────────────────────

  const updateSelectedProp = useCallback((key: string, value: any) => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.map((o) => sel.has(o.id) ? { ...o, [key]: value } : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  /** Misma mutación que `updateSelectedProp` pero sin apilar historial (p. ej. arrastre tipo scrub). */
  const updateSelectedPropSilent = useCallback((key: string, value: any) => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => prev.map((o) => (sel.has(o.id) ? { ...o, [key]: value } : o)));
  }, []);

  /** Un solo paso de deshacer al terminar un gesto de scrub. */
  const commitHistoryAfterScrub = useCallback(() => {
    pushHistory(objectsRef.current, selectedIdsRef.current);
  }, [pushHistory]);

  const TRANSFORM_DIM_MIN = 1;

  /** W/H con signo: negativo = espejo en ese eje (texto usa scaleX/Y). `silent` evita historial (scrub en vivo). */
  const applySignedDimension = useCallback(
    (dim: "width" | "height", raw: number, silent: boolean) => {
      const sel = selectedIdsRef.current;
      if (sel.size === 0) return;
      const mag = Math.max(TRANSFORM_DIM_MIN, Math.abs(raw));
      const neg = raw < 0;
      setObjects((prev) => {
        const next = prev.map((o) => {
          if (!sel.has(o.id)) return o;
          if (o.type === "text") {
            const t = o as TextObject;
            if (dim === "width") {
              const sx = t.scaleX ?? 1;
              const nextSx = neg ? -Math.abs(sx) : Math.abs(sx);
              return { ...t, width: mag, scaleX: nextSx };
            }
            const sy = t.scaleY ?? 1;
            const nextSy = neg ? -Math.abs(sy) : Math.abs(sy);
            return { ...t, height: mag, scaleY: nextSy };
          }
          if (dim === "width") return { ...o, width: mag, flipX: neg };
          return { ...o, height: mag, flipY: neg };
        });
        if (!silent) pushHistory(next, sel);
        return next;
      });
    },
    [pushHistory],
  );

  const replaceDocumentColorLive = useCallback((from: string, to: string) => {
    setObjects((prev) => replaceHexEverywhere(prev, from, to));
  }, []);

  const commitPaletteHistory = useCallback(() => {
    pushHistory(objectsRef.current, selectedIdsRef.current);
  }, [pushHistory]);

  const applyPaletteHex = useCallback(
    (hex: string) => {
      const t = paletteTarget;
      const sel = selectedIdsRef.current;
      if (sel.size === 0) {
        if (t === "fill") setFillColor(hex);
        else setStrokeColor(hex);
        return;
      }
      if (t === "stroke") {
        updateSelectedProp("stroke", hex);
        return;
      }
      setObjects((prev) => {
        const next = prev.map((o) => {
          if (!sel.has(o.id)) return o;
          if (o.type === "textOnPath") return { ...o, fill: hex };
          if (o.type === "booleanGroup" || o.type === "image") return o;
          return { ...o, fill: solidFill(hex) };
        });
        pushHistory(next, sel);
        return next;
      });
    },
    [paletteTarget, updateSelectedProp, pushHistory],
  );

  const updateSelectedFill = useCallback((updater: (f: FillAppearance) => FillAppearance) => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (!sel.has(o.id)) return o;
        if (o.type === "textOnPath") return o;
        return { ...o, fill: updater(migrateFill(o.fill)) };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const updateSelectedFillSilent = useCallback((updater: (f: FillAppearance) => FillAppearance) => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) =>
      prev.map((o) => {
        if (!sel.has(o.id)) return o;
        if (o.type === "textOnPath") return o;
        return { ...o, fill: updater(migrateFill(o.fill)) };
      }),
    );
  }, []);

  const objectClipboardRef = useRef<FreehandObject[] | null>(null);

  const copySelectedObjects = useCallback(() => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current.filter((o) => sel.has(o.id));
    if (objs.length === 0) return;
    const cloned = objs.map((o) => deepCloneFreehandObject(o, uid));
    objectClipboardRef.current = cloned;
    if (designerMode && designerClipboardRef) {
      designerClipboardRef.current = cloned;
    }
  }, [designerMode, designerClipboardRef]);

  const pasteClipboardObjects = useCallback(() => {
    const designerClip = designerClipboardRef?.current;
    const clip =
      designerMode && designerClip && designerClip.length > 0 ? designerClip : objectClipboardRef.current;
    if (!clip || clip.length === 0) return;
    const dupes = clip.map((o) => {
      const c = deepCloneFreehandObject(o, uid);
      return translateFreehandObject(c, 24, 24);
    });
    const next = [...objectsRef.current, ...dupes];
    const ns = new Set(dupes.map((d) => d.id));
    setObjects(next);
    setSelectedIds(ns);
    pushHistory(next, ns);
  }, [pushHistory]);

  const convertTextToOutlines = useCallback(async () => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    const t = objs.find((o) => sel.has(o.id) && o.type === "text") as TextObject | undefined;
    if (!t || !t.text.trim()) return;
    const fontRes = await loadFontForTextConversion({
      fontFamily: t.fontFamily,
      fontSize: t.fontSize,
      fontWeight: t.fontWeight,
    });
    if ("error" in fontRes) {
      setToast(FONT_CONVERSION_UNAVAILABLE);
      window.setTimeout(() => setToast(null), 3200);
      return;
    }
    const payloads = await textToGlyphPathPayloads(
      {
        name: t.name,
        text: t.text,
        textMode: t.textMode,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        fontKerning: t.fontKerning,
        textAlign: t.textAlign,
        paragraphIndent: t.paragraphIndent,
      },
      fontRes.font,
    );
    if (payloads.length === 0) {
      setToast(FONT_CONVERSION_UNAVAILABLE);
      window.setTimeout(() => setToast(null), 3200);
      return;
    }
    const gid = uid();
    const newPaths: PathObject[] = payloads.map((pl, i) => {
      const pts: BezierPoint[] =
        pl.points.length >= 2
          ? pl.points.map((p) => ({
              anchor: { ...p.anchor },
              handleIn: { ...p.handleIn },
              handleOut: { ...p.handleOut },
              vertexMode: p.vertexMode === "corner" || p.vertexMode === "cusp" ? p.vertexMode : "smooth",
            }))
          : [
              {
                anchor: { x: pl.x, y: pl.y },
                handleIn: { x: pl.x, y: pl.y },
                handleOut: { x: pl.x + 1, y: pl.y },
                vertexMode: "corner" as const,
              },
              {
                anchor: { x: pl.x + pl.width, y: pl.y + pl.height },
                handleIn: { x: pl.x + pl.width, y: pl.y + pl.height },
                handleOut: { x: pl.x + pl.width, y: pl.y + pl.height },
                vertexMode: "corner" as const,
              },
            ];
      return {
        ...defaultObj({ name: pl.name || `${t.name} ${i + 1}` }),
        type: "path" as const,
        x: pl.x,
        y: pl.y,
        width: pl.width,
        height: pl.height,
        fill: cloneFill(migrateFill(t.fill)),
        stroke: t.stroke,
        strokeWidth: t.strokeWidth,
        strokeLinecap: t.strokeLinecap,
        strokeLinejoin: t.strokeLinejoin,
        strokeDasharray: t.strokeDasharray,
        opacity: t.opacity,
        points: pts,
        closed: pl.closed,
        svgPathD: pl.svgPathD,
        groupId: gid,
      } as PathObject;
    });
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== t.id).concat(newPaths);
      pushHistory(next, new Set(newPaths.map((p) => p.id)));
      return next;
    });
    setSelectedIds(new Set(newPaths.map((p) => p.id)));
    setTextEditingId(null);
  }, [pushHistory]);

  const resetZoomCanvas = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: 1 }));
  }, []);

  const deleteSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.filter((o) => !sel.has(o.id));
      pushHistory(next, new Set());
      return next;
    });
    setSelectedIds(new Set());
  }, [pushHistory]);

  const cutSelectedObjects = useCallback(() => {
    copySelectedObjects();
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.filter((o) => !sel.has(o.id));
      pushHistory(next, new Set());
      return next;
    });
    setSelectedIds(new Set());
  }, [copySelectedObjects, pushHistory]);

  const duplicateSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    if (sel.size === 0) return;
    const { dx, dy } = duplicateStepRef.current;
    const dupes = objs.filter((o) => sel.has(o.id))
      .map((o) => translateFreehandObject(deepCloneFreehandObject(o, uid), dx, dy));
    const next = [...objs, ...dupes];
    const ns = new Set(dupes.map((d) => d.id));
    setObjects(next); setSelectedIds(ns);
    pushHistory(next, ns);
  }, [pushHistory]);

  const bringForward = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = [...prev];
      const ids = Array.from(sel);
      for (let j = ids.length - 1; j >= 0; j--) {
        const idx = next.findIndex((o) => o.id === ids[j]);
        if (idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      }
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const sendBackward = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = [...prev];
      for (const sid of sel) {
        const idx = next.findIndex((o) => o.id === sid);
        if (idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      }
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const bringToFront = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const rest = prev.filter((o) => !sel.has(o.id));
      const moved = prev.filter((o) => sel.has(o.id));
      const next = [...rest, ...moved];
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const sendToBack = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const moved = prev.filter((o) => sel.has(o.id));
      const rest = prev.filter((o) => !sel.has(o.id));
      const next = [...moved, ...rest];
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Grouping ──────────────────────────────────────────────────────

  const groupSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size < 2) return;
    const gid = uid();
    setObjects((prev) => {
      const next = prev.map((o) => sel.has(o.id) ? { ...o, groupId: gid } : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const ungroupSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => sel.has(o.id) ? { ...o, groupId: undefined } : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Clipping mask ─────────────────────────────────────────────────

  const createClipMask = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size < 2) return;
    setObjects((prev) => {
      const selArr = prev.filter((o) => sel.has(o.id));
      const clipObj = selArr[selArr.length - 1];
      const clippedIds = selArr.slice(0, -1).map((o) => o.id);
      const next = prev.map((o) => {
        if (o.id === clipObj.id) return { ...o, isClipMask: true };
        if (clippedIds.includes(o.id)) return { ...o, clipMaskId: clipObj.id };
        return o;
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const releaseClipMask = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const selArr = prev.filter((o) => sel.has(o.id));
      const clipIds = new Set<string>();
      selArr.forEach((o) => { if (o.clipMaskId) clipIds.add(o.clipMaskId); if (o.isClipMask) clipIds.add(o.id); });
      if (clipIds.size === 0) return prev;
      const next = prev.map((o) => {
        if (clipIds.has(o.id)) return { ...o, isClipMask: false };
        if (o.clipMaskId && clipIds.has(o.clipMaskId)) return { ...o, clipMaskId: undefined };
        return o;
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Paste Inside (non-destructive clipping container) ───────────

  const pasteInside = useCallback(() => {
    const designerClip = designerClipboardRef?.current;
    const clip =
      designerMode && designerClip && designerClip.length > 0 ? designerClip : objectClipboardRef.current;
    if (!clip || clip.length === 0) return;
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const objs = objectsRef.current;
    const maskSrc = objs.find((o) => o.id === Array.from(sel)[0]);
    if (!maskSrc || !isValidPasteInsideMask(maskSrc)) return;
    const maskClone = deepCloneFreehandObject(maskSrc, uid) as ClipMaskShape;
    const contentWorld = clip.map((o) => deepCloneFreehandObject(o, uid));
    const ub = clipContainerOuterBoundsFromMask(maskClone);
    const newId = uid();
    const container: ClippingContainerObject = {
      ...defaultObj({
        id: newId,
        name: `Clip ${objs.filter((o) => o.type === "clippingContainer").length + 1}`,
        x: ub.x,
        y: ub.y,
        width: ub.w,
        height: ub.h,
        fill: solidFill("none"),
        stroke: "none",
        strokeWidth: 0,
      }),
      type: "clippingContainer",
      mask: offsetShapeWorldToLocal(maskClone, ub.x, ub.y),
      content: contentWorld.map((c) => offsetObjectWorldToLocal(c, ub.x, ub.y)),
    } as ClippingContainerObject;
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== maskSrc.id).concat(container);
      pushHistory(next, new Set([newId]));
      return next;
    });
    setSelectedIds(new Set([newId]));
  }, [pushHistory, designerMode, designerClipboardRef]);

  const releaseClippingStructure = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const objs = objectsRef.current;
    const cid = Array.from(sel)[0];
    const c = objs.find((o) => o.id === cid && o.type === "clippingContainer") as ClippingContainerObject | undefined;
    if (!c) return;
    const flat = releaseClippingContainerToObjects(c);
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== c.id).concat(flat);
      pushHistory(next, new Set(flat.map((o) => o.id)));
      return next;
    });
    setSelectedIds(new Set(flat.map((o) => o.id)));
  }, [pushHistory]);

  // ── Boolean operations (non-destructive BooleanGroup) ────────────

  const booleanOp = useCallback(async (mode: BooleanOperation) => {
    const sel = selectedIdsRef.current;
    if (sel.size < 2) return;
    const objs = objectsRef.current;
    const selArr = objs.filter((o) => sel.has(o.id));
    if (selArr.length < 2) return;

    const bounds = getGroupBounds(selArr);
    const { dataUrl, bounds: resultBounds } = await computeBooleanCachedResult(selArr, mode);

    const groupObj: BooleanGroupObject = {
      ...defaultObj({ name: `Boolean ${mode}` }),
      type: "booleanGroup",
      x: resultBounds.x, y: resultBounds.y,
      width: resultBounds.w, height: resultBounds.h,
      fill: solidFill("none"), stroke: "none", strokeWidth: 0,
      operation: mode,
      children: selArr.map((o) => ({ ...o })),
      cachedResult: dataUrl,
    } as BooleanGroupObject;

    setObjects((prev) => {
      const next = prev.filter((o) => !sel.has(o.id));
      next.push(groupObj);
      const ns = new Set([groupObj.id]);
      pushHistory(next, ns);
      return next;
    });
    setSelectedIds(new Set([groupObj.id]));
  }, [pushHistory]);

  const changeBooleanOp = useCallback(async (newOp: BooleanOperation) => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    const group = objs.find((o) => sel.has(o.id) && o.type === "booleanGroup") as BooleanGroupObject | undefined;
    if (!group) return;
    const { dataUrl, bounds } = await computeBooleanCachedResult(group.children, newOp);
    const updated: BooleanGroupObject = {
      ...group,
      operation: newOp,
      cachedResult: dataUrl,
      // Mantener posición en el lienzo (tras mover el grupo solo cambian x/y del padre; los hijos no se trasladan).
      x: group.x,
      y: group.y,
      width: bounds.w,
      height: bounds.h,
    };
    setObjects((prev) => {
      const next = prev.map((o) => o.id === group.id ? updated : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  /**
   * Aplica el boolean de forma destructiva: un solo trazo vectorial (Paper.js).
   * Sirve como máscara para «Pegar dentro» (path cerrado con `svgPathD`).
   */
  const flattenBooleanToDefinitivePath = useCallback(async () => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    const group = objs.find((o) => sel.has(o.id) && o.type === "booleanGroup") as BooleanGroupObject | undefined;
    if (!group) return;

    const supported = group.children.filter(
      (o) => o.visible && (o.type === "rect" || o.type === "ellipse" || o.type === "path"),
    );
    if (supported.length === 0) {
      setToast("Solo se pueden convertir a trazo los hijos que sean rectángulo, elipse o trazado (sin texto ni imágenes).");
      window.setTimeout(() => setToast(null), 4200);
      return;
    }

    /** El preview booleano escala con `group.width/height`; los hijos no siempre se actualizan al redimensionar. */
    const cb = getGroupBounds(supported);
    const gx = group.x, gy = group.y, gw = group.width, gh = group.height;
    const scaleX = gw / Math.max(cb.w, 1e-9);
    const scaleY = gh / Math.max(cb.h, 1e-9);
    const mapChildToGroupVisual = (p: Point): Point => ({
      x: gx + (p.x - cb.x) * scaleX,
      y: gy + (p.y - cb.y) * scaleY,
    });
    const scaledSupported = supported.map((ch) => mapObjectPointsWithWorld(ch, mapChildToGroupVisual) as FreehandObject);

    const bounds = getGroupBounds(scaledSupported);
    const pad = 4;
    const w = Math.ceil(bounds.w + pad * 2);
    const h = Math.ceil(bounds.h + pad * 2);
    const ox = bounds.x - pad;
    const oy = bounds.y - pad;

    const defBlocks: string[] = [];
    const bodies: string[] = [];
    for (const ch of scaledSupported) {
      const full = objToSvgStringStatic(ch, w, h, ox, oy);
      const dm = full.match(/<defs>([\s\S]*?)<\/defs>/i);
      if (dm) defBlocks.push(dm[1]);
      const inner = full
        .replace(/^[\s\S]*?<svg[^>]*>/i, "")
        .replace(/<\/svg>\s*$/i, "")
        .replace(/<defs>[\s\S]*?<\/defs>\s*/gi, "");
      bodies.push(inner);
    }
    const combinedSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${ox} ${oy} ${w} ${h}">${defBlocks.length ? `<defs>${defBlocks.join("")}</defs>` : ""}${bodies.join("")}</svg>`;

    const { paperFlattenBooleanFromCombinedSvg } = await import("./freehand/boolean-flatten-paper");
    const flat = await paperFlattenBooleanFromCombinedSvg(group.operation, combinedSvg);
    if (!flat) {
      setToast("No se pudo calcular el trazo definitivo. Prueba con formas más simples.");
      window.setTimeout(() => setToast(null), 3800);
      return;
    }

    // Paper.js devuelve bounds del trazo en espacio del viewBox importado (origen ~0); el SVG usa viewBox ox,oy → sumar al lienzo.
    const placeX = ox + flat.x;
    const placeY = oy + flat.y;

    let newPath: PathObject = {
      ...defaultObj({
        id: group.id,
        type: "path",
        name: `${group.name} (trazo)`,
        x: placeX,
        y: placeY,
        width: flat.width,
        height: flat.height,
        fill: migrateFill(scaledSupported[0]!.fill),
        stroke: "none",
        strokeWidth: 0,
        opacity: group.opacity,
        rotation: group.rotation ?? 0,
        flipX: group.flipX,
        flipY: group.flipY,
        visible: group.visible,
        locked: group.locked,
      }),
      points: [],
      closed: true,
      svgPathD: flat.pathData,
      svgPathIntrinsicW: flat.width,
      svgPathIntrinsicH: flat.height,
    } as PathObject;

    /** Mismo horneado que al pulsar A: puntos Bézier + agujeros; sin esto «Pegar dentro» y la máscara fallan hasta cambiar de herramienta. */
    try {
      const { bakeSvgPathObjectToBezier } = await import("./freehand/svg-path-bake-paper");
      const baked = bakeSvgPathObjectToBezier(newPath as unknown as import("./freehand/svg-path-bake-paper").SvgPathBakeInput);
      if (baked) newPath = baked as unknown as PathObject;
    } catch {
      /* mantener solo svgPathD */
    }

    setObjects((prev) => {
      const next = prev.map((o) => (o.id === group.id ? newPath : o));
      pushHistory(next, new Set([newPath.id]));
      return next;
    });
    setSelectedIds(new Set([newPath.id]));
  }, [pushHistory]);

  const enterIsolation = useCallback((groupId: string) => {
    const objs = objectsRef.current;
    const group = objs.find((o) => o.id === groupId && o.type === "booleanGroup") as BooleanGroupObject | undefined;
    if (!group) return;
    isolationStackRef.current.push({
      kind: "boolean",
      groupId,
      parentObjects: objs.map((o) => ({ ...o })),
      parentSelectedIds: new Set(selectedIdsRef.current),
      parentHistory: [...historyRef.current],
      parentHistoryIdx: historyIdxRef.current,
    });
    const children = group.children.map((c) => ({ ...c }));
    setObjects(children);
    setSelectedIds(new Set());
    historyRef.current = [{ objects: [...children], sel: [] }];
    historyIdxRef.current = 0;
    setIsolationDepth((d) => d + 1);
  }, []);

  const enterVectorGroupIsolation = useCallback((groupId: string) => {
    const objs = objectsRef.current;
    const members = objs.filter((o) => o.groupId === groupId);
    if (members.length < 2) return;
    isolationStackRef.current.push({
      kind: "vectorGroup",
      groupId,
      parentObjects: objs.map((o) => ({ ...o })),
      parentSelectedIds: new Set(selectedIdsRef.current),
      parentHistory: [...historyRef.current],
      parentHistoryIdx: historyIdxRef.current,
    });
    const copy = members.map((m) => ({ ...m }));
    setObjects(copy);
    setSelectedIds(new Set());
    historyRef.current = [{ objects: copy, sel: [] }];
    historyIdxRef.current = 0;
    setIsolationDepth((d) => d + 1);
  }, []);

  const enterClippingIsolation = useCallback((containerId: string, mode: "content" | "mask" = "content") => {
    setClipContentEditId(null);
    const objs = objectsRef.current;
    const container = objs.find((o) => o.id === containerId && o.type === "clippingContainer") as ClippingContainerObject | undefined;
    if (!container) return;
    const root = (p: Point) => localPointToWorld(container, p);
    const entry: IsolationFrame = {
      kind: "clipping",
      containerId,
      editMode: mode,
      storedContent:
        mode === "mask" ? container.content.map((ch) => mapChildToWorldWithChain(root, ch)) : null,
      parentObjects: objs.map((o) => ({ ...o })),
      parentSelectedIds: new Set(selectedIdsRef.current),
      parentHistory: [...historyRef.current],
      parentHistoryIdx: historyIdxRef.current,
    };
    isolationStackRef.current.push(entry);
    if (mode === "content") {
      const children = container.content.map((ch) => mapChildToWorldWithChain(root, ch));
      setObjects(children);
      historyRef.current = [{ objects: [...children], sel: [] }];
    } else {
      const maskW = mapMaskShapeWithWorldMap(container.mask, root);
      const maskOnly: FreehandObject[] = [maskW as FreehandObject];
      setObjects(maskOnly);
      historyRef.current = [{ objects: [...maskOnly], sel: [] }];
    }
    historyIdxRef.current = 0;
    setSelectedIds(new Set());
    setIsolationDepth((d) => d + 1);
  }, []);

  const switchClippingIsolationMode = useCallback((target: "content" | "mask") => {
    setClipContentEditId(null);
    const top = isolationStackRef.current[isolationStackRef.current.length - 1];
    if (!top || top.kind !== "clipping") return;
    const parentC = top.parentObjects.find((o) => o.id === top.containerId) as ClippingContainerObject | undefined;
    if (!parentC) return;
    if (top.editMode === target) return;
    if (target === "mask") {
      if (top.editMode !== "content") return;
      top.storedContent = objectsRef.current.map((c) => ({ ...c }));
      top.editMode = "mask";
      const r = (p: Point) => localPointToWorld(parentC, p);
      const maskW = mapMaskShapeWithWorldMap(parentC.mask, r);
      setObjects([maskW as FreehandObject]);
      setSelectedIds(new Set([parentC.mask.id]));
    } else {
      const m = objectsRef.current[0] as ClipMaskShape | undefined;
      if (!m) return;
      top.editMode = "content";
      const maskLocal = mapMaskShapeWorldToLocalMap(m, (wp) => worldPointToLocal(parentC, wp));
      top.parentObjects = top.parentObjects.map((o) =>
        o.id === top.containerId ? { ...(o as ClippingContainerObject), mask: maskLocal } : o
      );
      const sc = top.storedContent ?? [];
      top.storedContent = null;
      setObjects(sc.map((c) => ({ ...c })));
      setSelectedIds(new Set());
    }
  }, []);

  const exitIsolation = useCallback(async () => {
    const frame = isolationStackRef.current.pop();
    if (!frame) return;
    if (frame.kind === "clipping") {
      setClipContentEditId(null);
      const current = objectsRef.current;
      const parentC = frame.parentObjects.find((o) => o.id === frame.containerId) as ClippingContainerObject | undefined;
      if (!parentC) return;
      let mask: ClipMaskShape = parentC.mask;
      let content: FreehandObject[];
      const outerInv = (wp: Point) => worldPointToLocal(parentC, wp);
      if (frame.editMode === "mask") {
        const m = current[0] as ClipMaskShape | undefined;
        if (m) mask = m;
        content = (frame.storedContent ?? []).map((c) => mapChildFromWorldWithChain(outerInv, c));
      } else {
        content = current.map((c) => mapChildFromWorldWithChain(outerInv, c));
      }
      const ub = clipContainerOuterBoundsFromMask(mask);
      const updated: ClippingContainerObject = {
        ...parentC,
        width: ub.w,
        height: ub.h,
        mask: offsetShapeWorldToLocal(mask, ub.x, ub.y),
        content: content.map((c) => offsetObjectWorldToLocal(c, ub.x, ub.y)),
      };
      const restoredObjects = frame.parentObjects.map((o) =>
        o.id === frame.containerId ? updated : o
      );
      objectsRef.current = restoredObjects;
      setObjects(restoredObjects);
      setSelectedIds(new Set([frame.containerId]));
      historyRef.current = frame.parentHistory;
      historyIdxRef.current = frame.parentHistoryIdx;
      setIsolationDepth((d) => d - 1);
      setLivePreview(null);
      return;
    }
    if (frame.kind === "vectorGroup") {
      const current = objectsRef.current;
      const restoredObjects = frame.parentObjects.map((o) => {
        const u = current.find((c) => c.id === o.id);
        return u ? u : o;
      });
      objectsRef.current = restoredObjects;
      setObjects(restoredObjects);
      setSelectedIds(new Set([...frame.parentSelectedIds].filter((id) => restoredObjects.some((o) => o.id === id))));
      historyRef.current = frame.parentHistory;
      historyIdxRef.current = frame.parentHistoryIdx;
      setIsolationDepth((d) => d - 1);
      setLivePreview(null);
      return;
    }
    const currentChildren = objectsRef.current;
    const parentGroup = frame.parentObjects.find((o) => o.id === frame.groupId) as BooleanGroupObject;
    if (!parentGroup) return;

    const { dataUrl, bounds } = await computeBooleanCachedResult(currentChildren, parentGroup.operation);
    const updatedGroup: BooleanGroupObject = {
      ...parentGroup,
      children: currentChildren.map((c) => ({ ...c })),
      cachedResult: dataUrl,
      // Misma razón que en changeBooleanOp: no reanclar al bbox de los hijos si el grupo ya se movió en el artboard.
      x: parentGroup.x,
      y: parentGroup.y,
      width: bounds.w,
      height: bounds.h,
    };

    const restoredObjects = frame.parentObjects.map((o) =>
      o.id === frame.groupId ? updatedGroup : o
    );
    objectsRef.current = restoredObjects;
    setObjects(restoredObjects);
    setSelectedIds(new Set([frame.groupId]));
    historyRef.current = frame.parentHistory;
    historyIdxRef.current = frame.parentHistoryIdx;
    setIsolationDepth((d) => d - 1);
    setLivePreview(null);
  }, []);

  const exitToLevel = useCallback(async (targetLevel: number) => {
    while (isolationStackRef.current.length > targetLevel) {
      await exitIsolation();
    }
  }, [exitIsolation]);

  // ── Alignment ─────────────────────────────────────────────────────

  const alignObjects = useCallback((mode: string) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const selObjs = prev.filter((o) => sel.has(o.id));
      if (selObjs.length < 2) return prev;
      const b = getGroupBounds(selObjs);
      const next = prev.map((o) => {
        if (!sel.has(o.id)) return o;
        switch (mode) {
          case "left": return { ...o, x: b.x };
          case "centerH": return { ...o, x: b.x + (b.w - o.width) / 2 };
          case "right": return { ...o, x: b.x + b.w - o.width };
          case "top": return { ...o, y: b.y };
          case "centerV": return { ...o, y: b.y + (b.h - o.height) / 2 };
          case "bottom": return { ...o, y: b.y + b.h - o.height };
          case "distH": {
            const sorted = [...selObjs].sort((a, c) => a.x - c.x);
            const totalW = sorted.reduce((s, oo) => s + oo.width, 0);
            const gap = (b.w - totalW) / Math.max(sorted.length - 1, 1);
            const idx = sorted.findIndex((s) => s.id === o.id);
            let xPos = b.x;
            for (let i = 0; i < idx; i++) xPos += sorted[i].width + gap;
            return { ...o, x: xPos };
          }
          case "distV": {
            const sorted = [...selObjs].sort((a, c) => a.y - c.y);
            const totalH = sorted.reduce((s, oo) => s + oo.height, 0);
            const gap = (b.h - totalH) / Math.max(sorted.length - 1, 1);
            const idx = sorted.findIndex((s) => s.id === o.id);
            let yPos = b.y;
            for (let i = 0; i < idx; i++) yPos += sorted[i].height + gap;
            return { ...o, y: yPos };
          }
          default: return o;
        }
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Path editing helpers ──────────────────────────────────────────

  const deleteVertexSelectionMap = useCallback(
    (sp: Map<string, Set<number>>) => {
      if (sp.size === 0) return;
      const sel = selectedIdsRef.current;
      setObjects((prev) => {
        const next = applyDeletePathPointIndicesToObjects(prev, sp);
        pushHistory(next, sel);
        return next;
      });
      setSelectedPoints(new Map());
    },
    [pushHistory],
  );

  const deleteSelectedPoints = useCallback(() => {
    if (selectedPoints.size === 0) return;
    deleteVertexSelectionMap(selectedPoints);
  }, [selectedPoints, deleteVertexSelectionMap]);

  const addPointOnSegment = useCallback(
    (objId: string, ringIdx: number, segIdx: number, t: number, clipContainerId?: string) => {
      const sel = selectedIdsRef.current;
      setObjects((prev) => {
        const next = prev.map((o) => {
          if (clipContainerId) {
            if (o.id !== clipContainerId || o.type !== "clippingContainer") return o;
            const c = o as ClippingContainerObject;
            if (c.mask.type !== "path" || c.mask.id !== objId) return o;
            const p = c.mask as PathObject;
            const rings = getPathRings(p);
            const ring = rings[ringIdx];
            if (!ring) return o;
            const newRing = splitBezierSegment(ring, segIdx, t);
            const nextRings = rings.slice();
            nextRings[ringIdx] = newRing;
            const points: BezierPoint[] = [];
            const contourStarts: number[] = [];
            for (const r of nextRings) {
              contourStarts.push(points.length);
              points.push(...r);
            }
            const pb = getPathBoundsFromPoints(points);
            const nextMask = {
              ...p,
              points,
              contourStarts: contourStarts.length > 1 ? contourStarts : undefined,
              x: pb.x,
              y: pb.y,
              width: pb.w,
              height: pb.h,
            };
            return { ...c, mask: nextMask };
          }
          if (o.id !== objId || o.type !== "path") return o;
          const p = o as PathObject;
          const rings = getPathRings(p);
          const ring = rings[ringIdx];
          if (!ring) return o;
          const newRing = splitBezierSegment(ring, segIdx, t);
          const nextRings = rings.slice();
          nextRings[ringIdx] = newRing;
          const points: BezierPoint[] = [];
          const contourStarts: number[] = [];
          for (const r of nextRings) {
            contourStarts.push(points.length);
            points.push(...r);
          }
          const pb = getPathBoundsFromPoints(points);
          return {
            ...p,
            points,
            contourStarts: contourStarts.length > 1 ? contourStarts : undefined,
            x: pb.x,
            y: pb.y,
            width: pb.w,
            height: pb.h,
          };
        });
        pushHistory(next, sel);
        return next;
      });
    },
    [pushHistory],
  );

  const addMidAnchorToSelectedPath = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const id = Array.from(sel)[0];
    const o = objectsRef.current.find((x) => x.id === id && x.type === "path") as PathObject | undefined;
    if (!o || o.points.length < 2) return;
    const count = o.closed ? o.points.length : o.points.length - 1;
    let bestI = 0;
    let bestLen = 0;
    for (let i = 0; i < count; i++) {
      const j = o.closed ? (i + 1) % o.points.length : i + 1;
      const a = o.points[i].anchor;
      const b = o.points[j].anchor;
      const L = dist(a, b);
      if (L > bestLen) {
        bestLen = L;
        bestI = i;
      }
    }
    addPointOnSegment(o.id, 0, bestI, 0.5);
  }, [addPointOnSegment]);

  const togglePathClosed = useCallback((objId: string) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.id !== objId || o.type !== "path") return o;
        return { ...o, closed: !(o as PathObject).closed };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const cycleVertexMode = useCallback((objId: string, ptIdx: number) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.type === "clippingContainer") {
          const c = o as ClippingContainerObject;
          if (c.mask.type !== "path" || c.mask.id !== objId) return o;
          const p = c.mask as PathObject;
          const pts = p.points.map((pt, i) => {
            if (i !== ptIdx) return pt;
            const cur = getVertexMode(pt);
            const order: VertexMode[] = ["smooth", "cusp", "corner"];
            const nextMode = order[(order.indexOf(cur) + 1) % order.length];
            return normalizeBezierPointForVertexMode(pt, nextMode);
          });
          const pb = getPathBoundsFromPoints(pts);
          return { ...c, mask: { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h } };
        }
        if (o.id !== objId || o.type !== "path") return o;
        const p = o as PathObject;
        const pts = p.points.map((pt, i) => {
          if (i !== ptIdx) return pt;
          const cur = getVertexMode(pt);
          const order: VertexMode[] = ["smooth", "cusp", "corner"];
          const nextMode = order[(order.indexOf(cur) + 1) % order.length];
          return normalizeBezierPointForVertexMode(pt, nextMode);
        });
        const pb = getPathBoundsFromPoints(pts);
        return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const setVertexModeOnSelectedAnchors = useCallback((mode: VertexMode) => {
    const sel = selectedIdsRef.current;
    const sp = selectedPointsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.type === "clippingContainer" && sel.has(o.id)) {
          const c = o as ClippingContainerObject;
          if (c.mask.type !== "path") return o;
          const p = c.mask as PathObject;
          const idxs = sp.get(p.id);
          if (!idxs || idxs.size === 0) return o;
          const pts = p.points.map((pt, i) => {
            if (!idxs.has(i)) return pt;
            return normalizeBezierPointForVertexMode(pt, mode);
          });
          const pb = getPathBoundsFromPoints(pts);
          return { ...c, mask: { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h } };
        }
        if (o.type !== "path" || !sel.has(o.id)) return o;
        const idxs = sp.get(o.id);
        if (!idxs || idxs.size === 0) return o;
        const p = o as PathObject;
        const pts = p.points.map((pt, i) => {
          if (!idxs.has(i)) return pt;
          return normalizeBezierPointForVertexMode(pt, mode);
        });
        const pb = getPathBoundsFromPoints(pts);
        return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Export ────────────────────────────────────────────────────────

  const doExportSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = resolveSceneExportBounds(objects, artboards);
    const ab = pickPrimaryArtboard(artboards, null);
    const bg: "transparent" | string = ab?.background ?? "transparent";
    const str = buildStandaloneSvgFromCanvasDom(svg, {
      exportIds: null,
      bounds,
      scale: 1,
      background: bg,
    });
    downloadBlob(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), "freehand.svg");
  }, [objects, artboards]);

  const doExportPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = resolveSceneExportBounds(objects, artboards);
    const ab = pickPrimaryArtboard(artboards, null);
    const bg: "transparent" | string = ab?.background ?? "transparent";
    const strRaw = buildStandaloneSvgFromCanvasDom(svg, {
      exportIds: null,
      bounds,
      scale: 1,
      background: bg,
    });
    const str = substituteNativeTextForRasterExport(strRaw, objects);
    const canvas = await svgStringToCanvasSafe(str, bounds.w, bounds.h);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "freehand.png"); }, "image/png");
  }, [objects, artboards]);

  const doExportJpg = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = resolveSceneExportBounds(objects, artboards);
    const ab = pickPrimaryArtboard(artboards, null);
    const bg: "transparent" | string = ab?.background ?? "transparent";
    const strRaw = buildStandaloneSvgFromCanvasDom(svg, {
      exportIds: null,
      bounds,
      scale: 1,
      background: bg,
    });
    const str = substituteNativeTextForRasterExport(strRaw, objects);
    const jpgBg = bg === "transparent" ? "#ffffff" : bg;
    const canvas = await svgStringToCanvasSafe(str, bounds.w, bounds.h, jpgBg);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "freehand.jpg"); }, "image/jpeg", 0.92);
  }, [objects, artboards]);

  const doExportNode = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = resolveSceneExportBounds(objects, artboards);
    const ab = pickPrimaryArtboard(artboards, null);
    const bg: "transparent" | string = ab?.background ?? "transparent";
    const strRaw = buildStandaloneSvgFromCanvasDom(svg, {
      exportIds: null,
      bounds,
      scale: 1,
      background: bg,
    });
    const str = substituteNativeTextForRasterExport(strRaw, objects);
    const canvas = await svgStringToCanvasSafe(str, bounds.w, bounds.h);
    onExport(canvasToPngDataUrlSafe(canvas));
  }, [objects, artboards, onExport]);

  const closeInFlight = useRef(false);
  const handleCloseStudio = useCallback(async () => {
    if (closeInFlight.current) return;
    closeInFlight.current = true;
    try {
      if (!designerSkipAutoNodeExportOnClose) {
        const hasVisibleArt = objects.some((o) => o.visible);
        if (hasVisibleArt) {
          try {
            await doExportNode();
          } catch (err) {
            console.error("Freehand: export on close failed", err);
          }
        }
      }
      onClose();
    } finally {
      closeInFlight.current = false;
    }
  }, [objects, doExportNode, onClose, designerSkipAutoNodeExportOnClose]);

  const triggerExportFlash = useCallback((b: ExportRect) => {
    setExportFlash(b);
    window.setTimeout(() => setExportFlash(null), 700);
  }, []);

  const quickExportSelectionPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const objs = objectsRef.current;
    const sel = selectedIdsRef.current;
    if (sel.size === 0) {
      setToast("Select objects to export");
      window.setTimeout(() => setToast(null), 2200);
      return;
    }
    const cmap = clipMapFromObjects(objs);
    const exportIds = expandExportIds(new Set(sel), objs, cmap);
    const targets = objs.filter((o) => exportIds.has(o.id) && o.visible);
    const b = getGroupBounds(targets);
    if (b.w < 1 || b.h < 1) return;
    const str = substituteNativeTextForRasterExport(
      buildStandaloneSvgFromCanvasDom(svg, {
        exportIds,
        bounds: b,
        scale: 1,
        background: "transparent",
      }),
      objs,
    );
    const w = Math.max(1, Math.round(b.w));
    const h = Math.max(1, Math.round(b.h));
    const canvas = await svgStringToCanvasSafe(str, w, h);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `export-${Date.now()}.png`);
    }, "image/png");
    triggerExportFlash(b);
    setToast("Exported PNG (1×)");
    window.setTimeout(() => setToast(null), 2600);
  }, [triggerExportFlash]);

  const runProfessionalExport = useCallback(
    async (opts: ProfessionalExportOptions) => {
      const svg = svgRef.current;
      if (!svg) return;
      const objs = objectsRef.current;
      const sel = selectedIdsRef.current;
      const cmap = clipMapFromObjects(objs);
      const scope = exportModalScope;

      const bgForCanvas =
        opts.format === "jpg"
          ? opts.background === "transparent"
            ? "#ffffff"
            : opts.background
          : opts.background === "transparent"
            ? undefined
            : opts.background;

      const downloadSvg = (str: string, name: string) => {
        downloadBlob(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), name);
      };

      const rasterize = async (str: string, bw: number, bh: number, name: string) => {
        const canvas = await svgStringToCanvasSafe(str, bw, bh, bgForCanvas);
        const mime = opts.format === "jpg" ? "image/jpeg" : "image/png";
        const quality = opts.format === "jpg" ? 0.92 : undefined;
        await new Promise<void>((res) => {
          canvas.toBlob(
            (blob) => {
              if (blob) downloadBlob(blob, name);
              res();
            },
            mime,
            quality,
          );
        });
      };

      const runOne = async (exportIds: Set<string> | null, b: ExportRect, suffix: string) => {
        const bg =
          opts.format === "jpg"
            ? opts.background === "transparent"
              ? "#ffffff"
              : opts.background
            : opts.background;
        const strRaw = buildStandaloneSvgFromCanvasDom(svg, {
          exportIds,
          bounds: b,
          scale: opts.scale,
          background: bg,
        });
        const str =
          opts.format === "svg" || opts.format === "pdf"
            ? strRaw
            : substituteNativeTextForRasterExport(strRaw, objs);
        const base = opts.filename.replace(/\.(png|svg|jpg|jpeg|pdf)$/i, "");
        const ext =
          opts.format === "svg" ? "svg" : opts.format === "jpg" ? "jpg" : opts.format === "pdf" ? "pdf" : "png";
        const name = suffix ? `${base}-${suffix}.${ext}` : `${base}.${ext}`;
        const pw = Math.max(1, Math.round(b.w * opts.scale));
        const ph = Math.max(1, Math.round(b.h * opts.scale));
        if (opts.format === "svg") {
          downloadSvg(strRaw, name);
        } else if (opts.format === "pdf") {
          const { downloadSvgAsVectorPdf } = await import("./freehand/download-vector-pdf");
          let pdfMarkup = strRaw;
          const textObjs = objs.filter((o): o is TextObject => o.type === "text" && o.visible && !o.isClipMask);
          if (textObjs.length > 0) {
            pdfMarkup = await substituteTextWithOutlinedPathsInSvg(
              strRaw,
              textObjs.map(textObjectToVectorPdfOutlineItem),
            );
          }
          await downloadSvgAsVectorPdf(pdfMarkup, name);
        } else {
          await rasterize(str, pw, ph, name);
        }
        triggerExportFlash(b);
      };

      try {
        if (opts.batchArtboardIds && opts.batchArtboardIds.length > 0 && scope === "full") {
          const abs = artboardsRef.current;
          const { default: JSZip } = await import("jszip");
          const { svgMarkupToPdfBlob } = await import("./freehand/download-vector-pdf");
          const mapTextForPdf = (tx: TextObject) => textObjectToVectorPdfOutlineItem(tx);
          const entries: { fname: string; blob: Blob }[] = [];
          const ext =
            opts.format === "svg" ? "svg" : opts.format === "jpg" ? "jpg" : opts.format === "pdf" ? "pdf" : "png";
          for (const abId of opts.batchArtboardIds) {
            const ab = abs.find((a) => a.id === abId);
            if (!ab) continue;
            const b = artboardToRect(ab);
            if (b.w < 1 || b.h < 1) continue;
            const bg =
              opts.format === "jpg"
                ? opts.background === "transparent"
                  ? "#ffffff"
                  : opts.background
                : opts.background;
            const strRaw = buildStandaloneSvgFromCanvasDom(svg, {
              exportIds: null,
              bounds: b,
              scale: opts.scale,
              background: bg,
            });
            const safeName = (ab.name || "artboard").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
            const fname = `${safeName}.${ext}`;
            if (opts.format === "svg") {
              entries.push({ fname, blob: new Blob([strRaw], { type: "image/svg+xml;charset=utf-8" }) });
            } else if (opts.format === "pdf") {
              let pdfMarkup = strRaw;
              const textObjs = objs.filter((o): o is TextObject => o.type === "text" && o.visible && !o.isClipMask);
              if (textObjs.length > 0) {
                pdfMarkup = await substituteTextWithOutlinedPathsInSvg(strRaw, textObjs.map(mapTextForPdf));
              }
              entries.push({ fname, blob: await svgMarkupToPdfBlob(pdfMarkup) });
            } else {
              const str = substituteNativeTextForRasterExport(strRaw, objs);
              const pw = Math.max(1, Math.round(b.w * opts.scale));
              const ph = Math.max(1, Math.round(b.h * opts.scale));
              const canvas = await svgStringToCanvasSafe(str, pw, ph, bgForCanvas);
              const mime = opts.format === "jpg" ? "image/jpeg" : "image/png";
              const quality = opts.format === "jpg" ? 0.92 : undefined;
              const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("toBlob"))), mime, quality);
              });
              entries.push({ fname, blob });
            }
            triggerExportFlash(b);
          }
          if (entries.length === 0) return;
          if (entries.length === 1) {
            downloadBlob(entries[0].blob, entries[0].fname);
          } else {
            const zip = new JSZip();
            for (const e of entries) zip.file(e.fname, e.blob);
            const zb = await zip.generateAsync({ type: "blob" });
            const zipBase = opts.filename.replace(/\.[^.]+$/i, "").replace(/[^a-z0-9-_]+/gi, "_") || "export";
            downloadBlob(zb, `${zipBase}-artboards.zip`);
          }
          setToast(`Exported ${entries.length} artboard(s)`);
          window.setTimeout(() => setToast(null), 2800);
          setShowExportModal(false);
          return;
        }

        if (scope === "full") {
          const abs = artboardsRef.current;
          const ab = pickPrimaryArtboard(abs, null);
          const visible = objs.filter((o) => o.visible);
          const b = ab ? artboardToRect(ab) : getGroupBounds(visible);
          if (b.w < 1 || b.h < 1) return;
          await runOne(null, b, "");
        } else {
          if (sel.size === 0) return;
          const exportIds = expandExportIds(new Set(sel), objs, cmap);
          const targets = objs.filter((o) => exportIds.has(o.id) && o.visible);
          const b = getGroupBounds(targets);
          if (b.w < 1 || b.h < 1) return;

          if (
            !opts.merged &&
            sel.size > 1 &&
            (opts.format === "png" || opts.format === "svg" || opts.format === "jpg" || opts.format === "pdf")
          ) {
            let i = 0;
            for (const id of sel) {
              const oneIds = expandExportIds(new Set([id]), objs, cmap);
              const targs = objs.filter((o) => oneIds.has(o.id) && o.visible);
              const bb = getGroupBounds(targs);
              if (bb.w >= 1 && bb.h >= 1) await runOne(oneIds, bb, `${++i}`);
            }
            setToast(`Exported ${sel.size} assets`);
            window.setTimeout(() => setToast(null), 2800);
            setShowExportModal(false);
            return;
          }
          await runOne(exportIds, b, "");
        }
        setToast(`Exported ${opts.format.toUpperCase()}${opts.scale !== 1 ? ` (${opts.scale}×)` : ""}`);
        window.setTimeout(() => setToast(null), 2800);
        setShowExportModal(false);
      } catch (err) {
        console.error(err);
        setToast("Export failed");
        window.setTimeout(() => setToast(null), 3000);
      }
    },
    [exportModalScope, triggerExportFlash],
  );

  // ── Keyboard ──────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;

      e.stopPropagation();

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyO") {
        e.preventDefault();
        void convertTextToOutlines();
        return;
      }
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setSpaceHeld(true); return; }
      // Plain V = select tool; must not steal Ctrl/Meta+V (paste) or Ctrl+Shift+V (paste inside)
      if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setActiveTool("select"); return;
      }
      if (e.key === "a" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("directSelect"); return; }
      // P = modo lienzo limpio (sin UI salvo transform en canvas); ⇧P = lápiz
      if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.shiftKey) {
          e.preventDefault();
          setActiveTool("pen");
          if (!e.repeat) shapeShortcutKeyDownAtRef.current.KeyP = Date.now();
          return;
        }
        e.preventDefault();
        setClipContentEditId(null);
        setCanvasZenMode((z) => {
          if (z) scheduleFitAllAfterLayout();
          return !z;
        });
        setCtxMenu(null);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setActiveTool("rect");
        if (!e.repeat) shapeShortcutKeyDownAtRef.current.KeyR = Date.now();
        return;
      }
      if (e.key === "e" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setActiveTool("ellipse");
        if (!e.repeat) shapeShortcutKeyDownAtRef.current.KeyE = Date.now();
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setActiveTool("text");
        if (!e.repeat) shapeShortcutKeyDownAtRef.current.KeyT = Date.now();
        return;
      }
      if ((e.key === "o" || e.key === "O") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setActiveTool("ellipse");
        if (!e.repeat) shapeShortcutKeyDownAtRef.current.KeyO = Date.now();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        void quickExportSelectionPng();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c") { e.preventDefault(); copySelectedObjects(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "x") { e.preventDefault(); cutSelectedObjects(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (e.shiftKey) pasteInside();
        else pasteClipboardObjects();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        if (activeTool === "directSelect" && selectedPoints.size > 0) { deleteSelectedPoints(); return; }
        deleteSelected();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); setSelectedIds(new Set(objects.map((o) => o.id))); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); duplicateSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && !e.shiftKey) { e.preventDefault(); groupSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && e.shiftKey) { e.preventDefault(); ungroupSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "G") { e.preventDefault(); ungroupSelected(); return; }

      if ((e.metaKey || e.ctrlKey) && (e.key === "]" || e.key === "}")) { e.preventDefault(); bringForward(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "[" || e.key === "{")) { e.preventDefault(); sendBackward(); return; }

      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        !e.metaKey && !e.ctrlKey && !e.altKey
      ) {
        if (textEditingId) return;
        const step = 1 / viewport.zoom;
        let mdx = 0, mdy = 0;
        if (e.key === "ArrowLeft") mdx = -step;
        else if (e.key === "ArrowRight") mdx = step;
        else if (e.key === "ArrowUp") mdy = -step;
        else mdy = step;

        const sel = selectedIdsRef.current;
        const sp = selectedPointsRef.current;

        if (activeTool === "directSelect" && sp.size > 0) {
          e.preventDefault();
          setObjects((prev) => {
            const next = prev.map((o) => {
              if (o.type === "clippingContainer" && sel.has(o.id)) {
                const c = o as ClippingContainerObject;
                if (c.mask.type !== "path") return o;
                const p = c.mask as PathObject;
                const idxs = sp.get(p.id);
                if (!idxs || idxs.size === 0) return o;
                const newPts = p.points.map((pt, pi) => {
                  if (!idxs.has(pi)) return pt;
                  return {
                    ...pt,
                    anchor: { x: pt.anchor.x + mdx, y: pt.anchor.y + mdy },
                    handleIn: { x: pt.handleIn.x + mdx, y: pt.handleIn.y + mdy },
                    handleOut: { x: pt.handleOut.x + mdx, y: pt.handleOut.y + mdy },
                  };
                });
                const pb = getPathBoundsFromPoints(newPts);
                return { ...c, mask: { ...p, points: newPts, x: pb.x, y: pb.y, width: pb.w, height: pb.h } };
              }
              if (o.type !== "path") return o;
              const idxs = sp.get(o.id);
              if (!idxs || idxs.size === 0) return o;
              const p = o as PathObject;
              const newPts = p.points.map((pt, pi) => {
                if (!idxs.has(pi)) return pt;
                return {
                  ...pt,
                  anchor: { x: pt.anchor.x + mdx, y: pt.anchor.y + mdy },
                  handleIn: { x: pt.handleIn.x + mdx, y: pt.handleIn.y + mdy },
                  handleOut: { x: pt.handleOut.x + mdx, y: pt.handleOut.y + mdy },
                };
              });
              const pb = getPathBoundsFromPoints(newPts);
              return { ...p, points: newPts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
            });
            pushHistory(next, sel);
            return next;
          });
          return;
        }

        if (sel.size > 0) {
          e.preventDefault();
          setObjects((prev) => {
            const next = prev.map((o) => (sel.has(o.id) ? translateFreehandObject(o, mdx, mdy) : o));
            pushHistory(next, sel);
            return next;
          });
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (canvasZenMode) {
          setCanvasZenMode(false);
          scheduleFitAllAfterLayout();
          return;
        }
        if (clipContentEditId) {
          setClipContentEditId(null);
          return;
        }
        if (designerMode && imageFrameContentEditId) {
          setImageFrameContentEditId(null);
          return;
        }
        setQuickEditMode(null);
        if (isPenDrawing && penPoints.length > 0) finishPenPath(false);
        else if (isolationStackRef.current.length > 0) exitIsolation();
        else {
          setSelectedIds(new Set());
          setSelectedPoints(new Map());
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code === "Space") setSpaceHeld(false);

      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT") return;

      const codeToTool: Partial<Record<string, Tool>> = {
        KeyR: "rect",
        KeyE: "ellipse",
        KeyO: "ellipse",
        KeyT: "text",
        KeyP: "pen",
      };
      const want = codeToTool[e.code];
      if (!want) return;

      const t0 = shapeShortcutKeyDownAtRef.current[e.code];
      if (t0 == null) return;
      delete shapeShortcutKeyDownAtRef.current[e.code];

      if (activeTool !== want) return;
      if (Date.now() - t0 < SHAPE_SHORTCUT_HOLD_MS) return;
      const ds = dragState?.type;
      if (ds === "create" || ds === "createText" || ds === "createTextFrame" || ds === "createImageFrame") return;
      if (isPenDrawing) return;

      setActiveTool("select");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [objects, selectedIds, selectedPoints, isPenDrawing, penPoints, activeTool, textEditingId, viewport.zoom, dragState,
      undo, redo, pushHistory, deleteSelected, duplicateSelected, groupSelected,
      ungroupSelected, bringForward, sendBackward, finishPenPath, deleteSelectedPoints, exitIsolation,
      copySelectedObjects, cutSelectedObjects, pasteClipboardObjects, pasteInside, quickExportSelectionPng, convertTextToOutlines,
      designerMode, imageFrameContentEditId, clipContentEditId, canvasZenMode, scheduleFitAllAfterLayout]);

  // ── Mouse handlers ────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    setCtxMenu(null);

    // Right-click → context menu
    if (e.button === 2) {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      // If right-clicking an object, select it first
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (hitTestObject(pos, obj, 8 / viewport.zoom, objects)) {
          if (!selectedIds.has(obj.id)) setSelectedIds(resolveSelection(obj.id, false));
          break;
        }
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, canvas: pos });
      return;
    }

    // Pan: middle click, space+drag, or hand tool
    if (e.button === 1 || spaceHeld || (activeTool === "handTool" && e.button === 0)) {
      setDragState({ type: "pan", startX: e.clientX, startY: e.clientY, svpX: viewport.x, svpY: viewport.y });
      return;
    }

    const pos = screenToCanvas(e.clientX, e.clientY);

    // ── Zoom tool (click = zoom in toward point, Alt = zoom out) ─
    if (activeTool === "zoomTool" && e.button === 0) {
      e.preventDefault();
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const factor = e.altKey ? 1 / 1.2 : 1.2;
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setViewport((v) => {
        const nz = clamp(v.zoom * factor, 0.05, 20);
        const ratio = nz / v.zoom;
        return { zoom: nz, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
      });
      return;
    }

    // ── Eyedropper ────────────────────────────────────────────────
    if (activeTool === "eyedropper" && e.button === 0) {
      e.preventDefault();
      const th = 8 / viewport.zoom;
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!obj.visible || obj.locked) continue;
        if (!hitTestObject(pos, obj, th, objects)) continue;
        const f = migrateFill(obj.fill);
        if (f.type === "solid" && f.color !== "none") {
          const c = f.color;
          setFillColor(c);
          if (selectedIds.size > 0) {
            setObjects((prev) =>
              prev.map((o) => {
                if (!selectedIds.has(o.id)) return o;
                if (o.type === "textOnPath") return { ...o, fill: c };
                return { ...o, fill: solidFill(c) };
              }),
            );
          }
        }
        setActiveTool("select");
        return;
      }
      setActiveTool("select");
      return;
    }

    // ── Layout guides: arrastrar para mover, Alt+clic para quitar (solo selección / directa) ─
    if (
      e.button === 0 &&
      showLayoutGuides &&
      layoutGuides.length > 0 &&
      (activeTool === "select" || activeTool === "directSelect")
    ) {
      const hitW = 12 / viewport.zoom;
      for (let i = layoutGuides.length - 1; i >= 0; i--) {
        const g = layoutGuides[i];
        if (g.orientation === "vertical") {
          if (Math.abs(pos.x - g.position) < hitW) {
            if (e.altKey) {
              setLayoutGuides((prev) => prev.filter((x) => x.id !== g.id));
              return;
            }
            guideGestureRef.current = {
              kind: "move",
              guideId: g.id,
              orientation: g.orientation,
              startWorld: g.position,
              startClientX: e.clientX,
              startClientY: e.clientY,
            };
            setDragState({
              type: "guideMove",
              startX: e.clientX,
              startY: e.clientY,
              guideId: g.id,
              guideOrientation: g.orientation,
              guideStartPos: g.position,
            });
            setupGuideWindowListeners();
            return;
          }
        } else if (Math.abs(pos.y - g.position) < hitW) {
          if (e.altKey) {
            setLayoutGuides((prev) => prev.filter((x) => x.id !== g.id));
            return;
          }
          guideGestureRef.current = {
            kind: "move",
            guideId: g.id,
            orientation: g.orientation,
            startWorld: g.position,
            startClientX: e.clientX,
            startClientY: e.clientY,
          };
          setDragState({
            type: "guideMove",
            startX: e.clientX,
            startY: e.clientY,
            guideId: g.id,
            guideOrientation: g.orientation,
            guideStartPos: g.position,
          });
          setupGuideWindowListeners();
          return;
        }
      }
    }

    // ── Pen tool ──────────────────────────────────────────────────
    if (activeTool === "pen") {
      const newPt: BezierPoint = { anchor: { ...pos }, handleIn: { ...pos }, handleOut: { ...pos }, vertexMode: "smooth" };

      if (!isPenDrawing) {
        setPenPoints([newPt]);
        setIsPenDrawing(true);
        setPenDragging(true);
        setDragState({ type: "penHandle", startX: e.clientX, startY: e.clientY, startCanvas: pos });
      } else {
        if (penPoints.length > 1 && dist(pos, penPoints[0].anchor) < PEN_CLOSE_TO_START_PX / viewport.zoom) {
          finishPenPath(true);
          return;
        }
        setPenPoints((prev) => [...prev, newPt]);
        setPenDragging(true);
        setDragState({ type: "penHandle", startX: e.clientX, startY: e.clientY, startCanvas: pos });
      }
      return;
    }

    // ── Create shapes ─────────────────────────────────────────────
    if (activeTool === "rect" || activeTool === "ellipse") {
      setDragState({ type: "create", startX: e.clientX, startY: e.clientY, createType: activeTool, createOrigin: pos, currentCanvas: pos });
      return;
    }

    if (activeTool === "text") {
      setDragState({ type: "createText", startX: e.clientX, startY: e.clientY, createOrigin: pos, currentCanvas: pos });
      return;
    }

    // ── Designer: Text Frame & Image Frame ─────────────────────
    if (activeTool === "textFrame") {
      setDragState({ type: "createTextFrame", startX: e.clientX, startY: e.clientY, createOrigin: pos, currentCanvas: pos });
      return;
    }
    if (activeTool === "imageFrame") {
      setDragState({ type: "createImageFrame", startX: e.clientX, startY: e.clientY, createOrigin: pos, currentCanvas: pos });
      return;
    }

    // ── Direct select ─────────────────────────────────────────────
    if (activeTool === "directSelect") {
      const threshold = 8 / viewport.zoom;
      // Check anchor points and handles on all paths
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.locked || !obj.visible || obj.type !== "path") continue;
        const p = obj as PathObject;
        const rings = getPathRings(p);
        let gBase = 0;
        for (const ring of rings) {
          for (let pi = 0; pi < ring.length; pi++) {
            const pt = ring[pi]!;
            const gIdx = gBase + pi;
            for (const ht of ["anchor", "handleIn", "handleOut"] as const) {
              if (dist(pos, pt[ht]) < threshold) {
                if (e.shiftKey || e.nativeEvent.getModifierState?.("Shift")) {
                  setSelectedPoints((prev) => {
                    const m = new Map(prev);
                    const s = new Set(m.get(obj.id) || []);
                    if (ht === "anchor") { if (s.has(gIdx)) s.delete(gIdx); else s.add(gIdx); }
                    else s.add(gIdx);
                    m.set(obj.id, s);
                    return m;
                  });
                } else {
                  const m = new Map<string, Set<number>>();
                  m.set(obj.id, new Set([gIdx]));
                  setSelectedPoints(m);
                }
                setSelectedIds(new Set([obj.id]));
                setDragState({
                  type: "directSelect", startX: e.clientX, startY: e.clientY,
                  dsObjId: obj.id, dsPtIdx: gIdx, dsHtType: ht, dsStartPt: { ...pt[ht] },
                });
                return;
              }
            }
          }
          gBase += ring.length;
        }
      }

      // Máscara path de clippingContainer (puntos en local del contenedor)
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.locked || !obj.visible || obj.type !== "clippingContainer") continue;
        const cc = obj as ClippingContainerObject;
        if (cc.mask.type !== "path") continue;
        const raw = cc.mask as PathObject;
        if (!raw.points || raw.points.length < 2) continue;
        const pWorld = clipMaskPathAnchorsToWorld(cc, raw);
        const ringsW = getPathRings(pWorld);
        const ringsL = getPathRings(raw);
        let gBase = 0;
        for (let ri = 0; ri < ringsW.length; ri++) {
          const ringW = ringsW[ri]!;
          const ringL = ringsL[ri]!;
          for (let pi = 0; pi < ringW.length; pi++) {
            const ptW = ringW[pi]!;
            const ptL = ringL[pi]!;
            const gIdx = gBase + pi;
            for (const ht of ["anchor", "handleIn", "handleOut"] as const) {
              if (dist(pos, ptW[ht]) < threshold) {
                if (e.shiftKey || e.nativeEvent.getModifierState?.("Shift")) {
                  setSelectedPoints((prev) => {
                    const m = new Map(prev);
                    const s = new Set(m.get(raw.id) || []);
                    if (ht === "anchor") {
                      if (s.has(gIdx)) s.delete(gIdx);
                      else s.add(gIdx);
                    } else s.add(gIdx);
                    m.set(raw.id, s);
                    return m;
                  });
                } else {
                  const m = new Map<string, Set<number>>();
                  m.set(raw.id, new Set([gIdx]));
                  setSelectedPoints(m);
                }
                setSelectedIds(new Set([cc.id]));
                setDragState({
                  type: "directSelect",
                  startX: e.clientX,
                  startY: e.clientY,
                  dsObjId: raw.id,
                  dsClipContainerId: cc.id,
                  dsPtIdx: gIdx,
                  dsHtType: ht,
                  dsStartPt: { ...ptL[ht] },
                });
                return;
              }
            }
          }
          gBase += ringW.length;
        }
      }

      // Check path segments for adding points
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.locked || !obj.visible || obj.type !== "path") continue;
        const p = obj as PathObject;
        const seg = distToPathSegments(pos, p);
        if (seg.dist < threshold) {
          addPointOnSegment(obj.id, seg.ringIdx, seg.segIdx, seg.t);
          setSelectedIds(new Set([obj.id]));
          return;
        }
      }

      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.locked || !obj.visible || obj.type !== "clippingContainer") continue;
        const cc = obj as ClippingContainerObject;
        if (cc.mask.type !== "path") continue;
        const raw = cc.mask as PathObject;
        if (!raw.points || raw.points.length < 2) continue;
        const lp = worldPointToLocal(cc, pos);
        const seg = distToPathSegments(lp, raw);
        if (seg.dist < threshold) {
          addPointOnSegment(raw.id, seg.ringIdx, seg.segIdx, seg.t, cc.id);
          setSelectedIds(new Set([cc.id]));
          return;
        }
      }

      // Transform handles (same as selection tool) so rect/ellipse scale from corners in Direct Selection
      const shiftHeldDS = e.shiftKey || (typeof e.nativeEvent.getModifierState === "function" && e.nativeEvent.getModifierState("Shift"));
      if (selectedObjects.length > 0 && selectionFrame && !shiftHeldDS) {
        const f = selectionFrame;
        const handleSize = 8 / viewport.zoom;
        const rotOffset = 14 / viewport.zoom;
        const hw = f.w / 2, hh = f.h / 2;
        const rotLocal = [{ x: hw + rotOffset, y: -hh - rotOffset }];
        for (const rl of rotLocal) {
          const rc = localToWorldOBB(rl, f.cx, f.cy, f.angleDeg);
          if (dist(pos, rc) < handleSize) {
            const startAngle = Math.atan2(pos.y - f.cy, pos.x - f.cx);
            const initRots = new Map<string, number>();
            const initSnaps = new Map<string, FreehandObject>();
            for (const so of selectedObjects) {
              initRots.set(so.id, so.rotation);
              initSnaps.set(so.id, deepCloneFreehandObjectKeepIds(so));
            }
            setDragState({
              type: "rotate", startX: e.clientX, startY: e.clientY,
              rotateCenter: { x: f.cx, y: f.cy }, rotateStartAngle: startAngle, rotateInitialRotations: initRots,
              rotateInitialSnapshots: initSnaps,
            });
            return;
          }
        }
        const hDefs: { id: string; lx: number; ly: number }[] = [
          { id: "nw", lx: -hw, ly: -hh }, { id: "ne", lx: hw, ly: -hh },
          { id: "se", lx: hw, ly: hh }, { id: "sw", lx: -hw, ly: hh },
          { id: "n", lx: 0, ly: -hh }, { id: "e", lx: hw, ly: 0 },
          { id: "s", lx: 0, ly: hh }, { id: "w", lx: -hw, ly: 0 },
        ];
        for (const hi of hDefs) {
          const hp = localToWorldOBB({ x: hi.lx, y: hi.ly }, f.cx, f.cy, f.angleDeg);
          if (dist(pos, hp) < handleSize) {
            const allBounds = new Map<string, Rect>();
            const resizeSnapshot = new Map<string, FreehandObject>();
            for (const so of selectedObjects) {
              allBounds.set(so.id, getVisualAABB(so, objects));
              resizeSnapshot.set(so.id, deepCloneFreehandObjectKeepIds(so));
            }
            setDragState({
              type: "resize", startX: e.clientX, startY: e.clientY,
              handle: hi.id,
              bounds: { ...groupBounds },
              initialOrientedFrame: { ...f },
              allBounds,
              resizeSnapshot,
            });
            return;
          }
        }
      }

      // Click on empty → marquee
      setSelectedPoints(new Map());
      setDragState({ type: "marquee", startX: e.clientX, startY: e.clientY, marqueeOrigin: pos, currentCanvas: pos });
      return;
    }

    // ── Select & gradient tools ─────────────────────────────────────
    const threshold = 6 / viewport.zoom;
    /** Ampliar selección: Mayús, o Cmd/Ctrl (común en macOS). */
    const extendSel = isShiftHeld(e) || e.metaKey || e.ctrlKey;

    if (activeTool === "select" && selectedIds.size > 0) {
      const gTh = 12 / viewport.zoom;
      for (const oid of Array.from(selectedIds)) {
        const o = objects.find((x) => x.id === oid);
        if (!o || !supportsGradientFill(o)) continue;
        const f = migrateFill(o.fill);
        if (f.type === "gradient-linear") {
          const wa = localBoxToWorld(o, f.x1, f.y1);
          const wb = localBoxToWorld(o, f.x2, f.y2);
          if (dist(pos, wa) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "linA", gradientPrimaryId: o.id });
            return;
          }
          if (dist(pos, wb) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "linB", gradientPrimaryId: o.id });
            return;
          }
          for (let si = 0; si < f.stops.length; si++) {
            const tt = clamp(f.stops[si].position / 100, 0, 1);
            const wx = wa.x + (wb.x - wa.x) * tt;
            const wy = wa.y + (wb.y - wa.y) * tt;
            if (dist(pos, { x: wx, y: wy }) < gTh * 0.85) {
              setDragState({
                type: "gradient",
                startX: e.clientX,
                startY: e.clientY,
                gradientHandle: "stop",
                gradientPrimaryId: o.id,
                gradientStopIndex: si,
              });
              return;
            }
          }
        } else if (f.type === "gradient-radial") {
          const wc = localBoxToWorld(o, f.cx, f.cy);
          const wr = localBoxToWorld(o, Math.min(1, f.cx + f.r), f.cy);
          if (dist(pos, wc) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "radC", gradientPrimaryId: o.id });
            return;
          }
          if (dist(pos, wr) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "radR", gradientPrimaryId: o.id });
            return;
          }
        }
      }
    }

    // Designer: intercept click on text frame overflow port (before resize handles)
    if (designerMode && selectedObjects.length === 1) {
      const tfObj = selectedObjects[0];
      if (tfObj.isTextFrame && (tfObj as any)._designerOverflow) {
        const ti = (tfObj as any)._designerThreadInfo as { index: number; total: number } | undefined;
        const hasOut = ti && ti.index < ti.total - 1;
        if (!hasOut) {
          const portCx = tfObj.x + tfObj.width + 13;
          const portCy = tfObj.y + tfObj.height + 1;
          if (dist(pos, { x: portCx, y: portCy }) < 14 / viewport.zoom) {
            onDesignerAppendThreadedFrame?.(tfObj.id);
            return;
          }
        }
      }
    }

    // Designer: pan / escala del bitmap dentro del marco (modo edición en lienzo)
    if (
      designerMode &&
      imageFrameContentEditId &&
      activeTool === "select" &&
      e.button === 0 &&
      !extendSel
    ) {
      const edObj = objects.find((o) => o.id === imageFrameContentEditId);
      if (edObj?.isImageFrame && edObj.imageFrameContent?.src && selectedIds.has(edObj.id) && selectedIds.size === 1) {
        const hitIc = hitTestImageContentEdit(pos, edObj, viewport.zoom);
        if (hitIc === "pan") {
          const g = getImageFrameContentGeom(edObj);
          if (g) {
            setDragState({
              type: "imageContentPan",
              startX: e.clientX,
              startY: e.clientY,
              imageFrameId: edObj.id,
              startOffsetX: g.ifc.offsetX,
              startOffsetY: g.ifc.offsetY,
            });
            return;
          }
        } else if (hitIc === "nw" || hitIc === "ne" || hitIc === "sw" || hitIc === "se") {
          setDragState({
            type: "imageContentResize",
            startX: e.clientX,
            startY: e.clientY,
            imageFrameId: edObj.id,
            imageCorner: hitIc,
          });
          return;
        }
      }
    }

    // Contenido dentro de máscara (aislamiento): pan / escala con mismas esquinas que marco de imagen
    if (
      isClipContentIsolation &&
      clipContentEditId &&
      activeTool === "select" &&
      e.button === 0 &&
      !extendSel
    ) {
      const edObj = objects.find((o) => o.id === clipContentEditId);
      if (edObj && !edObj.locked && edObj.visible && selectedIds.has(clipContentEditId) && selectedIds.size === 1) {
        const aabb = getVisualAABB(edObj, objects);
        const hitInner = hitTestInnerContentHandles(pos, aabb, viewport.zoom);
        if (hitInner === "pan") {
          const positions = new Map<string, Point>();
          const pathPointsMap = new Map<string, BezierPoint[]>();
          positions.set(edObj.id, { x: edObj.x, y: edObj.y });
          if (edObj.type === "path") {
            pathPointsMap.set(
              edObj.id,
              (edObj as PathObject).points.map((pt) => ({
                ...pt,
                anchor: { ...pt.anchor },
                handleIn: { ...pt.handleIn },
                handleOut: { ...pt.handleOut },
              })),
            );
          }
          setDragState({ type: "move", startX: e.clientX, startY: e.clientY, positions, pathPointsMap });
          return;
        }
        if (hitInner === "nw" || hitInner === "ne" || hitInner === "sw" || hitInner === "se") {
          const f = selectionFrame;
          if (f && selectedObjects.length > 0) {
            const allBounds = new Map<string, Rect>();
            const resizeSnapshot = new Map<string, FreehandObject>();
            for (const so of selectedObjects) {
              allBounds.set(so.id, getVisualAABB(so, objects));
              resizeSnapshot.set(so.id, deepCloneFreehandObjectKeepIds(so));
            }
            setDragState({
              type: "resize",
              startX: e.clientX,
              startY: e.clientY,
              handle: hitInner,
              bounds: { ...groupBounds },
              initialOrientedFrame: { ...f },
              allBounds,
              resizeSnapshot,
            });
            return;
          }
        }
      }
    }

    const hideFrameHandlesForInnerContent =
      (designerMode &&
        imageFrameContentEditId != null &&
        selectedIds.size === 1 &&
        selectedIds.has(imageFrameContentEditId)) ||
      (isClipContentIsolation &&
        clipContentEditId != null &&
        selectedIds.size === 1 &&
        selectedIds.has(clipContentEditId));

    // Resize/rotate handles (omitir si se amplía selección: el clic debe llegar al objeto bajo el marco)
    if (selectedObjects.length > 0 && selectionFrame && !extendSel && !hideFrameHandlesForInnerContent) {
      const f = selectionFrame;
      const handleSize = 8 / viewport.zoom;
      const rotOffset = 14 / viewport.zoom;
      const hw = f.w / 2, hh = f.h / 2;

      const rotLocal = [{ x: hw + rotOffset, y: -hh - rotOffset }];
      for (const rl of rotLocal) {
        const rc = localToWorldOBB(rl, f.cx, f.cy, f.angleDeg);
        if (dist(pos, rc) < handleSize) {
          const startAngle = Math.atan2(pos.y - f.cy, pos.x - f.cx);
          const initRots = new Map<string, number>();
          const initSnaps = new Map<string, FreehandObject>();
          for (const so of selectedObjects) {
            initRots.set(so.id, so.rotation);
            initSnaps.set(so.id, deepCloneFreehandObjectKeepIds(so));
          }
          setDragState({
            type: "rotate", startX: e.clientX, startY: e.clientY,
            rotateCenter: { x: f.cx, y: f.cy }, rotateStartAngle: startAngle, rotateInitialRotations: initRots,
            rotateInitialSnapshots: initSnaps,
          });
          return;
        }
      }

      const hDefs: { id: string; lx: number; ly: number }[] = [
        { id: "nw", lx: -hw, ly: -hh }, { id: "ne", lx: hw, ly: -hh },
        { id: "se", lx: hw, ly: hh }, { id: "sw", lx: -hw, ly: hh },
        { id: "n", lx: 0, ly: -hh }, { id: "e", lx: hw, ly: 0 },
        { id: "s", lx: 0, ly: hh }, { id: "w", lx: -hw, ly: 0 },
      ];
      for (const hi of hDefs) {
        const hp = localToWorldOBB({ x: hi.lx, y: hi.ly }, f.cx, f.cy, f.angleDeg);
        if (dist(pos, hp) < handleSize) {
          const allBounds = new Map<string, Rect>();
          const resizeSnapshot = new Map<string, FreehandObject>();
          for (const so of selectedObjects) {
            allBounds.set(so.id, getVisualAABB(so, objects));
            resizeSnapshot.set(so.id, deepCloneFreehandObjectKeepIds(so));
          }
          setDragState({
            type: "resize", startX: e.clientX, startY: e.clientY,
            handle: hi.id,
            bounds: { ...groupBounds },
            initialOrientedFrame: { ...f },
            allBounds,
            resizeSnapshot,
          });
          return;
        }
      }
    }

    // Todos los objetos bajo el cursor (frente → fondo). Con solape + Mayús, elegir uno que aún no esté entero en la selección.
    const hits: FreehandObject[] = [];
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (hitTestObject(pos, o, threshold, objects)) hits.push(o);
    }

    if (hits.length > 0) {
      const vecIsoGid = vectorIsolationGroupId(isolationStackRef.current);
      const obj = pickHitForExtendSelection(hits, extendSel, selectedIdsRef.current, objects, vecIsoGid) ?? hits[0];
      // Alt/Option + drag → duplicate then drag the clones
      if (e.altKey) {
        const baseSel = selectedIds.has(obj.id) ? selectedIds : resolveSelection(obj.id, false);
        const toClone = objects.filter((o) => baseSel.has(o.id));
        if (toClone.length > 0) {
          const clones = toClone.map((o) => deepCloneFreehandObject(o, uid));
          const next = [...objects, ...clones];
          setObjects(next);
          const cloneSel = new Set(clones.map((c) => c.id));
          setSelectedIds(cloneSel);
          const positions = new Map<string, Point>();
          const pathPointsMap = new Map<string, BezierPoint[]>();
          const pathSvgMatrixStart = new Map<string, { e: number; f: number }>();
          for (const c of clones) {
            positions.set(c.id, { x: c.x, y: c.y });
            if (c.type === "path") {
              const cp = c as PathObject;
              pathPointsMap.set(c.id, cp.points.map(pt => ({ ...pt, anchor: { ...pt.anchor }, handleIn: { ...pt.handleIn }, handleOut: { ...pt.handleOut } })));
              if (cp.svgPathMatrix) pathSvgMatrixStart.set(c.id, { e: cp.svgPathMatrix.e, f: cp.svgPathMatrix.f });
              else if (
                cp.svgPathD &&
                (!cp.points || cp.points.length < 2) &&
                (cp.svgPathIntrinsicW == null || cp.svgPathIntrinsicH == null)
              ) pathSvgMatrixStart.set(c.id, { e: 0, f: 0 });
            }
          }
          setDragState({
            type: "move",
            startX: e.clientX,
            startY: e.clientY,
            positions,
            pathPointsMap,
            pathSvgMatrixStart: pathSvgMatrixStart.size > 0 ? pathSvgMatrixStart : undefined,
            duplicateMove: true,
          });
          pushHistory(next, cloneSel);
          return;
        }
      }

      const newSel = extendSel
        ? resolveSelection(obj.id, true)
        : selectedIds.has(obj.id)
          ? new Set(selectedIds)
          : resolveSelection(obj.id, false);
      setSelectedIds(newSel);
      setPrimarySelectedId(obj.id);
      const positions = new Map<string, Point>();
      const pathPointsMap = new Map<string, BezierPoint[]>();
      const pathSvgMatrixStart = new Map<string, { e: number; f: number }>();
      for (const sid of newSel) {
        const o = objects.find((x) => x.id === sid);
        if (o) {
          positions.set(sid, { x: o.x, y: o.y });
          if (o.type === "path") {
            const po = o as PathObject;
            pathPointsMap.set(sid, po.points.map(pt => ({ ...pt, anchor: { ...pt.anchor }, handleIn: { ...pt.handleIn }, handleOut: { ...pt.handleOut } })));
            if (po.svgPathMatrix) pathSvgMatrixStart.set(sid, { e: po.svgPathMatrix.e, f: po.svgPathMatrix.f });
            else if (
              po.svgPathD &&
              (!po.points || po.points.length < 2) &&
              (po.svgPathIntrinsicW == null || po.svgPathIntrinsicH == null)
            ) pathSvgMatrixStart.set(sid, { e: 0, f: 0 });
          }
        }
      }
      setDragState({
        type: "move",
        startX: e.clientX,
        startY: e.clientY,
        positions,
        pathPointsMap,
        pathSvgMatrixStart: pathSvgMatrixStart.size > 0 ? pathSvgMatrixStart : undefined,
      });
      return;
    }

    // Empty click → start marquee
    if (!extendSel) {
      setSelectedIds(new Set());
      if (designerMode) setImageFrameContentEditId(null);
      setClipContentEditId(null);
    }
    setDragState({ type: "marquee", startX: e.clientX, startY: e.clientY, marqueeOrigin: pos, currentCanvas: pos, shiftKey: extendSel });
  }, [activeTool, viewport, spaceHeld, objects, artboards, selectedIds, selectedObjects, groupBounds, selectionFrame,
      screenToCanvas, isPenDrawing, penPoints, finishPenPath, resolveSelection, addPointOnSegment, pushHistory,
      layoutGuides, showLayoutGuides, designerMode, imageFrameContentEditId, setupGuideWindowListeners,
      isClipContentIsolation, clipContentEditId]);

  const handleMouseMove = useCallback((e: ReactMouseEvent) => {
    if (!dragState) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      if (activeTool === "select" || activeTool === "directSelect") {
        const threshold = 8 / viewport.zoom;
        let found: string | null = null;
        for (let i = objects.length - 1; i >= 0; i--) {
          const obj = objects[i];
          if (!obj.visible || obj.locked) continue;
          if (obj.isClipMask || obj.clipMaskId) continue;
          if (hitTestObject(pos, obj, threshold, objects)) {
            found = obj.id;
            break;
          }
        }
        setHoverCanvasId((prev) => (prev === found ? prev : found));
      }
      if (activeTool === "pen" && isPenDrawing && penPoints.length >= 1 && !penDragging) {
        setPenHoverCanvas(pos);
      } else {
        setPenHoverCanvas((h) => (h == null ? h : null));
      }
      return;
    }
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    if (dragState.type === "guidePull" || dragState.type === "guideMove") {
      return;
    }

    if (dragState.type === "pan") {
      setViewport((v) => ({ ...v, x: (dragState.svpX ?? 0) + dx, y: (dragState.svpY ?? 0) + dy }));
      return;
    }

    if (
      dragState.type === "imageContentPan" &&
      dragState.imageFrameId != null &&
      dragState.startOffsetX != null &&
      dragState.startOffsetY != null
    ) {
      const scale = 1 / viewport.zoom;
      const ddx = (e.clientX - dragState.startX) * scale;
      const ddy = (e.clientY - dragState.startY) * scale;
      const fid = dragState.imageFrameId;
      const ox0 = dragState.startOffsetX;
      const oy0 = dragState.startOffsetY;
      setObjects((prev) =>
        prev.map((o) => {
          if (o.id !== fid || !o.isImageFrame || !o.imageFrameContent?.src) return o;
          const c = o.imageFrameContent;
          return {
            ...o,
            imageFrameAutoFit: false,
            imageFrameContent: {
              ...c,
              offsetX: ox0 + ddx,
              offsetY: oy0 + ddy,
            },
          };
        }),
      );
      return;
    }

    if (dragState.type === "imageContentResize" && dragState.imageFrameId && dragState.imageCorner) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const mx = pos.x, my = pos.y;
      const fid = dragState.imageFrameId;
      const corner = dragState.imageCorner;
      const lockAspect = isShiftHeld(e);
      setObjects((prev) =>
        prev.map((obj) => {
          if (obj.id !== fid || !obj.isImageFrame || !obj.imageFrameContent?.src) return obj;
          const c = obj.imageFrameContent;
          const fx = obj.x, fy = obj.y;
          const L = fx + c.offsetX, T = fy + c.offsetY;
          const R = L + c.originalWidth * c.scaleX, B = T + c.originalHeight * c.scaleY;
          const ow = c.originalWidth, oh = c.originalHeight;
          let nextScaleX = c.scaleX, nextScaleY = c.scaleY, nextOx = c.offsetX, nextOy = c.offsetY;
          if (corner === "se") {
            let sx = Math.max(0.01, (mx - L) / ow);
            let sy = Math.max(0.01, (my - T) / oh);
            if (lockAspect) {
              const s = Math.min(sx, sy);
              sx = sy = s;
            }
            nextScaleX = sx;
            nextScaleY = sy;
          } else if (corner === "nw") {
            let sx = Math.max(0.01, (R - mx) / ow);
            let sy = Math.max(0.01, (B - my) / oh);
            if (lockAspect) {
              const s = Math.min(sx, sy);
              sx = sy = s;
              const Ln = R - ow * sx;
              const Tn = B - oh * sy;
              nextOx = Ln - fx;
              nextOy = Tn - fy;
            } else {
              nextOx = mx - fx;
              nextOy = my - fy;
            }
            nextScaleX = sx;
            nextScaleY = sy;
          } else if (corner === "ne") {
            let sx = Math.max(0.01, (mx - L) / ow);
            let sy = Math.max(0.01, (B - my) / oh);
            if (lockAspect) {
              const s = Math.min(sx, sy);
              sx = sy = s;
              nextOy = B - oh * sy - fy;
            } else {
              nextOy = my - fy;
            }
            nextScaleX = sx;
            nextScaleY = sy;
          } else if (corner === "sw") {
            let sx = Math.max(0.01, (R - mx) / ow);
            let sy = Math.max(0.01, (my - T) / oh);
            if (lockAspect) {
              const s = Math.min(sx, sy);
              sx = sy = s;
              nextOx = R - ow * sx - fx;
            } else {
              nextOx = mx - fx;
            }
            nextScaleX = sx;
            nextScaleY = sy;
          }
          return {
            ...obj,
            imageFrameAutoFit: false,
            imageFrameContent: {
              ...c,
              scaleX: nextScaleX,
              scaleY: nextScaleY,
              offsetX: nextOx,
              offsetY: nextOy,
            },
          };
        }),
      );
      return;
    }

    if (dragState.type === "penHandle" && penPoints.length > 0) {
      setPenHoverCanvas(null);
      const pos = screenToCanvas(e.clientX, e.clientY);
      setPenPoints((prev) => {
        const pts = [...prev];
        const last = pts[pts.length - 1];
        pts[pts.length - 1] = applyVertexHandleDrag(last, "handleOut", pos);
        return pts;
      });
      return;
    }

    if (dragState.type === "marquee" && dragState.marqueeOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDragState((prev) => prev ? { ...prev, currentCanvas: pos } : null);
      return;
    }

    if (dragState.type === "create" && dragState.createOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const o = dragState.createOrigin;
      const ct = dragState.createType;
      const next =
        (ct === "rect" || ct === "ellipse") && isShiftHeld(e)
          ? oppositeCornerForSquareDrag(o, pos)
          : pos;
      setDragState((prev) => prev ? { ...prev, currentCanvas: next } : null);
      return;
    }

    if (dragState.type === "createText" && dragState.createOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDragState((prev) => prev ? { ...prev, currentCanvas: pos } : null);
      return;
    }

    if ((dragState.type === "createTextFrame" || dragState.type === "createImageFrame") && dragState.createOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDragState((prev) => prev ? { ...prev, currentCanvas: pos } : null);
      return;
    }

    if (dragState.type === "gradient" && dragState.gradientPrimaryId && dragState.gradientHandle) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const primary = objects.find((o) => o.id === dragState.gradientPrimaryId);
      if (!primary) return;
      const f0 = migrateFill(primary.fill);

      if (dragState.gradientHandle === "stop" && dragState.gradientStopIndex != null && f0.type === "gradient-linear") {
        const ff = f0;
        const a = localBoxToWorld(primary, ff.x1, ff.y1);
        const b = localBoxToWorld(primary, ff.x2, ff.y2);
        const abx = b.x - a.x, aby = b.y - a.y;
        const len2 = abx * abx + aby * aby || 1e-9;
        const apx = pos.x - a.x, apy = pos.y - a.y;
        let t = (apx * abx + apy * aby) / len2;
        t = clamp(t, 0, 1);
        const posPct = t * 100;
        const si = dragState.gradientStopIndex;
        const sel = selectedIdsRef.current;
        setObjects((prev) =>
          prev.map((o) => {
            if (o.id !== dragState.gradientPrimaryId || !sel.has(o.id)) return o;
            if (o.type === "textOnPath") return o;
            const mf = migrateFill(o.fill);
            if (mf.type !== "gradient-linear") return o;
            const stops = mf.stops.map((s, i) => (i === si ? { ...s, position: posPct } : { ...s }));
            stops.sort((x, y) => x.position - y.position);
            return { ...o, fill: { ...mf, stops } };
          }),
        );
        return;
      }

      const loc = worldToLocalBox(primary, pos);
      const lx = clamp(loc.lx, 0, 1);
      const ly = clamp(loc.ly, 0, 1);
      const sel = selectedIdsRef.current;
      setObjects((prev) =>
        prev.map((o) => {
          if (!sel.has(o.id) || !supportsGradientFill(o)) return o;
          if (o.type === "textOnPath") return o;
          const f = migrateFill(o.fill);
          if (f.type === "gradient-linear") {
            let nf = { ...f, stops: f.stops.map((s) => ({ ...s })) };
            if (dragState.gradientHandle === "linA") nf = { ...nf, x1: lx, y1: ly };
            else if (dragState.gradientHandle === "linB") nf = { ...nf, x2: lx, y2: ly };
            return { ...o, fill: nf };
          }
          if (f.type === "gradient-radial") {
            let nf = { ...f, stops: f.stops.map((s) => ({ ...s })) };
            if (dragState.gradientHandle === "radC") {
              nf = { ...nf, cx: lx, cy: ly, fx: lx, fy: ly };
            } else if (dragState.gradientHandle === "radR") {
              const rr = Math.hypot(lx - f.cx, ly - f.cy);
              nf = { ...nf, r: clamp(rr, 0.02, 1.5) };
            }
            return { ...o, fill: nf };
          }
          return o;
        }),
      );
      return;
    }

    if (dragState.type === "move" && dragState.positions) {
      const scale = canvasScaleFromPointer(viewport.zoom);
      let mdx = dx * scale, mdy = dy * scale;

      if (isShiftHeld(e)) {
        const c = snapDeltaTo45(mdx, mdy);
        mdx = c.x; mdy = c.y;
      }

      if (snapEnabled && dragState.positions.size > 0) {
        const firstPos = Array.from(dragState.positions.values())[0];
        const tentBounds = getGroupBounds(
          Array.from(dragState.positions.entries()).map(([id, p]) => {
            const obj = objects.find((o) => o.id === id)!;
            return { ...obj, x: p.x + mdx, y: p.y + mdy };
          })
        );
        const vg = layoutGuidesRef.current.filter((g) => g.orientation === "vertical").map((g) => g.position);
        const hg = layoutGuidesRef.current.filter((g) => g.orientation === "horizontal").map((g) => g.position);
        const snap = computeSnap(tentBounds, objects, selectedIds, viewport.zoom, { vertical: vg, horizontal: hg });
        mdx += snap.dx;
        mdy += snap.dy;
        setSnapGuides(snap.guides);
      } else {
        setSnapGuides([]);
      }

      setObjects((prev) => prev.map((o) => {
        const sp = dragState.positions!.get(o.id);
        if (!sp) return o;
        if (
          o.type === "path" &&
          dragState.pathPointsMap?.has(o.id) &&
          (dragState.pathPointsMap.get(o.id)?.length ?? 0) > 0
        ) {
          const origPts = dragState.pathPointsMap.get(o.id)!;
          const newPts = origPts.map(pt => ({
            ...pt,
            anchor: { x: pt.anchor.x + mdx, y: pt.anchor.y + mdy },
            handleIn: { x: pt.handleIn.x + mdx, y: pt.handleIn.y + mdy },
            handleOut: { x: pt.handleOut.x + mdx, y: pt.handleOut.y + mdy },
          }));
          const pb = getPathBoundsFromPoints(newPts);
          return { ...o, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: newPts };
        }
        if (o.type === "path") {
          const po = o as PathObject;
          const m0 = dragState.pathSvgMatrixStart?.get(o.id);
          if (
            m0 != null &&
            po.svgPathD &&
            (!po.points || po.points.length < 2) &&
            (po.svgPathIntrinsicW == null || po.svgPathIntrinsicH == null)
          ) {
            const base = po.svgPathMatrix ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            return {
              ...o,
              x: sp.x + mdx,
              y: sp.y + mdy,
              svgPathMatrix: { ...base, e: m0.e + mdx, f: m0.f + mdy },
            };
          }
        }
        return { ...o, x: sp.x + mdx, y: sp.y + mdy };
      }));
      return;
    }

    if (dragState.type === "resize" && dragState.allBounds && dragState.initialOrientedFrame) {
      const scale = canvasScaleFromPointer(viewport.zoom);
      const dCanvas = { x: dx * scale, y: dy * scale };
      const f0 = dragState.initialOrientedFrame;
      const h = dragState.handle!;
      const dLocal = worldDeltaToLocal(dCanvas, f0.angleDeg);
      let nw = f0.w, nh = f0.h;
      if (h.includes("e")) nw = Math.max(10, f0.w + dLocal.x);
      if (h.includes("w")) nw = Math.max(10, f0.w - dLocal.x);
      if (h.includes("s")) nh = Math.max(10, f0.h + dLocal.y);
      if (h.includes("n")) nh = Math.max(10, f0.h - dLocal.y);

      if (isShiftHeld(e)) {
        const aspect = f0.w / f0.h;
        if (h === "n" || h === "s") nw = Math.max(10, nh * aspect);
        else if (h === "e" || h === "w") nh = Math.max(10, nw / aspect);
        else {
          const avgScale = ((nw / f0.w) + (nh / f0.h)) / 2;
          nw = Math.max(10, f0.w * avgScale);
          nh = Math.max(10, f0.h * avgScale);
        }
      } else {
        const snaps = dragState.resizeSnapshot;
        if (snaps && dragState.allBounds) {
          const ids = Array.from(dragState.allBounds.keys());
          if (ids.length > 0 && ids.every((id) => snaps.get(id)?.type === "image")) {
            const u = (nw / f0.w + nh / f0.h) / 2;
            nw = Math.max(10, f0.w * u);
            nh = Math.max(10, f0.h * u);
          }
        }
      }

      const dw = nw - f0.w, dh = nh - f0.h;
      const th = degToRad(f0.angleDeg);
      const ux = Math.cos(th), uy = Math.sin(th);
      const vx = -Math.sin(th), vy = Math.cos(th);
      /** Borde opuesto fijo: e/s suman mitad; w/n restan (antes +/+ para todos y n/w movían el lado equivocado). */
      let tcx = 0, tcy = 0;
      if (h.includes("e")) { tcx += (dw / 2) * ux; tcy += (dw / 2) * uy; }
      if (h.includes("w")) { tcx -= (dw / 2) * ux; tcy -= (dw / 2) * uy; }
      if (h.includes("s")) { tcx += (dh / 2) * vx; tcy += (dh / 2) * vy; }
      if (h.includes("n")) { tcx -= (dh / 2) * vx; tcy -= (dh / 2) * vy; }
      const ncx = f0.cx + tcx;
      const ncy = f0.cy + tcy;
      const sx = nw / f0.w, sy = nh / f0.h;

      setObjects((prev) => prev.map((o) => {
        if (!dragState.allBounds!.has(o.id)) return o;
        const src = dragState.resizeSnapshot?.get(o.id);
        if (!src) return o;
        const mapWorld = (p: Point) => {
          const L = worldToLocalOBB(p, f0.cx, f0.cy, f0.angleDeg);
          return localToWorldOBB({ x: L.x * sx, y: L.y * sy }, ncx, ncy, f0.angleDeg);
        };
        if (src.type === "path") {
          const pp = src as PathObject;
          if (pp.svgPathD && (!pp.points || pp.points.length < 2)) {
            const newW = Math.max(4, src.width * sx);
            const newH = Math.max(4, src.height * sy);
            const pivot = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
            const newC = mapWorld(pivot);
            return { ...o, x: newC.x - newW / 2, y: newC.y - newH / 2, width: newW, height: newH };
          }
          const pts = pp.points.map((pt) => ({
            ...pt,
            anchor: mapWorld(pt.anchor),
            handleIn: mapWorld(pt.handleIn),
            handleOut: mapWorld(pt.handleOut),
          }));
          const pb = getPathBoundsFromPoints(pts);
          return { ...o, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: pts };
        }
        if (src.type === "clippingContainer") {
          return mapObjectPointsWithWorld(src, mapWorld) as ClippingContainerObject;
        }
        if (src.type === "text") {
          const t = src as TextObject;
          if (t.isTextFrame) {
            const newW = Math.max(20, src.width * sx);
            const newH = Math.max(20, src.height * sy);
            const pivot = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
            const newC = mapWorld(pivot);
            return { ...o, x: newC.x - newW / 2, y: newC.y - newH / 2, width: newW, height: newH };
          }
          const { w: lw, h: lh } = textLayoutDims(t);
          const pivot = { x: src.x + lw / 2, y: src.y + lh / 2 };
          const newC = mapWorld(pivot);
          return {
            ...o,
            x: newC.x - lw / 2,
            y: newC.y - lh / 2,
            width: t.width,
            height: t.height,
            scaleX: (t.scaleX ?? 1) * sx,
            scaleY: (t.scaleY ?? 1) * sy,
          };
        }
        const newW = Math.max(4, src.width * sx);
        const newH = Math.max(4, src.height * sy);
        const pivot = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
        const newC = mapWorld(pivot);
        return { ...o, x: newC.x - newW / 2, y: newC.y - newH / 2, width: newW, height: newH };
      }));
      return;
    }

    if (dragState.type === "resize" && dragState.bounds && dragState.allBounds && !dragState.initialOrientedFrame) {
      const scale = canvasScaleFromPointer(viewport.zoom);
      const b = dragState.bounds;
      const h = dragState.handle!;
      let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
      if (h.includes("e")) nw = Math.max(10, b.w + dx * scale);
      if (h.includes("s")) nh = Math.max(10, b.h + dy * scale);
      if (h.includes("w")) { nw = Math.max(10, b.w - dx * scale); nx = b.x + (b.w - nw); }
      if (h.includes("n")) { nh = Math.max(10, b.h - dy * scale); ny = b.y + (b.h - nh); }

      if (isShiftHeld(e)) {
        const aspect = b.w / b.h;
        if (h === "n" || h === "s") { nw = Math.max(10, nh * aspect); nx = b.x + (b.w - nw) / 2; }
        else if (h === "e" || h === "w") { nh = Math.max(10, nw / aspect); ny = b.y + (b.h - nh) / 2; }
        else {
          const avgScale = ((nw / b.w) + (nh / b.h)) / 2;
          nw = Math.max(10, b.w * avgScale); nh = Math.max(10, b.h * avgScale);
          if (h.includes("w")) nx = b.x + b.w - nw;
          if (h.includes("n")) ny = b.y + b.h - nh;
        }
      } else {
        const snaps = dragState.resizeSnapshot;
        if (snaps && dragState.allBounds) {
          const ids = Array.from(dragState.allBounds.keys());
          if (ids.length > 0 && ids.every((id) => snaps.get(id)?.type === "image")) {
            const u = (nw / b.w + nh / b.h) / 2;
            nw = Math.max(10, b.w * u);
            nh = Math.max(10, b.h * u);
          }
        }
      }

      if (snapEnabled && !isShiftHeld(e)) {
        const vg = layoutGuidesRef.current.filter((g) => g.orientation === "vertical").map((g) => g.position);
        const hg = layoutGuidesRef.current.filter((g) => g.orientation === "horizontal").map((g) => g.position);
        const sn = snapAxisAlignedResizeToGuides({ x: nx, y: ny, w: nw, h: nh }, h, vg, hg, viewport.zoom);
        nx = sn.rect.x;
        ny = sn.rect.y;
        nw = sn.rect.w;
        nh = sn.rect.h;
        setSnapGuides(sn.guides);
      } else {
        setSnapGuides([]);
      }

      const sx = nw / b.w, sy = nh / b.h;
      setObjects((prev) => prev.map((o) => {
        const ob = dragState.allBounds!.get(o.id);
        const src = dragState.resizeSnapshot?.get(o.id);
        if (!ob || !src) return o;
        const newX = nx + (ob.x - b.x) * sx;
        const newY = ny + (ob.y - b.y) * sy;
        if (src.type === "path") {
          const pp = src as PathObject;
          if (pp.svgPathD && (!pp.points || pp.points.length < 2)) {
            return { ...o, x: newX, y: newY, width: ob.w * sx, height: ob.h * sy };
          }
          const pts = pp.points.map(pt => ({
            ...pt,
            anchor: { x: nx + (pt.anchor.x - b.x) * sx, y: ny + (pt.anchor.y - b.y) * sy },
            handleIn: { x: nx + (pt.handleIn.x - b.x) * sx, y: ny + (pt.handleIn.y - b.y) * sy },
            handleOut: { x: nx + (pt.handleOut.x - b.x) * sx, y: ny + (pt.handleOut.y - b.y) * sy },
          }));
          const pb = getPathBoundsFromPoints(pts);
          return { ...o, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: pts };
        }
        if (src.type === "clippingContainer") {
          const mapWorld = (p: Point) => ({
            x: nx + (p.x - b.x) * sx,
            y: ny + (p.y - b.y) * sy,
          });
          return mapObjectPointsWithWorld(src, mapWorld) as ClippingContainerObject;
        }
        if (src.type === "text") {
          const tt = src as TextObject;
          const { w: lw, h: lh } = textLayoutDims(tt);
          const vx = nx + (ob.x - b.x) * sx;
          const vy = ny + (ob.y - b.y) * sy;
          const vw = ob.w * sx, vh = ob.h * sy;
          const tcx = vx + vw / 2, tcy = vy + vh / 2;
          return {
            ...o,
            x: tcx - lw / 2,
            y: tcy - lh / 2,
            width: tt.width,
            height: tt.height,
            scaleX: (tt.scaleX ?? 1) * sx,
            scaleY: (tt.scaleY ?? 1) * sy,
          };
        }
        return {
          ...o,
          x: newX, y: newY,
          width: ob.w * sx,
          height: ob.h * sy,
        };
      }));
      return;
    }

    if (dragState.type === "rotate" && dragState.rotateCenter && dragState.rotateStartAngle != null) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const pivot = dragState.rotateCenter;
      const currentAngle = Math.atan2(pos.y - pivot.y, pos.x - pivot.x);
      const radDelta = shortestAngleDeltaRad(currentAngle, dragState.rotateStartAngle);
      let angleDelta = (radDelta * 180) / Math.PI;
      if (e.shiftKey) angleDelta = Math.round(angleDelta / 15) * 15;
      const snaps = dragState.rotateInitialSnapshots;
      setObjects((prev) =>
        prev.map((o) => {
          const initRot = dragState.rotateInitialRotations?.get(o.id);
          if (initRot == null) return o;
          if (snaps?.has(o.id)) {
            const init = snaps.get(o.id)!;
            return applyRotateAroundSelectionPivot(init, pivot, angleDelta);
          }
          return { ...o, rotation: initRot + angleDelta };
        }),
      );
      return;
    }

    if (dragState.type === "directSelect" && dragState.dsObjId) {
      const scale = 1 / viewport.zoom;
      const start = dragState.dsStartPt!;
      let ndx = dx * scale, ndy = dy * scale;
      if (isShiftHeld(e)) {
        const s = snapDeltaTo45(ndx, ndy);
        ndx = s.x; ndy = s.y;
      }
      const clipId = dragState.dsClipContainerId;
      const applyPt = (pt: BezierPoint, pi: number, o: PathObject): BezierPoint => {
        if (pi !== dragState.dsPtIdx) return pt;
        const ht = dragState.dsHtType!;
        let newPos: Point;
        if (clipId) {
          const c = objectsRef.current.find((x) => x.id === clipId && x.type === "clippingContainer") as
            | ClippingContainerObject
            | undefined;
          if (!c) return pt;
          const sw = localPointToWorld(c, start);
          const ew = { x: sw.x + ndx, y: sw.y + ndy };
          newPos = worldPointToLocal(c, ew);
        } else {
          newPos = { x: start.x + ndx, y: start.y + ndy };
        }
        if (ht === "anchor") {
          const adx = newPos.x - pt.anchor.x, ady = newPos.y - pt.anchor.y;
          return { ...pt, anchor: newPos, handleIn: { x: pt.handleIn.x + adx, y: pt.handleIn.y + ady }, handleOut: { x: pt.handleOut.x + adx, y: pt.handleOut.y + ady } };
        }
        return applyVertexHandleDrag(pt, ht, newPos);
      };
      setObjects((prev) =>
        prev.map((o) => {
          if (clipId) {
            if (o.id !== clipId || o.type !== "clippingContainer") return o;
            const cc = o as ClippingContainerObject;
            const m = cc.mask;
            if (m.type !== "path" || m.id !== dragState.dsObjId) return o;
            const po = m as PathObject;
            const pts = po.points.map((pt, pi) => applyPt(pt, pi, po));
            const pb = getPathBoundsFromPoints(pts);
            return { ...cc, mask: { ...po, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h } };
          }
          if (o.id !== dragState.dsObjId || o.type !== "path") return o;
          const po = o as PathObject;
          const pts = po.points.map((pt, pi) => applyPt(pt, pi, po));
          const pb = getPathBoundsFromPoints(pts);
          return { ...o, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
        }),
      );
      return;
    }
  }, [dragState, viewport, objects, artboards, selectedIds, snapEnabled, screenToCanvas, penPoints.length, activeTool, isPenDrawing, penDragging]);

  const handleMouseUp = useCallback((e: ReactMouseEvent) => {
    const dsUp = dragStateRef.current;
    if (guideGestureRef.current || dsUp?.type === "guidePull" || dsUp?.type === "guideMove") {
      finishGuideGesture(e.clientX, e.clientY);
      return;
    }
    if (!dragState) return;
    setSnapGuides([]);

    if (dragState.type === "penHandle") {
      setPenDragging(false);
      setDragState(null);
      return;
    }

    if (dragState.type === "marquee" && dragState.marqueeOrigin && dragState.currentCanvas) {
      const o = dragState.marqueeOrigin, c = dragState.currentCanvas;
      const mx = Math.min(o.x, c.x), my = Math.min(o.y, c.y);
      const mw = Math.abs(c.x - o.x), mh = Math.abs(c.y - o.y);
      if (mw > 2 && mh > 2) {
        const marqueeRect: Rect = { x: mx, y: my, w: mw, h: mh };

        if (activeTool === "directSelect") {
          const newPts = new Map<string, Set<number>>();
          const selIds = new Set<string>();
          for (const obj of objects) {
            if (obj.locked || !obj.visible) continue;
            if (obj.type === "path") {
              const p = obj as PathObject;
              const idxs = new Set<number>();
              p.points.forEach((pt, i) => {
                if (pt.anchor.x >= mx && pt.anchor.x <= mx + mw && pt.anchor.y >= my && pt.anchor.y <= my + mh) {
                  idxs.add(i);
                }
              });
              if (idxs.size > 0) {
                newPts.set(obj.id, idxs);
                selIds.add(obj.id);
              }
              continue;
            }
            if (obj.type === "clippingContainer") {
              const c = obj as ClippingContainerObject;
              if (c.mask.type !== "path") continue;
              const raw = c.mask as PathObject;
              const idxs = new Set<number>();
              raw.points.forEach((pt, i) => {
                const w = localPointToWorld(c, pt.anchor);
                if (w.x >= mx && w.x <= mx + mw && w.y >= my && w.y <= my + mh) idxs.add(i);
              });
              if (idxs.size > 0) {
                newPts.set(raw.id, idxs);
                selIds.add(c.id);
              }
            }
          }
          setSelectedPoints(newPts);
          setSelectedIds(selIds);
        } else {
          const marqueeSel = new Set<string>();
          const vecIsoGid = vectorIsolationGroupId(isolationStackRef.current);
          for (const obj of objects) {
            if (obj.locked || !obj.visible || obj.isClipMask) continue;
            const objRect = getObjBounds(obj, objects);
            if (rectsIntersect(marqueeRect, objRect)) {
              const gid = obj.groupId;
              const expandMarquee = gid && !(vecIsoGid && gid === vecIsoGid);
              if (expandMarquee) objects.filter((oo) => oo.groupId === gid).forEach((oo) => marqueeSel.add(oo.id));
              else marqueeSel.add(obj.id);
            }
          }
          if (dragState.shiftKey) {
            setSelectedIds((prev) => {
              const merged = new Set(prev);
              marqueeSel.forEach((id) => merged.add(id));
              return merged;
            });
          } else {
            setSelectedIds(marqueeSel);
          }
        }
      }
      setDragState(null);
      return;
    }

    if (dragState.type === "createText" && dragState.createOrigin && dragState.currentCanvas) {
      const o = dragState.createOrigin, c = dragState.currentCanvas;
      const dx = c.x - o.x, dy = c.y - o.y;
      const dragLen = Math.hypot(dx, dy);
      const pointClick = dragLen * viewport.zoom < 6;
      if (pointClick) {
        const newObj = {
          ...defaultObj({ name: `Text ${objects.length + 1}` }),
          type: "text" as const,
          textMode: "point" as const,
          text: "",
          x: o.x,
          y: o.y,
          width: 200,
          height: 32,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 1.35,
          letterSpacing: 0,
          fontKerning: "auto",
          fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
          fontVariantLigatures: "common-ligatures",
          paragraphIndent: 0,
          textAlign: "left" as const,
          fill: solidFill(fillColor),
          stroke: "none",
          strokeWidth: 0,
          strokePosition: "over",
          scaleX: 1,
          scaleY: 1,
        } as TextObject;
        const next = [...objects, newObj];
        setObjects(next);
        const ns = new Set([newObj.id]);
        setSelectedIds(ns);
        pushHistory(next, ns);
        setTextEditingId(newObj.id);
      } else {
        const x = Math.min(o.x, c.x), y = Math.min(o.y, c.y);
        const w = Math.max(Math.abs(c.x - o.x), 40), h = Math.max(Math.abs(c.y - o.y), 32);
        const newObj = {
          ...defaultObj({ name: `Text ${objects.length + 1}` }),
          type: "text" as const,
          textMode: "area" as const,
          text: "",
          x, y,
          width: w,
          height: h,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 1.35,
          letterSpacing: 0,
          fontKerning: "auto",
          fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
          fontVariantLigatures: "common-ligatures",
          paragraphIndent: 0,
          textAlign: "left" as const,
          fill: solidFill(fillColor),
          stroke: "none",
          strokeWidth: 0,
          strokePosition: "over",
          scaleX: 1,
          scaleY: 1,
        } as TextObject;
        const next = [...objects, newObj];
        setObjects(next);
        const ns = new Set([newObj.id]);
        setSelectedIds(ns);
        pushHistory(next, ns);
        setTextEditingId(newObj.id);
      }
      setActiveTool("select");
    }

    // ── Designer: Text Frame creation ────────────────────────────
    if (dragState.type === "createTextFrame" && dragState.createOrigin && dragState.currentCanvas) {
      const o = dragState.createOrigin, c = dragState.currentCanvas;
      const x = Math.min(o.x, c.x), y = Math.min(o.y, c.y);
      const w = Math.max(Math.abs(c.x - o.x), 80), h = Math.max(Math.abs(c.y - o.y), 40);
      const frameId = uid();
      const newObj = {
        ...defaultObj({ name: `Text Frame ${objects.length + 1}` }),
        id: frameId,
        type: "text" as const,
        textMode: "area" as const,
        text: "",
        x, y,
        width: w,
        height: h,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.4,
        letterSpacing: 0,
        fontKerning: "auto" as const,
        fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
        fontVariantLigatures: "common-ligatures",
        paragraphIndent: 0,
        textAlign: "left" as const,
        fill: solidFill("#000000"),
        stroke: "none",
        strokeWidth: 0,
        strokePosition: "over",
        scaleX: 1,
        scaleY: 1,
        isTextFrame: true,
        storyId: frameId,
      } as TextObject;
      const next = [...objects, newObj];
      setObjects(next);
      const ns = new Set([newObj.id]);
      setSelectedIds(ns);
      pushHistory(next, ns);
      setTextEditingId(newObj.id);
      onDesignerTextFrameCreate?.(newObj);
      setActiveTool("select");
    }

    // ── Designer: Image Frame creation ───────────────────────────
    if (dragState.type === "createImageFrame" && dragState.createOrigin && dragState.currentCanvas) {
      const o = dragState.createOrigin, c = dragState.currentCanvas;
      const x = Math.min(o.x, c.x), y = Math.min(o.y, c.y);
      const w = Math.max(Math.abs(c.x - o.x), 40), h = Math.max(Math.abs(c.y - o.y), 40);
      const newObj: RectObject = {
        ...defaultObj({ name: `Image Frame ${objects.length + 1}` }),
        type: "rect",
        x, y,
        width: w,
        height: h,
        fill: solidFill("none"),
        stroke: "#888888",
        strokeWidth: 1,
        strokeDasharray: `${6} ${4}`,
        rx: 0,
        isImageFrame: true,
        imageFrameContent: null,
        imageFrameAutoFit: true,
        imageFrameContentAlignment: "center",
      } as RectObject;
      const next = [...objects, newObj];
      setObjects(next);
      const ns = new Set([newObj.id]);
      setSelectedIds(ns);
      pushHistory(next, ns);
      setActiveTool("select");
    }

    if (dragState.type === "create" && dragState.createOrigin && dragState.currentCanvas) {
      const o = dragState.createOrigin;
      const raw = screenToCanvas(e.clientX, e.clientY);
      const ct = dragState.createType;
      const c =
        (ct === "rect" || ct === "ellipse") && isShiftHeld(e)
          ? oppositeCornerForSquareDrag(o, raw)
          : raw;
      const x = Math.min(o.x, c.x), y = Math.min(o.y, c.y);
      const w = Math.max(Math.abs(c.x - o.x), 4), h = Math.max(Math.abs(c.y - o.y), 4);

      const newObj: FreehandObject = dragState.createType === "ellipse"
        ? { ...defaultObj({ name: `Ellipse ${objects.length + 1}` }), type: "ellipse", x, y, width: w, height: h, fill: solidFill(fillColor), stroke: strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray } as EllipseObject
        : { ...defaultObj({ name: `Rect ${objects.length + 1}` }), type: "rect", x, y, width: w, height: h, fill: solidFill(fillColor), stroke: strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray, rx: 0 } as RectObject;

      const next = [...objects, newObj];
      setObjects(next);
      const ns = new Set([newObj.id]);
      setSelectedIds(ns);
      pushHistory(next, ns);
      setActiveTool("select");
    }

    if (
      dragState.type === "move" &&
      dragState.duplicateMove &&
      dragState.positions &&
      dragState.positions.size > 0
    ) {
      const firstId = Array.from(dragState.positions.keys())[0];
      if (firstId) {
        const init = dragState.positions.get(firstId);
        const cur = objects.find((o) => o.id === firstId);
        if (init && cur) {
          duplicateStepRef.current = { dx: cur.x - init.x, dy: cur.y - init.y };
        }
      }
    }

    if (
      dragState.type === "move" ||
      dragState.type === "resize" ||
      dragState.type === "directSelect" ||
      dragState.type === "rotate" ||
      dragState.type === "gradient" ||
      dragState.type === "imageContentPan" ||
      dragState.type === "imageContentResize"
    ) {
      pushHistory(objects, selectedIds);
    }

    setDragState(null);
  }, [
    dragState,
    objects,
    artboards,
    selectedIds,
    fillColor,
    strokeColor,
    strokeWidth,
    strokeLinecap,
    strokeLinejoin,
    strokeDasharray,
    activeTool,
    pushHistory,
    screenToCanvas,
    viewport.zoom,
    finishGuideGesture,
  ]);

  const handleWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault();
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setViewport((v) => {
      const nz = clamp(v.zoom * factor, 0.05, 20);
      const ratio = nz / v.zoom;
      return { zoom: nz, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  }, []);

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    // Same as right-button mousedown: some platforms deliver contextmenu without a reliable button-2 path
    const pos = screenToCanvas(e.clientX, e.clientY);
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (hitTestObject(pos, obj, 8 / viewport.zoom, objects)) {
        if (!selectedIds.has(obj.id)) setSelectedIds(resolveSelection(obj.id, false));
        break;
      }
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, canvas: pos });
  }, [objects, selectedIds, screenToCanvas, viewport.zoom, resolveSelection]);

  const renameSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const o = objectsRef.current.find((x) => sel.has(x.id));
    if (!o) return;
    const name = window.prompt("Layer name", o.name);
    if (name != null && name.trim()) updateSelectedProp("name", name.trim());
  }, [updateSelectedProp]);

  const handleLinkTextToPath = useCallback(() => {
    const prev = objectsRef.current;
    const sel = selectedIdsRef.current;
    const next = linkTextToPath(prev, sel);
    if (next === prev) return;
    const added = next.find((n) => !prev.some((o) => o.id === n.id));
    setObjects(next);
    if (added?.type === "textOnPath") setSelectedIds(new Set([added.id]));
    pushHistory(next, new Set(added?.type === "textOnPath" ? [added.id] : sel));
  }, [pushHistory]);

  // ── Context menu items ────────────────────────────────────────────

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const hasSel = selectedIds.size > 0;
    const multiSel = selectedIds.size >= 2;
    const single = selectedIds.size === 1 ? selectedObjects[0] : null;
    const hasClip = selectedObjects.some((o) => o.clipMaskId || o.isClipMask);
    const hasPath = selectedObjects.some((o) => o.type === "path");
    const hasBoolGroup = selectedObjects.some((o) => o.type === "booleanGroup");

    if (isolationDepth > 0) {
      const top = isolationStackRef.current[isolationStackRef.current.length - 1];
      const clipIso = top?.kind === "clipping";
      return [
        { label: "Exit isolation mode", shortcut: "Esc", action: () => { void exitIsolation(); } },
        ...(clipIso
          ? [
              { label: "Edit content", action: () => switchClippingIsolationMode("content"), disabled: top.editMode === "content" },
              { label: "Edit mask", action: () => switchClippingIsolationMode("mask"), disabled: top.editMode === "mask" },
            ]
          : []),
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, disabled: !hasSel, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected, disabled: !hasSel },
        { label: "Delete", action: deleteSelected, disabled: !hasSel },
      ];
    }

    if (!hasSel) {
      return [
        { label: "Paste", shortcut: "⌘V", action: pasteClipboardObjects },
        { label: "Import image…", action: () => fileInputRef.current?.click() },
        { label: "Import SVG…", action: () => svgInputRef.current?.click() },
        {
          label: "Guía vertical aquí",
          action: () => {
            const c = ctxMenu?.canvas;
            if (c) setLayoutGuides((p) => [...p, createLayoutGuide("vertical", c.x)]);
          },
        },
        {
          label: "Guía horizontal aquí",
          action: () => {
            const c = ctxMenu?.canvas;
            if (c) setLayoutGuides((p) => [...p, createLayoutGuide("horizontal", c.y)]);
          },
        },
        {
          label: "Quitar todas las guías",
          action: () => setLayoutGuides([]),
          disabled: layoutGuides.length === 0,
          separator: true,
        },
        {
          label: showLayoutGuides ? "Ocultar guías" : "Mostrar guías",
          action: () => setShowLayoutGuides((v) => !v),
        },
        { label: "Add text", shortcut: "T", action: () => setActiveTool("text"), separator: true },
        { label: "Rectangle", shortcut: "R", action: () => setActiveTool("rect") },
        { label: "Ellipse", shortcut: "E", action: () => setActiveTool("ellipse") },
        { label: "Select all", shortcut: "⌘A", action: () => setSelectedIds(new Set(objects.map((o) => o.id))) },
        { label: "Export página…", action: () => { setExportModalScope("full"); setShowExportModal(true); }, separator: true },
        { label: "Reset zoom", action: resetZoomCanvas, separator: true },
        { label: "Fit all", action: fitAllCanvas },
        { label: showGrid ? "Hide grid" : "Show grid", action: () => setShowGrid((g) => !g) },
        { label: snapEnabled ? "Disable snap" : "Enable snap", action: () => setSnapEnabled((s) => !s) },
      ];
    }

    if (multiSel) {
      return [
        ...(canLinkTextToPath
          ? [{ label: "Texto sobre trazado", action: handleLinkTextToPath, separator: true } as ContextMenuItem]
          : []),
        { label: "Cut", shortcut: "⌘X", action: cutSelectedObjects },
        { label: "Copy", shortcut: "⌘C", action: copySelectedObjects },
        { label: "Paste", shortcut: "⌘V", action: pasteClipboardObjects, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Group", shortcut: "⌘G", action: groupSelected, separator: true },
        { label: "Align left", action: () => alignObjects("left") },
        { label: "Align center (H)", action: () => alignObjects("centerH") },
        { label: "Align right", action: () => alignObjects("right") },
        { label: "Distribute H", action: () => alignObjects("distH"), separator: true },
        { label: "Union", action: () => void booleanOp("union") },
        { label: "Subtract", action: () => void booleanOp("subtract") },
        { label: "Intersect", action: () => void booleanOp("intersect") },
        { label: "Exclude", action: () => void booleanOp("exclude") },
        { label: "Create clipping mask", action: createClipMask, separator: true },
        { label: "Lock", action: () => { const locked = selectedObjects.every((o) => o.locked); updateSelectedProp("locked", !locked); } },
        { label: "Hide", action: () => { const vis = selectedObjects.every((o) => o.visible); updateSelectedProp("visible", !vis); } },
      ];
    }

    if (single?.isTextFrame) {
      const tfi = single._designerThreadInfo;
      const canUnlinkTf = tfi && tfi.index > 0;
      return [
        { label: "Editar texto", action: () => setTextEditingId(single.id), shortcut: "dbl-click" },
        ...(single._designerOverflow ? [
          { label: "Añadir marco enlazado ↗", action: () => onDesignerAppendThreadedFrame?.(single.id) },
        ] : []),
        ...(canUnlinkTf ? [
          { label: "Romper enlace entrante", action: () => onDesignerUnlinkTextFrame?.(single.id), separator: true },
        ] : []),
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected, separator: !canUnlinkTf },
        { label: "Delete", action: deleteSelected },
        { label: "Bring to front", action: bringToFront, separator: true },
        { label: "Send to back", action: sendToBack },
        { label: "Lock / Unlock", action: () => updateSelectedProp("locked", !single.locked) },
      ];
    }

    if (single?.type === "text") {
      return [
        { label: "Edit text", action: () => setTextEditingId(single.id), shortcut: "dbl-click" },
        { label: "Convert to outlines", action: () => { void convertTextToOutlines(); }, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Bring to front", action: bringToFront, separator: true },
        { label: "Send to back", action: sendToBack },
      ];
    }

    if (single?.isImageFrame) {
      const ifc = single.imageFrameContent;
      const applyFit = (mode: string) => {
        if (!ifc) return;
        const fw = single.width, fh = single.height, iw = ifc.originalWidth, ih = ifc.originalHeight;
        let sX: number, sY: number, oX: number, oY: number;
        if (mode === "fit-proportional") { const s = Math.min(fw / iw, fh / ih); sX = sY = s; oX = (fw - iw * s) / 2; oY = (fh - ih * s) / 2; }
        else if (mode === "fill-proportional") { const s = Math.max(fw / iw, fh / ih); sX = sY = s; oX = (fw - iw * s) / 2; oY = (fh - ih * s) / 2; }
        else if (mode === "fit-stretch" || mode === "fill-stretch") { sX = fw / iw; sY = fh / ih; oX = 0; oY = 0; }
        else if (mode === "center-content") { sX = sY = 1; oX = (fw - iw) / 2; oY = (fh - ih) / 2; }
        else if (mode === "frame-to-content") {
          const csx = ifc.scaleX || 1, csy = ifc.scaleY || 1;
          updateSelectedProp("width", iw * csx);
          updateSelectedProp("height", ih * csy);
          updateSelectedProp("imageFrameContent", { ...ifc, offsetX: 0, offsetY: 0, fittingMode: mode });
          return;
        }
        else { sX = sY = 1; oX = 0; oY = 0; }
        updateSelectedProp("imageFrameContent", { ...ifc, scaleX: sX, scaleY: sY, offsetX: oX, offsetY: oY, fittingMode: mode });
      };
      const fittingItems: ContextMenuItem[] = ifc?.src ? [
        { label: `Ajustar proporcional${ifc.fittingMode === "fit-proportional" ? " ✓" : ""}`, action: () => applyFit("fit-proportional") },
        { label: `Rellenar proporcional${ifc.fittingMode === "fill-proportional" ? " ✓" : ""}`, action: () => applyFit("fill-proportional") },
        { label: `Ajustar a la caja${ifc.fittingMode === "fit-stretch" ? " ✓" : ""}`, action: () => applyFit("fit-stretch") },
        { label: `Centrar sin escalar${ifc.fittingMode === "center-content" ? " ✓" : ""}`, action: () => applyFit("center-content") },
        { label: `Rellenar sin proporción${ifc.fittingMode === "fill-stretch" ? " ✓" : ""}`, action: () => applyFit("fill-stretch") },
        { label: `Caja al contenido${ifc.fittingMode === "frame-to-content" ? " ✓" : ""}`, action: () => applyFit("frame-to-content"), separator: true },
      ] : [];
      const autoFitOn = (single as any).imageFrameAutoFit !== false;
      return [
        { label: "Colocar imagen dentro", action: () => { onDesignerImageFramePlace?.(single.id); } },
        ...(ifc?.src ? [
          {
            label: "Eliminar imagen",
            action: () => {
              const sk = ifc?.s3Key;
              if (typeof sk === "string" && sk.startsWith("knowledge-files/")) fireAndForgetDeleteS3Keys([sk]);
              updateSelectedProp("imageFrameContent", null);
            },
            separator: true,
          },
        ] : []),
        ...fittingItems,
        { label: `Auto-Fit: ${autoFitOn ? "On ✓" : "Off"}`, action: () => updateSelectedProp("imageFrameAutoFit", !autoFitOn), separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected, separator: true },
        { label: "Bring to front", action: bringToFront },
        { label: "Send to back", action: sendToBack },
        { label: "Lock / Unlock", action: () => updateSelectedProp("locked", !single.locked) },
      ];
    }

    if (single?.type === "booleanGroup") {
      return [
        { label: "Edit boolean group", action: () => enterIsolation(single.id) },
        { label: "Forma definitiva (trazo)", action: () => void flattenBooleanToDefinitivePath(), separator: true },
        { label: "Duplicate", action: duplicateSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Lock / Unlock", action: () => updateSelectedProp("locked", !single.locked) },
        { label: "Hide / Show", action: () => updateSelectedProp("visible", !single.visible) },
      ];
    }

    if (single?.type === "clippingContainer") {
      const cc = single as ClippingContainerObject;
      return [
        { label: "Edit content", action: () => enterClippingIsolation(cc.id, "content") },
        { label: "Edit mask", action: () => enterClippingIsolation(cc.id, "mask") },
        { label: "Release clipping", action: releaseClippingStructure, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Lock / Unlock", action: () => updateSelectedProp("locked", !cc.locked) },
        { label: "Hide / Show", action: () => updateSelectedProp("visible", !cc.visible) },
      ];
    }

    if (single && (single.isClipMask || single.clipMaskId)) {
      return [
        { label: "Release clipping mask", action: releaseClipMask, separator: true },
        { label: "Duplicate", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
      ];
    }

    const designerClip = designerClipboardRef?.current;
    const clipBuf =
      designerMode && designerClip && designerClip.length > 0 ? designerClip : objectClipboardRef.current;
    const canPasteInsideMenu = !!(single && clipBuf && clipBuf.length > 0 && isValidPasteInsideMask(single));

    return [
      { label: "Cut", shortcut: "⌘X", action: cutSelectedObjects },
      { label: "Copy", shortcut: "⌘C", action: copySelectedObjects },
      { label: "Paste", shortcut: "⌘V", action: pasteClipboardObjects },
      { label: "Paste inside", shortcut: "⇧⌘V / Ctrl+⇧V", action: pasteInside, disabled: !canPasteInsideMenu, separator: true },
      { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
      { label: "Delete", action: deleteSelected },
      { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
      { label: "Rename…", action: renameSelected, separator: true },
      { label: "Bring forward", shortcut: "⌘]", action: bringForward },
      { label: "Send backward", shortcut: "⌘[", action: sendBackward },
      { label: "Bring to front", action: bringToFront },
      { label: "Send to back", action: sendToBack },
      { label: "Group", shortcut: "⌘G", action: groupSelected, disabled: !multiSel, separator: true },
      { label: "Lock / Unlock", action: () => { const locked = selectedObjects.every((o) => o.locked); updateSelectedProp("locked", !locked); } },
      { label: "Hide / Show", action: () => { const vis = selectedObjects.every((o) => o.visible); updateSelectedProp("visible", !vis); } },
      { label: "Create clipping mask", action: createClipMask, disabled: selectedIds.size < 2, separator: true },
      { label: "Release clipping mask", action: releaseClipMask, disabled: !hasClip },
      { label: "Boolean union", action: () => void booleanOp("union"), disabled: selectedIds.size < 2, separator: true },
      { label: "Boolean subtract", action: () => void booleanOp("subtract"), disabled: selectedIds.size < 2 },
      { label: "Boolean intersect", action: () => void booleanOp("intersect"), disabled: selectedIds.size < 2 },
      { label: "Boolean exclude", action: () => void booleanOp("exclude"), disabled: selectedIds.size < 2 },
      {
        label: "Edit vector group",
        action: () => {
          const g = selectedObjects[0]?.groupId;
          if (g) enterVectorGroupIsolation(g);
        },
        disabled: !(single?.groupId && objects.filter((o) => o.groupId === single.groupId).length >= 2),
        separator: true,
      },
      { label: "Edit boolean group", action: () => { const bg = selectedObjects.find((o) => o.type === "booleanGroup"); if (bg) enterIsolation(bg.id); }, disabled: !hasBoolGroup, separator: true },
      { label: "Forma definitiva (trazo)", action: () => void flattenBooleanToDefinitivePath(), disabled: !hasBoolGroup },
      { label: "Open / close path", action: () => { if (hasPath) togglePathClosed(selectedObjects.find((o) => o.type === "path")!.id); }, disabled: !hasPath, separator: true },
      { label: "Cycle anchor type", action: () => { selectedPoints.forEach((idxs, objId) => { idxs.forEach((idx) => cycleVertexMode(objId, idx)); }); }, disabled: selectedPoints.size === 0 },
    ];
  }, [ctxMenu, selectedIds, selectedObjects, selectedPoints, isolationDepth, objects, showGrid, snapEnabled,
      canLinkTextToPath, handleLinkTextToPath,
      setShowExportModal, setExportModalScope,
      duplicateSelected, deleteSelected, bringForward, sendBackward, bringToFront, sendToBack,
      updateSelectedProp, groupSelected, ungroupSelected, createClipMask, releaseClipMask, togglePathClosed,
      cycleVertexMode, booleanOp, enterIsolation, flattenBooleanToDefinitivePath, exitIsolation, alignObjects, fitAllCanvas,
      resetZoomCanvas, pasteClipboardObjects, pasteInside, cutSelectedObjects, copySelectedObjects, renameSelected,
      convertTextToOutlines, releaseClippingStructure, enterClippingIsolation, switchClippingIsolationMode, enterVectorGroupIsolation,
      layoutGuides.length, showLayoutGuides]);

  // ── Cursor ────────────────────────────────────────────────────────

  const cursor = useMemo(() => {
    if (spaceHeld || dragState?.type === "pan") return "grab";
    if (dragState?.type === "imageContentPan") return "move";
    if (dragState?.type === "imageContentResize" && dragState.imageCorner) {
      const m: Record<string, string> = {
        nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize",
      };
      return m[dragState.imageCorner] ?? "default";
    }
    if (dragState?.type === "resize" && dragState.handle) {
      const h = dragState.handle;
      const map: Record<string, string> = {
        nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize",
        e: "ew-resize", w: "ew-resize",
        se: "nwse-resize", s: "ns-resize", sw: "nesw-resize",
      };
      return map[h] ?? "default";
    }
    if (dragState?.type === "rotate") return "grab";
    if (dragState?.type === "move") return "move";
    if (activeTool === "pen" || activeTool === "rect" || activeTool === "ellipse" || activeTool === "text" || activeTool === "textFrame" || activeTool === "imageFrame") return "crosshair";
    return "default";
  }, [activeTool, spaceHeld, dragState]);

  const quickEditPos = useMemo(() => {
    if (!quickEditMode || !selectionFrame || typeof window === "undefined") return null;
    const el = containerRef.current;
    if (!el) return null;
    const cx = selectionFrame.cx * viewport.zoom + viewport.x;
    const bottomCanvas = selectionFrame.cy * viewport.zoom + viewport.y + (selectionFrame.h / 2) * viewport.zoom + 12;
    return { left: cx, top: bottomCanvas };
  }, [quickEditMode, selectionFrame, viewport.x, viewport.y, viewport.zoom]);

  // ── Marquee rect ──────────────────────────────────────────────────

  const marqueeRect = useMemo(() => {
    if (!dragState || (dragState.type !== "marquee") || !dragState.marqueeOrigin || !dragState.currentCanvas) return null;
    const o = dragState.marqueeOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
  }, [dragState]);

  // Create preview rect
  const createPreviewRect = useMemo(() => {
    if (!dragState || dragState.type !== "create" || !dragState.createOrigin || !dragState.currentCanvas) return null;
    const o = dragState.createOrigin, c = dragState.currentCanvas;
    const base = { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
    return { ...base, type: dragState.createType };
  }, [dragState]);

  const createTextPreviewRect = useMemo(() => {
    if (!dragState || dragState.type !== "createText" || !dragState.createOrigin || !dragState.currentCanvas) return null;
    const o = dragState.createOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
  }, [dragState]);

  const createTextFramePreviewRect = useMemo(() => {
    if (!dragState || dragState.type !== "createTextFrame" || !dragState.createOrigin || !dragState.currentCanvas) return null;
    const o = dragState.createOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
  }, [dragState]);

  const createImageFramePreviewRect = useMemo(() => {
    if (!dragState || dragState.type !== "createImageFrame" || !dragState.createOrigin || !dragState.currentCanvas) return null;
    const o = dragState.createOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
  }, [dragState]);

  // ── Clip path defs ────────────────────────────────────────────────

  const clipObjects = useMemo(() => objects.filter((o) => o.isClipMask), [objects]);
  const clippedGroups = useMemo(() => {
    const map = new Map<string, FreehandObject[]>();
    for (const o of objects) {
      if (o.clipMaskId) {
        const arr = map.get(o.clipMaskId) || [];
        arr.push(o);
        map.set(o.clipMaskId, arr);
      }
    }
    return map;
  }, [objects]);

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div
      ref={studioShellRef}
      data-foldder-studio-canvas
      className="fixed inset-0 z-[9999] flex min-h-0 flex-col bg-[#0b0d10] text-zinc-200"
      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, Inter, system-ui" }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) importImageFile(f);
        e.target.value = "";
      }} />
      <input
        ref={svgInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importSvgFile(f);
          e.target.value = "";
        }}
      />

      {!canvasZenMode && (
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#12151a] px-3 min-w-0">
        <div className="min-w-0 shrink">
          <div className="truncate text-[13px] font-semibold tracking-tight text-white">Designer</div>
          <div className="truncate text-[10px] text-zinc-500">Vector document</div>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        <div
          className="flex min-w-0 flex-wrap items-center gap-px rounded-lg border border-white/[0.08] bg-[#0b0d10] px-1 py-0.5"
          title="Alinear (selecciona 2+ objetos)"
        >
          <button
            type="button"
            title="Horizontal: izquierda"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("left")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalJustifyStart size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Horizontal: centrar"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("centerH")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalJustifyCenter size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Horizontal: derecha"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("right")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalJustifyEnd size={14} strokeWidth={1.75} />
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          <button
            type="button"
            title="Vertical: arriba"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("top")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalJustifyStart size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Vertical: centrar"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("centerV")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalJustifyCenter size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Vertical: abajo"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("bottom")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalJustifyEnd size={14} strokeWidth={1.75} />
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          <button
            type="button"
            title="Distribuir horizontalmente"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("distH")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalSpaceBetween size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Distribuir verticalmente"
            disabled={selectedObjects.length < 2}
            onClick={() => alignObjects("distV")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalSpaceBetween size={14} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0d10] px-1 py-0.5 shrink-0">
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            onClick={() =>
              setViewport((v) => {
                const nz = clamp(v.zoom / 1.15, 0.05, 20);
                return { ...v, zoom: nz };
              })
            }
            title="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3.25rem] text-center font-mono text-[11px] tabular-nums text-zinc-300">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            onClick={() =>
              setViewport((v) => {
                const nz = clamp(v.zoom * 1.15, 0.05, 20);
                return { ...v, zoom: nz };
              })
            }
            title="Zoom in"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            title="Undo (⌘Z)"
          >
            <Undo2 size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={redo}
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            title="Redo (⇧⌘Z)"
          >
            <Redo2 size={18} strokeWidth={1.5} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setExportModalScope(selectedIds.size > 0 ? "selection" : "full");
            setShowExportModal(true);
          }}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-[12px] font-semibold text-white shadow-lg shadow-sky-900/25 transition-colors duration-150 hover:bg-sky-500"
        >
          <Download size={16} strokeWidth={1.5} />
          Export
        </button>
        <button
          type="button"
          onClick={() => void handleCloseStudio()}
          className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
          title="Cerrar — guarda la vista previa en el nodo"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
        </div>
      </header>
      )}

      <div className={`flex min-h-0 min-w-0 flex-1 flex-row${canvasZenMode ? " w-full" : ""}`}>
      {!canvasZenMode && (
      <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.08] bg-[#12151a] py-3">
        <ToolBtn active={activeTool === "select"} onClick={() => { setActiveTool("select"); setSelectedPoints(new Map()); }} title="Selection (V)">
          <MousePointer2 size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "directSelect"} onClick={() => setActiveTool("directSelect")} title="Direct Selection (A)">
          <MousePointer2 size={20} strokeWidth={1.5} className="opacity-60" />
        </ToolBtn>
        <ToolBtn active={activeTool === "pen"} onClick={() => setActiveTool("pen")} title="Pen (⇧P)">
          <PenTool size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "rect"} onClick={() => setActiveTool("rect")} title="Rectangle (R)">
          <Square size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "ellipse"} onClick={() => setActiveTool("ellipse")} title="Ellipse (O)">
          <Circle size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "text"} onClick={() => setActiveTool("text")} title="Text (T)">
          <Type size={20} strokeWidth={1.5} />
        </ToolBtn>
        {designerMode && (
          <>
            <ToolBtn active={activeTool === "textFrame"} onClick={() => setActiveTool("textFrame")} title="Text Frame — caja de texto encadenada">
              <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="16" height="14" rx="1.5" strokeDasharray="3 2" />
                <path d="M6 7.5h8M6 10h8M6 12.5h4" />
              </svg>
            </ToolBtn>
            <ToolBtn onClick={() => fileInputRef.current?.click()} title="Importar imagen">
              <ImageIconLucide size={20} strokeWidth={1.5} />
            </ToolBtn>
            <ToolBtn active={activeTool === "imageFrame"} onClick={() => setActiveTool("imageFrame")} title="Image Frame — marco de imagen">
              <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="16" height="14" rx="1.5" />
                <line x1="2" y1="3" x2="18" y2="17" opacity={0.5} />
                <line x1="18" y1="3" x2="2" y2="17" opacity={0.5} />
              </svg>
            </ToolBtn>
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
        )}

        <div className="my-1 h-px w-6 bg-white/[0.08]" />

        {!designerMode && (
          <>
            <ToolBtn onClick={() => fileInputRef.current?.click()} title="Import image">
              <Upload size={18} strokeWidth={1.5} />
            </ToolBtn>
            <ToolBtn onClick={() => svgInputRef.current?.click()} title="Import SVG">
              <FileType2 size={18} strokeWidth={1.5} />
            </ToolBtn>
          </>
        )}

        <div className="flex-1 min-h-[8px]" />

        <ToolBtn active={snapEnabled} onClick={() => setSnapEnabled((p) => !p)} title={`Snap ${snapEnabled ? "on" : "off"}`}>
          <Magnet size={18} strokeWidth={1.5} />
        </ToolBtn>
      </div>
      )}

      <div className={`relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0B0D10]${canvasZenMode ? " w-full" : ""}`}>

        {/* Isolation breadcrumb */}
        {!canvasZenMode && isolationDepth > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-violet-900/40 border-b border-violet-500/30 text-[10px] font-bold uppercase tracking-wider">
            <button type="button" onClick={() => exitToLevel(0)}
              className="text-violet-300 hover:text-white transition-colors">Scene</button>
            {isolationStackRef.current.map((frame, i) => {
              const id = frame.kind === "clipping" ? frame.containerId : frame.groupId;
              const label = frame.kind === "clipping"
                ? (frame.parentObjects.find((o) => o.id === frame.containerId)?.name ?? "Clip container")
                : frame.kind === "vectorGroup"
                  ? "Vector group"
                  : (frame.parentObjects.find((o) => o.id === frame.groupId)?.name ?? "Boolean Group");
              const sub = frame.kind === "clipping" && frame.editMode === "mask" ? " · mask" : "";
              return (
                <React.Fragment key={id}>
                  <span className="text-violet-500/60">/</span>
                  <button type="button"
                    onClick={() => exitToLevel(i)}
                    className={`${i === isolationStackRef.current.length - 1 ? "text-white" : "text-violet-300 hover:text-white"} transition-colors`}>
                    {label}{sub}
                  </button>
                </React.Fragment>
              );
            })}
            <span className="text-violet-500/40 ml-2 normal-case tracking-normal font-normal italic">Esc to exit · editing limited to this scope</span>
          </div>
        )}

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoverCanvasId(null);
        }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          const pos = screenToCanvas(e.clientX, e.clientY);
          const dsTh = 8 / viewport.zoom;
          if (activeTool === "directSelect") {
            const hit = findTopAnchorHitForDirectSelectDelete(pos, dsTh, objects);
            if (hit) {
              e.preventDefault();
              const m = new Map<string, Set<number>>();
              m.set(hit.pathId, new Set([hit.gIdx]));
              deleteVertexSelectionMap(m);
              return;
            }
          }
          const threshold = 6 / viewport.zoom;
          const topIso = isolationStackRef.current[isolationStackRef.current.length - 1];
          const inClipContent = topIso?.kind === "clipping" && topIso.editMode === "content";
          if (inClipContent && (activeTool === "select" || activeTool === "directSelect")) {
            for (let i = objects.length - 1; i >= 0; i--) {
              const obj = objects[i];
              if (!obj.visible || obj.locked) continue;
              if (hitTestObject(pos, obj, threshold, objects)) {
                setSelectedIds(new Set([obj.id]));
                setPrimarySelectedId(obj.id);
                setClipContentEditId(obj.id);
                setImageFrameContentEditId(null);
                return;
              }
            }
          }
          if (activeTool === "select" || activeTool === "text" || activeTool === "imageFrame") {
            for (let i = objects.length - 1; i >= 0; i--) {
              const obj = objects[i];
              if (obj.isImageFrame && hitTestObject(pos, obj, threshold, objects)) {
                setSelectedIds(new Set([obj.id]));
                setPrimarySelectedId(obj.id);
                const hasImg = !!(obj as RectObject).imageFrameContent?.src;
                if (!hasImg) {
                  onDesignerImageFramePlace?.(obj.id);
                } else if (designerMode) {
                  setImageFrameContentEditId(obj.id);
                }
                return;
              }
              if (obj.type === "text" && hitTestObject(pos, obj, threshold, objects)) {
                setSelectedIds(new Set([obj.id]));
                setTextEditingId(obj.id);
                return;
              }
            }
          }
          if (activeTool !== "select") return;
          for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (obj.type === "booleanGroup" && hitTestObject(pos, obj, threshold, objects)) {
              enterIsolation(obj.id);
              return;
            }
            if (obj.type === "clippingContainer" && hitTestObject(pos, obj, threshold, objects)) {
              enterClippingIsolation(obj.id, "content");
              return;
            }
            if (obj.groupId && hitTestObject(pos, obj, threshold, objects)) {
              const n = objects.filter((x) => x.groupId === obj.groupId).length;
              if (n >= 2) {
                enterVectorGroupIsolation(obj.groupId);
                return;
              }
            }
          }
          for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (!obj.visible || obj.locked) continue;
            if (obj.isClipMask || obj.clipMaskId) continue;
            if (hitTestObject(pos, obj, threshold, objects)) {
              setSelectedIds(new Set([obj.id]));
              setPrimarySelectedId(obj.id);
              setQuickEditMode(e.altKey ? "stroke" : "fill");
              return;
            }
          }
          if (isolationStackRef.current.length > 0) exitIsolation();
          if (activeTool === "select") fitAllCanvas();
        }}
      >
        {designerMode && !canvasZenMode && (
          <div className="flex shrink-0" style={{ height: DESIGNER_RULER_THICKNESS }}>
            <DesignerRulerCorner ref={designerRulerCornerRef} />
            <DesignerRulerHorizontal
              ref={designerRulerHorizRef}
              viewport={viewport}
              widthPx={designerCanvasViewportSize.w}
              onGuideEdgePointerDown={(e) => handleDesignerGuidePullStart("horizontal", e)}
            />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-row">
          {designerMode && !canvasZenMode && (
            <DesignerRulerVertical
              ref={designerRulerVertRef}
              viewport={viewport}
              heightPx={designerCanvasViewportSize.h}
              onGuideEdgePointerDown={(e) => handleDesignerGuidePullStart("vertical", e)}
            />
          )}
          <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ userSelect: "none" }}>
          <defs>
            <pattern id="fh-grid" width={20 * viewport.zoom} height={20 * viewport.zoom} patternUnits="userSpaceOnUse"
              x={viewport.x % (20 * viewport.zoom)} y={viewport.y % (20 * viewport.zoom)}>
              <circle cx={1} cy={1} r={0.5} fill="rgba(255,255,255,0.04)" />
            </pattern>
            {flattenObjectsForGradientDefs(objects).map((o) => {
              const f = migrateFill(o.fill);
              return f.type === "solid" ? null : renderFillDef(f, gradientDefId(o.id));
            })}
            {clipObjects.map((co) => renderClipDef(co))}
            <filter id="fh-selection-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </defs>
          {showGrid ? (
            <rect width="100%" height="100%" fill="url(#fh-grid)" data-ui="grid" />
          ) : (
            <rect width="100%" height="100%" fill="transparent" data-ui="grid" />
          )}

          <g data-fh-world transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {/* Pliego (página): fondo detrás de objetos; borde solo ayuda visual (data-ui se quita al exportar). */}
            {artboards.map((ab) => (
              <g key={ab.id} data-fh-artboard={ab.id}>
                <rect x={ab.x} y={ab.y} width={ab.width} height={ab.height} fill={ab.background} />
                <rect
                  x={ab.x}
                  y={ab.y}
                  width={ab.width}
                  height={ab.height}
                  fill="none"
                  stroke="rgba(148,163,184,0.4)"
                  strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${4 / viewport.zoom}`}
                  data-ui="artboard-edge"
                  pointerEvents="none"
                />
              </g>
            ))}

            {/* Guías de diseño (no exportan con el vector; solo ayuda visual / snap) */}
            {showLayoutGuides &&
              layoutGuides.map((g) =>
                g.orientation === "vertical" ? (
                  <line
                    key={g.id}
                    data-ui="layout-guide"
                    x1={g.position}
                    y1={-5e5}
                    x2={g.position}
                    y2={5e5}
                    stroke="rgba(196,181,253,0.92)"
                    strokeWidth={1 / viewport.zoom}
                    strokeDasharray={`${6 / viewport.zoom} ${4 / viewport.zoom}`}
                    pointerEvents="none"
                  />
                ) : (
                  <line
                    key={g.id}
                    data-ui="layout-guide"
                    x1={-5e5}
                    y1={g.position}
                    x2={5e5}
                    y2={g.position}
                    stroke="rgba(196,181,253,0.92)"
                    strokeWidth={1 / viewport.zoom}
                    strokeDasharray={`${6 / viewport.zoom} ${4 / viewport.zoom}`}
                    pointerEvents="none"
                  />
                ),
              )}
            {dragState?.type === "guidePull" &&
              dragState.guideOrientation === "vertical" &&
              dragState.draftPos != null && (
                <line
                  data-ui="layout-guide-draft"
                  x1={dragState.draftPos}
                  y1={-5e5}
                  x2={dragState.draftPos}
                  y2={5e5}
                  stroke="rgba(251,191,36,0.9)"
                  strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${5 / viewport.zoom} ${4 / viewport.zoom}`}
                  pointerEvents="none"
                />
              )}
            {dragState?.type === "guidePull" &&
              dragState.guideOrientation === "horizontal" &&
              dragState.draftPos != null && (
                <line
                  data-ui="layout-guide-draft"
                  x1={-5e5}
                  y1={dragState.draftPos}
                  x2={5e5}
                  y2={dragState.draftPos}
                  stroke="rgba(251,191,36,0.9)"
                  strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${5 / viewport.zoom} ${4 / viewport.zoom}`}
                  pointerEvents="none"
                />
              )}

            {/* Aislamiento «pegar dentro»: silueta de la máscara del contenedor (solo guía, no seleccionable) */}
            {!canvasZenMode &&
              isClipContentIsolation &&
              (() => {
                const top = isolationStackRef.current[isolationStackRef.current.length - 1];
                if (!top || top.kind !== "clipping" || top.editMode !== "content") return null;
                const cc = top.parentObjects.find(
                  (o) => o.id === top.containerId && o.type === "clippingContainer",
                ) as ClippingContainerObject | undefined;
                if (!cc) return null;
                const innerT = `translate(${cc.x} ${cc.y}) rotate(${cc.rotation} ${cc.width / 2} ${cc.height / 2})`;
                const z = viewport.zoom;
                return (
                  <g
                    key="clip-content-mask-guide"
                    data-ui="clip-mask-guide"
                    pointerEvents="none"
                    style={{ pointerEvents: "none" }}
                  >
                    <g transform={innerT}>{renderClipContentIsolationMaskGuide(cc.mask, z)}</g>
                  </g>
                );
              })()}

            {/* Render objects (multi-select: non-primary slightly faded) */}
            {objects.map((obj) => {
              if (obj.isClipMask) return null;
              if (obj.clipMaskId) return null;
              const inSel = selectedIds.has(obj.id);
              const multi = selectedIds.size > 1;
              const isPrimary = !multi || !inSel || primarySelectedId === obj.id || primarySelectedId == null;
              const op = multi && inSel && !isPrimary ? 0.62 : 1;
              return (
                <g key={obj.id} opacity={op} data-fh-obj={obj.id}>
                  {renderObj(obj, objects, selectedIds, { canvasZenMode })}
                </g>
              );
            })}

            {/* Render clipped groups */}
            {Array.from(clippedGroups.entries()).map(([clipId, members]) => (
              <g key={`cg-${clipId}`} data-fh-clip-root={clipId} clipPath={`url(#clip-${clipId})`}>
                {members.map((m) => {
                  const inSel = selectedIds.has(m.id);
                  const multi = selectedIds.size > 1;
                  const isPrimary = !multi || !inSel || primarySelectedId === m.id || primarySelectedId == null;
                  const op = multi && inSel && !isPrimary ? 0.62 : 1;
                  return (
                    <g key={m.id} data-fh-obj={m.id} opacity={op}>
                      {renderObj(m, objects, selectedIds, { canvasZenMode })}
                    </g>
                  );
                })}
              </g>
            ))}

            {/* Hover outline: canvas hover or layers panel hover (sync) */}
            {(hoverCanvasId || layerHoverId) && !canvasZenMode && (activeTool === "select" || activeTool === "directSelect") && (() => {
              const hid = hoverCanvasId ?? layerHoverId;
              const ho = objects.find((o) => o.id === hid);
              if (!ho || selectedIds.has(ho.id)) return null;
              const ob = getVisualAABB(ho, objects);
              const fromPanel = !!(layerHoverId && layerHoverId === hid && !hoverCanvasId);
              return (
                <rect x={ob.x} y={ob.y} width={ob.w} height={ob.h} fill="none"
                  stroke={fromPanel ? "rgba(56,189,248,0.85)" : "rgba(148,163,184,0.92)"}
                  strokeWidth={(fromPanel ? 1.25 : 1) / viewport.zoom}
                  strokeDasharray={fromPanel ? `${4 / viewport.zoom}` : undefined}
                  pointerEvents="none" data-ui="hover-outline" />
              );
            })()}

            {/* Pen WIP */}
            {isPenDrawing && penPoints.length > 0 && (
              <>
                {penHoverCanvas && !penDragging && penPoints.length >= 1 && (
                  <path
                    d={penRubberBandSegmentD(penPoints[penPoints.length - 1]!, penHoverCanvas)}
                    fill="none"
                    stroke={penHoverNearPathStart ? "rgba(91, 118, 205, 0.82)" : "rgba(99,102,241,0.9)"}
                    strokeWidth={(penHoverNearPathStart ? 1.3 : 1.25) / viewport.zoom}
                    strokeDasharray={`${5 / viewport.zoom} ${4 / viewport.zoom}`}
                    opacity={penHoverNearPathStart ? 0.88 : 0.85}
                    pointerEvents="none"
                    data-ui="pen-rubber-guide"
                  />
                )}
                <path d={bezierToSvgD(penPoints, false)} fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
                  strokeDasharray="4 2" opacity={0.7} data-ui="pen-wip" />
                {penPoints.map((pt, i) => (
                  <React.Fragment key={`pp-${i}`}>
                    {(dist(pt.handleIn, pt.anchor) > 1 || dist(pt.handleOut, pt.anchor) > 1) && (
                      <>
                        <line x1={pt.handleIn.x} y1={pt.handleIn.y} x2={pt.anchor.x} y2={pt.anchor.y}
                          stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                        <line x1={pt.anchor.x} y1={pt.anchor.y} x2={pt.handleOut.x} y2={pt.handleOut.y}
                          stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                        <circle cx={pt.handleIn.x} cy={pt.handleIn.y} r={3 / viewport.zoom}
                          fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                        <circle cx={pt.handleOut.x} cy={pt.handleOut.y} r={3 / viewport.zoom}
                          fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                      </>
                    )}
                    {i === 0 && penPoints.length > 1 && penHoverNearPathStart && (
                      <circle
                        cx={pt.anchor.x}
                        cy={pt.anchor.y}
                        r={10 / viewport.zoom}
                        fill="rgba(16,185,129,0.04)"
                        stroke="rgba(16,185,129,0.32)"
                        strokeWidth={1 / viewport.zoom}
                        pointerEvents="none"
                        data-ui="pen-close-hint-ring"
                      />
                    )}
                    <circle
                      cx={pt.anchor.x}
                      cy={pt.anchor.y}
                      r={(i === 0 && penHoverNearPathStart ? 4.5 : 4) / viewport.zoom}
                      fill={i === 0 && penHoverNearPathStart ? "#5b6fd4" : "#6366f1"}
                      stroke="#fff"
                      strokeWidth={1.5 / viewport.zoom}
                      data-ui="pen"
                    />
                  </React.Fragment>
                ))}
              </>
            )}

            {/* Create preview */}
            {createPreviewRect && (
              createPreviewRect.type === "ellipse"
                ? <ellipse cx={createPreviewRect.x + createPreviewRect.w / 2} cy={createPreviewRect.y + createPreviewRect.h / 2}
                    rx={createPreviewRect.w / 2} ry={createPreviewRect.h / 2}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} opacity={0.5} data-ui="preview" />
                : <rect x={createPreviewRect.x} y={createPreviewRect.y} width={createPreviewRect.w} height={createPreviewRect.h}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} opacity={0.5} data-ui="preview" />
            )}

            {createTextPreviewRect && createTextPreviewRect.w > 1 && createTextPreviewRect.h > 1 && (
              <rect x={createTextPreviewRect.x} y={createTextPreviewRect.y} width={createTextPreviewRect.w} height={createTextPreviewRect.h}
                fill="rgba(167,139,250,0.06)" stroke="#a78bfa" strokeWidth={1 / viewport.zoom} strokeDasharray={`${5 / viewport.zoom}`} data-ui="text-preview" />
            )}

            {/* Designer: Text frame preview */}
            {createTextFramePreviewRect && createTextFramePreviewRect.w > 1 && createTextFramePreviewRect.h > 1 && (
              <rect x={createTextFramePreviewRect.x} y={createTextFramePreviewRect.y} width={createTextFramePreviewRect.w} height={createTextFramePreviewRect.h}
                fill="rgba(56,189,248,0.06)" stroke="#38bdf8" strokeWidth={1 / viewport.zoom} strokeDasharray={`${5 / viewport.zoom}`} data-ui="textframe-preview" />
            )}

            {/* Designer: Image frame preview */}
            {createImageFramePreviewRect && createImageFramePreviewRect.w > 1 && createImageFramePreviewRect.h > 1 && (
              <>
                <rect x={createImageFramePreviewRect.x} y={createImageFramePreviewRect.y} width={createImageFramePreviewRect.w} height={createImageFramePreviewRect.h}
                  fill="rgba(251,191,36,0.04)" stroke="#fbbf24" strokeWidth={1 / viewport.zoom} strokeDasharray={`${6 / viewport.zoom} ${4 / viewport.zoom}`} data-ui="imageframe-preview" />
                {/* X placeholder */}
                <line x1={createImageFramePreviewRect.x} y1={createImageFramePreviewRect.y}
                  x2={createImageFramePreviewRect.x + createImageFramePreviewRect.w} y2={createImageFramePreviewRect.y + createImageFramePreviewRect.h}
                  stroke="#fbbf24" strokeWidth={0.5 / viewport.zoom} opacity={0.4} />
                <line x1={createImageFramePreviewRect.x + createImageFramePreviewRect.w} y1={createImageFramePreviewRect.y}
                  x2={createImageFramePreviewRect.x} y2={createImageFramePreviewRect.y + createImageFramePreviewRect.h}
                  stroke="#fbbf24" strokeWidth={0.5 / viewport.zoom} opacity={0.4} />
              </>
            )}

            {/* Marquee */}
            {marqueeRect && marqueeRect.w > 2 && marqueeRect.h > 2 && (
              <rect x={marqueeRect.x} y={marqueeRect.y} width={marqueeRect.w} height={marqueeRect.h}
                fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${3 / viewport.zoom}`} data-ui="marquee" />
            )}

            {/* Per-object selection outlines (multi-select): primary stronger, secondary lighter */}
            {selectedObjects.length > 1 && !canvasZenMode && (activeTool === "select" || activeTool === "directSelect") && selectedObjects.map((obj) => {
              const ob = getVisualAABB(obj, objects);
              const isPr = primarySelectedId === obj.id || primarySelectedId == null;
              return (
                <rect key={`sel-outline-${obj.id}`} x={ob.x} y={ob.y} width={ob.w} height={ob.h}
                  fill="none"
                  stroke={isPr ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.42)"}
                  strokeWidth={(isPr ? 1.1 : 0.9) / viewport.zoom}
                  strokeDasharray={isPr ? undefined : `${3 / viewport.zoom}`}
                  pointerEvents="none"
                  data-ui="per-sel" />
              );
            })}

            {/* Selection: oriented bounding box + handles (matches object rotation) */}
            {!canvasZenMode && activeTool === "select" && selectedObjects.length === 1 && supportsGradientFill(selectedObjects[0]) && (() => {
              const o = selectedObjects[0];
              const f = migrateFill(o.fill);
              const hz = 5 / viewport.zoom;
              if (f.type === "gradient-linear") {
                const a = localBoxToWorld(o, f.x1, f.y1);
                const b = localBoxToWorld(o, f.x2, f.y2);
                return (
                  <g key="grad-ui" data-ui="gradient-edit" pointerEvents="none">
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#93c5fd" strokeWidth={1.5 / viewport.zoom} opacity={0.95} />
                    <circle cx={a.x} cy={a.y} r={hz} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2 / viewport.zoom} />
                    <circle cx={b.x} cy={b.y} r={hz} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2 / viewport.zoom} />
                    {f.stops.map((st, si) => {
                      const tt = clamp(st.position / 100, 0, 1);
                      const sx = a.x + (b.x - a.x) * tt;
                      const sy = a.y + (b.y - a.y) * tt;
                      return (
                        <circle key={`gstop-${si}`} cx={sx} cy={sy} r={hz * 0.78} fill="#0f172a" stroke="#7dd3fc" strokeWidth={1 / viewport.zoom} />
                      );
                    })}
                  </g>
                );
              }
              if (f.type === "gradient-radial") {
                const c = localBoxToWorld(o, f.cx, f.cy);
                const r = localBoxToWorld(o, Math.min(1, f.cx + f.r), f.cy);
                return (
                  <g key="grad-ui-r" data-ui="gradient-edit" pointerEvents="none">
                    <circle cx={c.x} cy={c.y} r={Math.hypot(r.x - c.x, r.y - c.y)} fill="none" stroke="#c4b5fd" strokeWidth={1.2 / viewport.zoom} strokeDasharray={`${4 / viewport.zoom}`} opacity={0.85} />
                    <circle cx={c.x} cy={c.y} r={hz} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={1.2 / viewport.zoom} />
                    <circle cx={r.x} cy={r.y} r={hz} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={1.2 / viewport.zoom} />
                  </g>
                );
              }
              return null;
            })()}

            {selectedObjects.length > 0 && !canvasZenMode && (activeTool === "select" || activeTool === "directSelect") && selectionFrame && !suppressOuterTransformHandles && (
              <g data-ui="selection-box" transform={`translate(${selectionFrame.cx},${selectionFrame.cy}) rotate(${selectionFrame.angleDeg})`} filter="url(#fh-selection-shadow)">
                <rect x={-selectionFrame.w / 2 - 1 / viewport.zoom} y={-selectionFrame.h / 2 - 1 / viewport.zoom}
                  width={selectionFrame.w + 2 / viewport.zoom} height={selectionFrame.h + 2 / viewport.zoom}
                  fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.92)" strokeWidth={1 / viewport.zoom}
                  pointerEvents="none" />
                {["nw", "ne", "se", "sw", "n", "e", "s", "w"].map((h) => {
                  const sz = 7 / viewport.zoom;
                  const hw = selectionFrame.w / 2, hh = selectionFrame.h / 2;
                  let hx = 0, hy = 0;
                  if (h.includes("e")) hx = hw;
                  if (h.includes("w")) hx = -hw;
                  if (h === "n" || h === "s") hx = 0;
                  if (h.includes("s")) hy = hh;
                  if (h.includes("n")) hy = -hh;
                  if (h === "e" || h === "w") hy = 0;
                  return (
                    <rect key={h} x={hx - sz / 2} y={hy - sz / 2} width={sz} height={sz}
                      fill="#1a1d24" stroke="rgba(255,255,255,0.95)" strokeWidth={1 / viewport.zoom}
                      rx={1.5 / viewport.zoom} style={{ cursor: `${h}-resize` }} data-ui="handle" />
                  );
                })}
                {(() => {
                  const rotOff = 14 / viewport.zoom;
                  const rotR = 4 / viewport.zoom;
                  const hw = selectionFrame.w / 2, hh = selectionFrame.h / 2;
                  const c = { x: hw + rotOff, y: -hh - rotOff };
                  return (
                    <circle cx={c.x} cy={c.y} r={rotR}
                      fill="transparent" stroke="rgba(255,255,255,0.75)" strokeWidth={1.1 / viewport.zoom}
                      style={{ cursor: "grab" }} data-ui="rotate-handle" />
                  );
                })()}
              </g>
            )}

            {/* Designer: límites marco (blanco) + bitmap completo (ámbar) + esquinas al editar contenido */}
            {designerMode && !canvasZenMode && suppressSelectionForImageContentEdit && imageFrameContentEditId && (() => {
              const o = objects.find((x) => x.id === imageFrameContentEditId) as RectObject | undefined;
              if (!o?.isImageFrame) return null;
              const ifc = o.imageFrameContent;
              if (!ifc?.src) return null;
              const tf = buildObjTransform(o);
              const z = viewport.zoom;
              const iw = ifc.originalWidth * ifc.scaleX;
              const ih = ifc.originalHeight * ifc.scaleY;
              const hz = 6 / z;
              return (
                <g key="image-content-edit-overlay" data-ui="image-content-edit" pointerEvents="none">
                  <g transform={tf}>
                    <rect
                      x={o.x} y={o.y} width={o.width} height={o.height} rx={o.rx ?? 0}
                      fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.25 / z}
                    />
                    <rect
                      x={o.x + ifc.offsetX} y={o.y + ifc.offsetY} width={iw} height={ih}
                      fill="rgba(251,191,36,0.07)" stroke="#fbbf24" strokeWidth={1.5 / z}
                      strokeDasharray={`${5 / z} ${4 / z}`}
                    />
                    {(["nw", "ne", "sw", "se"] as const).map((corner) => {
                      let cx = o.x + ifc.offsetX;
                      let cy = o.y + ifc.offsetY;
                      if (corner.includes("e")) cx = o.x + ifc.offsetX + iw;
                      if (corner.includes("s")) cy = o.y + ifc.offsetY + ih;
                      return (
                        <rect
                          key={corner}
                          x={cx - hz / 2} y={cy - hz / 2} width={hz} height={hz}
                          fill="#1a1d24" stroke="#fbbf24" strokeWidth={1 / z} rx={1 / z}
                        />
                      );
                    })}
                  </g>
                </g>
              );
            })()}

            {/* Contenido pegado dentro del clip: máscara (blanco) + AABB del objeto (ámbar) + esquinas como marco de imagen */}
            {!canvasZenMode && suppressSelectionForClipContentEdit && clipContentEditId && (() => {
              const top = isolationStackRef.current[isolationStackRef.current.length - 1];
              if (!top || top.kind !== "clipping" || top.editMode !== "content") return null;
              const container = top.parentObjects.find((o) => o.id === top.containerId) as ClippingContainerObject | undefined;
              if (!container) return null;
              const mb = clippingContainerMaskWorldBoundsAabb(container);
              const ed = objects.find((x) => x.id === clipContentEditId);
              if (!ed) return null;
              const ab = getVisualAABB(ed, objects);
              const z = viewport.zoom;
              const hz = 6 / z;
              return (
                <g key="clip-content-edit-overlay" data-ui="clip-content-edit" pointerEvents="none">
                  <rect
                    x={mb.x}
                    y={mb.y}
                    width={mb.w}
                    height={mb.h}
                    fill="none"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth={1.25 / z}
                  />
                  <rect
                    x={ab.x}
                    y={ab.y}
                    width={ab.w}
                    height={ab.h}
                    fill="rgba(251,191,36,0.06)"
                    stroke="#fbbf24"
                    strokeWidth={1.5 / z}
                    strokeDasharray={`${5 / z} ${4 / z}`}
                  />
                  {(["nw", "ne", "sw", "se"] as const).map((corner) => {
                    let cx = ab.x;
                    let cy = ab.y;
                    if (corner.includes("e")) cx = ab.x + ab.w;
                    if (corner.includes("s")) cy = ab.y + ab.h;
                    return (
                      <rect
                        key={corner}
                        x={cx - hz / 2}
                        y={cy - hz / 2}
                        width={hz}
                        height={hz}
                        fill="#1a1d24"
                        stroke="#fbbf24"
                        strokeWidth={1 / z}
                        rx={1 / z}
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* ── Designer: text frame ports overlay (above selection box) — oculto en modo P (pantalla completa lienzo) ── */}
            {designerMode && !canvasZenMode && (() => {
              const selTfId = selectedObjects.length === 1 && selectedObjects[0].isTextFrame ? selectedObjects[0].id : null;
              return objects.filter(o => o.isTextFrame).map((t) => {
                const ti = (t as any)._designerThreadInfo as { index: number; total: number } | undefined;
                const hasIn = ti && ti.index > 0;
                const hasOverflow = !!(t as any)._designerOverflow;
                const hasOut = ti && ti.index < ti.total - 1;
                if (!hasIn && !hasOverflow && !hasOut && !(ti && ti.total > 1)) return null;
                const foW = t.width;
                const foH = t.height;
                const isSelected = t.id === selTfId;
                return (
                  <g key={`tfport-${t.id}`} data-ui="tf-ports" pointerEvents="visiblePainted">
                    {/* IN port — left center */}
                    {hasIn && (
                      <circle cx={t.x} cy={t.y + foH / 2} r={5} fill="#38bdf8" stroke="#38bdf8" strokeWidth={0.75} opacity={0.8} pointerEvents="none" />
                    )}
                    {hasIn && (
                      <polygon points={`${t.x - 2},${t.y + foH / 2 - 3} ${t.x + 3},${t.y + foH / 2} ${t.x - 2},${t.y + foH / 2 + 3}`} fill="white" opacity={0.9} pointerEvents="none" />
                    )}
                    {/* OUT port — overflow: red + button (only clickable on selected frame) */}
                    {hasOverflow && !hasOut && isSelected && (
                      <g
                        style={{ cursor: "pointer" }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDesignerAppendThreadedFrame?.(t.id);
                        }}
                      >
                        <rect x={t.x + foW + 4} y={t.y + foH - 8} width={18} height={18} rx={4} fill="#ef4444" opacity={0.95} />
                        <text x={t.x + foW + 13} y={t.y + foH + 6} textAnchor="middle" fontSize={13} fill="white" fontWeight="bold" style={{ pointerEvents: "none" }}>+</text>
                      </g>
                    )}
                    {/* OUT port — overflow indicator (non-selected: visual only) */}
                    {hasOverflow && !hasOut && !isSelected && (
                      <g pointerEvents="none">
                        <rect x={t.x + foW + 4} y={t.y + foH - 8} width={18} height={18} rx={4} fill="#ef4444" opacity={0.45} />
                        <text x={t.x + foW + 13} y={t.y + foH + 6} textAnchor="middle" fontSize={13} fill="white" fontWeight="bold" style={{ pointerEvents: "none" }}>+</text>
                      </g>
                    )}
                    {/* OUT port — linked connector */}
                    {hasOut && (
                      <g pointerEvents="none">
                        <circle cx={t.x + foW} cy={t.y + foH / 2} r={5} fill="#38bdf8" stroke="#38bdf8" strokeWidth={0.75} opacity={0.8} />
                        <polygon points={`${t.x + foW - 2},${t.y + foH / 2 - 3} ${t.x + foW + 3},${t.y + foH / 2} ${t.x + foW - 2},${t.y + foH / 2 + 3}`} fill="white" opacity={0.9} />
                      </g>
                    )}
                    {/* Thread badge */}
                    {ti && ti.total > 1 && (
                      <g pointerEvents="none">
                        <rect x={t.x + foW - 26} y={t.y - 10} width={26} height={16} rx={4} fill="#38bdf8" opacity={0.9} />
                        <text x={t.x + foW - 13} y={t.y + 2} textAnchor="middle" fontSize={10} fill="white" fontWeight="bold" style={{ pointerEvents: "none" }}>{ti.index + 1}/{ti.total}</text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}

            {exportFlash && (
              <rect
                x={exportFlash.x}
                y={exportFlash.y}
                width={exportFlash.w}
                height={exportFlash.h}
                fill="none"
                stroke="rgba(56,189,248,0.95)"
                strokeWidth={2 / viewport.zoom}
                pointerEvents="none"
                data-ui="export-flash"
              />
            )}

            {/* Direct select: anchor points and handles for selected paths (incl. máscara de clippingContainer) */}
            {activeTool === "directSelect" && !canvasZenMode &&
              (() => {
                type DsPath = { keyId: string; p: PathObject; selPts: Set<number> | undefined };
                const list: DsPath[] = [];
                for (const o of objects) {
                  if (!o.visible || o.locked) continue;
                  if (o.type === "path" && selectedIds.has(o.id)) {
                    list.push({ keyId: o.id, p: o as PathObject, selPts: selectedPoints.get(o.id) });
                  }
                  if (o.type === "clippingContainer" && selectedIds.has(o.id)) {
                    const c = o as ClippingContainerObject;
                    if (c.mask.type !== "path") continue;
                    const raw = c.mask as PathObject;
                    list.push({
                      keyId: `${c.id}-${raw.id}`,
                      p: clipMaskPathAnchorsToWorld(c, raw),
                      selPts: selectedPoints.get(raw.id),
                    });
                  }
                }
                return list.map(({ keyId, p, selPts }) => {
                  const rings = getPathRings(p);
                  let gBase = 0;
                  return rings.flatMap((ring) => {
                    const slice = ring.map((pt, pi) => {
                      const gIdx = gBase + pi;
                      const isSel = selPts?.has(gIdx);
                      const vm = getVertexMode(pt);
                      const anchorFill = isSel ? "#6366f1" : vm === "corner" ? "#fcd34d" : vm === "cusp" ? "#7dd3fc" : "#fff";
                      const anchorStroke = isSel ? "#fff" : "#6366f1";
                      return (
                        <g key={`ds-${keyId}-${gIdx}`} data-ui="ds-points">
                          <title>{vm === "smooth" ? "Suave (simétrico)" : vm === "cusp" ? "Partir (tangente continua asimétrica)" : "Esquina (independiente)"}</title>
                          <line x1={pt.handleIn.x} y1={pt.handleIn.y} x2={pt.anchor.x} y2={pt.anchor.y}
                            stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} />
                          <line x1={pt.anchor.x} y1={pt.anchor.y} x2={pt.handleOut.x} y2={pt.handleOut.y}
                            stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} />
                          <circle cx={pt.handleIn.x} cy={pt.handleIn.y} r={3.5 / viewport.zoom}
                            fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} />
                          <circle cx={pt.handleOut.x} cy={pt.handleOut.y} r={3.5 / viewport.zoom}
                            fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} />
                          {vm === "corner" ? (
                            <polygon
                              points={`${pt.anchor.x},${pt.anchor.y - 5 / viewport.zoom} ${pt.anchor.x + 4.5 / viewport.zoom},${pt.anchor.y + 4 / viewport.zoom} ${pt.anchor.x - 4.5 / viewport.zoom},${pt.anchor.y + 4 / viewport.zoom}`}
                              fill={anchorFill} stroke={anchorStroke} strokeWidth={1 / viewport.zoom} />
                          ) : vm === "cusp" ? (
                            <rect x={pt.anchor.x - 4 / viewport.zoom} y={pt.anchor.y - 4 / viewport.zoom}
                              width={8 / viewport.zoom} height={8 / viewport.zoom}
                              fill={anchorFill} stroke={anchorStroke} strokeWidth={1 / viewport.zoom} rx={1 / viewport.zoom} />
                          ) : (
                            <circle cx={pt.anchor.x} cy={pt.anchor.y} r={4.2 / viewport.zoom}
                              fill={anchorFill} stroke={anchorStroke} strokeWidth={1 / viewport.zoom} />
                          )}
                        </g>
                      );
                    });
                    gBase += ring.length;
                    return slice;
                  });
                });
              })()}

            {/* Snap guides */}
            {snapGuides.map((g, i) => {
              if (g.type === "anchor") {
                return (
                  <circle key={`sg-${i}`} cx={g.x} cy={g.y} r={4 / viewport.zoom} fill="none" stroke="#38bdf8" strokeWidth={1.5 / viewport.zoom} data-ui="snap" />
                );
              }
              if (g.type === "cross") {
                return (
                  <g key={`sg-${i}`} data-ui="snap">
                    <line x1={g.cx} y1={-99999} x2={g.cx} y2={99999} stroke="#38bdf8" strokeWidth={1 / viewport.zoom} opacity={0.9} />
                    <line x1={-99999} y1={g.cy} x2={99999} y2={g.cy} stroke="#38bdf8" strokeWidth={1 / viewport.zoom} opacity={0.9} />
                  </g>
                );
              }
              return g.type === "line" && g.axis === "x"
                ? <line key={`sg-${i}`} x1={g.pos} y1={-99999} x2={g.pos} y2={99999} stroke="#f472b6" strokeWidth={1 / viewport.zoom} data-ui="snap" />
                : g.type === "line"
                  ? <line key={`sg-${i}`} x1={-99999} y1={g.pos!} x2={99999} y2={g.pos!} stroke="#f472b6" strokeWidth={1 / viewport.zoom} data-ui="snap" />
                  : null;
            })}
          </g>
        </svg>

        {/* Zoom % en esquina (solo modo Freehand; Designer ya tiene controles en cabecera) */}
        {!designerMode && !canvasZenMode && (
          <div className="absolute bottom-3 left-3 text-[10px] text-white/30 font-mono select-none pointer-events-none">
            {Math.round(viewport.zoom * 100)}%
          </div>
        )}

        {quickEditMode && firstSelected && quickEditPos && !canvasZenMode && (
          <div
            className="absolute z-[10002] flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-sky-500/35 bg-zinc-950/98 shadow-xl pointer-events-auto"
            style={{ left: quickEditPos.left, top: quickEditPos.top, transform: "translate(-50%, 0)" }}
            data-ui="quick-fill-stroke">
            <span className="text-[9px] font-bold uppercase tracking-wider text-sky-400/95">{quickEditMode}</span>
            <input
              type="color"
              className="w-7 h-7 rounded border border-white/15 cursor-pointer bg-transparent"
              value={
                quickEditMode === "stroke"
                  ? (firstSelected.stroke || "#ffffff")
                  : (() => {
                      const f = migrateFill(firstSelected.fill);
                      if (f.type === "solid") return f.color;
                      if (f.type === "gradient-linear" || f.type === "gradient-radial") return f.stops[0]?.color ?? "#6366f1";
                      return "#6366f1";
                    })()
              }
              onChange={(e) => {
                const v = e.target.value;
                if (quickEditMode === "stroke") updateSelectedProp("stroke", v);
                else {
                  updateSelectedFill(() => solidFill(v));
                }
              }}
            />
            <button type="button" className="text-[10px] text-zinc-500 hover:text-white px-1" onClick={() => setQuickEditMode(null)} title="Close">×</button>
          </div>
        )}

        {textEditingId && (() => {
          const to = objects.find((o) => o.id === textEditingId) as TextObject | undefined;
          if (!to) return null;
          if (!containerRef.current) return null;
          const foW = to.textMode === "point" ? Math.max(to.width, 32) : to.width;
          const foH = to.textMode === "point" ? Math.max(to.height, to.fontSize * to.lineHeight + 4) : to.height;
          const rcx = to.x + to.width / 2;
          const rcy = to.y + to.height / 2;
          const rot = to.rotation ?? 0;
          const tl = rotatePointAround({ x: to.x, y: to.y }, { x: rcx, y: rcy }, rot);
          const left = viewport.x + tl.x * viewport.zoom;
          const top = viewport.y + tl.y * viewport.zoom;
          const w = Math.max(foW * viewport.zoom, 120);
          const h = Math.max(foH * viewport.zoom, to.fontSize * to.lineHeight * viewport.zoom);
          const fill = migrateFill(to.fill);
          const caretColor =
            fill.type === "solid"
              ? (fill.color === "none" ? "rgba(255,255,255,0.95)" : fill.color)
              : (fill.stops[0]?.color ?? "rgba(255,255,255,0.95)");
          const padSide = (to.textMode === "area" ? 4 : 0) + (to.paragraphIndent ?? 0);
          const z = viewport.zoom;
          const editorStyle: React.CSSProperties = {
            left,
            top,
            width: w,
            minHeight: h,
            fontFamily: to.fontFamily,
            fontSize: Math.max(8, to.fontSize * z),
            fontWeight: to.fontWeight,
            lineHeight: to.lineHeight,
            letterSpacing: to.letterSpacing !== undefined ? `${to.letterSpacing * z}px` : undefined,
            textAlign: to.textAlign,
            fontFeatureSettings: to.fontFeatureSettings ?? '"kern" 1, "liga" 1',
            fontKerning: to.fontKerning === "none" ? "none" : undefined,
            paddingTop: (to.textMode === "area" ? 4 : 0) * z,
            paddingRight: (to.textMode === "area" ? 4 : 0) * z,
            paddingBottom: (to.textMode === "area" ? 4 : 0) * z,
            paddingLeft: padSide * z,
            boxSizing: "border-box",
            color: "transparent",
            WebkitTextFillColor: "transparent",
            caretColor,
            transform: rot ? `rotate(${rot}deg)` : undefined,
            transformOrigin: `${(to.width / 2) * z}px ${(to.height / 2) * z}px`,
          };

          return (
            <textarea
              data-fh-text-editor
              className="absolute z-[10001] resize-none border-0 bg-transparent p-0 shadow-none outline-none ring-0 placeholder:text-transparent [&::selection]:bg-white/15 [&::selection]:text-transparent"
              style={editorStyle}
              value={to.text}
              onChange={(e) => {
                const v = e.target.value;
                setObjects((prev) =>
                  prev.map((o) => {
                    if (o.id !== to.id || o.type !== "text") return o;
                    const t = o as TextObject;
                    let width = t.width;
                    if (t.textMode === "point") {
                      const lines = v.split("\n");
                      const maxLen = lines.reduce((m, line) => Math.max(m, line.length), 0);
                      width = Math.max(80, maxLen * t.fontSize * 0.52 + 24);
                    }
                    return { ...t, text: v, width };
                  }),
                );
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  (ev.target as HTMLTextAreaElement).blur();
                  ev.stopPropagation();
                }
              }}
              onBlur={() => {
                const editedObj = objectsRef.current.find(o => o.id === to.id) as TextObject | undefined;
                pushHistory(objectsRef.current, selectedIdsRef.current);
                if (editedObj?.isTextFrame && onDesignerTextFrameEdit && editedObj.storyId) {
                  onDesignerTextFrameEdit(editedObj.id, editedObj.storyId, editedObj.text);
                }
                setTextEditingId(null);
              }}
              autoFocus
            />
          );
        })()}

        {/* Isolation dimming overlay - renders dimmed parent objects behind current editing context */}
        {isolationDepth > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: -1, opacity: 0.32 }}>
            <svg className="w-full h-full">
              <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
                {isolationStackRef.current.length > 0 && (() => {
                  const f = isolationStackRef.current[isolationStackRef.current.length - 1];
                  const hid = f.kind === "clipping" ? f.containerId : f.groupId;
                  return f.parentObjects
                    .filter((o) => o.id !== hid)
                    .map((o) => (
                      <g key={o.id}>{renderObj(o, f.parentObjects, undefined, { canvasZenMode })}</g>
                    ));
                })()}
              </g>
            </svg>
          </div>
        )}

        {/* Live boolean result preview during isolation */}
        {livePreview && isolationDepth > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: -1, opacity: 0.3 }}>
            <svg className="w-full h-full">
              <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
                <image href={livePreview.dataUrl}
                  x={livePreview.bounds.x} y={livePreview.bounds.y}
                  width={livePreview.bounds.w} height={livePreview.bounds.h}
                  preserveAspectRatio="none" data-ui="live-preview" />
                <rect x={livePreview.bounds.x} y={livePreview.bounds.y}
                  width={livePreview.bounds.w} height={livePreview.bounds.h}
                  fill="none" stroke="#a78bfa" strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${4 / viewport.zoom}`} data-ui="live-preview" />
              </g>
            </svg>
          </div>
        )}
          </div>
        </div>
      </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────── */}
      {!canvasZenMode && !designerStoryModalOpen && (
      <div className="flex w-[200px] shrink-0 flex-col min-h-0 overflow-hidden border-l border-white/[0.08] bg-[#12151a]">
        {/* Header */}
        <div className="px-3 py-2 border-b border-white/10 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Propiedades</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FreehandColorPalette
              inUse={documentColorStats}
              savedColors={savedPaletteColors}
              onSavedColorsChange={setSavedPaletteColors}
              applyTarget={paletteTarget}
              onApplyTargetChange={setPaletteTarget}
              onApplyHex={applyPaletteHex}
              onReplaceDocumentColor={replaceDocumentColorLive}
              onCommitHistory={commitPaletteHistory}
            />

            {firstSelected ? (
              <>
                {/* Transform */}
                <div className="border-b border-white/[0.08] px-[14px] py-3 space-y-2">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Transform</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["x", "y"] as const).map((key) => (
                      <div key={key} className="space-y-0.5">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider">{key.charAt(0).toUpperCase()}</label>
                        <ScrubNumberInput
                          value={Math.round(firstSelected[key])}
                          onKeyboardCommit={(n) => updateSelectedProp(key, n)}
                          onScrubLive={(n) => updateSelectedPropSilent(key, n)}
                          onScrubEnd={commitHistoryAfterScrub}
                          step={1}
                          title="Arrastra horizontalmente para cambiar · Mayús = ×10"
                          className="w-full cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                        />
                      </div>
                    ))}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">W</label>
                      <ScrubNumberInput
                        value={Math.round(
                          firstSelected.type === "text"
                            ? (firstSelected as TextObject).width *
                                (((firstSelected as TextObject).scaleX ?? 1) < 0 ? -1 : 1)
                            : firstSelected.width * (firstSelected.flipX ? -1 : 1),
                        )}
                        onKeyboardCommit={(n) => applySignedDimension("width", n, false)}
                        onScrubLive={(n) => applySignedDimension("width", n, true)}
                        onScrubEnd={commitHistoryAfterScrub}
                        step={1}
                        title="Valor con signo: negativo = espejo horizontal. Arrastra · Mayús = ×10"
                        className="w-full cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">H</label>
                      <ScrubNumberInput
                        value={Math.round(
                          firstSelected.type === "text"
                            ? (firstSelected as TextObject).height *
                                (((firstSelected as TextObject).scaleY ?? 1) < 0 ? -1 : 1)
                            : firstSelected.height * (firstSelected.flipY ? -1 : 1),
                        )}
                        onKeyboardCommit={(n) => applySignedDimension("height", n, false)}
                        onScrubLive={(n) => applySignedDimension("height", n, true)}
                        onScrubEnd={commitHistoryAfterScrub}
                        step={1}
                        title="Valor con signo: negativo = espejo vertical. Arrastra · Mayús = ×10"
                        className="w-full cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Rot</label>
                      <ScrubNumberInput
                        value={Math.round(firstSelected.rotation * 1000) / 1000}
                        onKeyboardCommit={(n) => updateSelectedProp("rotation", n)}
                        onScrubLive={(n) => updateSelectedPropSilent("rotation", n)}
                        onScrubEnd={commitHistoryAfterScrub}
                        step={0.1}
                        roundFn={(n) => Math.round(n * 1000) / 1000}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className="w-full cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Opacity</label>
                      <ScrubNumberInput
                        value={Math.round(firstSelected.opacity * 100)}
                        onKeyboardCommit={(n) => updateSelectedProp("opacity", clamp(n, 0, 100) / 100)}
                        onScrubLive={(n) => updateSelectedPropSilent("opacity", clamp(n, 0, 100) / 100)}
                        onScrubEnd={commitHistoryAfterScrub}
                        step={1}
                        roundFn={(n) => clamp(Math.round(n), 0, 100)}
                        min={0}
                        max={100}
                        title="Opacity % · Mayús = ×10"
                        className="w-full cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Designer: Marco de imagen ── */}
                {designerMode && firstSelected.isImageFrame && (() => {
                  const ifc = (firstSelected as any).imageFrameContent as FreehandObjectBase["imageFrameContent"];
                  const autoFit = (firstSelected as any).imageFrameAutoFit !== false;
                  const hasImg = !!ifc?.src;
                  const fitting = ifc?.fittingMode ?? "fill-proportional";

                  const IMG_FIT_OPTIONS: { value: string; label: string }[] = [
                    { value: "fit-proportional", label: "Ajustar contenido proporcionalmente" },
                    { value: "fill-proportional", label: "Rellenar caja proporcionalmente" },
                    { value: "fit-stretch", label: "Ajustar contenido a la caja" },
                    { value: "center-content", label: "Centrar contenido (sin escalar)" },
                    { value: "fill-stretch", label: "Rellenar sin proporción" },
                    { value: "frame-to-content", label: "Ajustar caja al contenido" },
                  ];

                  const applyFitting = (mode: string) => {
                    if (!ifc) return;
                    const fw = firstSelected.width, fh = firstSelected.height;
                    const iw = ifc.originalWidth, ih = ifc.originalHeight;
                    let sX: number, sY: number, oX: number, oY: number;
                    if (mode === "fit-proportional") { const s = Math.min(fw / iw, fh / ih); sX = sY = s; oX = (fw - iw * s) / 2; oY = (fh - ih * s) / 2; }
                    else if (mode === "fill-proportional") { const s = Math.max(fw / iw, fh / ih); sX = sY = s; oX = (fw - iw * s) / 2; oY = (fh - ih * s) / 2; }
                    else if (mode === "fit-stretch" || mode === "fill-stretch") { sX = fw / iw; sY = fh / ih; oX = 0; oY = 0; }
                    else if (mode === "center-content") { sX = sY = 1; oX = (fw - iw) / 2; oY = (fh - ih) / 2; }
                    else if (mode === "frame-to-content") {
                      const csx = ifc.scaleX || 1, csy = ifc.scaleY || 1;
                      updateSelectedProp("width", iw * csx);
                      updateSelectedProp("height", ih * csy);
                      updateSelectedProp("imageFrameContent", { ...ifc, offsetX: 0, offsetY: 0, fittingMode: mode });
                      return;
                    }
                    else { sX = sY = 1; oX = 0; oY = 0; }
                    updateSelectedProp("imageFrameContent", { ...ifc, scaleX: sX, scaleY: sY, offsetX: oX, offsetY: oY, fittingMode: mode });
                  };

                  return (
                    <div ref={designerImageFramePropsRef} className="border-b border-white/[0.08] px-[14px] py-3 space-y-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200/80">Marco de imagen</p>

                      <button
                        type="button"
                        onClick={() => onDesignerImageFramePlace?.(firstSelected.id)}
                        className="w-full rounded-lg border border-amber-400/35 bg-amber-500/15 py-2 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-500/25"
                      >
                        Colocar imagen dentro
                      </button>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Auto-Fit</span>
                        <button
                          type="button"
                          onClick={() => updateSelectedProp("imageFrameAutoFit", !autoFit)}
                          className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase transition ${
                            autoFit
                              ? "border-violet-400/50 bg-violet-500/25 text-violet-200"
                              : "border-white/[0.08] bg-white/[0.04] text-zinc-500"
                          }`}
                        >
                          {autoFit ? "On" : "Off"}
                        </button>
                      </div>

                      {hasImg && (
                        <>
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Ajuste (fitting)</span>
                            <div className="grid grid-cols-3 gap-1">
                              {IMG_FIT_OPTIONS.map((o) => {
                                const active = fitting === o.value;
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    title={o.label}
                                    aria-label={o.label}
                                    aria-pressed={active}
                                    onClick={() => applyFitting(o.value)}
                                    className={`flex h-9 items-center justify-center rounded-md border transition ${
                                      active
                                        ? "border-violet-400/50 bg-violet-500/25 text-violet-200"
                                        : "border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
                                    }`}
                                  >
                                    <ImageFrameFittingGlyph mode={o.value} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      {hasImg && (
                        <button
                          type="button"
                          onClick={() => {
                            const sk = ifc?.s3Key;
                            if (typeof sk === "string" && sk.startsWith("knowledge-files/")) {
                              fireAndForgetDeleteS3Keys([sk]);
                            }
                            updateSelectedProp("imageFrameContent", null);
                          }}
                          className="w-full rounded-lg border border-rose-500/25 bg-rose-500/10 py-1.5 text-[10px] font-medium text-rose-300 transition hover:bg-rose-500/20"
                        >
                          Eliminar imagen
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* ── Designer: Marco de texto ── */}
                {designerMode && firstSelected.isTextFrame && (() => {
                  const storyId = (firstSelected as any).storyId as string | undefined;
                  const ti = (firstSelected as any)._designerThreadInfo as { index: number; total: number } | undefined;
                  const canUnlink = ti && ti.index > 0;
                  const storyText = storyId ? designerStoryMap?.get(storyId) ?? "" : "";
                  const storyHtml = storyId ? designerStoryHtmlMap?.get(storyId) ?? "" : "";

                  const openDesignerStoryModal = () => {
                    if (typeof window === "undefined" || !storyId) return;
                    const w = Math.min(820, Math.max(420, window.innerWidth - 96));
                    const h = Math.min(640, Math.max(300, window.innerHeight - 100));
                    const x = Math.max(16, (window.innerWidth - w) / 2);
                    const y = Math.max(36, (window.innerHeight - h) / 2);
                    setDesignerStoryModalRect({ x, y, w, h });
                    setDesignerStoryModalObjectId(firstSelected.id);
                    setDesignerStoryModalOpen(true);
                  };

                  return (
                    <div className="border-b border-white/[0.08] px-[14px] py-3 space-y-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">Marco de texto</p>

                      <label className="block text-[10px] font-medium text-zinc-500">Contenido</label>
                      {storyId && (
                        <DesignerStoryRichEditorBlock
                          key={`re-panel-${storyId}`}
                          storyId={storyId}
                          storyText={storyText}
                          storyHtml={storyHtml}
                          onRichChange={onDesignerStoryRichChange}
                          compactMaxLines={4}
                          onRequestOpenFull={openDesignerStoryModal}
                          editorClassName="mt-0 min-h-0 w-full rounded-b-[5px] border border-white/[0.08] bg-white/[0.06] px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500/40 [&_b]:font-bold [&_i]:italic [&_u]:underline [&_s]:line-through"
                        />
                      )}

                      {canUnlink && (
                        <button
                          type="button"
                          onClick={() => onDesignerUnlinkTextFrame?.(firstSelected.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-[5px] border border-white/[0.08] bg-white/[0.06] py-2 text-[11px] font-bold text-zinc-200 transition hover:bg-white/10"
                        >
                          Romper enlace entrante
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Fill */}
                <div className="py-3 px-[14px] border-b border-white/[0.08] space-y-3">
                {firstSelected.type === "image" || firstSelected.type === "booleanGroup" ? (
                  <p className="text-[9px] text-zinc-500 leading-relaxed">
                    {firstSelected.type === "booleanGroup"
                      ? "Boolean preview is rasterized. Gradient fill applies after vector boolean in a future update."
                      : "Bitmap images do not use vector fill."}
                  </p>
                ) : firstSelected.type === "textOnPath" ? (
                  (() => {
                    const top = firstSelected as TextOnPathObject;
                    const noFillTp = top.fill === "none" || top.fill === "transparent";
                    const tpHex = /^#[0-9A-Fa-f]{6}$/.test(top.fill) ? top.fill : "#000000";
                    return (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Fill</span>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Sin relleno"
                            aria-pressed={noFillTp}
                            onClick={() => updateSelectedProp("fill", "none")}
                            className={`relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] border bg-[#2a2d33] transition-colors ${
                              noFillTp
                                ? "border-[#534AB7] ring-1 ring-[#534AB7]/40"
                                : "border-white/[0.08] hover:bg-white/[0.06]"
                            }`}
                          >
                            <svg width="22" height="22" viewBox="0 0 22 22" className="pointer-events-none absolute inset-0 text-red-500" aria-hidden>
                              <line x1="4" y1="18" x2="18" y2="4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="square" />
                            </svg>
                          </button>
                          <input
                            type="color"
                            value={noFillTp ? "#000000" : tpHex}
                            onChange={(e) => updateSelectedProp("fill", e.target.value)}
                            className="h-[22px] w-[22px] shrink-0 cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent"
                            title="Elige un color para el relleno del texto"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                    );
                  })()
                ) : (
                  (() => {
                    const mf = migrateFill(firstSelected.fill);
                    const noFill = mf.type === "solid" && mf.color === "none";
                    const fillExpanded = mf.type !== "solid" || !noFill;
                    const fillPickerValue =
                      mf.type === "solid"
                        ? mf.color === "none"
                          ? "#000000"
                          : mf.color
                        : mf.type === "gradient-linear" || mf.type === "gradient-radial"
                          ? mf.stops[0]?.color ?? "#6366f1"
                          : "#000000";
                    return (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Fill</span>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Sin relleno"
                            aria-label="Sin relleno"
                            aria-pressed={noFill}
                            onClick={() => updateSelectedFill(() => solidFill("none"))}
                            className={`relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] border bg-[#2a2d33] transition-colors ${
                              noFill
                                ? "border-[#534AB7] ring-1 ring-[#534AB7]/40"
                                : "border-white/[0.08] hover:bg-white/[0.06]"
                            }`}
                          >
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 22 22"
                              className="pointer-events-none absolute inset-0 text-red-500"
                              aria-hidden
                            >
                              <line x1="4" y1="18" x2="18" y2="4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="square" />
                            </svg>
                          </button>
                          <input
                            type="color"
                            value={fillPickerValue}
                            onChange={(e) => {
                              const c = e.target.value;
                              updateSelectedFill(() => solidFill(c));
                              setFillColor(c);
                            }}
                            className="h-[22px] w-[22px] shrink-0 cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent"
                            title="Elige un color para relleno sólido (reactiva el relleno)"
                          />
                        </div>
                      </div>
                    </div>
                    {fillExpanded ? (
                    <>
                    <div className="flex gap-1.5">
                      {([
                        { id: "solid" as const, label: "Solid" },
                        { id: "gradient-linear" as const, label: "Linear" },
                        { id: "gradient-radial" as const, label: "Radial" },
                      ]).map((m) => {
                        const cur = mf.type;
                        const active = cur === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`flex-1 rounded-[5px] border px-2 py-1 text-[12px] transition-colors ${active ? "border-[#534AB7] bg-[#534AB7] text-white" : "border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200"}`}
                            onClick={() => {
                              if (m.id === "solid") {
                                const prev = mf;
                                const c = prev.type === "solid" ? prev.color : "#6366f1";
                                updateSelectedFill(() => solidFill(c));
                                setFillColor(c === "none" ? "#6366f1" : c);
                              } else if (m.id === "gradient-linear") {
                                updateSelectedFill(() => defaultLinearGradient());
                              } else {
                                updateSelectedFill(() => defaultRadialGradient());
                              }
                            }}
                          >{m.label}</button>
                        );
                      })}
                    </div>
                    {mf.type === "solid" && (() => {
                      const sf = mf;
                      const solidHex = sf.color !== "none" ? sf.color : "#000000";
                      return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          key={solidHex}
                          type="text"
                          defaultValue={solidHex}
                          disabled={noFill}
                          spellCheck={false}
                          onBlur={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                              updateSelectedFill(() => solidFill(v));
                              setFillColor(v);
                            } else {
                              e.currentTarget.value = solidHex;
                            }
                          }}
                          className={`min-w-0 flex-1 rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100 ${noFill ? "cursor-not-allowed opacity-40" : ""}`}
                        />
                        <span
                          className="min-w-[44px] shrink-0 rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-center text-[12px] text-zinc-300"
                          title="Opacidad global del objeto"
                        >
                          {Math.round(firstSelected.opacity * 100)}%
                        </span>
                      </div>
                      );
                    })()}
                    {mf.type === "gradient-linear" && (() => {
                      const gf = mf as Extract<FillAppearance, { type: "gradient-linear" }>;
                      const ang = Math.round(angleFromLinearGradient(gf));
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Angle</span>
                            <ScrubNumberInput
                              value={ang}
                              onKeyboardCommit={(deg) => {
                                const d = Number(deg) || 0;
                                const xy = linearGradientFromAngle(d);
                                updateSelectedFill((f) =>
                                  f.type === "gradient-linear" ? { ...f, ...xy, stops: f.stops.map((s) => ({ ...s })) } : f,
                                );
                              }}
                              onScrubLive={(deg) => {
                                const d = Number(deg) || 0;
                                const xy = linearGradientFromAngle(d);
                                updateSelectedFillSilent((f) =>
                                  f.type === "gradient-linear" ? { ...f, ...xy, stops: f.stops.map((s) => ({ ...s })) } : f,
                                );
                              }}
                              onScrubEnd={commitHistoryAfterScrub}
                              step={1}
                              title="Arrastra horizontalmente · Mayús = ×10"
                              className="w-16 cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                            />
                          </div>
                          <div className="h-3 rounded-full border border-white/10 relative overflow-hidden"
                            style={{
                              background: `linear-gradient(90deg, ${gf.stops.map((s) => `rgba(${parseInt(s.color.slice(1, 3), 16)},${parseInt(s.color.slice(3, 5), 16)},${parseInt(s.color.slice(5, 7), 16)},${s.opacity}) ${s.position}%`).join(",")})`,
                            }}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" className="rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10" onClick={() => updateSelectedFill((f) => (f.type === "gradient-linear" ? { ...f, stops: addMidStop(f.stops) } : f))}>+ Stop</button>
                            <button type="button" className="rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10" onClick={() => updateSelectedFill((f) => (f.type === "gradient-linear" ? { ...f, stops: reverseGradientStops(f.stops) } : f))}>Reverse</button>
                          </div>
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {gf.stops.map((s, si) => (
                              <div key={si} className="flex items-center gap-1">
                                <input type="color" value={s.color} className="h-6 w-6 shrink-0 rounded-[5px] border border-white/[0.08]"
                                  onChange={(e) => {
                                    const c = e.target.value;
                                    updateSelectedFill((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, color: c } : st));
                                      return { ...f, stops };
                                    });
                                  }} />
                                <input type="range" min={0} max={1} step={0.01} value={s.opacity} className="flex-1 accent-violet-500"
                                  onChange={(e) => {
                                    const op = Number(e.target.value);
                                    updateSelectedFill((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, opacity: op } : st));
                                      return { ...f, stops };
                                    });
                                  }} />
                                <ScrubNumberInput
                                  value={s.position}
                                  onKeyboardCommit={(p) => {
                                    updateSelectedFill((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, position: clamp(p, 0, 100) } : st));
                                      return { ...f, stops };
                                    });
                                  }}
                                  onScrubLive={(p) => {
                                    updateSelectedFillSilent((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, position: clamp(p, 0, 100) } : st));
                                      return { ...f, stops };
                                    });
                                  }}
                                  onScrubEnd={commitHistoryAfterScrub}
                                  step={1}
                                  roundFn={(n) => clamp(Math.round(n), 0, 100)}
                                  min={0}
                                  max={100}
                                  title="Arrastra horizontalmente · Mayús = ×10"
                                  className="w-10 cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[12px] text-zinc-100"
                                />
                                <button type="button" className="text-zinc-500 text-[8px]" disabled={gf.stops.length <= 2}
                                  onClick={() => updateSelectedFill((f) => {
                                    if (f.type !== "gradient-linear" || f.stops.length <= 2) return f;
                                    return { ...f, stops: f.stops.filter((_, j) => j !== si) };
                                  })}>✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {mf.type === "gradient-radial" && (() => {
                      const gf = mf as Extract<FillAppearance, { type: "gradient-radial" }>;
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Radius</span>
                            <ScrubNumberInput
                              value={Math.round(gf.r * 100) / 100}
                              onKeyboardCommit={(r) => updateSelectedFill((f) => (f.type === "gradient-radial" ? { ...f, r: clamp(r, 0.02, 2) } : f))}
                              onScrubLive={(r) => updateSelectedFillSilent((f) => (f.type === "gradient-radial" ? { ...f, r: clamp(r, 0.02, 2) } : f))}
                              onScrubEnd={commitHistoryAfterScrub}
                              step={0.02}
                              roundFn={(n) => Math.round(clamp(n, 0.02, 2) * 100) / 100}
                              min={0.02}
                              max={2}
                              title="Arrastra horizontalmente · Mayús = ×10"
                              className="w-16 cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                            />
                          </div>
                          <div className="h-3 rounded-full border border-white/10" style={{ background: `radial-gradient(circle, ${gf.stops.map((s) => `${s.color} ${s.position}%`).join(",")})` }} />
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" className="rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10" onClick={() => updateSelectedFill((f) => (f.type === "gradient-radial" ? { ...f, stops: addMidStop(f.stops) } : f))}>+ Stop</button>
                            <button type="button" className="rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10" onClick={() => updateSelectedFill((f) => (f.type === "gradient-radial" ? { ...f, stops: reverseGradientStops(f.stops) } : f))}>Reverse</button>
                          </div>
                          {gf.stops.map((s, si) => (
                            <div key={si} className="flex items-center gap-1">
                              <input type="color" value={s.color} className="h-6 w-6 shrink-0 rounded-[5px] border border-white/[0.08]"
                                onChange={(e) => {
                                  const c = e.target.value;
                                  updateSelectedFill((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, color: c } : st));
                                    return { ...f, stops };
                                  });
                                }} />
                              <input type="range" min={0} max={1} step={0.01} value={s.opacity} className="flex-1 accent-violet-500"
                                onChange={(e) => {
                                  const op = Number(e.target.value);
                                  updateSelectedFill((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, opacity: op } : st));
                                    return { ...f, stops };
                                  });
                                }} />
                              <ScrubNumberInput
                                value={s.position}
                                onKeyboardCommit={(p) => {
                                  updateSelectedFill((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, position: clamp(p, 0, 100) } : st));
                                    return { ...f, stops };
                                  });
                                }}
                                onScrubLive={(p) => {
                                  updateSelectedFillSilent((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, position: clamp(p, 0, 100) } : st));
                                    return { ...f, stops };
                                  });
                                }}
                                onScrubEnd={commitHistoryAfterScrub}
                                step={1}
                                roundFn={(n) => clamp(Math.round(n), 0, 100)}
                                min={0}
                                max={100}
                                title="Arrastra horizontalmente · Mayús = ×10"
                                className="w-10 cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[12px] text-zinc-100"
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {(() => {
                      const ft = mf.type;
                      const isGrad = ft === "gradient-linear" || ft === "gradient-radial";
                      return isGrad && !supportsGradientFill(firstSelected) ? (
                        <p className="text-[9px] text-amber-400/90">This layer cannot use on-canvas gradient handles; adjust gradient in the panel or pick another shape.</p>
                      ) : null;
                    })()}
                    </>
                    ) : null}
                  </div>
                    );
                  })()
                )}
                </div>

                {/* Stroke — swatches; opciones al elegir color */}
                {(() => {
                  const noStroke = firstSelected.stroke === "none";
                  return (
                <div className={`border-b border-white/[0.08] py-3 px-[14px] ${noStroke ? "space-y-0" : "space-y-2.5"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stroke</span>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Sin trazo (ningún borde)"
                          aria-label="Sin trazo"
                          aria-pressed={noStroke}
                          onClick={() => updateSelectedProp("stroke", "none")}
                          className={`relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] border bg-[#2a2d33] transition-colors ${
                            noStroke
                              ? "border-[#534AB7] ring-1 ring-[#534AB7]/40"
                              : "border-white/[0.08] hover:bg-white/[0.06]"
                          }`}
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 22 22"
                            className="pointer-events-none absolute inset-0 text-red-500"
                            aria-hidden
                          >
                            <line x1="4" y1="18" x2="18" y2="4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="square" />
                          </svg>
                        </button>
                        <input
                          type="color"
                          value={noStroke ? "#000000" : firstSelected.stroke}
                          onChange={(e) => {
                            const c = e.target.value;
                            updateSelectedProp("stroke", c);
                            setStrokeColor(c);
                          }}
                          className="h-[22px] w-[22px] shrink-0 cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent"
                          title="Elige un color para activar el trazo de nuevo"
                        />
                      </div>
                    </div>
                  </div>
                  {!noStroke ? (
                    <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 text-[10px] text-zinc-500 uppercase tracking-wider">Weight</span>
                    <ScrubNumberInput
                      value={firstSelected.strokeWidth}
                      onKeyboardCommit={(n) => updateSelectedProp("strokeWidth", clamp(n, 0, 50))}
                      onScrubLive={(n) => updateSelectedPropSilent("strokeWidth", clamp(n, 0, 50))}
                      onScrubEnd={commitHistoryAfterScrub}
                      step={0.5}
                      roundFn={(n) => Math.round(clamp(n, 0, 50) * 2) / 2}
                      min={0}
                      max={50}
                      title="Arrastra horizontalmente · Mayús = ×10"
                      className="min-w-[3rem] flex-1 cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                    />
                    <div className="flex items-center gap-1.5" title="Cap">
                      {([
                        { v: "butt" as const, Icon: Minus, label: "Butt cap" },
                        { v: "round" as const, Icon: Circle, label: "Round cap" },
                        { v: "square" as const, Icon: RectangleHorizontal, label: "Square cap" },
                      ]).map(({ v, Icon, label }) => (
                        <button
                          key={v}
                          type="button"
                          title={label}
                          onClick={() => {
                            updateSelectedProp("strokeLinecap", v);
                            setStrokeLinecap(v);
                          }}
                          className={`rounded-[5px] border p-1.5 transition-colors ${firstSelected.strokeLinecap === v ? "border-[#534AB7] bg-[#534AB7] text-white" : "border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200"}`}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 text-[10px] text-zinc-500 uppercase tracking-wider">Join</span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5" title="Join">
                      {([
                        { v: "miter" as const, Icon: Triangle, label: "Miter join" },
                        { v: "round" as const, Icon: Circle, label: "Round join" },
                        { v: "bevel" as const, Icon: Diamond, label: "Bevel join" },
                      ]).map(({ v, Icon, label }) => (
                        <button
                          key={v}
                          type="button"
                          title={label}
                          onClick={() => {
                            updateSelectedProp("strokeLinejoin", v);
                            setStrokeLinejoin(v);
                          }}
                          className={`rounded-[5px] border p-1.5 transition-colors ${firstSelected.strokeLinejoin === v ? "border-[#534AB7] bg-[#534AB7] text-white" : "border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200"}`}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 text-[10px] text-zinc-500 uppercase tracking-wider">Dash</span>
                    <input
                      type="text"
                      value={firstSelected.strokeDasharray ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.replace(/,/g, " ");
                        updateSelectedProp("strokeDasharray", v);
                        setStrokeDasharray(v);
                      }}
                      className="min-w-0 flex-1 rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100"
                      title="Dash gap (e.g. 8 4)"
                    />
                  </div>
                  {firstSelected.type === "text" && firstSelected.strokeWidth > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-14 shrink-0 text-[10px] text-zinc-500 uppercase tracking-wider">Posición</span>
                      <div className="flex flex-1 gap-1.5">
                        {([
                          { id: "over" as const, label: "Encima" },
                          { id: "under" as const, label: "Debajo" },
                        ]).map((p) => {
                          const tx = firstSelected as TextObject;
                          const cur = tx.strokePosition ?? "over";
                          const active = cur === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => updateSelectedProp("strokePosition", p.id)}
                              className={`flex-1 rounded-[5px] border px-2 py-1 text-[11px] transition-colors ${active ? "border-[#534AB7] bg-[#534AB7] text-white" : "border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200"}`}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                    </>
                  ) : null}
                </div>
                  );
                })()}

                <div className="space-y-2.5 px-[14px] pb-3 pt-1">

                {firstSelected.type === "text" && (() => {
                  const tx = firstSelected as TextObject;
                  const primaryFamily = tx.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
                  /** Misma línea visual que el bloque Transform (#121417 panel / inputs #1e2024). */
                  const tfInp =
                    "w-full cursor-ew-resize rounded-[7px] border border-[#2d2f34] bg-[#1e2024] px-3 py-2 font-mono text-[12px] text-zinc-100";
                  const tfLbl = "text-[10px] text-[#71717a] uppercase tracking-wider";
                  const tfSec = "text-[10px] text-[#71717a] uppercase tracking-wider";
                  const tfField = "space-y-1";
                  const tfIconMuted = "text-[#71717a]";
                  const pillOn = "border-[#534AB7] bg-[#534AB7] text-white";
                  const pillOff =
                    "border-[#2d2f34] bg-[#1e2024] text-[#71717a] hover:border-[#3f4249] hover:text-zinc-200";
                  const iconToolBtn = `inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-[7px] border text-[#a1a1aa] transition-colors ${pillOff}`;
                  const iconToolBtnOn = `inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-[7px] border text-white transition-colors ${pillOn}`;
                  const kernOn = (tx.fontKerning ?? "auto") !== "none";
                  return (
                    <div className="-mx-[14px] space-y-4 border-b border-white/[0.08] px-[14px] py-3">
                      <div className={tfSec}>Typography</div>

                      <div className="flex gap-3">
                        <select
                          value={GOOGLE_FONTS_POPULAR.some((g) => g.family === primaryFamily) ? primaryFamily : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            updateSelectedProp("fontFamily", `${v}, system-ui, sans-serif`);
                          }}
                          className="min-h-[40px] min-w-0 flex-1 rounded-[7px] border border-[#2d2f34] bg-[#1e2024] px-3 py-2 text-[12px] text-zinc-100"
                        >
                          <option value="">— Font —</option>
                          {GOOGLE_FONTS_POPULAR.map((g) => (
                            <option key={g.family} value={g.family}>
                              {g.family} ({g.category})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          title="Importar .ttf · .otf · woff"
                          onClick={() => customFontInputRef.current?.click()}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-[#2d2f34] bg-[#1e2024] text-[#71717a] transition hover:border-[#3f4249] hover:text-zinc-200"
                        >
                          <Upload size={16} strokeWidth={2} aria-hidden />
                        </button>
                        <input
                          ref={customFontInputRef}
                          type="file"
                          accept=".ttf,.otf,.woff,.woff2"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            try {
                              const buf = await f.arrayBuffer();
                              const face = new FontFace(f.name.replace(/\.[^.]+$/, ""), buf);
                              await face.load();
                              document.fonts.add(face);
                              registerUserFontBuffer(parsePrimaryFontFamily(face.family), tx.fontWeight, buf);
                              updateSelectedProp("fontFamily", `"${face.family}", system-ui, sans-serif`);
                              setToast(`Font loaded: ${face.family}`);
                              setTimeout(() => setToast(null), 2500);
                            } catch {
                              setToast("Could not load font file");
                              setTimeout(() => setToast(null), 2500);
                            }
                            e.target.value = "";
                          }}
                        />
                      </div>
                      <input
                        type="text"
                        value={tx.fontFamily}
                        onChange={(e) => updateSelectedProp("fontFamily", e.target.value)}
                        spellCheck={false}
                        className={`${tfInp} text-[11px] placeholder:text-zinc-500`}
                        placeholder="Inter, system-ui, sans-serif"
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <div className={tfField}>
                          <label className={`flex items-center gap-1.5 ${tfLbl}`} title="Size (px)">
                            <Type size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                            Size
                          </label>
                          <ScrubNumberInput
                            value={tx.fontSize}
                            onKeyboardCommit={(n) => updateSelectedProp("fontSize", clamp(Math.round(n), 4, 400))}
                            onScrubLive={(n) => updateSelectedPropSilent("fontSize", clamp(Math.round(n), 4, 400))}
                            onScrubEnd={commitHistoryAfterScrub}
                            step={1}
                            roundFn={(n) => clamp(Math.round(n), 4, 400)}
                            min={4}
                            max={400}
                            title="Arrastra horizontalmente · Mayús = ×10"
                            className={tfInp}
                          />
                        </div>
                        <div className={tfField}>
                          <label className={`flex items-center gap-1.5 ${tfLbl}`} title="Weight">
                            <Weight size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                            Wgt
                          </label>
                          <ScrubNumberInput
                            value={tx.fontWeight}
                            onKeyboardCommit={(n) => updateSelectedProp("fontWeight", clamp(Math.round(n), 100, 900))}
                            onScrubLive={(n) => updateSelectedPropSilent("fontWeight", clamp(Math.round(n), 100, 900))}
                            onScrubEnd={commitHistoryAfterScrub}
                            step={1}
                            roundFn={(n) => clamp(Math.round(n), 100, 900)}
                            min={100}
                            max={900}
                            title="Arrastra horizontalmente · Mayús = ×10"
                            className={tfInp}
                          />
                        </div>
                        <div className={tfField}>
                          <label className={`flex items-center gap-1.5 ${tfLbl}`} title="Line height">
                            <BetweenVerticalStart size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                            Lead
                          </label>
                          <ScrubNumberInput
                            value={tx.lineHeight}
                            onKeyboardCommit={(n) => updateSelectedProp("lineHeight", clamp(Math.round(n * 100) / 100, 0.5, 4))}
                            onScrubLive={(n) => updateSelectedPropSilent("lineHeight", clamp(Math.round(n * 100) / 100, 0.5, 4))}
                            onScrubEnd={commitHistoryAfterScrub}
                            step={0.05}
                            roundFn={(n) => Math.round(clamp(n, 0.5, 4) * 100) / 100}
                            min={0.5}
                            max={4}
                            title="Arrastra horizontalmente · Mayús = ×10"
                            className={tfInp}
                          />
                        </div>
                        <div className={tfField}>
                          <label className={`flex items-center gap-1.5 ${tfLbl}`} title="Letter-spacing (px)">
                            <BetweenHorizontalStart size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                            Trk
                          </label>
                          <ScrubNumberInput
                            value={tx.letterSpacing}
                            onKeyboardCommit={(n) => updateSelectedProp("letterSpacing", Math.round(n * 100) / 100)}
                            onScrubLive={(n) => updateSelectedPropSilent("letterSpacing", Math.round(n * 100) / 100)}
                            onScrubEnd={commitHistoryAfterScrub}
                            step={0.05}
                            roundFn={(n) => Math.round(n * 100) / 100}
                            title="Arrastra horizontalmente · Mayús = ×10"
                            className={tfInp}
                          />
                        </div>
                        <div className={tfField}>
                          <label className={`flex items-center gap-1.5 ${tfLbl}`} title="Paragraph indent (px)">
                            <IndentIncrease size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                            Ind
                          </label>
                          <ScrubNumberInput
                            value={tx.paragraphIndent ?? 0}
                            onKeyboardCommit={(n) => updateSelectedProp("paragraphIndent", clamp(Math.round(n), 0, 200))}
                            onScrubLive={(n) => updateSelectedPropSilent("paragraphIndent", clamp(Math.round(n), 0, 200))}
                            onScrubEnd={commitHistoryAfterScrub}
                            step={1}
                            roundFn={(n) => clamp(Math.round(n), 0, 200)}
                            min={0}
                            max={200}
                            title="Arrastra horizontalmente · Mayús = ×10"
                            className={tfInp}
                          />
                        </div>
                        <div className={tfField}>
                          <label className={`flex items-center gap-1.5 ${tfLbl}`} title="font-kerning: auto aplica pares en la fuente; none los apaga.">
                            <Link2 size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                            Kern
                          </label>
                          <div
                            className="flex h-10 overflow-hidden rounded-[7px] border border-[#2d2f34] bg-[#1e2024]"
                            role="group"
                            aria-label="Kerning de pares"
                          >
                            <button
                              type="button"
                              title="Auto (font-kerning: auto)"
                              onClick={() => updateSelectedProp("fontKerning", "auto")}
                              className={`flex flex-1 items-center justify-center border-r border-[#2d2f34] transition-colors ${
                                kernOn ? "bg-[#534AB7] text-white" : "bg-transparent text-[#71717a] hover:bg-[#252830] hover:text-zinc-200"
                              }`}
                            >
                              <Link2 size={15} strokeWidth={2} aria-hidden />
                            </button>
                            <button
                              type="button"
                              title="None (font-kerning: none)"
                              onClick={() => updateSelectedProp("fontKerning", "none")}
                              className={`flex flex-1 items-center justify-center transition-colors ${
                                !kernOn ? "bg-[#534AB7] text-white" : "bg-transparent text-[#71717a] hover:bg-[#252830] hover:text-zinc-200"
                              }`}
                            >
                              <Unlink2 size={15} strokeWidth={2} aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className={`flex items-center gap-1.5 ${tfLbl}`}>
                          <AlignStartHorizontal size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                          Align
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {(
                            [
                              ["left", AlignLeft, "Left"],
                              ["center", AlignCenter, "Center"],
                              ["right", AlignRight, "Right"],
                              ["justify", AlignJustify, "Justify"],
                            ] as const
                          ).map(([al, Icon, label]) => (
                            <button
                              key={al}
                              type="button"
                              title={label}
                              onClick={() => updateSelectedProp("textAlign", al)}
                              className={tx.textAlign === al ? iconToolBtnOn : iconToolBtn}
                            >
                              <Icon size={16} strokeWidth={2} aria-hidden />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className={`flex items-center gap-1.5 ${tfLbl}`}>
                          <Type size={11} strokeWidth={2} className={tfIconMuted} aria-hidden />
                          Style
                        </div>
                        <div className="grid grid-cols-5 gap-3">
                          <button
                            type="button"
                            title="Small caps"
                            onClick={() =>
                              updateSelectedProp("fontVariantCaps", tx.fontVariantCaps === "small-caps" ? "normal" : "small-caps")
                            }
                            className={tx.fontVariantCaps === "small-caps" ? iconToolBtnOn : iconToolBtn}
                          >
                            <CaseSensitive size={16} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            title="Bold"
                            onClick={() => updateSelectedProp("fontWeight", tx.fontWeight >= 600 ? 400 : 700)}
                            className={tx.fontWeight >= 600 ? iconToolBtnOn : iconToolBtn}
                          >
                            <Bold size={16} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            title="Italic"
                            onClick={() =>
                              updateSelectedProp("fontStyle", tx.fontStyle === "italic" ? "normal" : "italic")
                            }
                            className={tx.fontStyle === "italic" ? iconToolBtnOn : iconToolBtn}
                          >
                            <Italic size={16} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            title="Underline"
                            onClick={() => updateSelectedProp("textUnderline", !tx.textUnderline)}
                            className={tx.textUnderline ? iconToolBtnOn : iconToolBtn}
                          >
                            <Underline size={16} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            title="Strikethrough"
                            onClick={() => updateSelectedProp("textStrikethrough", !tx.textStrikethrough)}
                            className={tx.textStrikethrough ? iconToolBtnOn : iconToolBtn}
                          >
                            <Strikethrough size={16} strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Convert to outlines will make text non-editable. Continue?")) void convertTextToOutlines();
                        }}
                        className="w-full rounded-[7px] border border-[#2d2f34] bg-[#1e2024] py-2.5 text-[12px] font-medium text-zinc-100 transition hover:border-[#3f4249] hover:bg-[#252830]"
                      >
                        Convert to outlines
                      </button>
                    </div>
                  );
                })()}

                {firstSelected.type === "textOnPath" && (() => {
                  const top = firstSelected as TextOnPathObject;
                  const primaryFamily = top.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
                  return (
                    <>
                      <div className="space-y-2 border-t border-white/10 pt-2">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Typography</div>
                        <label className="text-[8px] text-zinc-500">Google Fonts</label>
                        <select
                          value={GOOGLE_FONTS_POPULAR.some((g) => g.family === primaryFamily) ? primaryFamily : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            updateSelectedProp("fontFamily", `${v}, system-ui, sans-serif`);
                          }}
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white"
                        >
                          <option value="">— Elegir fuente —</option>
                          {GOOGLE_FONTS_POPULAR.map((g) => (
                            <option key={g.family} value={g.family}>{g.family} ({g.category})</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={top.fontFamily}
                          onChange={(e) => updateSelectedProp("fontFamily", e.target.value)}
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white"
                          placeholder="CSS font stack (prioridad)"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="flex-1 rounded border border-white/10 bg-white/5 py-1 text-[8px] font-bold uppercase text-zinc-300 hover:bg-white/10"
                            onClick={() => customFontInputRef.current?.click()}
                          >
                            Importar .ttf / .otf
                          </button>
                          <input
                            ref={customFontInputRef}
                            type="file"
                            accept=".ttf,.otf,.woff,.woff2"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              try {
                                const buf = await f.arrayBuffer();
                                const face = new FontFace(f.name.replace(/\.[^.]+$/, ""), buf);
                                await face.load();
                                document.fonts.add(face);
                                registerUserFontBuffer(parsePrimaryFontFamily(face.family), top.fontWeight, buf);
                                updateSelectedProp("fontFamily", `"${face.family}", system-ui, sans-serif`);
                                setToast(`Font loaded: ${face.family}`);
                                setTimeout(() => setToast(null), 2500);
                              } catch {
                                setToast("Could not load font file");
                                setTimeout(() => setToast(null), 2500);
                              }
                              e.target.value = "";
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="space-y-0.5">
                            <label className="text-[8px] text-zinc-600">Size</label>
                            <ScrubNumberInput
                              value={top.fontSize}
                              onKeyboardCommit={(n) => updateSelectedProp("fontSize", clamp(Math.round(n), 4, 400))}
                              onScrubLive={(n) => updateSelectedPropSilent("fontSize", clamp(Math.round(n), 4, 400))}
                              onScrubEnd={commitHistoryAfterScrub}
                              step={1}
                              roundFn={(n) => clamp(Math.round(n), 4, 400)}
                              min={4}
                              max={400}
                              title="Arrastra horizontalmente · Mayús = ×10"
                              className="w-full cursor-ew-resize rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[8px] text-zinc-600">Weight</label>
                            <ScrubNumberInput
                              value={top.fontWeight}
                              onKeyboardCommit={(n) => updateSelectedProp("fontWeight", clamp(Math.round(n), 100, 900))}
                              onScrubLive={(n) => updateSelectedPropSilent("fontWeight", clamp(Math.round(n), 100, 900))}
                              onScrubEnd={commitHistoryAfterScrub}
                              step={1}
                              roundFn={(n) => clamp(Math.round(n), 100, 900)}
                              min={100}
                              max={900}
                              title="Arrastra horizontalmente · Mayús = ×10"
                              className="w-full cursor-ew-resize rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white"
                            />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-600">Style</label>
                          <select
                            value={top.fontStyle === "italic" || top.fontStyle === "oblique" ? top.fontStyle : "normal"}
                            onChange={(e) => updateSelectedProp("fontStyle", e.target.value)}
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white"
                          >
                            <option value="normal">Normal</option>
                            <option value="italic">Italic</option>
                            <option value="oblique">Oblique</option>
                          </select>
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-600">Tracking</label>
                          <ScrubNumberInput
                            value={top.letterSpacing}
                            onKeyboardCommit={(n) => updateSelectedProp("letterSpacing", Math.round(n * 100) / 100)}
                            onScrubLive={(n) => updateSelectedPropSilent("letterSpacing", Math.round(n * 100) / 100)}
                            onScrubEnd={commitHistoryAfterScrub}
                            step={0.05}
                            roundFn={(n) => Math.round(n * 100) / 100}
                            title="Arrastra horizontalmente · Mayús = ×10"
                            className="w-full cursor-ew-resize rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 border-t border-white/10 pt-2">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Texto en trazado</div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[8px] text-zinc-500">Inicio en trazado</label>
                            <span className="font-mono text-[9px] text-zinc-400">{Math.round(top.startOffset)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={top.startOffset}
                            onChange={(e) => updateSelectedPropSilent("startOffset", Number(e.target.value))}
                            onPointerUp={commitHistoryAfterScrub}
                            className="w-full accent-violet-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] text-zinc-500">Lado</label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => updateSelectedProp("side", "above")}
                              className={`flex-1 rounded py-1.5 text-[8px] font-bold uppercase ${top.side === "above" ? "bg-violet-600/50 text-white" : "bg-white/5 text-zinc-500 hover:text-white"}`}
                            >
                              Encima
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSelectedProp("side", "below")}
                              className={`flex-1 rounded py-1.5 text-[8px] font-bold uppercase ${top.side === "below" ? "bg-violet-600/50 text-white" : "bg-white/5 text-zinc-500 hover:text-white"}`}
                            >
                              Debajo
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[8px] text-zinc-500">Separación</label>
                            <span className="font-mono text-[9px] text-zinc-400">{Math.round(top.baselineShift)}px</span>
                          </div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={top.baselineShift}
                            onChange={(e) => updateSelectedPropSilent("baselineShift", Number(e.target.value))}
                            onPointerUp={commitHistoryAfterScrub}
                            className="w-full accent-violet-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] text-zinc-500">Anclaje</label>
                          <div className="flex items-center justify-center gap-1">
                            {(
                              [
                                { a: "start" as const, Icon: AlignStartHorizontal, title: "Inicio" },
                                { a: "middle" as const, Icon: AlignCenterHorizontal, title: "Centro" },
                                { a: "end" as const, Icon: AlignEndHorizontal, title: "Fin" },
                              ] as const
                            ).map(({ a, Icon, title }) => (
                              <button
                                key={a}
                                type="button"
                                title={title}
                                onClick={() => updateSelectedProp("textAnchor", a)}
                                className={`rounded border p-2 transition-colors ${
                                  top.textAnchor === a ? "border-violet-400 bg-violet-600/45 text-white" : "border-white/10 bg-white/5 text-zinc-500 hover:text-white"
                                }`}
                              >
                                <Icon size={16} strokeWidth={2} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[8px] text-zinc-500">Espaciado curva</label>
                            <span className="font-mono text-[9px] text-zinc-400">{Math.round(top.charSpacing * 10) / 10}</span>
                          </div>
                          <input
                            type="range"
                            min={-20}
                            max={100}
                            step={0.5}
                            value={top.charSpacing}
                            onChange={(e) => updateSelectedPropSilent("charSpacing", Number(e.target.value))}
                            onPointerUp={commitHistoryAfterScrub}
                            className="w-full accent-violet-500"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[8px] text-zinc-500">Mostrar guía</label>
                          <button
                            type="button"
                            onClick={() => updateSelectedProp("pathVisible", !top.pathVisible)}
                            className={`rounded px-2 py-0.5 text-[8px] font-bold uppercase ${top.pathVisible ? "bg-violet-600/50 text-white" : "bg-white/5 text-zinc-500"}`}
                          >
                            {top.pathVisible ? "Sí" : "No"}
                          </button>
                        </div>
                        {top.pathVisible ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="color"
                              value={/^#[0-9A-Fa-f]{6}$/.test(top.pathColor) ? top.pathColor : "#888888"}
                              onChange={(e) => updateSelectedProp("pathColor", e.target.value)}
                              className="h-7 w-7 cursor-pointer rounded border border-white/20 bg-transparent"
                            />
                            <div className="min-w-[120px] flex-1 space-y-0.5">
                              <div className="flex justify-between text-[8px] text-zinc-500">
                                <span>Grosor</span>
                                <span className="font-mono">{top.pathWidth}px</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={10}
                                step={0.5}
                                value={top.pathWidth}
                                onChange={(e) => updateSelectedPropSilent("pathWidth", Number(e.target.value))}
                                onPointerUp={commitHistoryAfterScrub}
                                className="w-full accent-violet-500"
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-500">Desbordamiento</label>
                          <select
                            value={top.overflow}
                            onChange={(e) => updateSelectedProp("overflow", e.target.value as TextOnPathObject["overflow"])}
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white"
                          >
                            <option value="hidden">Ocultar</option>
                            <option value="visible">Visible</option>
                            {/* TODO: requiere medir longitud del path y ajustar fontSize iterativamente — próxima iteración */}
                            <option value="scale" disabled>
                              Escalar (próximamente)
                            </option>
                          </select>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {activeTool === "directSelect" && selectedAnchorVertexHint && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Punto de ancla (Bezier)</div>
                    {selectedAnchorVertexHint.modes.length > 1 && (
                      <div className="text-[9px] text-amber-400/90">Selección mixta — elige un modo para aplicar a todos</div>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {([
                        { mode: "smooth" as const, Icon: Spline, title: "Continuo en curva (tangentes simétricas)", label: "Suave" },
                        { mode: "cusp" as const, Icon: Unlink2, title: "Partir tangente: curva continua con longitudes independientes", label: "Partir" },
                        { mode: "corner" as const, Icon: Diamond, title: "Esquina: manejadores independientes (ángulo agudo posible)", label: "Esquina" },
                      ]).map(({ mode, Icon, title, label }) => (
                        <button key={mode} type="button" title={title}
                          onClick={() => setVertexModeOnSelectedAnchors(mode)}
                          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded border min-w-[3.25rem] transition-colors ${
                            selectedAnchorVertexHint.unified === mode
                              ? "bg-violet-600/45 border-violet-400 text-white"
                              : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"
                          }`}>
                          <Icon size={15} strokeWidth={2} />
                          <span className="text-[7px] font-bold uppercase tracking-wide">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTool === "directSelect" && firstSelected?.type === "path" && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Puntos del trazado</div>
                    <p className="text-[8px] text-zinc-500">Clic en un segmento añade un punto. También puedes usar los botones o Suprimir con puntos seleccionados.</p>
                    <div className="flex gap-1">
                      <button type="button" onClick={addMidAnchorToSelectedPath}
                        className="flex-1 rounded border border-white/10 bg-white/5 py-1.5 text-[8px] font-bold uppercase text-zinc-200 hover:bg-white/10">
                        + Punto (segmento largo)
                      </button>
                      <button type="button" onClick={deleteSelectedPoints}
                        className="flex-1 rounded border border-rose-500/25 bg-rose-500/10 py-1.5 text-[8px] font-bold uppercase text-rose-200 hover:bg-rose-500/20">
                        − Quitar selección
                      </button>
                    </div>
                  </div>
                )}

                {firstSelected.type === "booleanGroup" && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Boolean Group</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {([
                        { op: "union" as const, Icon: Layers, title: "Union" },
                        { op: "subtract" as const, Icon: Minus, title: "Subtract" },
                        { op: "intersect" as const, Icon: Crop, title: "Intersect" },
                        { op: "exclude" as const, Icon: Split, title: "Exclude" },
                      ]).map(({ op, Icon, title }) => (
                        <button key={op} type="button" title={title}
                          onClick={() => changeBooleanOp(op)}
                          className={`p-2 rounded border transition-colors ${(firstSelected as BooleanGroupObject).operation === op ? "bg-violet-600/50 border-violet-400 text-white" : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"}`}>
                          <Icon size={16} strokeWidth={2} />
                        </button>
                      ))}
                      <span className="text-[9px] text-zinc-500 ml-1">{(firstSelected as BooleanGroupObject).children.length} children</span>
                    </div>
                    <button type="button" onClick={() => enterIsolation(firstSelected.id)}
                      className="w-full py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-white text-[9px] font-bold uppercase tracking-wider hover:bg-violet-600/50 transition-colors">
                      Edit Children (double-click)
                    </button>
                    <button type="button" onClick={flattenBooleanToDefinitivePath}
                      className="w-full py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-[9px] font-bold uppercase tracking-wider hover:bg-white/10 hover:text-white transition-colors"
                      title="Aplica el boolean de forma destructiva: un solo trazo vectorial. Luego usa Pegar dentro (⇧⌘V) con este trazo como máscara.">
                      Forma definitiva (trazo)
                    </button>
                    <p className="text-[8px] leading-snug text-zinc-600">
                      Convierte el grupo booleano en un <span className="text-zinc-500">path</span> cerrado. Sirve como máscara para <span className="text-zinc-500">Pegar dentro</span>.
                    </p>
                  </div>
                )}
                </div>
              </>
            ) : (
              <div className="text-[10px] text-zinc-600 italic">No object selected</div>
            )}

            {canLinkTextToPath ? (
              <div className="border-t border-white/[0.08] px-[14px] py-3">
                <div className="mb-2 text-[10px] text-zinc-500 uppercase tracking-wider">Acciones</div>
                <button
                  type="button"
                  onClick={handleLinkTextToPath}
                  className="w-full rounded-[5px] bg-[#534AB7] py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#6357c4]"
                >
                  Texto sobre trazado
                </button>
              </div>
            ) : null}

          {/* ── Multi-selección: grupo / boolean (alinear arriba en modo Designer) ── */}
          {selectedObjects.length >= 2 && (
            <div className="p-3 border-b border-white/10 space-y-2">
              <div className="flex items-center gap-1">
                <ToolBtn onClick={groupSelected} title="Group (⌘G)"><Group size={14} /></ToolBtn>
                <ToolBtn onClick={ungroupSelected} title="Ungroup (⇧⌘G)"><Ungroup size={14} /></ToolBtn>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mt-2">Boolean</div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { op: "union" as const, Icon: Layers, label: "Union", title: "Union" },
                  { op: "subtract" as const, Icon: Minus, label: "Subtract", title: "Subtract" },
                  { op: "intersect" as const, Icon: Crop, label: "Intersect", title: "Intersect" },
                  { op: "exclude" as const, Icon: Split, label: "Exclude", title: "Exclude" },
                ]).map(({ op, Icon, label, title }) => (
                  <button
                    key={op}
                    type="button"
                    title={title}
                    onClick={() => void booleanOp(op)}
                    className="group flex flex-col items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.04] py-2 transition-colors hover:bg-white/10 hover:border-white/15"
                  >
                    <Icon size={16} strokeWidth={2} className="text-zinc-300 group-hover:text-white" />
                    <span className="text-[7px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-200">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          </div>

          {/* ── Layers (plegable abajo, solo en la columna derecha) ── */}
          <div
            className={`flex min-h-0 flex-col border-t border-white/[0.08] bg-[#12151a] ${
              layersPanelExpanded ? "min-h-[120px] flex-1" : "shrink-0"
            }`}
          >
            {layersPanelExpanded ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#151820] px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Layers ({objects.length})</span>
                  <button
                    type="button"
                    className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                    title="Plegar capas"
                    onClick={() => setLayersPanelExpanded(false)}
                  >
                    <ChevronDown size={16} strokeWidth={2} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="space-y-0.5">
                    {[...objects].reverse().map((obj) => {
                      const isSel = selectedIds.has(obj.id);
                      const isDropTarget = layerDropTarget === obj.id;
                      return (
                        <div
                          key={obj.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            setLayerDragId(obj.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (layerDragId && layerDragId !== obj.id) setLayerDropTarget(obj.id);
                          }}
                          onDragLeave={() => {
                            if (layerDropTarget === obj.id) setLayerDropTarget(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (layerDragId && layerDragId !== obj.id) {
                              setObjects((prev) => {
                                const fromIdx = prev.findIndex((o) => o.id === layerDragId);
                                const toIdx = prev.findIndex((o) => o.id === obj.id);
                                if (fromIdx < 0 || toIdx < 0) return prev;
                                const n = [...prev];
                                const [moved] = n.splice(fromIdx, 1);
                                n.splice(toIdx, 0, moved);
                                pushHistory(n, selectedIds);
                                return n;
                              });
                            }
                            setLayerDragId(null);
                            setLayerDropTarget(null);
                          }}
                          onDragEnd={() => {
                            setLayerDragId(null);
                            setLayerDropTarget(null);
                          }}
                          onMouseEnter={() => setLayerHoverId(obj.id)}
                          onMouseLeave={() => setLayerHoverId((h) => (h === obj.id ? null : h))}
                          className={`flex cursor-grab items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-[10px] transition-colors ${
                            isSel ? "border-violet-500/25 bg-violet-600/30 text-white" : "text-zinc-400 hover:bg-white/5"
                          } ${obj.isClipMask ? "italic opacity-50" : ""} ${isDropTarget ? "ring-1 ring-violet-400" : ""} ${layerDragId === obj.id ? "opacity-40" : ""} ${
                            (hoverCanvasId === obj.id || layerHoverId === obj.id) && !isSel ? "bg-sky-500/10 ring-1 ring-sky-500/50" : ""
                          }`}
                          onClick={(e) => {
                            const extend =
                              e.shiftKey ||
                              e.metaKey ||
                              e.ctrlKey ||
                              (typeof e.nativeEvent.getModifierState === "function" && e.nativeEvent.getModifierState("Shift"));
                            const ns = resolveSelection(obj.id, extend);
                            setSelectedIds(ns);
                            if (ns.has(obj.id)) setPrimarySelectedId(obj.id);
                          }}
                        >
                          <button
                            type="button"
                            title="Toggle visibility"
                            className="shrink-0 hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              setObjects((p) => p.map((o) => (o.id === obj.id ? { ...o, visible: !o.visible } : o)));
                            }}
                          >
                            {obj.visible ? <Eye size={12} /> : <EyeOff size={12} className="opacity-40" />}
                          </button>
                          <button
                            type="button"
                            title="Toggle lock"
                            className="shrink-0 hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              setObjects((p) => p.map((o) => (o.id === obj.id ? { ...o, locked: !o.locked } : o)));
                            }}
                          >
                            {obj.locked ? <Lock size={12} className="text-amber-400" /> : <Unlock size={12} className="opacity-40" />}
                          </button>
                          {layerRowIcon(obj)}
                          <span
                            className="flex-1 truncate"
                            onDoubleClick={(e) => {
                              if (obj.type === "booleanGroup") {
                                e.stopPropagation();
                                enterIsolation(obj.id);
                              }
                              if (obj.type === "clippingContainer") {
                                e.stopPropagation();
                                enterClippingIsolation(obj.id, "content");
                              }
                              if (obj.groupId) {
                                const n = objects.filter((x) => x.groupId === obj.groupId).length;
                                if (n >= 2) {
                                  e.stopPropagation();
                                  enterVectorGroupIsolation(obj.groupId!);
                                }
                              }
                            }}
                          >
                            {obj.name}
                            {obj.groupId ? " ◆" : ""}
                            {obj.isClipMask ? " [clip]" : ""}
                            {obj.type === "booleanGroup" && (
                              <span className="ml-1 text-[8px] text-violet-400">
                                ◇{(obj as BooleanGroupObject).operation} ({(obj as BooleanGroupObject).children.length})
                              </span>
                            )}
                            {obj.type === "clippingContainer" && (
                              <span className="ml-1 text-[8px] text-emerald-400/90">
                                ▣ clip ({(obj as ClippingContainerObject).content.length})
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            title="Delete"
                            className="shrink-0 hover:text-red-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              setObjects((p) => {
                                const n = p.filter((o) => o.id !== obj.id);
                                pushHistory(n, new Set());
                                return n;
                              });
                              setSelectedIds((s) => {
                                const ns = new Set(s);
                                ns.delete(obj.id);
                                return ns;
                              });
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                title="Mostrar capas"
                onClick={() => setLayersPanelExpanded(true)}
              >
                <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                  <Layers size={14} className="text-zinc-400" strokeWidth={2} />
                  Layers ({objects.length})
                </span>
                <ChevronUp size={16} strokeWidth={2} className="shrink-0 text-zinc-500" />
              </button>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] px-3 py-2 text-[9px] text-zinc-500">
          <span>{objects.length} objects · {selectedIds.size} selected{isolationDepth > 0 ? ` · Isolation (depth ${isolationDepth})` : ""}</span>
        </div>
      </div>
      )}

      {!canvasZenMode && designerPagesRail != null ? (
        <div className="flex w-[110px] shrink-0 flex-col overflow-hidden border-l border-white/[0.08] bg-[#12151a] text-zinc-300">
          {designerPagesRail}
        </div>
      ) : null}
      </div>

      {/* ── Context menu ─────────────────────────────────────────── */}
      {ctxMenu && <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenuItems} onClose={() => setCtxMenu(null)} />}

      {designerMode &&
        designerStoryModalOpen &&
        designerStoryModalObjectId &&
        (() => {
          const modalObj = objects.find((o) => o.id === designerStoryModalObjectId);
          const sid = modalObj && (modalObj as { storyId?: string }).storyId;
          if (!modalObj || !modalObj.isTextFrame || !sid) return null;
          const st = designerStoryMap?.get(sid) ?? "";
          const sh = designerStoryHtmlMap?.get(sid) ?? "";
          const ti = (modalObj as { _designerThreadInfo?: { index: number; total: number } })._designerThreadInfo;
          const hasOverflow = !!(modalObj as { _designerOverflow?: boolean })._designerOverflow;
          const isLinked = ti != null && ti.total > 1;
          return createPortal(
            <div className="fixed inset-0 z-[100100]">
              <div
                className="absolute inset-0 bg-black/45"
                aria-hidden
                onMouseDown={() => {
                  setDesignerStoryModalOpen(false);
                  setDesignerStoryModalObjectId(null);
                }}
              />
              <div
                className="absolute flex flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#12151a] shadow-2xl"
                style={{
                  left: designerStoryModalRect.x,
                  top: designerStoryModalRect.y,
                  width: designerStoryModalRect.w,
                  height: designerStoryModalRect.h,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="flex shrink-0 cursor-grab select-none items-center justify-between gap-2 border-b border-white/[0.1] bg-[#161a22] px-3 py-2 active:cursor-grabbing"
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    let lx = e.clientX;
                    let ly = e.clientY;
                    const pid = e.pointerId;
                    const onMove = (ev: PointerEvent) => {
                      if (ev.pointerId !== pid) return;
                      const dx = ev.clientX - lx;
                      const dy = ev.clientY - ly;
                      lx = ev.clientX;
                      ly = ev.clientY;
                      setDesignerStoryModalRect((r) => ({
                        ...r,
                        x: clamp(r.x + dx, 0, Math.max(0, window.innerWidth - 120)),
                        y: clamp(r.y + dy, 0, Math.max(0, window.innerHeight - 80)),
                      }));
                    };
                    const onUp = (ev: PointerEvent) => {
                      if (ev.pointerId !== pid) return;
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  }}
                >
                  <span className="text-[11px] font-bold uppercase tracking-widest text-sky-200/85">Marco de texto · editor ampliado</span>
                  <button
                    type="button"
                    title="Cerrar (Esc)"
                    className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      setDesignerStoryModalOpen(false);
                      setDesignerStoryModalObjectId(null);
                    }}
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>
                <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-9 pt-2">
                  {isLinked && ti && (
                    <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">
                      Historia enlazada · Marco {ti.index + 1} de {ti.total}
                    </p>
                  )}
                  {hasOverflow && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-1.5">
                      <span className="text-[10px] font-medium text-rose-300">⚠ Texto desbordado</span>
                      <button
                        type="button"
                        onClick={() => onDesignerAppendThreadedFrame?.(modalObj.id)}
                        className="ml-auto rounded border border-rose-400/30 bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold text-rose-200 transition hover:bg-rose-500/30"
                      >
                        + Marco
                      </button>
                    </div>
                  )}
                  <label className="mb-1.5 block text-[10px] font-medium text-zinc-500">Contenido</label>
                  <DesignerStoryRichEditorBlock
                    key={`re-modal-${sid}`}
                    storyId={sid}
                    storyText={st}
                    storyHtml={sh}
                    onRichChange={onDesignerStoryRichChange}
                    enableHyperlink
                    editorClassName="min-h-[min(400px,calc(100vh-220px))] w-full overflow-y-auto rounded-b-[5px] border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-sm leading-relaxed text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500/40 [&_b]:font-bold [&_i]:italic [&_u]:underline [&_s]:line-through [&_a]:text-sky-400 [&_a]:underline"
                  />
                </div>
                <div
                  className="pointer-events-auto absolute bottom-1.5 right-1.5 h-5 w-5 cursor-nwse-resize rounded border border-white/15 bg-[#1a1f28] hover:bg-white/10"
                  title="Redimensionar"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const pid = e.pointerId;
                    const x0 = e.clientX;
                    const y0 = e.clientY;
                    const w0 = designerStoryModalRect.w;
                    const h0 = designerStoryModalRect.h;
                    const onMove = (ev: PointerEvent) => {
                      if (ev.pointerId !== pid) return;
                      setDesignerStoryModalRect((r) => ({
                        ...r,
                        w: clamp(w0 + ev.clientX - x0, 400, window.innerWidth - r.x - 8),
                        h: clamp(h0 + ev.clientY - y0, 240, window.innerHeight - r.y - 8),
                      }));
                    };
                    const onUp = (ev: PointerEvent) => {
                      if (ev.pointerId !== pid) return;
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  }}
                />
              </div>
            </div>,
            document.body,
          );
        })()}

      {showExportModal && (
        <FreehandExportModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          bounds={
            exportModalScope === "full"
              ? resolveSceneExportBounds(objects, artboards)
              : selectedObjects.length > 0
                ? getGroupBounds(selectedObjects)
                : null
          }
          defaultFilename={
            exportModalScope === "selection" && firstSelected
              ? `${firstSelected.name || "selection"}`
              : "page"
          }
          selectionLabel={
            exportModalScope === "full"
              ? "Página completa"
              : selectedObjects.length === 0
                ? "Nothing selected"
                : selectedObjects.length === 1
                  ? `Selection · ${firstSelected?.name ?? "layer"}`
                  : `${selectedObjects.length} objects`
          }
          hasSelection={selectedIds.size > 0}
          exportScope={exportModalScope}
          artboardList={[]}
          onExport={runProfessionalExport}
          designerMultipageVectorPdf={designerMultipageVectorPdfExport ?? null}
        />
      )}

      {canvasZenMode && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100002] -translate-x-1/2 rounded-md border border-white/[0.08] bg-black/45 px-3 py-1.5 text-[10px] text-zinc-500">
          P o Esc · salir del modo lienzo
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[100001] -translate-x-1/2 rounded-lg border border-white/[0.12] bg-[#1a1f28] px-4 py-2 text-[12px] font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
