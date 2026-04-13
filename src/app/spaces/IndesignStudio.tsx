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
  Layers,
  Unlink,
  Grid3x3,
  ArrowLeftRight,
} from "lucide-react";
import type {
  Canvas as FabricCanvas,
  FabricObject,
  FabricImage as FabricImageType,
  Group as FabricGroup,
} from "fabric";
import {
  useIndesignCanvas,
  type IndesignCanvasApi,
  type IndesignTool,
} from "./indesign/useIndesignCanvas";
import type { IndesignPageState, Story, TextFrame, Typography } from "./indesign/types";
import {
  appendTextFrameAfter,
  findFollowUpFrameRect,
  linkFrameAfter,
  unlinkFrameAt,
  updateStoryTypography,
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

  const exportMenuRef = useRef<HTMLDivElement>(null);
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

  const handleJSONChange = useCallback(
    (json: Record<string, unknown>) => {
      commitPages((prev) => {
        const next = [...prev];
        if (!next[activePageIndex]) return prev;
        next[activePageIndex] = { ...next[activePageIndex], fabricJSON: json };
        return next;
      });
    },
    [activePageIndex, commitPages],
  );

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
    pageKey: activePage?.id ?? "p",
    pageWidth: pageDims.width,
    pageHeight: pageDims.height,
    getPageSnapshot: getPageSnapshotRef,
    tool,
    onJSONChange: handleJSONChange,
    onSelectionChange: setSelected,
    stories,
    textFrames,
    onTextModelChange: handleTextModelChange,
    linkingMode: linkingFlow,
    onLinkTargetFrame,
    onLinkEmptyCanvas,
    onAfterTextFrameDraw: () => setTool("select"),
  });
  canvasApiRef.current = canvasApi;

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redoStudio();
        else undoStudio();
        return;
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
  const selectedFrameImg =
    selected && (selected as FabricObject).get?.("indesignType") === "frameImage"
      ? (selected as FabricImageType)
      : null;

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
    ...INDESIGN_PAGE_BG_SERIAL_PROPS,
  ];

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
        const { FabricImage } = await import("fabric");
        const old = o as FabricImageType;
        const next = await FabricImage.fromURL(patch.src, { crossOrigin: "anonymous" });
        next.set({
          left: old.left,
          top: old.top,
          originX: old.originX,
          originY: old.originY,
          opacity: old.opacity,
          angle: old.angle,
          indesignType: "frameImage",
          indesignUid: old.get("indesignUid"),
          frameUid: old.get("frameUid"),
          scaleX: old.scaleX,
          scaleY: old.scaleY,
        });
        next.clipPath = old.clipPath;
        c.remove(old);
        c.add(next);
        c.setActiveObject(next);
        c.requestRenderAll();
        handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
        return;
      }
      o.set(patch);
      c.requestRenderAll();
      handleJSONChange(c.toObject(SERIAL) as Record<string, unknown>);
    },
    [canvasApi, handleJSONChange],
  );

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
        <aside className="flex w-[13.5rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/[0.07] bg-[#101018]/95 p-3 backdrop-blur-sm sm:w-52">
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
                    const v = Math.min(8192, Math.max(32, Number.isFinite(n) ? Math.round(n) : pageDims.width));
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
                    const v = Math.min(8192, Math.max(32, Number.isFinite(n) ? Math.round(n) : pageDims.height));
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
                  <button
                    type="button"
                    title="Eliminar página"
                    className="absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/25 hover:text-rose-200 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(i);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
        </aside>

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

        <aside className="w-[17.5rem] shrink-0 overflow-y-auto border-l border-white/[0.07] bg-[#101018]/95 p-3.5 backdrop-blur-sm sm:w-72">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Propiedades</p>
          {!selected && (
            <div className="mt-6 rounded-xl border border-white/[0.06] bg-black/20 p-4 text-center">
              <p className="text-xs leading-relaxed text-zinc-500">
                Selecciona texto o imagen en el lienzo para editar.
              </p>
            </div>
          )}

          {selectedTextFrameHit && selectedTypo && selectedStory && (
            <div className="mt-4 space-y-3 rounded-xl border border-white/[0.07] bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-xs font-semibold text-amber-100/90">Texto (historia)</p>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                El contenido vive en la historia; los marcos solo muestran el flujo. Desbordamiento: puerto
                OUT (rojo +). Clic en OUT y luego en otro marco o en vacío.
              </p>
              <label className="block text-[10px] font-medium text-zinc-500">Contenido</label>
              <textarea
                className="min-h-[120px] w-full resize-y rounded-lg border border-white/12 bg-zinc-950/80 px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/25"
                value={serializeStoryContent(selectedStory.content)}
                onChange={(e) => onStoryPlainChange(e.target.value)}
                spellCheck={false}
              />
              {canUnlinkText ? (
                <button
                  type="button"
                  onClick={onUnlinkSelectedFrame}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] py-2 text-[11px] font-bold text-zinc-200 transition hover:bg-white/10"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Romper enlace entrante
                </button>
              ) : null}
              <p className="text-xs font-semibold text-amber-100/90">Tipografía</p>
              <label className="block text-[10px] font-medium text-zinc-500">Familia</label>
              <select
                className="w-full rounded-lg border border-white/12 bg-zinc-950/80 px-2.5 py-2 text-xs text-zinc-100 outline-none ring-amber-500/0 transition focus:ring-2 focus:ring-amber-500/30"
                value={(selectedTypo.fontFamily || "Inter").split(",")[0].replace(/['"]/g, "").trim()}
                onChange={(e) =>
                  applyTextTypography({ fontFamily: `${e.target.value}, sans-serif` })
                }
              >
                {GOOGLE_FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <label className="block text-[10px] font-medium text-zinc-500">Tamaño</label>
              <ScrubNumberInput
                title="Arrastra en horizontal para cambiar. Mayús = más rápido."
                className="w-full rounded-lg border border-white/12 bg-zinc-950/80 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500/25"
                value={Math.round(selectedTypo.fontSize || 16)}
                min={6}
                max={400}
                step={1}
                roundFn={Math.round}
                onKeyboardCommit={(n) => {
                  const v = Math.min(400, Math.max(6, Number.isFinite(n) ? n : 16));
                  applyTextTypography({ fontSize: v });
                }}
                onScrubLive={(n) => {
                  const v = Math.min(400, Math.max(6, n));
                  applyTextTypographySilent({ fontSize: v });
                }}
                onScrubEnd={endTypographyScrubGesture}
              />
              <label className="block text-[10px] font-medium text-zinc-500">Interlineado</label>
              <ScrubNumberInput
                title="Arrastra en horizontal para cambiar. Mayús = más rápido."
                step={0.05}
                roundFn={(x) => Math.round(x * 100) / 100}
                className="w-full rounded-lg border border-white/12 bg-zinc-950/80 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500/25"
                value={selectedTypo.lineHeight ?? 1.25}
                min={0.5}
                max={5}
                onKeyboardCommit={(n) => {
                  const v = Math.min(5, Math.max(0.5, Number.isFinite(n) ? n : 1.25));
                  applyTextTypography({ lineHeight: v });
                }}
                onScrubLive={(n) => {
                  const v = Math.min(5, Math.max(0.5, n));
                  applyTextTypographySilent({ lineHeight: v });
                }}
                onScrubEnd={endTypographyScrubGesture}
              />
              <label className="block text-[10px] font-medium text-zinc-500">Tracking</label>
              <ScrubNumberInput
                title="Arrastra en horizontal para cambiar. Mayús = más rápido."
                step={0.005}
                roundFn={(x) => Math.round(x * 1000) / 1000}
                className="w-full rounded-lg border border-white/12 bg-zinc-950/80 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500/25"
                value={selectedTypo.letterSpacing ?? 0}
                min={-0.5}
                max={2}
                onKeyboardCommit={(n) => {
                  const v = Math.min(2, Math.max(-0.5, Number.isFinite(n) ? n : 0));
                  applyTextTypography({ letterSpacing: v });
                }}
                onScrubLive={(n) => {
                  const v = Math.min(2, Math.max(-0.5, n));
                  applyTextTypographySilent({ letterSpacing: v });
                }}
                onScrubEnd={endTypographyScrubGesture}
              />
              <div className="flex gap-1">
                {(["left", "center", "right", "justify"] as const).map((al) => (
                  <button
                    key={al}
                    type="button"
                    className={`flex-1 rounded-lg px-1 py-1.5 text-[10px] font-bold uppercase transition ${
                      selectedTypo.align === al
                        ? "bg-amber-500/35 text-amber-50 ring-1 ring-amber-400/40"
                        : "bg-black/35 text-zinc-500 hover:bg-black/50"
                    }`}
                    onClick={() => applyTextTypography({ align: al })}
                  >
                    {al[0]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${selectedTypo.fontWeight === "bold" ? "bg-zinc-600 text-white" : "bg-black/35 text-zinc-400 hover:bg-black/50"}`}
                  onClick={() =>
                    applyTextTypography({
                      fontWeight: selectedTypo.fontWeight === "bold" ? "normal" : "bold",
                    })
                  }
                >
                  Negrita
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold italic transition ${selectedTypo.fontStyle === "italic" ? "bg-zinc-600 text-white" : "bg-black/35 text-zinc-400 hover:bg-black/50"}`}
                  onClick={() =>
                    applyTextTypography({
                      fontStyle: selectedTypo.fontStyle === "italic" ? "normal" : "italic",
                    })
                  }
                >
                  Cursiva
                </button>
              </div>
              <label className="block text-[10px] font-medium text-zinc-500">Color</label>
              <input
                type="color"
                className="h-10 w-full cursor-pointer rounded-lg border border-white/12 bg-zinc-950/50"
                value={typeof selectedTypo.color === "string" ? selectedTypo.color : "#111827"}
                onChange={(e) => applyTextTypography({ color: e.target.value })}
              />
            </div>
          )}

          {selectedFrameImg && (
            <div className="mt-4 space-y-3 rounded-xl border border-white/[0.07] bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-xs font-semibold text-amber-100/90">Imagen</p>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                Ajuste fill/fit: vuelve a soltar imagen en el marco o recrea el marco.
              </p>
              <label className="block text-[10px] font-medium text-zinc-500">Opacidad</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="w-full accent-amber-500"
                value={selectedFrameImg.opacity ?? 1}
                onChange={(e) => applyImageProp({ opacity: parseFloat(e.target.value) })}
              />
              <label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-white/18 bg-white/[0.02] px-2 py-3.5 text-center text-[11px] font-medium text-zinc-400 transition hover:border-amber-400/35 hover:bg-amber-500/5 hover:text-zinc-200">
                Reemplazar imagen
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (!f) return;
                    const url = URL.createObjectURL(f);
                    applyImageProp({ src: url });
                  }}
                />
              </label>
            </div>
          )}
        </aside>
      </div>

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
