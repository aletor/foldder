"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Canvas as FabricCanvas, FabricObject, Group as FabricGroup } from "fabric";
import { Point, util } from "fabric";
import { isFabricActiveSelection } from "./fabric-active-selection";
import { INDESIGN_PAD } from "./page-formats";
import { syncIndesignPageBackground, INDESIGN_PAGE_BG_SERIAL_PROPS } from "./indesign-page-background";
import { INDESIGN_CUSTOM_PROPS } from "./types";
import type { Story, TextFrame } from "./text-model";
import { serializeStoryContent } from "./text-model";
import { layoutPageStories } from "./text-layout";
import {
  appendTextFrameAfter,
  createStoryWithFrame,
  deleteTextFrame,
  findFollowUpFrameRect,
  patchStoryContentPlain,
  updateTextFrameGeometry,
} from "./text-threading";
import {
  removeAllTextFrameFabric,
  syncLayoutsToFabric,
  type TextFrameFabricRegistry,
} from "./text-fabric-renderer";

const EXTRA_PROPS = [
  ...INDESIGN_CUSTOM_PROPS,
  "indesignUid",
  "frameUid",
  "lineIndex",
  ...INDESIGN_PAGE_BG_SERIAL_PROPS,
];

function uid() {
  return `ind_${Math.random().toString(36).slice(2, 12)}`;
}

function stripLegacyTextObjects(json: Record<string, unknown>): Record<string, unknown> {
  const objs = json.objects as Record<string, unknown>[] | undefined;
  if (!objs) return json;
  const filtered = objs.filter((o) => {
    const t = o.indesignType as string | undefined;
    if (
      t === "text" ||
      t === "textOut" ||
      t === "textFrameHit" ||
      t === "textLine"
    ) {
      return false;
    }
    return true;
  });
  return { ...json, objects: filtered };
}

/** Posiciona un textarea fijo alineado al marco de texto en coordenadas de pantalla. */
function positionInlineTextarea(canvas: FabricCanvas, ta: HTMLTextAreaElement, fr: TextFrame): void {
  const vpt = canvas.viewportTransform;
  if (!vpt) return;
  const upper = canvas.upperCanvasEl;
  const box = upper.getBoundingClientRect();
  const gw = canvas.getWidth();
  const gh = canvas.getHeight();
  const tl = util.transformPoint(new Point(fr.x, fr.y), vpt);
  const br = util.transformPoint(new Point(fr.x + fr.width, fr.y + fr.height), vpt);
  const minX = Math.min(tl.x, br.x);
  const minY = Math.min(tl.y, br.y);
  const maxX = Math.max(tl.x, br.x);
  const maxY = Math.max(tl.y, br.y);
  const sx = box.width / gw;
  const sy = box.height / gh;
  ta.style.position = "fixed";
  ta.style.left = `${box.left + minX * sx}px`;
  ta.style.top = `${box.top + minY * sy}px`;
  ta.style.width = `${(maxX - minX) * sx}px`;
  ta.style.height = `${(maxY - minY) * sy}px`;
  ta.style.zIndex = "20060";
  ta.style.boxSizing = "border-box";
}

export type IndesignTool = "select" | "text" | "frame";

export type IndesignCanvasApi = {
  getCanvas: () => FabricCanvas | null;
  toJSON: () => Record<string, unknown>;
  /** Desplaza el viewport de Fabric (mano / espacio). */
  panViewportBy: (dx: number, dy: number) => void;
  /** Encaja el lienzo completo en el host (mismo criterio que doble clic en vacío). */
  resetViewportFit: () => void;
};

type UseIndesignCanvasOpts = {
  hostRef: React.RefObject<HTMLDivElement | null>;
  pageKey: string;
  pageWidth: number;
  pageHeight: number;
  getPageSnapshot: React.MutableRefObject<() => Record<string, unknown> | null>;
  tool: IndesignTool;
  onJSONChange: (json: Record<string, unknown>) => void;
  onSelectionChange: (obj: FabricObject | null) => void;
  stories: Story[];
  textFrames: TextFrame[];
  onTextModelChange: (next: { stories: Story[]; textFrames: TextFrame[] }) => void;
  linkingMode: boolean;
  onLinkTargetFrame: (frameId: string) => void;
  onLinkEmptyCanvas: (point: { x: number; y: number }) => void;
  /** Tras soltar el dibujo de un marco de texto (herramienta T), p. ej. volver a Selección. */
  onAfterTextFrameDraw?: () => void;
};

export function useIndesignCanvas(opts: UseIndesignCanvasOpts): IndesignCanvasApi {
  const {
    hostRef,
    pageKey,
    pageWidth,
    pageHeight,
    getPageSnapshot,
    tool,
    onJSONChange,
    onSelectionChange,
    stories,
    textFrames,
    onTextModelChange,
    linkingMode,
    onLinkTargetFrame,
    onLinkEmptyCanvas,
    onAfterTextFrameDraw,
  } = opts;

  const canvasRef = useRef<FabricCanvas | null>(null);
  const fabricRef = useRef<typeof import("fabric") | null>(null);
  const textRegistryRef = useRef<TextFrameFabricRegistry>(new Map());
  const drawRef = useRef<{ active: boolean; x: number; y: number } | null>(null);
  const toolRef = useRef(tool);
  const linkingRef = useRef(linkingMode);
  const storiesRef = useRef(stories);
  const textFramesRef = useRef(textFrames);
  const onJSONChangeRef = useRef(onJSONChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onTextModelChangeRef = useRef(onTextModelChange);
  const onLinkTargetFrameRef = useRef(onLinkTargetFrame);
  const onLinkEmptyCanvasRef = useRef(onLinkEmptyCanvas);
  const onAfterTextFrameDrawRef = useRef(onAfterTextFrameDraw);
  const editingFrameIdRef = useRef<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  toolRef.current = tool;
  linkingRef.current = linkingMode;
  storiesRef.current = stories;
  textFramesRef.current = textFrames;
  onJSONChangeRef.current = onJSONChange;
  onSelectionChangeRef.current = onSelectionChange;
  onTextModelChangeRef.current = onTextModelChange;
  onLinkTargetFrameRef.current = onLinkTargetFrame;
  onLinkEmptyCanvasRef.current = onLinkEmptyCanvas;
  onAfterTextFrameDrawRef.current = onAfterTextFrameDraw;

  const emitChange = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    onJSONChangeRef.current(c.toObject(EXTRA_PROPS) as Record<string, unknown>);
  }, []);

  const paintTextFromModel = useCallback(() => {
    const c = canvasRef.current;
    const fabric = fabricRef.current;
    if (!c || !fabric) return;
    const layouts = layoutPageStories(storiesRef.current, textFramesRef.current);
    syncLayoutsToFabric(
      c,
      fabric,
      layouts,
      storiesRef.current,
      textFramesRef.current,
      textRegistryRef.current,
    );
    emitChange();
    const fid = editingFrameIdRef.current;
    const ta = editTextareaRef.current;
    if (fid && ta) {
      const fr = textFramesRef.current.find((f) => f.id === fid);
      if (fr) positionInlineTextarea(c, ta, fr);
    }
  }, [emitChange]);

  const paintTextFromModelRef = useRef(paintTextFromModel);
  paintTextFromModelRef.current = paintTextFromModel;

  const panViewportBy = useCallback((dx: number, dy: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const v = c.viewportTransform;
    if (!v) return;
    v[4] += dx;
    v[5] += dy;
    c.setViewportTransform(v);
    c.requestRenderAll();
    const fid = editingFrameIdRef.current;
    const ta = editTextareaRef.current;
    if (fid && ta) {
      const fr = textFramesRef.current.find((f) => f.id === fid);
      if (fr) positionInlineTextarea(c, ta, fr);
    }
  }, []);

  const resetViewportFit = useCallback(() => {
    const c = canvasRef.current;
    const host = hostRef.current;
    if (!c || !host) return;
    const cw = c.getWidth();
    const ch = c.getHeight();
    const rw = host.clientWidth;
    const rh = host.clientHeight;
    if (rw < 1 || rh < 1) return;
    const z = Math.min(rw / cw, rh / ch);
    const tx = (rw - cw * z) / 2;
    const ty = (rh - ch * z) / 2;
    c.setViewportTransform([z, 0, 0, z, tx, ty]);
    c.requestRenderAll();
    const fid = editingFrameIdRef.current;
    const ta = editTextareaRef.current;
    if (fid && ta) {
      const fr = textFramesRef.current.find((f) => f.id === fid);
      if (fr) positionInlineTextarea(c, ta, fr);
    }
  }, []);

  const resetViewportFitRef = useRef(resetViewportFit);
  resetViewportFitRef.current = resetViewportFit;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !pageKey) return;

    let disposed = false;
    let cleanupDrop: (() => void) | undefined;
    let cleanupWheelZoom: (() => void) | undefined;
    let cleanupWindows: (() => void) | undefined;

    (async () => {
      const fabric = await import("fabric");
      if (disposed || !hostRef.current) return;
      fabricRef.current = fabric;
      const { Canvas, Rect, FabricImage } = fabric;

      const cw = pageWidth + INDESIGN_PAD * 2;
      const ch = pageHeight + INDESIGN_PAD * 2;

      const el = document.createElement("canvas");
      host.innerHTML = "";
      host.appendChild(el);

      const canvas = new Canvas(el, {
        width: cw,
        height: ch,
        backgroundColor: "#2a2a32",
        preserveObjectStacking: true,
        /** Esquinas: ancho/alto independientes (Mayús = proporción, ver uniScaleKey). */
        uniformScaling: false,
        /** Solo con herramienta Selección: si T/F está activa, evita el rectángulo de selección múltiple de Fabric compitiendo con el dibujo de marcos (creaba cajas vacías al multiseleccionar). */
        selection: toolRef.current === "select",
        selectionKey: "shiftKey",
      });
      canvasRef.current = canvas;
      const upper = canvas.upperCanvasEl;

      function addFrame(left: number, top: number, w: number, h: number) {
        const frame = new Rect({
          left,
          top,
          width: Math.max(24, w),
          height: Math.max(24, h),
          fill: "rgba(0,0,0,0.02)",
          stroke: "#6b7280",
          strokeWidth: 1,
          strokeDashArray: [5, 4],
          originX: "left",
          originY: "top",
        });
        frame.set({
          indesignType: "frame",
          indesignUid: uid(),
          hasImage: false,
          imageFit: "fill",
          opacity: 1,
        });
        canvas.add(frame);
        canvas.setActiveObject(frame);
        canvas.requestRenderAll();
        emitChange();
      }

      async function attachImageToFrame(frame: FabricObject, url: string) {
        const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
        const fw = (frame.width || 1) * (frame.scaleX || 1);
        const fh = (frame.height || 1) * (frame.scaleY || 1);
        const fl = frame.left || 0;
        const ft = frame.top || 0;
        const iw = img.width || 1;
        const ih = img.height || 1;
        const fit = (frame.get("imageFit") as string) || "fill";
        let scale = 1;
        let offX = 0;
        let offY = 0;
        if (fit === "fill") {
          scale = Math.max(fw / iw, fh / ih);
          offX = (fw - iw * scale) / 2;
          offY = (fh - ih * scale) / 2;
        } else if (fit === "fit") {
          scale = Math.min(fw / iw, fh / ih);
          offX = (fw - iw * scale) / 2;
          offY = (fh - ih * scale) / 2;
        } else {
          scale = 1;
          offX = (fw - iw) / 2;
          offY = (fh - ih) / 2;
        }
        img.set({
          left: fl + offX,
          top: ft + offY,
          scaleX: scale,
          scaleY: scale,
          originX: "left",
          originY: "top",
          indesignType: "frameImage",
          indesignUid: uid(),
          frameUid: frame.get("indesignUid"),
        });
        const clip = new Rect({
          left: fl,
          top: ft,
          width: fw,
          height: fh,
          absolutePositioned: true,
        });
        img.clipPath = clip;
        canvas.add(img);
        frame.set({ hasImage: true });
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        emitChange();
      }

      function closeInlineTextEdit(save: boolean) {
        const fid = editingFrameIdRef.current;
        const ta = editTextareaRef.current;
        if (!fid || !ta) return;
        const story = storiesRef.current.find((s) => s.frames.includes(fid));
        editingFrameIdRef.current = null;
        editTextareaRef.current = null;
        const plain = ta.value;
        ta.remove();
        if (save && story) {
          const nextStories = patchStoryContentPlain(storiesRef.current, story.id, plain);
          storiesRef.current = nextStories;
          onTextModelChangeRef.current({
            stories: nextStories,
            textFrames: textFramesRef.current,
          });
        }
        paintTextFromModelRef.current();
      }

      function openInlineTextEdit(frameId: string) {
        closeInlineTextEdit(true);
        const fr = textFramesRef.current.find((f) => f.id === frameId);
        const story = storiesRef.current.find((s) => s.id === fr?.storyId);
        if (!fr || !story) return;

        const ta = document.createElement("textarea");
        ta.dataset.indesignInlineText = "1";
        ta.value = serializeStoryContent(story.content);
        const typo = story.typography;
        ta.style.margin = "0";
        ta.style.padding = `${Math.min(8, Math.max(4, typo.fontSize * 0.28))}px`;
        ta.style.border = "1px solid rgba(251, 191, 36, 0.55)";
        ta.style.borderRadius = "4px";
        ta.style.background = "rgba(255,255,255,0.97)";
        ta.style.color = typo.color;
        ta.style.fontFamily = typo.fontFamily;
        ta.style.fontSize = `${typo.fontSize}px`;
        ta.style.lineHeight = String(typo.lineHeight);
        ta.style.letterSpacing = `${typo.letterSpacing}em`;
        ta.style.outline = "none";
        ta.style.resize = "none";
        ta.spellcheck = false;

        document.body.appendChild(ta);
        editingFrameIdRef.current = frameId;
        editTextareaRef.current = ta;
        positionInlineTextarea(canvas, ta, fr);

        ta.addEventListener("blur", () => closeInlineTextEdit(true));
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeInlineTextEdit(false);
          }
          e.stopPropagation();
        });

        requestAnimationFrame(() => {
          ta.focus();
          ta.select();
        });
      }

      function syncInlineTextareaLayout() {
        const fid = editingFrameIdRef.current;
        const ta = editTextareaRef.current;
        if (!fid || !ta) return;
        const fr = textFramesRef.current.find((f) => f.id === fid);
        if (!fr) return;
        positionInlineTextarea(canvas, ta, fr);
      }

      function syncInlineAfterViewport(): void {
        const fid = editingFrameIdRef.current;
        const ta = editTextareaRef.current;
        const c = canvasRef.current;
        if (!fid || !ta || !c) return;
        const fr = textFramesRef.current.find((f) => f.id === fid);
        if (fr) positionInlineTextarea(c, ta, fr);
      }

      const onWinKeyDown = (e: KeyboardEvent) => {
        const ae = document.activeElement as HTMLElement | null;
        const typing =
          !!ae &&
          (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT" || ae.isContentEditable);

        if (
          (e.ctrlKey || e.metaKey) &&
          (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "0")
        ) {
          if (typing) return;
          const c = canvasRef.current;
          if (!c) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "0") {
            resetViewportFitRef.current();
            return;
          }
          const u = c.upperCanvasEl;
          const r = u.getBoundingClientRect();
          const me = new MouseEvent("mousemove", {
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2,
          });
          const p = c.getPointer(me, true);
          const z = c.getZoom();
          const next =
            e.key === "-" ? Math.max(0.05, z / 1.12) : Math.min(24, z * 1.12);
          c.zoomToPoint(new Point(p.x, p.y), next);
          c.requestRenderAll();
          syncInlineAfterViewport();
          return;
        }

        if (e.key !== "Delete" && e.key !== "Backspace") return;
        if (typing) return;
        const c = canvasRef.current;
        if (!c) return;
        const active = c.getActiveObject() as FabricObject | undefined;
        if (!active) return;

        const textHitsFromSelection = (o: FabricObject): FabricObject[] => {
          if (o.get("indesignType") === "textFrameHit") return [o];
          if (isFabricActiveSelection(o)) {
            return (o as FabricGroup)
              .getObjects()
              .filter((x) => x.get("indesignType") === "textFrameHit");
          }
          return [];
        };

        const hits = textHitsFromSelection(active);
        if (hits.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        for (const h of hits) {
          const frameId = h.get("frameId") as string;
          if (editingFrameIdRef.current === frameId) {
            closeInlineTextEdit(true);
          }
        }

        let storiesNext = storiesRef.current;
        let framesNext = textFramesRef.current;
        for (const h of hits) {
          const frameId = h.get("frameId") as string;
          const next = deleteTextFrame(storiesNext, framesNext, frameId);
          storiesNext = next.stories;
          framesNext = next.textFrames;
        }
        storiesRef.current = storiesNext;
        textFramesRef.current = framesNext;
        onTextModelChangeRef.current({ stories: storiesNext, textFrames: framesNext });
        c.discardActiveObject();
        onSelectionChangeRef.current(null);
        c.requestRenderAll();
        paintTextFromModelRef.current();
      };

      const onWinResizeOrScroll = () => syncInlineTextareaLayout();

      const onWheelZoom = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        const pointer = canvas.getPointer(e, true);
        const z = canvas.getZoom();
        const nextZ = Math.min(24, Math.max(0.05, z * Math.pow(0.999, e.deltaY)));
        canvas.zoomToPoint(new Point(pointer.x, pointer.y), nextZ);
        canvas.requestRenderAll();
        syncInlineAfterViewport();
      };

      window.addEventListener("keydown", onWinKeyDown, true);
      window.addEventListener("resize", onWinResizeOrScroll);
      window.addEventListener("scroll", onWinResizeOrScroll, true);
      upper.addEventListener("wheel", onWheelZoom, { passive: false });
      cleanupWheelZoom = () => upper.removeEventListener("wheel", onWheelZoom);
      cleanupWindows = () => {
        window.removeEventListener("keydown", onWinKeyDown, true);
        window.removeEventListener("resize", onWinResizeOrScroll);
        window.removeEventListener("scroll", onWinResizeOrScroll, true);
        cleanupWheelZoom?.();
      };

      canvas.on("mouse:dblclick", (opt) => {
        if (linkingRef.current) return;
        const t = opt.target;
        const isTextHit = t && t.get("indesignType") === "textFrameHit";
        const isPageBg = t && t.get("name") === "indesignPageBg";
        if (!isTextHit && (isPageBg || !t)) {
          opt.e.preventDefault();
          opt.e.stopPropagation();
          resetViewportFitRef.current();
          return;
        }
        if (toolRef.current !== "select") return;
        if (isTextHit) {
          opt.e.preventDefault();
          opt.e.stopPropagation();
          const fid = (t as FabricObject).get("frameId") as string;
          const layouts = layoutPageStories(storiesRef.current, textFramesRef.current);
          const lay = layouts.find((l) => l.frameId === fid);
          const story = storiesRef.current.find((s) => s.frames.includes(fid));
          const ord = story ? story.frames.indexOf(fid) : -1;
          const hasLinkedNext = story != null && ord >= 0 && ord < story.frames.length - 1;
          if (lay?.hasOverflow && !hasLinkedNext) {
            const src = textFramesRef.current.find((f) => f.id === fid);
            if (src) {
              const box = findFollowUpFrameRect(src, textFramesRef.current, pageWidth, pageHeight);
              const next = appendTextFrameAfter(storiesRef.current, textFramesRef.current, fid, {
                ...box,
                padding: src.padding ?? 4,
              });
              onTextModelChangeRef.current(next);
              paintTextFromModelRef.current();
            }
            return;
          }
          openInlineTextEdit(fid);
        }
      });

      canvas.on("after:render", () => {
        if (!editingFrameIdRef.current) return;
        syncInlineTextareaLayout();
      });

      canvas.on("selection:created", () =>
        onSelectionChangeRef.current(canvas.getActiveObject() ?? null),
      );
      canvas.on("selection:updated", () =>
        onSelectionChangeRef.current(canvas.getActiveObject() ?? null),
      );
      canvas.on("selection:cleared", () => onSelectionChangeRef.current(null));

      canvas.on("object:modified", (e) => {
        const o = e.target;
        if (!o) return;

        if (isFabricActiveSelection(o)) {
          const objs = (o as FabricGroup).getObjects();
          const textHits = objs.filter((obj) => obj.get("indesignType") === "textFrameHit");
          if (textHits.length > 0) {
            let tf = textFramesRef.current;
            for (const hit of textHits) {
              const fid = hit.get("frameId") as string;
              hit.setCoords();
              const box = hit.getBoundingRect();
              tf = updateTextFrameGeometry(tf, fid, {
                x: box.left,
                y: box.top,
                width: Math.max(24, box.width),
                height: Math.max(24, box.height),
              });
            }
            textFramesRef.current = tf;
            onTextModelChangeRef.current({
              stories: storiesRef.current,
              textFrames: tf,
            });
            paintTextFromModel();
          }
          emitChange();
          return;
        }

        if (o.get("indesignType") === "textFrameHit") {
          const fid = o.get("frameId") as string;
          const w = (o.width || 0) * (o.scaleX || 1);
          const h = (o.height || 0) * (o.scaleY || 1);
          const left = o.left || 0;
          const top = o.top || 0;
          const tf = updateTextFrameGeometry(textFramesRef.current, fid, {
            x: left,
            y: top,
            width: Math.max(24, w),
            height: Math.max(24, h),
          });
          textFramesRef.current = tf;
          onTextModelChangeRef.current({
            stories: storiesRef.current,
            textFrames: tf,
          });
          paintTextFromModel();
          return;
        }
        emitChange();
      });

      canvas.on("mouse:down", (opt) => {
        const e = opt.e as MouseEvent;
        const t = opt.target;

        if (t?.get("indesignType") === "textFrameHit" && linkingRef.current) {
          e.preventDefault();
          onLinkTargetFrameRef.current(t.get("frameId") as string);
          return;
        }

        const isPageBg = t?.get("name") === "indesignPageBg";
        if (linkingRef.current && (!t || isPageBg)) {
          const p = canvas.getPointer(e);
          onLinkEmptyCanvasRef.current({ x: p.x, y: p.y });
          return;
        }

        if (toolRef.current === "select") return;

        // Nuevo rectángulo T/F solo desde clic en vacío (sin target). Cualquier objeto bajo el puntero
        // (marcos, líneas, ActiveSelection…) cancela — evita cajas fantasma al multiseleccionar.
        if (t) {
          const hitType = t.get("indesignType") as string | undefined;
          if (
            hitType === "textFrameHit" ||
            hitType === "textLine" ||
            hitType === "frame" ||
            hitType === "frameImage"
          ) {
            return;
          }
          if (isFabricActiveSelection(t)) return;
          return;
        }

        const p = canvas.getPointer(e);
        drawRef.current = { active: true, x: p.x, y: p.y };
      });

      canvas.on("mouse:up", (opt) => {
        const d = drawRef.current;
        if (!d?.active) {
          drawRef.current = null;
          return;
        }
        const e = opt.e as MouseEvent;
        const p = canvas.getPointer(e);
        const x1 = Math.min(d.x, p.x);
        const y1 = Math.min(d.y, p.y);
        const w = Math.abs(p.x - d.x);
        const h = Math.abs(p.y - d.y);
        drawRef.current = null;
        if (w < 4 || h < 4) return;
        const mode = toolRef.current;
        if (mode === "text") {
          const { story, frame } = createStoryWithFrame({
            x: x1,
            y: y1,
            width: w,
            height: h,
            padding: 4,
          });
          onTextModelChangeRef.current({
            stories: [...storiesRef.current, story],
            textFrames: [...textFramesRef.current, frame],
          });
          queueMicrotask(() => onAfterTextFrameDrawRef.current?.());
        }
        if (mode === "frame") addFrame(x1, y1, w, h);
      });

      const onDragOver = (ev: DragEvent) => ev.preventDefault();
      const onDrop = async (ev: DragEvent) => {
        ev.preventDefault();
        let url = "";
        const f = ev.dataTransfer?.files?.[0];
        if (f?.type.startsWith("image/")) url = URL.createObjectURL(f);
        else {
          const txt = ev.dataTransfer?.getData("text/uri-list") || ev.dataTransfer?.getData("text/plain");
          if (txt?.trim().startsWith("http")) url = txt.trim();
        }
        if (!url) return;
        const p = canvas.getScenePoint(ev);
        const objs = canvas.getObjects().filter((o) => o.get("indesignType") === "frame");
        const hit = objs.find((o) => o.containsPoint(p));
        if (hit) await attachImageToFrame(hit, url);
      };
      upper.addEventListener("dragover", onDragOver);
      upper.addEventListener("drop", onDrop);
      cleanupDrop = () => {
        upper.removeEventListener("dragover", onDragOver);
        upper.removeEventListener("drop", onDrop);
      };

      const snap = getPageSnapshot.current?.() ?? null;
      const raw =
        snap && Object.keys(snap).length > 0 ? snap : { objects: [], background: "#2a2a32" };
      const json = stripLegacyTextObjects(raw as Record<string, unknown>);
      await canvas.loadFromJSON(json);
      syncIndesignPageBackground(canvas, Rect, pageWidth, pageHeight);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      removeAllTextFrameFabric(canvas, textRegistryRef.current);
      paintTextFromModel();
      queueMicrotask(() => resetViewportFitRef.current());
    })();

    return () => {
      disposed = true;
      cleanupWindows?.();
      cleanupDrop?.();
      const taUnmount = editTextareaRef.current;
      const fidUnmount = editingFrameIdRef.current;
      if (taUnmount && fidUnmount) {
        const story = storiesRef.current.find((s) => s.frames.includes(fidUnmount));
        if (story) {
          const nextStories = patchStoryContentPlain(storiesRef.current, story.id, taUnmount.value);
          storiesRef.current = nextStories;
          onTextModelChangeRef.current({
            stories: nextStories,
            textFrames: textFramesRef.current,
          });
        }
        taUnmount.remove();
        editingFrameIdRef.current = null;
        editTextareaRef.current = null;
      }
      const c = canvasRef.current;
      if (c) removeAllTextFrameFabric(c, textRegistryRef.current);
      canvasRef.current?.dispose();
      canvasRef.current = null;
      if (host) host.innerHTML = "";
    };
  }, [
    pageKey,
    pageWidth,
    pageHeight,
    hostRef,
    getPageSnapshot,
    emitChange,
    paintTextFromModel,
  ]);

  useEffect(() => {
    storiesRef.current = stories;
    textFramesRef.current = textFrames;
    paintTextFromModel();
  }, [stories, textFrames, paintTextFromModel]);

  useEffect(() => {
    if (!hostRef.current) return;
    hostRef.current.style.cursor = linkingMode ? "crosshair" : "";
  }, [linkingMode, hostRef]);

  /** Mantener coherente: selección múltiple / marco solo con V; con T o F el lienzo no inicia el group selector de Fabric. */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.selection = tool === "select";
  }, [tool]);

  return {
    getCanvas: () => canvasRef.current,
    toJSON: () => {
      const c = canvasRef.current;
      if (!c) return { objects: [] };
      return c.toObject(EXTRA_PROPS) as Record<string, unknown>;
    },
    panViewportBy,
    resetViewportFit,
  };
}
