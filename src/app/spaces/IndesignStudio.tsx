"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MousePointer2,
  Type,
  Frame,
  FileDown,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Image as ImageIcon,
  PenTool,
  Layers,
  Unlink,
  Grid3x3,
  ArrowLeftRight,
  Square,
  Circle,
  Minus,
  Triangle,
  Diamond,
  RectangleHorizontal,
  GripVertical,
} from "lucide-react";
import type {
  Canvas as FabricCanvas,
  FabricObject,
  FabricImage as FabricImageType,
  Group as FabricGroup,
} from "fabric";
import {
  useIndesignCanvas,
  type FrameContextMenuDetail,
  type IndesignCanvasApi,
  type IndesignTool,
} from "./indesign/useIndesignCanvas";
import type {
  ContentAlignment,
  ImageFittingMode,
  ImageFrameRecord,
  IndesignPageState,
  Story,
  TextFrame,
  Typography,
} from "./indesign/types";
import {
  applyContentAlignmentToImageFrame,
  applyFittingModeToImageFrame,
  clearImageFrameContent,
  setImageFrameAutoFit,
} from "./indesign/image-frame-studio-ops";
import {
  appendTextFrameAfter,
  findFollowUpFrameRect,
  linkFrameAfter,
  unlinkFrameAt,
  updateStoryTypography,
  updateTextFrameGeometry,
  deleteTextFrame,
  patchStoryContentPlain,
} from "./indesign/text-threading";
import { layoutPageStories, type FrameLayout } from "./indesign/text-layout";
import { migrateIndesignPageState } from "./indesign/migrate-legacy-indesign";
import { exportIndesignPagesPdfVector } from "./indesign/indesign-export-pdf-vector";
import { serializeStoryContent } from "./indesign/text-model";
import {
  INDESIGN_PAGE_FORMATS,
  type IndesignPageFormatId,
  formatById,
  getPageDimensions,
  INDESIGN_PAD,
} from "./indesign/page-formats";
import { exportIndesignPagesPdf } from "./indesign/indesign-export-pdf";
import { INDESIGN_PAGE_BG_SERIAL_PROPS } from "./indesign/indesign-page-background";
import { isFabricActiveSelection } from "./indesign/fabric-active-selection";
import { scenePointToAreaPixels } from "./indesign/port-overlay-layout";
import { ScrubNumberInput } from "./ScrubNumberInput";
import { IndesignCanvasGrid } from "./indesign/IndesignCanvasGrid";
import { GOOGLE_FONTS_POPULAR } from "./freehand/google-fonts";
import { parseOpenTypeFeatureMap, stringifyOpenTypeFeatureMap, OPEN_TYPE_PANEL_TAGS } from "./indesign/open-type";
import { parsePrimaryFontFamily, registerUserFontBuffer } from "./freehand/text-outline";
import { reorderIndesignLayersInCanvas, splitIndesignPrefixAndLayerBlocks } from "./indesign/layer-stack";
import {
  buildAbsolutePasteOptionsFromTargets,
  buildIndesignClipboardPayload,
  collectSelectionTargets,
  pasteIndesignClipboard,
  type IndesignClipboardPayload,
} from "./indesign/indesign-clipboard";
const FH_LBL = "text-[10px] text-zinc-500 uppercase tracking-wider";
const FH_INP =
  "w-full cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100 outline-none focus:ring-1 focus:ring-[#534AB7]/40";
const FH_PILL_ON = "border-[#534AB7] bg-[#534AB7] text-white";
const FH_PILL_OFF = "border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200";

const IMG_FIT_OPTIONS: { value: ImageFittingMode; label: string }[] = [
  { value: "fit-proportional", label: "Ajustar contenido proporcionalmente" },
  { value: "fill-proportional", label: "Rellenar caja proporcionalmente" },
  { value: "fit-stretch", label: "Ajustar contenido a la caja" },
  { value: "center-content", label: "Centrar contenido (sin escalar)" },
  { value: "fill-stretch", label: "Rellenar sin proporción" },
  { value: "frame-to-content", label: "Ajustar caja al contenido" },
];

const IMG_ALIGN_GRID: ContentAlignment[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function typoWeightToNumber(t: Typography): number {
  const w = t.fontWeight;
  if (typeof w === "string") {
    const s = w.trim().toLowerCase();
    if (s === "bold") return 700;
    if (s === "normal") return 400;
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) return clamp(n, 100, 900);
  }
  return 400;
}

/** Valores de panel (bounding rect + ángulo del objeto) para transformaciones estilo Freehand. */
function readBoundingTransform(o: FabricObject): {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  opacityPct: number;
} {
  const box = o.getBoundingRect();
  const op = typeof o.opacity === "number" && Number.isFinite(o.opacity) ? o.opacity : 1;
  return {
    x: Math.round(box.left),
    y: Math.round(box.top),
    w: Math.max(1, Math.round(box.width)),
    h: Math.max(1, Math.round(box.height)),
    rot: Math.round((o.angle ?? 0) * 1000) / 1000,
    opacityPct: Math.round(op * 100),
  };
}

function isIndesignPageBackground(o: FabricObject): boolean {
  return o.get?.("name") === "indesignPageBg";
}

function isIndesignLayerListObject(o: FabricObject): boolean {
  if (isIndesignPageBackground(o)) return false;
  if (o.get?.("indesignType") === "textLine") return false;
  return true;
}

function indesignLayerDisplayName(o: FabricObject): string {
  const it = o.get?.("indesignType") as string | undefined;
  const kind = o.get?.("shapeKind") as string | undefined;
  const fid = o.get?.("frameId") as string | undefined;
  if (it === "textFrameHit") return `Texto${fid ? ` ${fid.slice(-6)}` : ""}`;
  if (it === "frameImage") return "Imagen";
  if (it === "frame") return "Marco";
  if (it === "vectorShape") return kind === "ellipse" ? "Elipse" : "Rectángulo";
  const t = (o.type || "obj").toString();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function IndesignLayerRowIcon({ o }: { o: FabricObject }) {
  const cls = "shrink-0 text-zinc-500";
  const it = o.get?.("indesignType") as string | undefined;
  const kind = o.get?.("shapeKind") as string | undefined;
  if (it === "textFrameHit") return <Type size={12} className={cls} strokeWidth={2} />;
  if (it === "frameImage") return <ImageIcon size={12} className={cls} strokeWidth={2} />;
  if (it === "frame") return <Frame size={12} className={cls} strokeWidth={2} />;
  if (it === "vectorShape")
    return kind === "ellipse" ? (
      <Circle size={12} className={cls} strokeWidth={2} />
    ) : (
      <Square size={12} className={cls} strokeWidth={2} />
    );
  const ty = (o.type || "").toLowerCase();
  if (ty === "path" || ty === "polygon" || ty === "polyline")
    return <PenTool size={12} className={cls} strokeWidth={2} />;
  return <Square size={12} className={cls} strokeWidth={2} />;
}

function fabricObjectIsInSelection(canvas: FabricCanvas | null, o: FabricObject): boolean {
  if (!canvas) return false;
  const a = canvas.getActiveObject();
  if (!a) return false;
  if (a === o) return true;
  if (isFabricActiveSelection(a)) return (a as FabricGroup).getObjects().includes(o);
  return false;
}

/** Primer marco de texto en la selección (incluye ActiveSelection / varias cajas). */
function primaryTextFrameFromSelection(sel: FabricObject | null): FabricObject | null {
  if (!sel) return null;
  if (sel.get?.("indesignType") === "textFrameHit") return sel;
  if (isFabricActiveSelection(sel)) {
    const hit = (sel as FabricGroup)
      .getObjects()
      .find((o) => o.get?.("indesignType") === "textFrameHit");
    return hit ?? null;
  }
  return null;
}

/** Primer rectángulo/elipse vectorial en la selección (incluye ActiveSelection). */
function primaryVectorShapeFromSelection(sel: FabricObject | null): FabricObject | null {
  if (!sel) return null;
  if (sel.get?.("indesignType") === "vectorShape") return sel;
  if (isFabricActiveSelection(sel)) {
    const v = (sel as FabricGroup)
      .getObjects()
      .find((o) => o.get?.("indesignType") === "vectorShape");
    return v ?? null;
  }
  return null;
}

/** Marco de imagen (Rect) asociado a la selección actual (marco o imagen interna). */
function primaryImageFrameFromSelection(
  canvas: FabricCanvas | null,
  sel: FabricObject | null,
): FabricObject | null {
  if (!sel) return null;
  if (sel.get?.("indesignType") === "frame") return sel;
  if (sel.get?.("indesignType") === "frameImage") {
    const uid = sel.get("frameUid") as string | undefined;
    if (!uid || !canvas) return null;
    return (
      canvas
        .getObjects()
        .find((o) => o.get("indesignUid") === uid && o.get("indesignType") === "frame") ?? null
    );
  }
  return null;
}

function fabricFillIsEmpty(fill: unknown): boolean {
  if (fill == null || fill === "") return true;
  const s = String(fill).trim().toLowerCase();
  return (
    s === "transparent" ||
    s === "rgba(0, 0, 0, 0)" ||
    s === "rgba(0,0,0,0)" ||
    s === "none"
  );
}

function fabricStrokeDisplayColor(o: FabricObject): string {
  const st = o.get("stroke") as string | null | undefined;
  if (st && /^#([0-9A-Fa-f]{6})$/.test(st)) return st;
  return "#60a5fa";
}

function fabricStrokeIsNone(o: FabricObject): boolean {
  const sw = Number(o.get("strokeWidth") ?? 0);
  const st = o.get("stroke") as string | null | undefined;
  if (!Number.isFinite(sw) || sw <= 0) return true;
  if (st == null || st === "" || st === "none") return true;
  return false;
}

function fabricFillDisplayHex(o: FabricObject): string {
  const fill = o.get("fill");
  if (fabricFillIsEmpty(fill)) return "#93c5fd";
  const s = String(fill);
  if (/^#([0-9A-Fa-f]{6})$/.test(s)) return s;
  return "#93c5fd";
}

function parseStrokeDashInput(s: string): number[] | undefined {
  const t = s.trim().replace(/,/g, " ");
  if (!t) return undefined;
  const parts = t.split(/\s+/).map((p) => parseFloat(p)).filter((n) => Number.isFinite(n));
  return parts.length ? parts : undefined;
}

function formatStrokeDashArray(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((n) => String(n)).join(" ");
  return "";
}

const GOOGLE_FONT_FAMILIES = [
  "Inter",
  "Playfair Display",
  "Space Mono",
  "DM Sans",
  "Fraunces",
  "Syne",
] as const;

const FONT_LINK =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Inter:wght@400;700",
    "family=Playfair+Display:ital,wght@0,400;0,700;1,400",
    "family=Space+Mono:ital,wght@0,400;0,700",
    "family=DM+Sans:ital,wght@0,400;0,700",
    "family=Fraunces:ital,wght@0,400;0,700",
    "family=Syne:wght@400;700",
  ].join("&") +
  "&display=swap";

export type IndesignStudioProps = {
  onClose: () => void;
  initialPages: IndesignPageState[];
  activePageIndex: number;
  onUpdatePages: (pages: IndesignPageState[], activeIndex?: number) => void;
};

export const IndesignStudio = memo(function IndesignStudio(props: IndesignStudioProps) {
  const { onClose, initialPages, activePageIndex: initialIdx, onUpdatePages } = props;

  const [pages, setPages] = useState<IndesignPageState[]>(() => {
    const seed =
      initialPages.length > 0
        ? initialPages
        : [
            {
              id: `pg_${Date.now()}`,
              format: "a4v" as const,
              fabricJSON: null,
              stories: [],
              textFrames: [],
              imageFrames: [],
            },
          ];
    return seed.map(migrateIndesignPageState);
  });
  const [activePageIndex, setActivePageIndex] = useState(() =>
    Math.min(initialIdx, Math.max(0, initialPages.length - 1)),
  );
  const [tool, setTool] = useState<IndesignTool>("select");
  const [selected, setSelected] = useState<FabricObject | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<IndesignPageFormatId>("a4v");
  /** Modo enlace: se eligió OUT; siguiente clic en marco o vacío completa el flujo. */
  const [linkingFlow, setLinkingFlow] = useState(false);
  const [flowSourceFrameId, setFlowSourceFrameId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [gridStep, setGridStep] = useState(16);
  /** Panel derecho: propiedades del objeto vs. documento (rejilla, pliego, lista de páginas). */
  const [rightPanelTab, setRightPanelTab] = useState<"properties" | "pages">("properties");
  const [layersPanelExpanded, setLayersPanelExpanded] = useState(true);
  const [layerListTick, setLayerListTick] = useState(0);
  const [layerDragOverIdx, setLayerDragOverIdx] = useState<number | null>(null);
  /** Incrementa en deshacer/rehacer para forzar que el canvas vuelva a cargar el `fabricJSON` de la página activa. */
  const [canvasHydrationEpoch, setCanvasHydrationEpoch] = useState(0);
  /** Edición de contenido interno (doble clic en imagen); null = solo marco. */
  const [imageContentEditUid, setImageContentEditUid] = useState<string | null>(null);
  const [frameCtx, setFrameCtx] = useState<FrameContextMenuDetail | null>(null);
  const placeImageInputRef = useRef<HTMLInputElement>(null);
  const placeImageTargetUidRef = useRef<string | null>(null);

  const clipboardPayloadRef = useRef<IndesignClipboardPayload | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const customFontFileRef = useRef<HTMLInputElement>(null);
  const studioRootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  /** Contenedor común del canvas HTML y del overlay de puertos (coords absolutas relativas a este nodo). */
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasApiRef = useRef<IndesignCanvasApi | null>(null);
  const getFabricCanvas = useCallback((): FabricCanvas | null => canvasApiRef.current?.getCanvas() ?? null, []);
  const getPageSnapshotRef = useRef<() => Record<string, unknown> | null>(() => null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const undoStackRef = useRef<IndesignPageState[][]>([]);
  const redoStackRef = useRef<IndesignPageState[][]>([]);
  const restoringHistoryRef = useRef(false);
  /** Un solo paso de deshacer al terminar un arrastre tipo scrub en tipografía. */
  const typographyScrubPrimedRef = useRef(false);
  /** Igual para grosor de trazo en formas vectoriales. */
  const vectorStrokeScrubPrimedRef = useRef(false);
  const pageDimScrubPrimedRef = useRef(false);

  const snapshotPages = useCallback(
    (p: IndesignPageState[]) => JSON.parse(JSON.stringify(p)) as IndesignPageState[],
    [],
  );

  const commitPages = useCallback(
    (updater: React.SetStateAction<IndesignPageState[]>) => {
      if (!restoringHistoryRef.current) {
        undoStackRef.current.push(snapshotPages(pagesRef.current));
        redoStackRef.current = [];
        if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      }
      setPages(updater);
    },
    [snapshotPages],
  );

  const undoStudio = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(snapshotPages(pagesRef.current));
    restoringHistoryRef.current = true;
    setPages(prev);
    setCanvasHydrationEpoch((n) => n + 1);
    queueMicrotask(() => {
      restoringHistoryRef.current = false;
    });
  }, [snapshotPages]);

  const redoStudio = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(snapshotPages(pagesRef.current));
    restoringHistoryRef.current = true;
    setPages(next);
    setCanvasHydrationEpoch((n) => n + 1);
    queueMicrotask(() => {
      restoringHistoryRef.current = false;
    });
  }, [snapshotPages]);
  getPageSnapshotRef.current = () => pages[activePageIndex]?.fabricJSON ?? null;

  const activePage = pages[activePageIndex] ?? pages[0];
  const pageDims = useMemo(
    () =>
      getPageDimensions({
        format: activePage?.format ?? "a4v",
        customWidth: activePage?.customWidth,
        customHeight: activePage?.customHeight,
      }),
    [activePage?.format, activePage?.customWidth, activePage?.customHeight],
  );
  const fmt = formatById(activePage?.format ?? "a4v");
  const stories = activePage?.stories ?? [];
  const textFrames = activePage?.textFrames ?? [];
  const imageFrames = activePage?.imageFrames ?? [];

  const frameLayouts = useMemo(
    () => layoutPageStories(stories, textFrames),
    [stories, textFrames],
  );

  const frameByIdMap = useMemo(() => new Map(textFrames.map((f) => [f.id, f])), [textFrames]);
  const storyByIdMap = useMemo(() => new Map(stories.map((s) => [s.id, s])), [stories]);

  const handleTextModelChange = useCallback(
    (next: { stories: Story[]; textFrames: TextFrame[] }) => {
      commitPages((prev) => {
        const n = [...prev];
        const p = n[activePageIndex];
        if (!p) return prev;
        n[activePageIndex] = {
          ...p,
          stories: next.stories,
          textFrames: next.textFrames,
        };
        return n;
      });
    },
    [activePageIndex, commitPages],
  );

  const handlePagePatch = useCallback(
    (patch: { fabricJSON?: Record<string, unknown>; imageFrames?: ImageFrameRecord[] }) => {
      commitPages((prev) => {
        const next = [...prev];
        const p = next[activePageIndex];
        if (!p) return prev;
        next[activePageIndex] = {
          ...p,
          ...(patch.fabricJSON !== undefined ? { fabricJSON: patch.fabricJSON } : {}),
          ...(patch.imageFrames !== undefined ? { imageFrames: patch.imageFrames } : {}),
        };
        return next;
      });
    },
    [activePageIndex, commitPages],
  );

  const handleJSONChange = useCallback(
    (json: Record<string, unknown>) => {
      handlePagePatch({ fabricJSON: json });
    },
    [handlePagePatch],
  );

  const handleTextModelChangeRef = useRef(handleTextModelChange);
  handleTextModelChangeRef.current = handleTextModelChange;
  const handleJSONChangeRef = useRef(handleJSONChange);
  handleJSONChangeRef.current = handleJSONChange;
  const activePageIndexRef = useRef(activePageIndex);
  activePageIndexRef.current = activePageIndex;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const linkingFlowRef = useRef(linkingFlow);
  linkingFlowRef.current = linkingFlow;

  const patchActivePage = useCallback(
    (patch: Partial<IndesignPageState>) => {
      commitPages((prev) => {
        const next = [...prev];
        const p = next[activePageIndex];
        if (!p) return prev;
        next[activePageIndex] = { ...p, ...patch };
        return next;
      });
    },
    [activePageIndex, commitPages],
  );

  const patchActivePageSilent = useCallback(
    (patch: Partial<IndesignPageState>) => {
      if (!pageDimScrubPrimedRef.current) {
        pageDimScrubPrimedRef.current = true;
        if (!restoringHistoryRef.current) {
          undoStackRef.current.push(snapshotPages(pagesRef.current));
          redoStackRef.current = [];
          if (undoStackRef.current.length > 100) undoStackRef.current.shift();
        }
      }
      setPages((prev) => {
        const next = [...prev];
        const p = next[activePageIndex];
        if (!p) return prev;
        next[activePageIndex] = { ...p, ...patch };
        return next;
      });
    },
    [activePageIndex, snapshotPages],
  );

  const endPageDimScrubGesture = useCallback(() => {
    pageDimScrubPrimedRef.current = false;
  }, []);

  /** No llamar setNodes/onUpdatePages dentro de actualizadores de setState (puede ejecutarse durante render). */
  useEffect(() => {
    onUpdatePages(pages);
  }, [pages, onUpdatePages]);

  const onFlowOutClick = useCallback((frameId: string) => {
    const story = stories.find((s) => s.frames.includes(frameId));
    if (!story) return;
    const ord = story.frames.indexOf(frameId);
    if (ord >= 0 && ord < story.frames.length - 1) return;
    setFlowSourceFrameId(frameId);
    setLinkingFlow(true);
  }, [stories]);

  /** Doble clic en el OUT rojo: nuevo marco sin entrar en modo enlace (sin banner de ayuda). */
  const onFlowOutDoubleClick = useCallback(
    (frameId: string) => {
      const story = stories.find((s) => s.frames.includes(frameId));
      if (!story) return;
      const ord = story.frames.indexOf(frameId);
      if (ord >= 0 && ord < story.frames.length - 1) return;
      const src = textFrames.find((f) => f.id === frameId);
      if (!src) return;
      const box = findFollowUpFrameRect(src, textFrames, pageDims.width, pageDims.height);
      handleTextModelChange(
        appendTextFrameAfter(stories, textFrames, frameId, {
          ...box,
          padding: src.padding ?? 4,
        }),
      );
    },
    [stories, textFrames, pageDims.width, pageDims.height, handleTextModelChange],
  );

  const onLinkTargetFrame = useCallback(
    (targetFrameId: string) => {
      if (!flowSourceFrameId || targetFrameId === flowSourceFrameId) {
        setLinkingFlow(false);
        setFlowSourceFrameId(null);
        return;
      }
      handleTextModelChange(
        linkFrameAfter(stories, textFrames, flowSourceFrameId, targetFrameId),
      );
      setLinkingFlow(false);
      setFlowSourceFrameId(null);
    },
    [flowSourceFrameId, stories, textFrames, handleTextModelChange],
  );

  const onLinkEmptyCanvas = useCallback(
    (p: { x: number; y: number }) => {
      if (!flowSourceFrameId) return;
      const bw = 200;
      const bh = 120;
      let x = p.x - bw / 2;
      let y = p.y - bh / 2;
      const minX = INDESIGN_PAD;
      const minY = INDESIGN_PAD;
      const maxX = INDESIGN_PAD + pageDims.width - bw;
      const maxY = INDESIGN_PAD + pageDims.height - bh;
      x = Math.max(minX, Math.min(x, maxX));
      y = Math.max(minY, Math.min(y, maxY));
      handleTextModelChange(
        appendTextFrameAfter(stories, textFrames, flowSourceFrameId, {
          x,
          y,
          width: bw,
          height: bh,
        }),
      );
      setLinkingFlow(false);
      setFlowSourceFrameId(null);
    },
    [flowSourceFrameId, stories, textFrames, handleTextModelChange, pageDims.width, pageDims.height],
  );

  const canvasApi = useIndesignCanvas({
    hostRef,
    pageKey: `${activePage?.id ?? "p"}#${canvasHydrationEpoch}`,
    pageWidth: pageDims.width,
    pageHeight: pageDims.height,
    getPageSnapshot: getPageSnapshotRef,
    tool,
    onPagePatch: handlePagePatch,
    imageFrames,
    imageContentEditUid,
    onImageContentEditChange: setImageContentEditUid,
    onSelectionChange: setSelected,
    stories,
    textFrames,
    onTextModelChange: handleTextModelChange,
    linkingMode: linkingFlow,
    onLinkTargetFrame,
    onLinkEmptyCanvas,
    onAfterPlaceDraw: () => setTool("select"),
    onFrameContextMenu: (d) => setFrameCtx(d),
  });
  canvasApiRef.current = canvasApi;

  useEffect(() => {
    setImageContentEditUid(null);
    setFrameCtx(null);
  }, [activePageIndex, canvasHydrationEpoch]);

  useEffect(() => {
    canvasApiRef.current?.getCanvas()?.requestRenderAll();
  }, [showGrid, gridStep]);

  useEffect(() => {
    const rootSel = "[data-indesign-studio]";
    /** El canvas no recibe foco: con el foco en `body` el usuario sigue interactuando con el estudio. */
    const inStudio = (n: EventTarget | null) => {
      const root = document.querySelector(rootSel);
      if (!root) return false;
      if (n instanceof Node && root.contains(n)) return true;
      const ae = document.activeElement;
      if (ae instanceof Node && root.contains(ae)) return true;
      if (ae === document.body || ae === document.documentElement) return true;
      return false;
    };

    const spaceHeldRef = { current: false };
    const panRef = { current: false };
    const lastRef = { x: 0, y: 0 };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!inStudio(e.target)) return;
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const isZ = e.code === "KeyZ" || e.key.toLowerCase() === "z";
        const isY = e.code === "KeyY" || e.key.toLowerCase() === "y";
        if (isZ && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) redoStudio();
          else undoStudio();
          return;
        }
        if (isY && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          redoStudio();
          return;
        }
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "v") {
          e.preventDefault();
          setTool("select");
          return;
        }
        if (k === "t") {
          e.preventDefault();
          setTool("text");
          return;
        }
        if (k === "f") {
          e.preventDefault();
          setTool("frame");
          return;
        }
        if (k === "r") {
          e.preventDefault();
          setTool("rect");
          return;
        }
        if (k === "o") {
          e.preventDefault();
          setTool("ellipse");
          return;
        }
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceHeldRef.current = true;
        studioRootRef.current?.style.setProperty("cursor", "grab");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        panRef.current = false;
        studioRootRef.current?.style.removeProperty("cursor");
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!spaceHeldRef.current || !inStudio(e.target)) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select, [role='dialog']")) return;
      e.preventDefault();
      panRef.current = true;
      lastRef.x = e.clientX;
      lastRef.y = e.clientY;
      studioRootRef.current?.style.setProperty("cursor", "grabbing");
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!panRef.current || !spaceHeldRef.current) return;
      const dx = e.clientX - lastRef.x;
      const dy = e.clientY - lastRef.y;
      lastRef.x = e.clientX;
      lastRef.y = e.clientY;
      canvasApiRef.current?.panViewportBy(dx, dy);
    };

    const onMouseUp = () => {
      if (panRef.current) {
        panRef.current = false;
        studioRootRef.current?.style.setProperty("cursor", spaceHeldRef.current ? "grab" : "auto");
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
    };
  }, [redoStudio, undoStudio]);

  useEffect(() => {
    const id = "indesign-google-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = exportMenuRef.current;
      if (el && !el.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  useEffect(() => {
    if (!linkingFlow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLinkingFlow(false);
        setFlowSourceFrameId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkingFlow]);

  const selectedTextFrameHit = primaryTextFrameFromSelection(selected);
  const selectedVectorShape = selectedTextFrameHit
    ? null
    : primaryVectorShapeFromSelection(selected);
  const selectedFrameImg =
    selected && (selected as FabricObject).get?.("indesignType") === "frameImage"
      ? (selected as FabricImageType)
      : null;

  const selectedImageFrameShell = primaryImageFrameFromSelection(
    getFabricCanvas(),
    selected,
  );
  const selectedImageFrameUid = selectedImageFrameShell?.get("indesignUid") as string | undefined;
  const selectedImageFrameRecord = selectedImageFrameUid
    ? imageFrames.find((r) => r.id === selectedImageFrameUid)
    : undefined;

  const selectedStoryId = selectedTextFrameHit
    ? (selectedTextFrameHit.get("storyId") as string)
    : undefined;
  const selectedFrameId = selectedTextFrameHit
    ? (selectedTextFrameHit.get("frameId") as string)
    : undefined;
  const selectedStory = selectedStoryId ? stories.find((s) => s.id === selectedStoryId) : undefined;
  const selectedTypo = selectedStory?.typography;
  const canUnlinkText = Boolean(
    selectedStory &&
      selectedFrameId &&
      selectedStory.frames.indexOf(selectedFrameId) > 0,
  );

  const SERIAL = [
    "indesignType",
    "indesignUid",
    "indesignBoxW",
    "indesignBoxH",
    "frameUid",
    "hasImage",
    "imageFit",
    "storyId",
    "frameId",
    "shapeKind",
    "indesignLocked",
    "indesignImageContentId",
    ...INDESIGN_PAGE_BG_SERIAL_PROPS,
  ];
  const serialPropsRef = useRef(SERIAL);
  serialPropsRef.current = SERIAL;

  const layerObjects = useMemo(() => {
    const c = getFabricCanvas();
    if (!c) return [];
    const { blocks } = splitIndesignPrefixAndLayerBlocks(c.getObjects());
    return [...blocks].reverse().map((b) => b[0]!);
  }, [getFabricCanvas, layerListTick, activePage?.id]);

  const applyTextTypography = useCallback(
    (patch: Partial<Typography>) => {
      if (!selectedStoryId) return;
      handleTextModelChange({
        stories: updateStoryTypography(stories, selectedStoryId, patch),
        textFrames,
      });
    },
    [selectedStoryId, stories, textFrames, handleTextModelChange],
  );

  const endTypographyScrubGesture = useCallback(() => {
    typographyScrubPrimedRef.current = false;
  }, []);

  /** Misma mutación que `applyTextTypography` pero sin apilar historial en cada frame (scrub en vivo). */
  const applyTextTypographySilent = useCallback(
    (patch: Partial<Typography>) => {
      if (!selectedStoryId) return;
      if (!typographyScrubPrimedRef.current) {
        typographyScrubPrimedRef.current = true;
        if (!restoringHistoryRef.current) {
          undoStackRef.current.push(snapshotPages(pagesRef.current));
          redoStackRef.current = [];
          if (undoStackRef.current.length > 100) undoStackRef.current.shift();
        }
      }
      setPages((prev) => {
        const n = [...prev];
        const p = n[activePageIndex];
        if (!p) return prev;
        n[activePageIndex] = {
          ...p,
          stories: updateStoryTypography(p.stories ?? [], selectedStoryId, patch),
        };
        return n;
      });
    },
    [activePageIndex, selectedStoryId, snapshotPages],
  );

  const onUnlinkSelectedFrame = useCallback(() => {
    if (!selectedFrameId) return;
    const lay = frameLayouts.find((l) => l.frameId === selectedFrameId);
    const splitAt = lay?.contentRange.start ?? 0;
    handleTextModelChange(unlinkFrameAt(stories, textFrames, selectedFrameId, splitAt));
  }, [selectedFrameId, stories, textFrames, frameLayouts, handleTextModelChange]);

  const onStoryPlainChange = useCallback(
    (plain: string) => {
      if (!selectedStoryId) return;
      handleTextModelChange({
        stories: patchStoryContentPlain(stories, selectedStoryId, plain),
        textFrames,
      });
    },
    [selectedStoryId, stories, textFrames, handleTextModelChange],
  );

  const applyImageProp = useCallback(
    async (patch: Record<string, unknown>) => {
      const c = canvasApi.getCanvas();
      const o = c?.getActiveObject();
      if (!c || !o) return;
      if (patch.src && typeof patch.src === "string") {
        const old = o as FabricImageType;
        const frameUid = old.get("frameUid") as string | undefined;
        if (frameUid) {
          await canvasApi.placeImageInFrame(frameUid, patch.src);
          return;
        }
      }
      o.set(patch);
      c.requestRenderAll();
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
    },
    [canvasApi, handleJSONChange],
  );

  const applyVectorShapePatch = useCallback(
    (patch: Record<string, unknown>) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      const raw = c.getActiveObject() as FabricObject | undefined;
      const target = primaryVectorShapeFromSelection(raw ?? null);
      if (!target) return;
      target.set(patch);
      target.setCoords();
      c.requestRenderAll();
      setSelected(c.getActiveObject() ?? null);
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
    },
    [canvasApi, handleJSONChange, setSelected],
  );

  const endVectorStrokeScrubGesture = useCallback(() => {
    vectorStrokeScrubPrimedRef.current = false;
  }, []);

  /** Scrub de grosor: un solo undo al inicio; actualiza `fabricJSON` sin `commitPages` en cada frame. */
  const applyVectorShapeStrokeWidthSilent = useCallback(
    (strokeWidth: number) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      const raw = c.getActiveObject() as FabricObject | undefined;
      const target = primaryVectorShapeFromSelection(raw ?? null);
      if (!target) return;
      if (!vectorStrokeScrubPrimedRef.current) {
        vectorStrokeScrubPrimedRef.current = true;
        if (!restoringHistoryRef.current) {
          undoStackRef.current.push(snapshotPages(pagesRef.current));
          redoStackRef.current = [];
          if (undoStackRef.current.length > 100) undoStackRef.current.shift();
        }
      }
      target.set({ strokeWidth });
      target.setCoords();
      c.requestRenderAll();
      setSelected(c.getActiveObject() ?? null);
      const json = c.toObject(SERIAL) as Record<string, unknown>;
      setPages((prev) => {
        const next = [...prev];
        if (!next[activePageIndex]) return prev;
        next[activePageIndex] = { ...next[activePageIndex], fabricJSON: json };
        return next;
      });
    },
    [activePageIndex, canvasApi, setSelected, setPages, snapshotPages],
  );

  const applyTextFrameGeomPatch = useCallback(
    (patch: Partial<Pick<TextFrame, "x" | "y" | "width" | "height" | "opacity">>) => {
      if (!selectedFrameId) return;
      handleTextModelChange({
        textFrames: updateTextFrameGeometry(textFrames, selectedFrameId, patch),
        stories,
      });
    },
    [selectedFrameId, textFrames, stories, handleTextModelChange],
  );

  const refreshLayerList = useCallback(() => {
    setLayerListTick((n) => n + 1);
  }, []);

  const applyBoundingTransformCommit = useCallback(
    (next: { x: number; y: number; w: number; h: number; rot: number; opacityPct: number }) => {
      const c = canvasApi.getCanvas();
      const raw = c?.getActiveObject() as FabricObject | undefined;
      if (!c || !raw) return;
      const op = clamp(next.opacityPct, 0, 100) / 100;
      const typ = (raw.type || "").toLowerCase();
      if (typ === "ellipse") {
        raw.set({
          originX: "center",
          originY: "center",
          left: next.x + next.w / 2,
          top: next.y + next.h / 2,
          rx: Math.max(4, next.w / 2),
          ry: Math.max(4, next.h / 2),
          scaleX: 1,
          scaleY: 1,
          angle: next.rot,
          opacity: op,
        });
      } else {
        raw.set({
          originX: "left",
          originY: "top",
          left: next.x,
          top: next.y,
          width: Math.max(4, next.w),
          height: Math.max(4, next.h),
          scaleX: 1,
          scaleY: 1,
          angle: next.rot,
          opacity: op,
        });
      }
      raw.setCoords();
      c.requestRenderAll();
      setSelected(c.getActiveObject() ?? null);
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
    },
    [canvasApi, handleJSONChange, setSelected],
  );

  const toggleLayerObjectVisibility = useCallback(
    (o: FabricObject) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      const nextVis = o.visible === false;
      const fid = o.get("frameId") as string | undefined;
      if (fid) {
        for (const obj of c.getObjects()) {
          if (obj.get("frameId") === fid) obj.set("visible", nextVis);
        }
      } else {
        o.set("visible", nextVis);
      }
      c.requestRenderAll();
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
      refreshLayerList();
    },
    [canvasApi, handleJSONChange, refreshLayerList],
  );

  const toggleLayerObjectLock = useCallback(
    (o: FabricObject) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      const locked = o.get("indesignLocked") === true || o.selectable === false;
      const nextLocked = !locked;
      const patch = nextLocked
        ? { indesignLocked: true, selectable: false, evented: false, hasControls: false }
        : { indesignLocked: false, selectable: true, evented: true, hasControls: true };
      const fid = o.get("frameId") as string | undefined;
      if (fid) {
        for (const obj of c.getObjects()) {
          if (obj.get("frameId") === fid) obj.set(patch);
        }
      } else {
        o.set(patch);
      }
      c.requestRenderAll();
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
      refreshLayerList();
    },
    [canvasApi, handleJSONChange, refreshLayerList],
  );

  const selectCanvasObject = useCallback(
    (o: FabricObject) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      c.setActiveObject(o);
      c.requestRenderAll();
      setSelected(o);
    },
    [canvasApi, setSelected],
  );

  const applyLayerReorder = useCallback(
    (fromDisplayIndex: number, toDisplayIndex: number) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      reorderIndesignLayersInCanvas(c, fromDisplayIndex, toDisplayIndex);
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
      refreshLayerList();
    },
    [canvasApi, handleJSONChange, refreshLayerList],
  );

  const removeLayerObject = useCallback(
    (o: FabricObject) => {
      const c = canvasApi.getCanvas();
      if (!c) return;
      const it = o.get("indesignType") as string | undefined;
      if (it === "textFrameHit") {
        const frameId = o.get("frameId") as string;
        handleTextModelChange(deleteTextFrame(stories, textFrames, frameId));
        c.discardActiveObject();
        setSelected(null);
        refreshLayerList();
        return;
      }
      if (it === "vectorShape") {
        c.remove(o);
        c.discardActiveObject();
        setSelected(null);
        handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
        refreshLayerList();
        return;
      }
      if (it === "frame") {
        const uid = o.get("indesignUid") as string;
        for (const obj of [...c.getObjects()]) {
          if (obj.get("frameUid") === uid) c.remove(obj);
        }
        c.remove(o);
        c.discardActiveObject();
        setSelected(null);
        const nextImg = imageFrames.filter((r) => r.id !== uid);
        handlePagePatch({
          fabricJSON: c.toObject(SERIAL) as Record<string, unknown>,
          imageFrames: nextImg,
        });
        refreshLayerList();
        return;
      }
      if (it === "frameImage") {
        const fid = o.get("frameUid") as string;
        const frameObj = c
          .getObjects()
          .find(
            (x) =>
              x.get("indesignUid") === fid && x.get("indesignType") === "frame",
          );
        if (frameObj) {
          const nextRec = clearImageFrameContent(c, fid, imageFrames);
          c.setActiveObject(frameObj);
          setSelected(frameObj);
          handlePagePatch({
            fabricJSON: c.toObject(SERIAL) as Record<string, unknown>,
            imageFrames: nextRec,
          });
        } else {
          c.remove(o);
          c.discardActiveObject();
          setSelected(null);
          handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
        }
        refreshLayerList();
        return;
      }
      c.remove(o);
      c.discardActiveObject();
      setSelected(null);
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
      refreshLayerList();
    },
    [
      canvasApi,
      handleJSONChange,
      handlePagePatch,
      handleTextModelChange,
      imageFrames,
      refreshLayerList,
      setSelected,
      stories,
      textFrames,
    ],
  );

  /** Desplaza la selección 1 px (marcos de texto vía modelo; resto vía Fabric). */
  const nudgeSelectedObjects = useCallback(
    (dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return;
      const c = canvasApi.getCanvas();
      if (!c) return;
      const raw = c.getActiveObject() as FabricObject | undefined;
      if (!raw) return;

      const collectTargets = (): FabricObject[] => {
        if (isFabricActiveSelection(raw)) {
          const out: FabricObject[] = [];
          for (const o of (raw as FabricGroup).getObjects()) {
            if (o.get?.("name") === "indesignPageBg") continue;
            if (o.get?.("indesignType") === "textLine") continue;
            if (o.get?.("indesignLocked") === true || o.selectable === false) continue;
            out.push(o);
          }
          return out;
        }
        if (raw.get?.("name") === "indesignPageBg") return [];
        if (raw.get?.("indesignType") === "textLine") return [];
        if (raw.get?.("indesignLocked") === true || raw.selectable === false) return [];
        return [raw];
      };

      const targets = collectTargets();
      if (targets.length === 0) return;

      let nextFrames = textFrames;
      let movedText = false;
      let movedFabricNonText = false;

      for (const o of targets) {
        const it = o.get("indesignType") as string | undefined;
        if (it === "textFrameHit") {
          const fid = o.get("frameId") as string;
          const fr = nextFrames.find((f) => f.id === fid);
          if (fr) {
            nextFrames = updateTextFrameGeometry(nextFrames, fid, {
              x: Math.round(fr.x + dx),
              y: Math.round(fr.y + dy),
            });
            movedText = true;
          }
        } else {
          o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
          o.setCoords();
          movedFabricNonText = true;
        }
      }

      c.requestRenderAll();
      setSelected(c.getActiveObject() ?? null);

      if (movedText) {
        handleTextModelChange({ stories, textFrames: nextFrames });
      } else if (movedFabricNonText) {
        handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
      }
    },
    [
      canvasApi,
      handleJSONChange,
      handleTextModelChange,
      setSelected,
      stories,
      textFrames,
    ],
  );

  const selectPastedFabricAndText = useCallback(
    async (c: FabricCanvas, fabricObjs: FabricObject[], textFrameIds: string[]) => {
      const { ActiveSelection } = await import("fabric");
      const picks: FabricObject[] = [...fabricObjs];
      for (const fid of textFrameIds) {
        const hit = c
          .getObjects()
          .find(
            (o) =>
              o.get?.("frameId") === fid && o.get?.("indesignType") === "textFrameHit",
          );
        if (hit) picks.push(hit);
      }
      if (picks.length === 0) return;
      if (picks.length === 1) c.setActiveObject(picks[0]!);
      else c.setActiveObject(new ActiveSelection(picks, { canvas: c }));
      c.requestRenderAll();
      setSelected(c.getActiveObject() ?? null);
    },
    [setSelected],
  );

  const copySelectionToClipboard = useCallback(() => {
    const c = getFabricCanvas();
    if (!c) return;
    clipboardPayloadRef.current = buildIndesignClipboardPayload(c, stories, textFrames, SERIAL);
  }, [getFabricCanvas, stories, textFrames]);

  const pasteFromClipboard = useCallback(async () => {
    const raw = clipboardPayloadRef.current;
    if (!raw) return;
    const c = getFabricCanvas();
    if (!c) return;
    const fabricNS = await import("fabric");
    const result = await pasteIndesignClipboard(c, fabricNS, stories, textFrames, raw, {
      uniformDelta: { dx: 16, dy: 16 },
    });
    if (result.createdTextFrameIds.length > 0) {
      handleTextModelChange({ stories: result.stories, textFrames: result.textFrames });
    } else {
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
    }
    requestAnimationFrame(() => {
      void selectPastedFabricAndText(c, result.addedFabricObjects, result.createdTextFrameIds);
    });
  }, [
    getFabricCanvas,
    stories,
    textFrames,
    handleTextModelChange,
    handleJSONChange,
    selectPastedFabricAndText,
  ]);

  const cutSelection = useCallback(() => {
    copySelectionToClipboard();
    const c = getFabricCanvas();
    if (!c) return;
    const targets = collectSelectionTargets(c.getActiveObject() ?? null);
    const seen = new Set<FabricObject>();
    for (const o of targets) {
      if (seen.has(o)) continue;
      seen.add(o);
      removeLayerObject(o);
    }
  }, [copySelectionToClipboard, getFabricCanvas, removeLayerObject]);

  useEffect(() => {
    const rootSel = "[data-indesign-studio]";
    const inStudio = (n: EventTarget | null) => {
      const root = document.querySelector(rootSel);
      if (!root) return false;
      if (n instanceof Node && root.contains(n)) return true;
      const ae = document.activeElement;
      if (ae instanceof Node && root.contains(ae)) return true;
      if (ae === document.body || ae === document.documentElement) return true;
      return false;
    };

    const onClipboardKeys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "c" && k !== "v" && k !== "x") return;
      if (!inStudio(e.target)) return;
      const el = e.target as HTMLElement;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (k === "c") copySelectionToClipboard();
      else if (k === "v") void pasteFromClipboard();
      else cutSelection();
    };

    window.addEventListener("keydown", onClipboardKeys, true);
    return () => window.removeEventListener("keydown", onClipboardKeys, true);
  }, [copySelectionToClipboard, pasteFromClipboard, cutSelection]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let cleanupCanvas: (() => void) | undefined;

    const tryAttach = () => {
      if (cancelled) return;
      const c = canvasApiRef.current?.getCanvas();
      if (!c) {
        raf = requestAnimationFrame(tryAttach);
        return;
      }

      type Snap = {
        fab: Map<FabricObject, { left: number; top: number }>;
        text: Map<string, { x: number; y: number }>;
      };
      let shiftSnap: Snap | null = null;
      let shiftDupDone = false;

      const onDown = (opt: { e?: { shiftKey?: boolean }; target?: FabricObject }) => {
        shiftSnap = null;
        shiftDupDone = false;
        const ev = opt.e;
        if (!ev?.shiftKey || !opt.target) return;
        if (linkingFlowRef.current || toolRef.current !== "select") return;
        const pageIdx = activePageIndexRef.current;
        const p = pagesRef.current[pageIdx];
        if (!p) return;
        const active = c.getActiveObject() as FabricObject | undefined;
        if (!active) return;
        const targets = collectSelectionTargets(active);
        if (targets.length === 0) return;
        const fab = new Map<FabricObject, { left: number; top: number }>();
        const text = new Map<string, { x: number; y: number }>();
        const tfList = p.textFrames ?? [];
        for (const o of targets) {
          const it = o.get("indesignType") as string | undefined;
          if (it === "textFrameHit") {
            const fid = o.get("frameId") as string;
            const fr = tfList.find((x) => x.id === fid);
            if (fr) text.set(fid, { x: fr.x, y: fr.y });
          } else {
            fab.set(o, { left: o.left ?? 0, top: o.top ?? 0 });
          }
        }
        shiftSnap = { fab, text };
      };

      const runShiftDup = async () => {
        const g = shiftSnap;
        if (!g || shiftDupDone) return;
        shiftDupDone = true;
        const c2 = canvasApiRef.current?.getCanvas();
        if (!c2) return;
        const pageIdx = activePageIndexRef.current;
        const p = pagesRef.current[pageIdx];
        if (!p) return;
        const st = p.stories ?? [];
        const tf = p.textFrames ?? [];
        const ser = serialPropsRef.current;
        const payload = buildIndesignClipboardPayload(c2, st, tf, ser);
        if (!payload) {
          shiftDupDone = false;
          return;
        }
        const targets = collectSelectionTargets(c2.getActiveObject() ?? null);
        const abs = buildAbsolutePasteOptionsFromTargets(targets);
        const fabricNS = await import("fabric");
        const result = await pasteIndesignClipboard(c2, fabricNS, st, tf, payload, {
          uniformDelta: { dx: 0, dy: 0 },
          ...abs,
        });
        let nextTf = result.textFrames;
        for (const [fid, pos] of g.text) {
          nextTf = updateTextFrameGeometry(nextTf, fid, { x: pos.x, y: pos.y });
        }
        for (const [o, pos] of g.fab) {
          o.set({ left: pos.left, top: pos.top });
          o.setCoords();
        }
        c2.requestRenderAll();
        if (result.createdTextFrameIds.length > 0) {
          handleTextModelChangeRef.current({ stories: result.stories, textFrames: nextTf });
        } else {
          handleJSONChangeRef.current(c2.toObject(ser) as Record<string, unknown>);
        }
        requestAnimationFrame(() => {
          void (async () => {
            const cx = canvasApiRef.current?.getCanvas();
            if (!cx) return;
            await selectPastedFabricAndText(
              cx,
              result.addedFabricObjects,
              result.createdTextFrameIds,
            );
          })();
        });
      };

      const onMoving = (opt: { e?: { shiftKey?: boolean } }) => {
        if (!shiftSnap || shiftDupDone || !opt.e?.shiftKey) return;
        if (linkingFlowRef.current || toolRef.current !== "select") return;
        void runShiftDup();
      };

      const onUp = () => {
        shiftSnap = null;
        shiftDupDone = false;
      };

      c.on("mouse:down", onDown);
      c.on("object:moving", onMoving);
      c.on("mouse:up", onUp);
      cleanupCanvas = () => {
        c.off("mouse:down", onDown);
        c.off("object:moving", onMoving);
        c.off("mouse:up", onUp);
      };
    };

    tryAttach();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanupCanvas?.();
    };
  }, [selectPastedFabricAndText]);

  useEffect(() => {
    const rootSel = "[data-indesign-studio]";
    const inStudio = (n: EventTarget | null) => {
      const root = document.querySelector(rootSel);
      if (!root) return false;
      if (n instanceof Node && root.contains(n)) return true;
      const ae = document.activeElement;
      if (ae instanceof Node && root.contains(ae)) return true;
      if (ae === document.body || ae === document.documentElement) return true;
      return false;
    };

    const onArrow = (e: KeyboardEvent) => {
      if (
        e.code !== "ArrowLeft" &&
        e.code !== "ArrowRight" &&
        e.code !== "ArrowUp" &&
        e.code !== "ArrowDown"
      ) {
        return;
      }
      if (!inStudio(e.target)) return;
      const el = e.target as HTMLElement;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      ) {
        return;
      }
      let dx = 0;
      let dy = 0;
      if (e.code === "ArrowLeft") dx = -1;
      else if (e.code === "ArrowRight") dx = 1;
      else if (e.code === "ArrowUp") dy = -1;
      else dy = 1;
      e.preventDefault();
      e.stopPropagation();
      nudgeSelectedObjects(dx, dy);
    };
    window.addEventListener("keydown", onArrow, true);
    return () => window.removeEventListener("keydown", onArrow, true);
  }, [nudgeSelectedObjects]);

  useEffect(() => {
    refreshLayerList();
  }, [activePageIndex, selected, rightPanelTab, refreshLayerList]);

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    let raf = 0;
    const attach = () => {
      if (cancelled) return;
      const c = canvasApi.getCanvas();
      if (!c) {
        raf = requestAnimationFrame(attach);
        return;
      }
      const bump = () => setLayerListTick((n) => n + 1);
      c.on("object:added", bump);
      c.on("object:removed", bump);
      c.on("object:modified", bump);
      c.on("selection:created", bump);
      c.on("selection:updated", bump);
      c.on("selection:cleared", bump);
      off = () => {
        c.off("object:added", bump);
        c.off("object:removed", bump);
        c.off("object:modified", bump);
        c.off("selection:created", bump);
        c.off("selection:updated", bump);
        c.off("selection:cleared", bump);
      };
    };
    raf = requestAnimationFrame(attach);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      off?.();
    };
  }, [canvasApi, activePage?.id]);

  const runPdf = useCallback(
    async (mode: "fast" | "quality" | "vector") => {
      try {
        if (mode === "vector") {
          const list = pages.map((p) => {
            const m = migrateIndesignPageState(p);
            const d = getPageDimensions(m);
            return {
              width: d.width,
              height: d.height,
              stories: m.stories ?? [],
              textFrames: m.textFrames ?? [],
            };
          });
          exportIndesignPagesPdfVector(list);
          setExportOpen(false);
          return;
        }
        const list = pages.map((p) => {
          const m = migrateIndesignPageState(p);
          const d = getPageDimensions(m);
          return {
            width: d.width,
            height: d.height,
            fabricJSON: p.fabricJSON,
          };
        });
        await exportIndesignPagesPdf(list, mode);
        setExportOpen(false);
      } catch (err) {
        console.error(err);
        window.alert(
          `No se pudo exportar el PDF: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [pages],
  );

  const addPage = useCallback(() => {
    const newPage: IndesignPageState = {
      id: `pg_${Date.now()}`,
      format: pendingFormat,
      fabricJSON: null,
      stories: [],
      textFrames: [],
      imageFrames: [],
    };
    commitPages((prev) => {
      const next = [...prev, newPage];
      queueMicrotask(() => setActivePageIndex(next.length - 1));
      return next;
    });
    setAddPageOpen(false);
  }, [commitPages, pendingFormat]);

  const deletePage = useCallback(
    (idx: number) => {
      if (pages.length <= 1) return;
      commitPages((prev) => prev.filter((_, i) => i !== idx));
      setActivePageIndex((i) => Math.min(i >= idx ? i - 1 : i, pages.length - 2));
    },
    [commitPages, pages.length],
  );

  const movePage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= pages.length || toIndex >= pages.length) return;
      commitPages((prev) => {
        const next = [...prev];
        const [item] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, item!);
        return next;
      });
      setActivePageIndex((active) => {
        if (active === fromIndex) return toIndex;
        if (fromIndex < toIndex) {
          if (active > fromIndex && active <= toIndex) return active - 1;
          return active;
        }
        if (active >= toIndex && active < fromIndex) return active + 1;
        return active;
      });
    },
    [commitPages, pages.length],
  );

  return createPortal(
    <div
      ref={studioRootRef}
      className="fixed inset-0 z-[10050] flex flex-col bg-[#0e0e12] text-zinc-100"
      data-foldder-studio-canvas=""
      data-indesign-studio=""
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(251,191,36,0.12),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(139,92,246,0.06),transparent_45%)]"
      />
      <header className="relative z-[200] flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-gradient-to-b from-zinc-900/95 to-[#0f0f14] px-4 py-2.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
        <div className="flex min-w-0 shrink-0 flex-col gap-0.5 pr-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/95">
            Indesign
          </span>
          <span className="truncate text-[11px] font-medium text-zinc-500">Studio de maquetación</span>
        </div>
        <div className="hidden h-8 w-px shrink-0 bg-white/10 sm:block" />
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:justify-start">
          <div className="flex items-center gap-0.5 rounded-2xl border border-white/[0.09] bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
            <ToolBtn active={tool === "select"} label="Selección (V)" onClick={() => setTool("select")}>
              <MousePointer2 className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "text"} label="Texto (T)" onClick={() => setTool("text")}>
              <Type className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "frame"} label="Marco imagen (F)" onClick={() => setTool("frame")}>
              <Frame className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "rect"} label="Rectángulo (R)" onClick={() => setTool("rect")}>
              <Square className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "ellipse"} label="Elipse (O)" onClick={() => setTool("ellipse")}>
              <Circle className="h-4 w-4" />
            </ToolBtn>
          </div>
        </div>
        <div ref={exportMenuRef} className="relative z-[210] shrink-0">
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-violet-400/25 bg-gradient-to-b from-violet-500/35 to-violet-700/25 px-3.5 py-2 text-xs font-bold text-violet-50 shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition hover:border-violet-300/40 hover:from-violet-500/45"
          >
            <FileDown className="h-4 w-4 shrink-0 opacity-95" />
            <span className="hidden sm:inline">Exportar PDF</span>
            <span className="sm:hidden">PDF</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </button>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-[220] mt-1 min-w-[12rem] py-0.5 text-xs [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-0 py-1.5 text-left font-semibold text-zinc-50 transition hover:text-white"
                onClick={() => void runPdf("vector")}
              >
                PDF vectorial
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-0 py-1.5 text-left font-normal text-zinc-400 transition hover:text-zinc-200"
                onClick={() => void runPdf("fast")}
              >
                Rápido (mapa de bits, JPEG)
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-0 py-1.5 text-left font-normal text-zinc-400 transition hover:text-zinc-200"
                onClick={() => void runPdf("quality")}
              >
                Calidad (mapa de bits, PNG ×2)
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar Studio"
          className="shrink-0 rounded-xl border border-white/12 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-rose-400/35 hover:bg-rose-500/15 hover:text-rose-100"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#1a1a22]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.12),transparent_70%)]"
          />
          <div ref={canvasAreaRef} className="relative z-[1] h-full w-full select-none">
            <div ref={hostRef} className="h-full w-full" />
            <IndesignCanvasGrid
              getCanvas={getFabricCanvas}
              show={showGrid}
              step={gridStep}
              layoutKey={`${activePage?.id ?? ""}-${pageDims.width}-${pageDims.height}`}
            />
            <TextFramePortsOverlay
              areaRef={canvasAreaRef}
              getCanvas={getFabricCanvas}
              canvasSubscriptionKey={activePage?.id ?? String(activePageIndex)}
              layouts={frameLayouts}
              framesById={frameByIdMap}
              storiesById={storyByIdMap}
              onOverflowOutClick={onFlowOutClick}
              onOverflowOutDoubleClick={onFlowOutDoubleClick}
            />
          </div>
          {linkingFlow && (
            <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex max-w-[min(480px,92vw)] -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border border-amber-400/40 bg-zinc-950/95 px-5 py-3 text-center text-xs text-amber-100/95 shadow-2xl backdrop-blur-md">
              <span className="font-semibold">Modo enlace de texto</span>
              <span className="text-[11px] text-zinc-400">
                Haz clic en otro marco de texto o en un hueco del pliego para crear un marco nuevo. ESC
                cancela.
              </span>
            </div>
          )}
        </div>

        <aside className="flex min-h-0 w-[17.5rem] shrink-0 flex-col border-l border-white/[0.07] bg-[#101018]/95 p-3.5 backdrop-blur-sm sm:w-72">
          <div
            role="tablist"
            aria-label="Panel lateral"
            className="flex shrink-0 gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={rightPanelTab === "properties"}
              onClick={() => setRightPanelTab("properties")}
              className={`min-h-[2.25rem] flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                rightPanelTab === "properties"
                  ? "bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/35"
                  : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              }`}
            >
              Propiedades
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightPanelTab === "pages"}
              onClick={() => setRightPanelTab("pages")}
              className={`min-h-[2.25rem] flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                rightPanelTab === "pages"
                  ? "bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/35"
                  : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              }`}
            >
              Páginas
            </button>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
            {rightPanelTab === "properties" ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable]">
          {!selected && (
            <div className="mt-6 rounded-xl border border-white/[0.06] bg-black/20 p-4 text-center">
              <p className="text-xs leading-relaxed text-zinc-500">
                Selecciona texto, imagen o forma (rectángulo/elipse) en el lienzo para editar.
              </p>
            </div>
          )}

          {selected &&
            (() => {
              const frModel =
                selectedFrameId && selectedTextFrameHit
                  ? textFrames.find((f) => f.id === selectedFrameId)
                  : undefined;
              const isText = Boolean(selectedTextFrameHit && frModel);
              const tr = isText && frModel
                ? {
                    x: Math.round(frModel.x),
                    y: Math.round(frModel.y),
                    w: Math.max(1, Math.round(frModel.width)),
                    h: Math.max(1, Math.round(frModel.height)),
                    rot: 0,
                    opacityPct: Math.round((frModel.opacity ?? 1) * 100),
                    rotLocked: true as const,
                  }
                : { ...readBoundingTransform(selected as FabricObject), rotLocked: false as const };
              const commitField = (
                patch: Partial<typeof tr> & { rot?: number; opacityPct?: number },
              ) => {
                if (isText && frModel) {
                  if (patch.x !== undefined) applyTextFrameGeomPatch({ x: patch.x });
                  if (patch.y !== undefined) applyTextFrameGeomPatch({ y: patch.y });
                  if (patch.w !== undefined) applyTextFrameGeomPatch({ width: patch.w });
                  if (patch.h !== undefined) applyTextFrameGeomPatch({ height: patch.h });
                  if (patch.opacityPct !== undefined)
                    applyTextFrameGeomPatch({ opacity: clamp(patch.opacityPct, 0, 100) / 100 });
                  return;
                }
                applyBoundingTransformCommit({
                  x: patch.x ?? tr.x,
                  y: patch.y ?? tr.y,
                  w: patch.w ?? tr.w,
                  h: patch.h ?? tr.h,
                  rot: patch.rot ?? tr.rot,
                  opacityPct: patch.opacityPct ?? tr.opacityPct,
                });
              };
              return (
                <div className="border-b border-white/[0.08] px-[14px] py-3 space-y-2">
                  <div className={FH_LBL}>Transform</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["x", "y"] as const).map((key) => (
                      <div key={key} className="space-y-0.5">
                        <label className={FH_LBL}>{key === "x" ? "X" : "Y"}</label>
                        <ScrubNumberInput
                          value={key === "x" ? tr.x : tr.y}
                          onKeyboardCommit={(n) =>
                            commitField(key === "x" ? { x: n } : { y: n })
                          }
                          onScrubLive={(n) => commitField(key === "x" ? { x: n } : { y: n })}
                          onScrubEnd={() => {}}
                          step={1}
                          title="Arrastra horizontalmente · Mayús = ×10"
                          className={FH_INP}
                        />
                      </div>
                    ))}
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>W</label>
                      <ScrubNumberInput
                        value={tr.w}
                        onKeyboardCommit={(n) => commitField({ w: Math.max(1, n) })}
                        onScrubLive={(n) => commitField({ w: Math.max(1, n) })}
                        onScrubEnd={() => {}}
                        step={1}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>H</label>
                      <ScrubNumberInput
                        value={tr.h}
                        onKeyboardCommit={(n) => commitField({ h: Math.max(1, n) })}
                        onScrubLive={(n) => commitField({ h: Math.max(1, n) })}
                        onScrubEnd={() => {}}
                        step={1}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Rot</label>
                      <ScrubNumberInput
                        value={tr.rotLocked ? 0 : tr.rot}
                        onKeyboardCommit={(n) => {
                          if (!tr.rotLocked) commitField({ rot: n });
                        }}
                        onScrubLive={(n) => {
                          if (!tr.rotLocked) commitField({ rot: n });
                        }}
                        onScrubEnd={() => {}}
                        step={0.1}
                        roundFn={(n) => Math.round(n * 1000) / 1000}
                        disabled={tr.rotLocked}
                        title={
                          tr.rotLocked
                            ? "Rotación no disponible para marcos de texto en este motor"
                            : "Arrastra horizontalmente · Mayús = ×10"
                        }
                        className={`${FH_INP} ${tr.rotLocked ? "cursor-not-allowed opacity-45" : ""}`}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Opacity</label>
                      <ScrubNumberInput
                        value={tr.opacityPct}
                        onKeyboardCommit={(n) =>
                          commitField({ opacityPct: clamp(Math.round(n), 0, 100) })
                        }
                        onScrubLive={(n) =>
                          commitField({ opacityPct: clamp(Math.round(n), 0, 100) })
                        }
                        onScrubEnd={() => {}}
                        step={1}
                        roundFn={(n) => clamp(Math.round(n), 0, 100)}
                        min={0}
                        max={100}
                        title="Opacidad % · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

          {selectedImageFrameShell &&
            !selectedTextFrameHit &&
            !primaryVectorShapeFromSelection(selected) &&
            selectedImageFrameUid &&
            (() => {
              const uid = selectedImageFrameUid;
              const rec = selectedImageFrameRecord;
              const hasImg = !!selectedImageFrameShell.get("hasImage");
              const editContent = imageContentEditUid === uid && !!selectedFrameImg;
              const fitting = rec?.imageContent?.fittingMode ?? "fill-proportional";
              const auto = rec?.autoFit ?? true;

              const commitIF = (next: ImageFrameRecord[]) => {
                const c = canvasApi.getCanvas();
                if (!c) return;
                handlePagePatch({
                  fabricJSON: c.toObject(SERIAL) as Record<string, unknown>,
                  imageFrames: next,
                });
              };

              const openPlace = () => {
                placeImageTargetUidRef.current = uid;
                placeImageInputRef.current?.click();
              };

              return (
                <div className="space-y-2.5 border-b border-white/[0.08] px-[14px] py-3">
                  <p className="text-xs font-semibold text-amber-100/90">Marco de imagen</p>
                  {editContent ? (
                    <p className="text-[10px] text-amber-400/90">
                      Editando contenido interno · Esc = volver al marco
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={openPlace}
                    className="w-full rounded-lg border border-amber-400/35 bg-amber-500/15 py-2 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-500/25"
                  >
                    Colocar imagen dentro
                  </button>
                  <div className="flex items-center justify-between gap-2">
                    <span className={FH_LBL}>Auto-Fit</span>
                    <button
                      type="button"
                      onClick={() => {
                        const c = canvasApi.getCanvas();
                        if (!c) return;
                        const next = setImageFrameAutoFit(c, uid, !auto, imageFrames);
                        commitIF(next);
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${
                        auto ? FH_PILL_ON : FH_PILL_OFF
                      }`}
                    >
                      {auto ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="space-y-1">
                    <span className={FH_LBL}>Ajuste (fitting)</span>
                    <select
                      value={fitting}
                      onChange={(e) => {
                        const c = canvasApi.getCanvas();
                        if (!c) return;
                        const m = e.target.value as ImageFittingMode;
                        const next = applyFittingModeToImageFrame(c, uid, m, imageFrames);
                        commitIF(next);
                      }}
                      className="w-full rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:ring-1 focus:ring-[#534AB7]/40"
                    >
                      {IMG_FIT_OPTIONS.map((o) => (
                        <option key={o.value + o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {hasImg ? (
                    <div className="space-y-1">
                      <span className={FH_LBL}>Alinear dentro de la caja</span>
                      <div className="grid max-w-[9rem] grid-cols-3 gap-1">
                        {IMG_ALIGN_GRID.map((al) => (
                          <button
                            key={al}
                            type="button"
                            title={al}
                            onClick={() => {
                              const c = canvasApi.getCanvas();
                              if (!c) return;
                              const next = applyContentAlignmentToImageFrame(c, uid, al, imageFrames);
                              commitIF(next);
                            }}
                            className={`h-7 rounded border text-[10px] font-bold ${
                              rec?.contentAlignment === al ? FH_PILL_ON : FH_PILL_OFF
                            }`}
                          >
                            ·
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {editContent && selectedFrameImg ? (
                    <div className="grid grid-cols-2 gap-1.5 text-[10px] text-zinc-400">
                      <span>Escala X: {((selectedFrameImg.scaleX ?? 1) * 100).toFixed(0)}%</span>
                      <span>Escala Y: {((selectedFrameImg.scaleY ?? 1) * 100).toFixed(0)}%</span>
                    </div>
                  ) : null}
                </div>
              );
            })()}

          {selectedTextFrameHit && selectedTypo && selectedStory && (
            <div className="space-y-0 border-b border-white/[0.08] px-[14px] py-3">
              <p className="text-[10px] leading-relaxed text-zinc-500">
                Historia enlazada: puerto OUT (rojo +) para continuar el flujo.
              </p>
              <label className="mt-2 block text-[10px] font-medium text-zinc-500">Contenido</label>
              <textarea
                className="mt-1 min-h-[100px] w-full resize-y rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:ring-1 focus:ring-[#534AB7]/40"
                value={serializeStoryContent(selectedStory.content)}
                onChange={(e) => onStoryPlainChange(e.target.value)}
                spellCheck={false}
              />
              {canUnlinkText ? (
                <button
                  type="button"
                  onClick={onUnlinkSelectedFrame}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-[5px] border border-white/[0.08] bg-white/[0.06] py-2 text-[11px] font-bold text-zinc-200 transition hover:bg-white/10"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Romper enlace entrante
                </button>
              ) : null}
            </div>
          )}

          {selectedTextFrameHit && selectedTypo && selectedStory &&
            (() => {
              const tx = selectedTypo;
              const primaryFamily = tx.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
              const feaMap = parseOpenTypeFeatureMap(tx.fontFeatureSettings);
              const activeOtTags = OPEN_TYPE_PANEL_TAGS.filter((t) => feaMap.get(t) === 1);
              const activosLine = activeOtTags.length > 0 ? activeOtTags.join(", ") : "—";
              return (
                <div className="space-y-3 border-b border-white/[0.08] px-[14px] py-3">
                  <div className={FH_LBL}>Typography</div>
                  <div className="flex gap-1.5">
                    <select
                      value={
                        GOOGLE_FONTS_POPULAR.some((g) => g.family === primaryFamily)
                          ? primaryFamily
                          : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        applyTextTypography({ fontFamily: `${v}, system-ui, sans-serif` });
                      }}
                      className="min-w-0 flex-1 rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1.5 text-[12px] text-zinc-100 outline-none focus:ring-1 focus:ring-[#534AB7]/40"
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
                      title="Importar .ttf / .otf"
                      onClick={() => customFontFileRef.current?.click()}
                      className="shrink-0 rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1.5 font-mono text-[11px] text-zinc-300"
                    >
                      .TTF
                    </button>
                    <input
                      ref={customFontFileRef}
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
                          registerUserFontBuffer(parsePrimaryFontFamily(face.family), typoWeightToNumber(tx), buf);
                          applyTextTypography({
                            fontFamily: `"${face.family}", system-ui, sans-serif`,
                          });
                        } catch {
                          window.alert("No se pudo cargar la fuente.");
                        }
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    value={tx.fontFamily}
                    onChange={(e) => applyTextTypography({ fontFamily: e.target.value })}
                    spellCheck={false}
                    className="w-full rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100 outline-none focus:ring-1 focus:ring-[#534AB7]/40"
                    placeholder="Inter, system-ui, sans-serif"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Size</label>
                      <ScrubNumberInput
                        value={tx.fontSize}
                        onKeyboardCommit={(n) =>
                          applyTextTypography({ fontSize: clamp(Math.round(n), 4, 400) })
                        }
                        onScrubLive={(n) =>
                          applyTextTypographySilent({ fontSize: clamp(Math.round(n), 4, 400) })
                        }
                        onScrubEnd={endTypographyScrubGesture}
                        step={1}
                        roundFn={(n) => clamp(Math.round(n), 4, 400)}
                        min={4}
                        max={400}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Weight</label>
                      <ScrubNumberInput
                        value={typoWeightToNumber(tx)}
                        onKeyboardCommit={(n) =>
                          applyTextTypography({
                            fontWeight: String(clamp(Math.round(n), 100, 900)),
                          })
                        }
                        onScrubLive={(n) =>
                          applyTextTypographySilent({
                            fontWeight: String(clamp(Math.round(n), 100, 900)),
                          })
                        }
                        onScrubEnd={endTypographyScrubGesture}
                        step={1}
                        roundFn={(n) => clamp(Math.round(n), 100, 900)}
                        min={100}
                        max={900}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Leading</label>
                      <ScrubNumberInput
                        value={tx.lineHeight}
                        onKeyboardCommit={(n) =>
                          applyTextTypography({
                            lineHeight: clamp(Math.round(n * 100) / 100, 0.5, 5),
                          })
                        }
                        onScrubLive={(n) =>
                          applyTextTypographySilent({
                            lineHeight: clamp(Math.round(n * 100) / 100, 0.5, 5),
                          })
                        }
                        onScrubEnd={endTypographyScrubGesture}
                        step={0.05}
                        roundFn={(n) => Math.round(clamp(n, 0.5, 5) * 100) / 100}
                        min={0.5}
                        max={5}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Tracking</label>
                      <ScrubNumberInput
                        value={tx.letterSpacing}
                        onKeyboardCommit={(n) =>
                          applyTextTypography({ letterSpacing: Math.round(n * 100) / 100 })
                        }
                        onScrubLive={(n) =>
                          applyTextTypographySilent({ letterSpacing: Math.round(n * 100) / 100 })
                        }
                        onScrubEnd={endTypographyScrubGesture}
                        step={0.05}
                        roundFn={(n) => Math.round(n * 100) / 100}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={FH_LBL}>Indent</label>
                      <ScrubNumberInput
                        value={tx.paragraphIndent ?? 0}
                        onKeyboardCommit={(n) =>
                          applyTextTypography({ paragraphIndent: clamp(Math.round(n), 0, 200) })
                        }
                        onScrubLive={(n) =>
                          applyTextTypographySilent({ paragraphIndent: clamp(Math.round(n), 0, 200) })
                        }
                        onScrubEnd={endTypographyScrubGesture}
                        step={1}
                        roundFn={(n) => clamp(Math.round(n), 0, 200)}
                        min={0}
                        max={200}
                        title="Arrastra horizontalmente · Mayús = ×10"
                        className={FH_INP}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={FH_LBL}>Kerning</span>
                    <select
                      value={tx.fontKerning}
                      onChange={(e) =>
                        applyTextTypography({
                          fontKerning: e.target.value as Typography["fontKerning"],
                        })
                      }
                      className="min-w-[7rem] rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[12px] text-zinc-100 outline-none focus:ring-1 focus:ring-[#534AB7]/40"
                    >
                      <option value="auto">Auto</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    {(["left", "center", "right", "justify"] as const).map((al) => (
                      <button
                        key={al}
                        type="button"
                        onClick={() => applyTextTypography({ align: al })}
                        className={`flex-1 rounded-[5px] border py-1 text-[11px] font-bold uppercase transition-colors ${
                          tx.align === al ? FH_PILL_ON : FH_PILL_OFF
                        }`}
                      >
                        {al === "left" ? "LEF" : al === "center" ? "CEN" : al === "right" ? "RIG" : "JUS"}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      title="Small caps"
                      onClick={() =>
                        applyTextTypography({
                          fontVariantCaps:
                            tx.fontVariantCaps === "small-caps" ? "normal" : "small-caps",
                        })
                      }
                      className={`flex-1 rounded-[5px] border py-1 text-[12px] font-semibold transition-colors ${
                        tx.fontVariantCaps === "small-caps" ? FH_PILL_ON : FH_PILL_OFF
                      }`}
                    >
                      Aa
                    </button>
                    <button
                      type="button"
                      title="Bold"
                      onClick={() =>
                        applyTextTypography({
                          fontWeight: String(typoWeightToNumber(tx) >= 600 ? 400 : 700),
                        })
                      }
                      className={`flex-1 rounded-[5px] border py-1 text-[12px] font-bold transition-colors ${
                        typoWeightToNumber(tx) >= 600 ? FH_PILL_ON : FH_PILL_OFF
                      }`}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      title="Italic"
                      onClick={() =>
                        applyTextTypography({
                          fontStyle: tx.fontStyle === "italic" ? "normal" : "italic",
                        })
                      }
                      className={`flex-1 rounded-[5px] border py-1 text-[12px] italic transition-colors ${
                        tx.fontStyle === "italic" ? FH_PILL_ON : FH_PILL_OFF
                      }`}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      title="Underline"
                      onClick={() =>
                        applyTextTypography({ textUnderline: !tx.textUnderline })
                      }
                      className={`flex-1 rounded-[5px] border py-1 text-[12px] transition-colors ${
                        tx.textUnderline ? FH_PILL_ON : FH_PILL_OFF
                      }`}
                    >
                      U
                    </button>
                    <button
                      type="button"
                      title="Strikethrough"
                      onClick={() =>
                        applyTextTypography({ textStrikethrough: !tx.textStrikethrough })
                      }
                      className={`flex-1 rounded-[5px] border py-1 text-[12px] transition-colors ${
                        tx.textStrikethrough ? FH_PILL_ON : FH_PILL_OFF
                      }`}
                    >
                      S
                    </button>
                  </div>
                  <div className="space-y-2 pt-1">
                    <div className={FH_LBL}>OpenType</div>
                    <div className="flex flex-wrap gap-1.5">
                      {OPEN_TYPE_PANEL_TAGS.map((tag) => {
                        const on = feaMap.get(tag) === 1;
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const next = parseOpenTypeFeatureMap(tx.fontFeatureSettings);
                              if (next.get(tag) === 1) next.delete(tag);
                              else next.set(tag, 1);
                              applyTextTypography({
                                fontFeatureSettings: stringifyOpenTypeFeatureMap(next),
                              });
                            }}
                            className={`rounded-[5px] border px-2 py-1 font-mono text-[11px] transition-colors ${
                              on
                                ? FH_PILL_ON
                                : "border-white/[0.08] bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-zinc-500">Activos: {activosLine}</p>
                  </div>
                  <label className="block text-[10px] font-medium text-zinc-500">Color</label>
                  <input
                    type="color"
                    className="h-10 w-full cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent"
                    value={typeof tx.color === "string" ? tx.color : "#111827"}
                    onChange={(e) => applyTextTypography({ color: e.target.value })}
                  />
                </div>
              );
            })()}

          {selectedVectorShape &&
            (() => {
              const v = selectedVectorShape;
              const noFill = fabricFillIsEmpty(v.get("fill"));
              const noStroke = fabricStrokeIsNone(v);
              const strokeW = Number(v.get("strokeWidth") ?? 0);
              const cap = ((v.get("strokeLineCap") as string) || "butt") as "butt" | "round" | "square";
              const join = ((v.get("strokeLineJoin") as string) || "miter") as "miter" | "round" | "bevel";
              const dashStr = formatStrokeDashArray(v.get("strokeDashArray"));
              const kindLabel = v.get("shapeKind") === "ellipse" ? "Elipse" : "Rectángulo";
              const fillHex = fabricFillDisplayHex(v);
              const strokeHex = fabricStrokeDisplayColor(v);
              const pillOn = "border-amber-400/50 bg-amber-500/30 text-amber-50 ring-1 ring-amber-400/35";
              const pillOff = "border-white/[0.08] bg-black/35 text-zinc-500 hover:bg-black/50 hover:text-zinc-300";
              return (
                <div className="mt-4 space-y-3 rounded-xl border border-white/[0.07] bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-xs font-semibold text-amber-100/90">Forma vectorial ({kindLabel})</p>
                  <p className="text-[10px] leading-relaxed text-zinc-500">
                    Relleno, trazo, grosor y guiones (como en Freehand).
                  </p>

                  <div className="space-y-2 border-b border-white/[0.06] pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Relleno
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Sin relleno"
                          aria-label="Sin relleno"
                          aria-pressed={noFill}
                          onClick={() => applyVectorShapePatch({ fill: "transparent" })}
                          className={`relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] border bg-[#2a2d33] transition-colors ${
                            noFill
                              ? "border-amber-400/50 ring-1 ring-amber-400/35"
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
                            <line
                              x1="4"
                              y1="18"
                              x2="18"
                              y2="4"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="square"
                            />
                          </svg>
                        </button>
                        <input
                          type="color"
                          value={noFill ? "#000000" : fillHex}
                          onChange={(e) => applyVectorShapePatch({ fill: e.target.value })}
                          className="h-[22px] w-[22px] shrink-0 cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent"
                          title="Color de relleno"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={`space-y-2 ${noStroke ? "" : "space-y-2.5"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Trazo
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Sin trazo"
                          aria-label="Sin trazo"
                          aria-pressed={noStroke}
                          onClick={() => applyVectorShapePatch({ strokeWidth: 0 })}
                          className={`relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] border bg-[#2a2d33] transition-colors ${
                            noStroke
                              ? "border-amber-400/50 ring-1 ring-amber-400/35"
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
                            <line
                              x1="4"
                              y1="18"
                              x2="18"
                              y2="4"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="square"
                            />
                          </svg>
                        </button>
                        <input
                          type="color"
                          value={noStroke ? "#000000" : strokeHex}
                          onChange={(e) => {
                            const c = e.target.value;
                            applyVectorShapePatch({
                              stroke: c,
                              strokeWidth: Math.max(1, strokeW || 2),
                            });
                          }}
                          className="h-[22px] w-[22px] shrink-0 cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent"
                          title="Color del trazo"
                        />
                      </div>
                    </div>

                    {!noStroke ? (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            Grosor
                          </span>
                          <ScrubNumberInput
                            value={strokeW}
                            onKeyboardCommit={(n) => {
                              vectorStrokeScrubPrimedRef.current = false;
                              const x = Math.min(50, Math.max(0, Number.isFinite(n) ? n : strokeW));
                              applyVectorShapePatch({ strokeWidth: x });
                            }}
                            onScrubLive={(n) => {
                              const x = Math.min(50, Math.max(0, n));
                              applyVectorShapeStrokeWidthSilent(x);
                            }}
                            onScrubEnd={endVectorStrokeScrubGesture}
                            step={0.5}
                            roundFn={(n) => Math.round(Math.min(50, Math.max(0, n)) * 2) / 2}
                            min={0}
                            max={50}
                            title="Arrastra en horizontal para cambiar. Mayús = más rápido."
                            className="min-w-[3rem] flex-1 cursor-ew-resize rounded-lg border border-white/12 bg-zinc-950/80 px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/25"
                          />
                          <div className="flex items-center gap-1" title="Terminación del trazo">
                            {(
                              [
                                { v: "butt" as const, Icon: Minus, label: "Extremo plano" },
                                { v: "round" as const, Icon: Circle, label: "Extremo redondo" },
                                { v: "square" as const, Icon: RectangleHorizontal, label: "Extremo cuadrado" },
                              ] as const
                            ).map(({ v, Icon, label }) => (
                              <button
                                key={v}
                                type="button"
                                title={label}
                                onClick={() => applyVectorShapePatch({ strokeLineCap: v })}
                                className={`rounded-lg border p-1.5 transition-colors ${cap === v ? pillOn : pillOff}`}
                              >
                                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            Esquinas
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1" title="Unión de trazo">
                            {(
                              [
                                { v: "miter" as const, Icon: Triangle, label: "Inglete" },
                                { v: "round" as const, Icon: Circle, label: "Redondeada" },
                                { v: "bevel" as const, Icon: Diamond, label: "Bisel" },
                              ] as const
                            ).map(({ v, Icon, label }) => (
                              <button
                                key={v}
                                type="button"
                                title={label}
                                onClick={() => applyVectorShapePatch({ strokeLineJoin: v })}
                                className={`rounded-lg border p-1.5 transition-colors ${join === v ? pillOn : pillOff}`}
                              >
                                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            Guión
                          </span>
                          <input
                            type="text"
                            value={dashStr}
                            placeholder="ej. 8 4"
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, " ");
                              const parsed = parseStrokeDashInput(raw);
                              applyVectorShapePatch({
                                strokeDashArray: parsed === undefined ? null : parsed,
                              });
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-zinc-950/80 px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/25"
                            title="Patrón de guión (p. ej. 8 4)"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })()}
                </div>

                <div className="shrink-0 border-t border-white/[0.07] bg-[#0c0c12]">
                  <button
                    type="button"
                    onClick={() => setLayersPanelExpanded((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      Capas ({layerObjects.length})
                    </span>
                    {layersPanelExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={2} />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={2} />
                    )}
                  </button>
                  {layersPanelExpanded ? (
                    <div className="max-h-[min(40vh,280px)] overflow-y-auto border-t border-white/[0.05] px-1 pb-2 [-ms-overflow-style:none] [scrollbar-gutter:stable]">
                      {layerObjects.length === 0 ? (
                        <p className="px-2 py-3 text-center text-[11px] text-zinc-600">
                          Sin objetos en esta hoja.
                        </p>
                      ) : (
                        <ul
                          className="space-y-0.5 pt-1"
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                        >
                          {layerObjects.map((o, idx) => {
                            const cvs = getFabricCanvas();
                            const isRowSelected = fabricObjectIsInSelection(cvs, o);
                            const visOff = o.visible === false;
                            const locked =
                              o.get("indesignLocked") === true || o.selectable === false;
                            return (
                              <li
                                key={`${activePage?.id ?? "p"}-${idx}-${String(o.get("frameId") ?? o.get("indesignUid") ?? o.type)}`}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = "move";
                                  setLayerDragOverIdx(idx);
                                }}
                                onDragLeave={() =>
                                  setLayerDragOverIdx((cur) => (cur === idx ? null : cur))
                                }
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
                                  if (!Number.isFinite(from) || from === idx) {
                                    setLayerDragOverIdx(null);
                                    return;
                                  }
                                  applyLayerReorder(from, idx);
                                  setLayerDragOverIdx(null);
                                }}
                                className={
                                  layerDragOverIdx === idx
                                    ? "rounded-lg ring-1 ring-amber-400/45 ring-inset"
                                    : undefined
                                }
                              >
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => selectCanvasObject(o)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      selectCanvasObject(o);
                                    }
                                  }}
                                  className={`flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] text-zinc-200 transition ${
                                    isRowSelected
                                      ? "bg-[#534AB7]/35 ring-1 ring-[#534AB7]/40"
                                      : "hover:bg-white/[0.06]"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    title="Arrastrar para reordenar"
                                    draggable
                                    className="cursor-grab shrink-0 rounded p-0.5 text-zinc-600 hover:bg-white/10 hover:text-zinc-300 active:cursor-grabbing"
                                    onClick={(e) => e.stopPropagation()}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData("text/plain", String(idx));
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => setLayerDragOverIdx(null)}
                                  >
                                    <GripVertical size={14} strokeWidth={2} />
                                  </button>
                                  <button
                                    type="button"
                                    title={visOff ? "Mostrar" : "Ocultar"}
                                    className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLayerObjectVisibility(o);
                                    }}
                                  >
                                    {visOff ? (
                                      <EyeOff size={14} strokeWidth={2} />
                                    ) : (
                                      <Eye size={14} strokeWidth={2} />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    title={locked ? "Desbloquear" : "Bloquear"}
                                    className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLayerObjectLock(o);
                                    }}
                                  >
                                    {locked ? (
                                      <Lock size={14} strokeWidth={2} />
                                    ) : (
                                      <Unlock size={14} strokeWidth={2} />
                                    )}
                                  </button>
                                  <span className="shrink-0">
                                    <IndesignLayerRowIcon o={o} />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-left">
                                    {indesignLayerDisplayName(o)}
                                  </span>
                                  <button
                                    type="button"
                                    title="Eliminar"
                                    className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeLayerObject(o);
                                    }}
                                  >
                                    <Trash2 size={14} strokeWidth={2} />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable]">
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Grid3x3 className="h-3.5 w-3.5 text-cyan-200/70" strokeWidth={2} />
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Cuadrícula</p>
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(e.target.checked)}
                    />
                    Mostrar rejilla
                  </label>
                  <label className="mt-2 block text-[9px] font-medium text-zinc-500">Paso (px)</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/12 bg-zinc-950/80 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/25"
                    value={gridStep}
                    onChange={(e) => setGridStep(Number(e.target.value))}
                  >
                    {[8, 12, 16, 24, 32, 48].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Pliego activo</p>
                  <label className="mt-2 block text-[9px] font-medium text-zinc-500">Preset</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/12 bg-zinc-950/80 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/25"
                    value={activePage?.format ?? "a4v"}
                    onChange={(e) => {
                      const id = e.target.value as IndesignPageFormatId;
                      patchActivePage({
                        format: id,
                        customWidth: undefined,
                        customHeight: undefined,
                      });
                    }}
                  >
                    {INDESIGN_PAGE_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-medium text-zinc-500">Ancho</label>
                      <ScrubNumberInput
                        title="Arrastra en horizontal para cambiar. Mayús = más rápido."
                        className="mt-0.5 w-full rounded-lg border border-white/12 bg-zinc-950/80 px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-amber-500/25"
                        value={pageDims.width}
                        min={32}
                        max={8192}
                        step={1}
                        roundFn={Math.round}
                        onKeyboardCommit={(n) => {
                          const v = Math.min(
                            8192,
                            Math.max(32, Number.isFinite(n) ? Math.round(n) : pageDims.width),
                          );
                          patchActivePage({ customWidth: v, customHeight: pageDims.height });
                        }}
                        onScrubLive={(n) => {
                          const v = Math.min(8192, Math.max(32, n));
                          patchActivePageSilent({ customWidth: v, customHeight: pageDims.height });
                        }}
                        onScrubEnd={endPageDimScrubGesture}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-medium text-zinc-500">Alto</label>
                      <ScrubNumberInput
                        title="Arrastra en horizontal para cambiar. Mayús = más rápido."
                        className="mt-0.5 w-full rounded-lg border border-white/12 bg-zinc-950/80 px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-amber-500/25"
                        value={pageDims.height}
                        min={32}
                        max={8192}
                        step={1}
                        roundFn={Math.round}
                        onKeyboardCommit={(n) => {
                          const v = Math.min(
                            8192,
                            Math.max(32, Number.isFinite(n) ? Math.round(n) : pageDims.height),
                          );
                          patchActivePage({ customWidth: pageDims.width, customHeight: v });
                        }}
                        onScrubLive={(n) => {
                          const v = Math.min(8192, Math.max(32, n));
                          patchActivePageSilent({ customWidth: pageDims.width, customHeight: v });
                        }}
                        onScrubEnd={endPageDimScrubGesture}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Intercambiar ancho y alto (horizontal ↔ vertical)"
                    onClick={() =>
                      patchActivePage({
                        customWidth: pageDims.height,
                        customHeight: pageDims.width,
                      })
                    }
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] py-1.5 text-[10px] font-semibold text-zinc-300 transition hover:bg-white/10"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Intercambiar orientación
                  </button>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                  <Layers className="h-3.5 w-3.5 text-amber-200/70" strokeWidth={2} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Páginas</p>
                </div>
                {pages.map((p, i) => {
                  const pd = getPageDimensions(p);
                  const pf = formatById(p.format);
                  const maxThumb = 44;
                  const tw =
                    pd.width >= pd.height ? maxThumb : Math.round((maxThumb * pd.width) / pd.height);
                  const th =
                    pd.height >= pd.width ? maxThumb : Math.round((maxThumb * pd.height) / pd.width);
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActivePageIndex(i);
                        }
                      }}
                      className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-2.5 transition ${
                        i === activePageIndex
                          ? "border-amber-400/40 bg-gradient-to-b from-amber-950/40 to-zinc-950/60 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
                          : "border-white/[0.08] bg-black/25 hover:border-white/18 hover:bg-black/35"
                      }`}
                      onClick={() => setActivePageIndex(i)}
                    >
                      <div className="flex h-[3.25rem] w-full items-center justify-center rounded-lg bg-zinc-950/80 ring-1 ring-inset ring-white/[0.06]">
                        <div
                          className="rounded-sm bg-white shadow-md shadow-black/40 ring-1 ring-black/10"
                          style={{ width: tw, height: th }}
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate font-mono text-[10px] font-semibold text-zinc-300">
                          {i + 1}. {pf.label}
                        </span>
                        <span className="text-[9px] text-zinc-600">
                          {pd.width}×{pd.height}
                        </span>
                      </div>
                      {pages.length > 1 && (
                        <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                          <button
                            type="button"
                            title="Subir página"
                            disabled={i === 0}
                            className="rounded-md p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-25"
                            onClick={(e) => {
                              e.stopPropagation();
                              movePage(i, i - 1);
                            }}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Bajar página"
                            disabled={i === pages.length - 1}
                            className="rounded-md p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-25"
                            onClick={(e) => {
                              e.stopPropagation();
                              movePage(i, i + 1);
                            }}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Eliminar página"
                            className="rounded-md p-0.5 text-zinc-500 hover:bg-rose-500/25 hover:text-rose-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePage(i);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAddPageOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/18 bg-white/[0.02] py-2.5 text-[11px] font-semibold text-zinc-500 transition hover:border-amber-400/35 hover:bg-amber-500/5 hover:text-zinc-300"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Añadir página
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      <input
        ref={placeImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = "";
          const uid = placeImageTargetUidRef.current;
          if (!f || !uid) return;
          const url = URL.createObjectURL(f);
          await canvasApi.placeImageInFrame(uid, url);
        }}
      />

      {frameCtx ? (
        <>
          <div
            className="fixed inset-0 z-[20060]"
            aria-hidden
            onMouseDown={() => setFrameCtx(null)}
          />
          <div
            className="fixed z-[20070] min-w-[13.5rem] rounded-xl border border-white/12 bg-[#14141c] py-1.5 text-[11px] shadow-2xl shadow-black/50"
            style={{
              left: Math.min(frameCtx.clientX, typeof window !== "undefined" ? window.innerWidth - 220 : frameCtx.clientX),
              top: frameCtx.clientY,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-white/[0.06]"
              onClick={() => {
                placeImageTargetUidRef.current = frameCtx.frameUid;
                placeImageInputRef.current?.click();
                setFrameCtx(null);
              }}
            >
              Colocar imagen dentro
            </button>
            {frameCtx.hasImage ? (
              <>
                <div className="my-1 border-t border-white/[0.06]" />
                <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                  Ajuste
                </p>
                {IMG_FIT_OPTIONS.map((o) => (
                  <button
                    key={o.value + o.label}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-white/[0.06]"
                    onClick={() => {
                      const c = canvasApi.getCanvas();
                      if (!c) return;
                      const next = applyFittingModeToImageFrame(c, frameCtx.frameUid, o.value, imageFrames);
                      handlePagePatch({
                        fabricJSON: c.toObject(SERIAL) as Record<string, unknown>,
                        imageFrames: next,
                      });
                      setFrameCtx(null);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
                <div className="my-1 border-t border-white/[0.06]" />
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-white/[0.06]"
                  onClick={() => {
                    const c = canvasApi.getCanvas();
                    if (!c) return;
                    const next = clearImageFrameContent(c, frameCtx.frameUid, imageFrames);
                    handlePagePatch({
                      fabricJSON: c.toObject(SERIAL) as Record<string, unknown>,
                      imageFrames: next,
                    });
                    setFrameCtx(null);
                  }}
                >
                  Eliminar imagen
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {addPageOpen && (
        <div
          className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-[#12121a] p-5 shadow-2xl shadow-black/60 ring-1 ring-white/[0.06]">
            <p className="text-sm font-bold tracking-tight text-zinc-100">Formato de página</p>
            <p className="mt-1 text-[11px] text-zinc-500">Elige el tamaño del nuevo pliego.</p>
            <div className="mt-4 space-y-2">
              {INDESIGN_PAGE_FORMATS.map((f) => (
                <label
                  key={f.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${
                    pendingFormat === f.id
                      ? "border-amber-400/40 bg-amber-500/10 text-zinc-100"
                      : "border-white/[0.08] bg-black/20 text-zinc-400 hover:border-white/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="fmt"
                    className="accent-amber-500"
                    checked={pendingFormat === f.id}
                    onChange={() => setPendingFormat(f.id)}
                  />
                  <span>
                    {f.label}{" "}
                    <span className="text-zinc-600">
                      ({f.width}×{f.height})
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                onClick={() => setAddPageOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-b from-amber-500 to-orange-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-amber-950/40"
                onClick={addPage}
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
});

function TextFramePortsOverlay({
  areaRef,
  getCanvas,
  canvasSubscriptionKey,
  layouts,
  framesById,
  storiesById,
  onOverflowOutClick,
  onOverflowOutDoubleClick,
}: {
  areaRef: React.RefObject<HTMLDivElement | null>;
  getCanvas: () => FabricCanvas | null;
  /** Al cambiar de página se recrea el canvas; hay que volver a suscribirse a `after:render`. */
  canvasSubscriptionKey: string;
  layouts: FrameLayout[];
  framesById: Map<string, TextFrame>;
  storiesById: Map<string, Story>;
  onOverflowOutClick: (frameId: string) => void;
  onOverflowOutDoubleClick: (frameId: string) => void;
}) {
  const [, setViewportTick] = useState(0);
  const linkClickDelayRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | null = null;

    const bump = () => setViewportTick((n) => n + 1);

    const tryAttach = (): boolean => {
      const c = getCanvas();
      if (!c || cancelled) return false;
      c.on("after:render", bump);
      off = () => c.off("after:render", bump);
      bump();
      return true;
    };

    const rafTry = () => {
      if (cancelled) return;
      if (tryAttach()) return;
      requestAnimationFrame(rafTry);
    };
    rafTry();

    const onResize = () => bump();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      off?.();
    };
  }, [getCanvas, canvasSubscriptionKey]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
      {layouts.map((lay) => {
        const fr = framesById.get(lay.frameId);
        const story = storiesById.get(lay.storyId);
        if (!fr || !story) return null;
        const ord = story.frames.indexOf(lay.frameId);
        const showIn = ord > 0;
        const hasLinkedNext = ord >= 0 && ord < story.frames.length - 1;
        const area = areaRef.current;
        const canvas = getCanvas();
        let inStyle: React.CSSProperties | undefined;
        let outStyle: React.CSSProperties | undefined;
        if (area && canvas) {
          if (showIn) {
            const p = scenePointToAreaPixels(canvas, area, fr.x, fr.y);
            inStyle = { left: p.left, top: p.top };
          }
          const pOut = scenePointToAreaPixels(canvas, area, fr.x + fr.width, fr.y + fr.height);
          outStyle = { left: pOut.left, top: pOut.top };
        } else {
          if (showIn) inStyle = { left: fr.x, top: fr.y };
          outStyle = { left: fr.x + fr.width, top: fr.y + fr.height };
        }
        return (
          <React.Fragment key={lay.frameId}>
            {showIn ? (
              <div
                className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-slate-500/85 shadow-sm"
                style={inStyle}
                title="Entrada de flujo"
              />
            ) : null}
            {lay.hasOverflow ? (
              hasLinkedNext ? (
                <div
                  className="pointer-events-none absolute flex h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-800/70 text-[10px] font-bold leading-none text-emerald-100/90 shadow-sm"
                  style={outStyle}
                  title="Flujo ya enlazado al siguiente marco"
                >
                  ↗
                </div>
              ) : (
                <button
                  type="button"
                  className="pointer-events-auto absolute flex h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-rose-300/50 bg-rose-600 text-[10px] font-bold leading-none text-white shadow-md hover:bg-rose-500"
                  style={outStyle}
                  title="Doble clic: nuevo marco aquí. Clic: enlazar con otro marco o vacío."
                  onClick={(e) => {
                    e.stopPropagation();
                    const id = lay.frameId;
                    if (e.detail === 2) {
                      const t = linkClickDelayRef.current.get(id);
                      if (t) {
                        clearTimeout(t);
                        linkClickDelayRef.current.delete(id);
                      }
                      onOverflowOutDoubleClick(id);
                      return;
                    }
                    if (e.detail !== 1) return;
                    const prev = linkClickDelayRef.current.get(id);
                    if (prev) clearTimeout(prev);
                    const to = window.setTimeout(() => {
                      linkClickDelayRef.current.delete(id);
                      onOverflowOutClick(id);
                    }, 320);
                    linkClickDelayRef.current.set(id, to);
                  }}
                >
                  +
                </button>
              )
            ) : (
              <div
                className="absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-white/15 bg-zinc-600/75"
                style={outStyle}
                title="Sin desbordamiento"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ToolBtn({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`rounded-xl p-2 transition ${
        active
          ? "bg-gradient-to-b from-amber-500/45 to-amber-700/35 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-amber-400/35"
          : "text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
