"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Canvas as FabricCanvas, FabricObject, Group as FabricGroup } from "fabric";
import { Point, util } from "fabric";
import { isFabricActiveSelection } from "./fabric-active-selection";
import { INDESIGN_PAD } from "./page-formats";
import { syncIndesignPageBackground, INDESIGN_PAGE_BG_SERIAL_PROPS } from "./indesign-page-background";
import { INDESIGN_CUSTOM_PROPS } from "./types";
import type { ImageFrameRecord, FrameImageContent } from "./image-frame-model";
import {
  emptyImageFrameRecord,
  getImageFrameRecord,
  legacyFabricImageFitToMode,
  patchImageFrameRecord,
  uidImageContent,
  upsertImageFrameRecord,
} from "./image-frame-model";
import { computeFittingLayout } from "./image-frame-layout";
import {
  applyContentToFabricImage,
  fabricImageToContent,
  frameInnerSize,
  frameOrigin,
  updateImageClipFromFrame,
} from "./image-frame-fabric";
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

export type IndesignTool = "select" | "text" | "frame" | "rect" | "ellipse";

export type IndesignCanvasApi = {
  getCanvas: () => FabricCanvas | null;
  toJSON: () => Record<string, unknown>;
  /** Desplaza el viewport de Fabric (mano / espacio). */
  panViewportBy: (dx: number, dy: number) => void;
  /** Encaja el lienzo completo en el host (mismo criterio que doble clic en vacío). */
  resetViewportFit: () => void;
  /** Coloca o sustituye imagen en el marco (`indesignUid`). */
  placeImageInFrame: (frameUid: string, url: string) => Promise<void>;
};

export type FrameContextMenuDetail = {
  clientX: number;
  clientY: number;
  frameUid: string;
  hasImage: boolean;
};

type UseIndesignCanvasOpts = {
  hostRef: React.RefObject<HTMLDivElement | null>;
  pageKey: string;
  pageWidth: number;
  pageHeight: number;
  getPageSnapshot: React.MutableRefObject<() => Record<string, unknown> | null>;
  tool: IndesignTool;
  /** Actualiza `fabricJSON` y/o `imageFrames` en un solo commit. */
  onPagePatch: (patch: { fabricJSON?: Record<string, unknown>; imageFrames?: ImageFrameRecord[] }) => void;
  imageFrames: ImageFrameRecord[];
  /** Marco cuyo contenido interno se está editando (doble clic); null = solo marco. */
  imageContentEditUid: string | null;
  onImageContentEditChange: (frameUid: string | null) => void;
  onSelectionChange: (obj: FabricObject | null) => void;
  stories: Story[];
  textFrames: TextFrame[];
  onTextModelChange: (next: { stories: Story[]; textFrames: TextFrame[] }) => void;
  linkingMode: boolean;
  onLinkTargetFrame: (frameId: string) => void;
  onLinkEmptyCanvas: (point: { x: number; y: number }) => void;
  /** Tras colocar texto / forma / marco por arrastre, p. ej. volver a Selección. */
  onAfterPlaceDraw?: () => void;
  onFrameContextMenu?: (detail: FrameContextMenuDetail) => void;
};

export function useIndesignCanvas(opts: UseIndesignCanvasOpts): IndesignCanvasApi {
  const {
    hostRef,
    pageKey,
    pageWidth,
    pageHeight,
    getPageSnapshot,
    tool,
    onPagePatch,
    imageFrames,
    imageContentEditUid,
    onImageContentEditChange,
    onSelectionChange,
    stories,
    textFrames,
    onTextModelChange,
    linkingMode,
    onLinkTargetFrame,
    onLinkEmptyCanvas,
    onAfterPlaceDraw,
    onFrameContextMenu,
  } = opts;

  const canvasRef = useRef<FabricCanvas | null>(null);
  const fabricRef = useRef<typeof import("fabric") | null>(null);
  const textRegistryRef = useRef<TextFrameFabricRegistry>(new Map());
  const drawRef = useRef<{ active: boolean; x: number; y: number } | null>(null);
  const toolRef = useRef(tool);
  const linkingRef = useRef(linkingMode);
  const storiesRef = useRef(stories);
  const textFramesRef = useRef(textFrames);
  const imageFramesRef = useRef(imageFrames);
  const onPagePatchRef = useRef(onPagePatch);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onTextModelChangeRef = useRef(onTextModelChange);
  const onLinkTargetFrameRef = useRef(onLinkTargetFrame);
  const onLinkEmptyCanvasRef = useRef(onLinkEmptyCanvas);
  const onAfterPlaceDrawRef = useRef(onAfterPlaceDraw);
  const onImageContentEditChangeRef = useRef(onImageContentEditChange);
  const onFrameContextMenuRef = useRef(onFrameContextMenu);
  const imageContentEditUidRef = useRef<string | null>(null);
  /** Evita bucles al redirigir selección de imagen → marco. */
  const selectionRedirectRef = useRef(false);
  /** Trazo original del marco al resaltar modo contenido (export JSON sin ámbar). */
  const frameStrokeRestoreRef = useRef<Map<string, { stroke: unknown; strokeWidth: number }>>(
    new Map(),
  );
  const editingFrameIdRef = useRef<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachImageToFrameRef = useRef<
    ((frame: FabricObject, url: string) => Promise<void>) | null
  >(null);

  toolRef.current = tool;
  linkingRef.current = linkingMode;
  storiesRef.current = stories;
  textFramesRef.current = textFrames;
  imageFramesRef.current = imageFrames;
  onPagePatchRef.current = onPagePatch;
  onSelectionChangeRef.current = onSelectionChange;
  onTextModelChangeRef.current = onTextModelChange;
  onLinkTargetFrameRef.current = onLinkTargetFrame;
  onLinkEmptyCanvasRef.current = onLinkEmptyCanvas;
  onAfterPlaceDrawRef.current = onAfterPlaceDraw;
  onImageContentEditChangeRef.current = onImageContentEditChange;
  onFrameContextMenuRef.current = onFrameContextMenu;
  imageContentEditUidRef.current = imageContentEditUid;

  useEffect(() => {
    imageFramesRef.current = imageFrames;
  }, [imageFrames]);

  useEffect(() => {
    imageContentEditUidRef.current = imageContentEditUid;
  }, [imageContentEditUid]);

  const fabricJsonForExport = useCallback((): Record<string, unknown> => {
    const c = canvasRef.current;
    if (!c) return { objects: [] };
    const editing = imageContentEditUidRef.current;
    if (editing) {
      const r0 = frameStrokeRestoreRef.current.get(editing);
      const fr = c
        .getObjects()
        .find(
          (o) => o.get("indesignUid") === editing && o.get("indesignType") === "frame",
        ) as FabricObject | undefined;
      if (fr && r0) {
        fr.set({ stroke: r0.stroke, strokeWidth: r0.strokeWidth });
        fr.setCoords();
      }
      const json = c.toObject(EXTRA_PROPS) as Record<string, unknown>;
      if (fr && r0) {
        fr.set({
          stroke: "#f59e0b",
          strokeWidth: Math.max(2, Number(r0.strokeWidth) || 1),
        });
        fr.setCoords();
        c.requestRenderAll();
      }
      return json;
    }
    return c.toObject(EXTRA_PROPS) as Record<string, unknown>;
  }, []);

  const emitPagePatch = useCallback(
    (nextImageFrames?: ImageFrameRecord[]) => {
      const c = canvasRef.current;
      if (!c) return;
      const json = fabricJsonForExport();
      if (nextImageFrames !== undefined) {
        imageFramesRef.current = nextImageFrames;
        onPagePatchRef.current({ fabricJSON: json, imageFrames: nextImageFrames });
      } else {
        onPagePatchRef.current({ fabricJSON: json, imageFrames: imageFramesRef.current });
      }
    },
    [fabricJsonForExport],
  );

  const emitChange = useCallback(() => {
    emitPagePatch();
  }, [emitPagePatch]);

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
      const { Canvas, Rect, Ellipse, FabricImage, Pattern } = fabric;

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

      function mergeImageFramesFromCanvas(): ImageFrameRecord[] {
        const map = new Map(imageFramesRef.current.map((r) => [r.id, { ...r }]));
        for (const o of canvas.getObjects()) {
          if (o.get("indesignType") !== "frame") continue;
          const id = o.get("indesignUid") as string;
          if (!id) continue;
          if (!map.has(id)) {
            map.set(id, emptyImageFrameRecord(id));
          }
          const img = canvas
            .getObjects()
            .find(
              (x) =>
                x.get("indesignType") === "frameImage" && x.get("frameUid") === id,
            ) as FabricObject | undefined;
          if (img && o.get("hasImage")) {
            const prev = map.get(id)!;
            const iw = img.width || 1;
            const ih = img.height || 1;
            const getSrc = (img as unknown as { getSrc?: () => string }).getSrc;
            const src = typeof getSrc === "function" ? getSrc() : "";
            const mode =
              prev.imageContent?.fittingMode ?? legacyFabricImageFitToMode(o.get("imageFit"));
            const ic =
              prev.imageContent ??
              fabricImageToContent(o, img, src || "about:blank", iw, ih, mode);
            map.set(id, {
              ...prev,
              autoFit: prev.autoFit ?? true,
              contentAlignment: prev.contentAlignment ?? "center",
              imageContent: ic,
            });
          }
        }
        return Array.from(map.values());
      }

      function restoreFrameChromeFor(uid: string | null) {
        if (!uid) return;
        const r0 = frameStrokeRestoreRef.current.get(uid);
        const fr = canvas
          .getObjects()
          .find(
            (o) => o.get("indesignUid") === uid && o.get("indesignType") === "frame",
          ) as FabricObject | undefined;
        if (fr && r0) {
          fr.set({ stroke: r0.stroke, strokeWidth: r0.strokeWidth });
          fr.setCoords();
        }
        frameStrokeRestoreRef.current.delete(uid);
      }

      function enterImageContentEdit(uid: string, img: FabricObject) {
        const prev = imageContentEditUidRef.current;
        if (prev && prev !== uid) restoreFrameChromeFor(prev);
        const fr = canvas
          .getObjects()
          .find(
            (o) => o.get("indesignUid") === uid && o.get("indesignType") === "frame",
          ) as FabricObject | undefined;
        if (fr && !frameStrokeRestoreRef.current.has(uid)) {
          frameStrokeRestoreRef.current.set(uid, {
            stroke: fr.stroke,
            strokeWidth: Number(fr.strokeWidth ?? 1),
          });
          fr.set({
            stroke: "#f59e0b",
            strokeWidth: Math.max(2, Number(fr.strokeWidth ?? 1)),
          });
          fr.setCoords();
        }
        onImageContentEditChangeRef.current(uid);
        selectionRedirectRef.current = true;
        canvas.setActiveObject(img);
        selectionRedirectRef.current = false;
        canvas.requestRenderAll();
      }

      function syncImageContentEditFromSelection(active: FabricObject | null) {
        const cur = imageContentEditUidRef.current;
        if (!cur) return;
        if (
          active &&
          active.get("indesignType") === "frameImage" &&
          active.get("frameUid") === cur
        )
          return;
        restoreFrameChromeFor(cur);
        onImageContentEditChangeRef.current(null);
      }

      function redirectFrameImageToFrame(active: FabricObject | null) {
        if (selectionRedirectRef.current) return;
        if (!active || imageContentEditUidRef.current) return;
        if (active.get("indesignType") !== "frameImage") return;
        const frameUid = active.get("frameUid") as string;
        const fr = canvas
          .getObjects()
          .find(
            (o) =>
              o.get("indesignUid") === frameUid && o.get("indesignType") === "frame",
          );
        if (fr) {
          selectionRedirectRef.current = true;
          canvas.setActiveObject(fr);
          selectionRedirectRef.current = false;
        }
      }

      function addFrame(left: number, top: number, w: number, h: number) {
        const patternCanvas = document.createElement("canvas");
        patternCanvas.width = 32;
        patternCanvas.height = 32;
        const pctx = patternCanvas.getContext("2d");
        if (pctx) {
          pctx.fillStyle = "rgba(0,0,0,0.06)";
          pctx.fillRect(0, 0, 32, 32);
          pctx.strokeStyle = "rgba(107,114,128,0.55)";
          pctx.lineWidth = 1.2;
          pctx.beginPath();
          pctx.moveTo(4, 4);
          pctx.lineTo(28, 28);
          pctx.moveTo(28, 4);
          pctx.lineTo(4, 28);
          pctx.stroke();
        }
        const pattern = new Pattern({ source: patternCanvas, repeat: "repeat" });
        const frameUid = uid();
        const frame = new Rect({
          left,
          top,
          width: Math.max(24, w),
          height: Math.max(24, h),
          fill: pattern,
          stroke: "#6b7280",
          strokeWidth: 1,
          strokeDashArray: [5, 4],
          originX: "left",
          originY: "top",
        });
        frame.set({
          indesignType: "frame",
          indesignUid: frameUid,
          hasImage: false,
          imageFit: "fill",
          opacity: 1,
        });
        canvas.add(frame);
        canvas.setActiveObject(frame);
        canvas.requestRenderAll();
        const nextRec = upsertImageFrameRecord(imageFramesRef.current, emptyImageFrameRecord(frameUid));
        emitPagePatch(nextRec);
      }

      function addVectorShapeRect(left: number, top: number, w: number, h: number) {
        const shape = new Rect({
          left,
          top,
          width: Math.max(4, w),
          height: Math.max(4, h),
          fill: "rgba(147, 197, 253, 0.28)",
          stroke: "#60a5fa",
          strokeWidth: 2,
          originX: "left",
          originY: "top",
        });
        shape.set({
          indesignType: "vectorShape",
          shapeKind: "rect",
          indesignUid: uid(),
        });
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.requestRenderAll();
        emitChange();
      }

      function addVectorShapeEllipse(x1: number, y1: number, w: number, h: number) {
        const ww = Math.max(8, w);
        const hh = Math.max(8, h);
        const cx = x1 + ww / 2;
        const cy = y1 + hh / 2;
        const shape = new Ellipse({
          left: cx,
          top: cy,
          originX: "center",
          originY: "center",
          rx: ww / 2,
          ry: hh / 2,
          fill: "rgba(253, 224, 71, 0.22)",
          stroke: "#eab308",
          strokeWidth: 2,
        });
        shape.set({
          indesignType: "vectorShape",
          shapeKind: "ellipse",
          indesignUid: uid(),
        });
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.requestRenderAll();
        emitChange();
      }

      async function attachImageToFrame(frame: FabricObject, url: string) {
        const frameUid = frame.get("indesignUid") as string;
        const baseRec =
          getImageFrameRecord(imageFramesRef.current, frameUid) ?? emptyImageFrameRecord(frameUid);
        let fittingMode =
          baseRec.imageContent?.fittingMode ?? legacyFabricImageFitToMode(frame.get("imageFit"));

        for (const obj of [...canvas.getObjects()]) {
          if (obj.get("indesignType") === "frameImage" && obj.get("frameUid") === frameUid) {
            canvas.remove(obj);
          }
        }

        const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
        const iw = img.width || 1;
        const ih = img.height || 1;

        if (fittingMode === "frame-to-content") {
          frame.set({ width: iw, height: ih, scaleX: 1, scaleY: 1 });
          frame.setCoords();
        }

        const { fw, fh } = frameInnerSize(frame);
        let layout = computeFittingLayout(fw, fh, iw, ih, fittingMode);
        if (fittingMode === "frame-to-content") {
          fittingMode = "fill-proportional";
          layout = computeFittingLayout(fw, fh, iw, ih, "fill-proportional");
        }

        const contentId = baseRec.imageContent?.id ?? uidImageContent();
        const content: FrameImageContent = {
          id: contentId,
          src: url,
          originalWidth: iw,
          originalHeight: ih,
          scaleX: layout.scaleX,
          scaleY: layout.scaleY,
          offsetX: layout.offsetX,
          offsetY: layout.offsetY,
          fittingMode,
        };

        img.set({
          indesignType: "frameImage",
          indesignUid: uid(),
          frameUid,
          indesignImageContentId: contentId,
        });
        applyContentToFabricImage(frame, img, content);
        updateImageClipFromFrame(Rect, frame, img);

        frame.set({
          hasImage: true,
          fill: "rgba(0,0,0,0.02)",
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();

        const nextRec = patchImageFrameRecord(imageFramesRef.current, frameUid, {
          imageContent: content,
        });
        emitPagePatch(nextRec);
      }

      attachImageToFrameRef.current = attachImageToFrame;

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

        if (e.key === "Escape") {
          if (typing) return;
          const c = canvasRef.current;
          if (!c) return;
          if (imageContentEditUidRef.current) {
            const uid = imageContentEditUidRef.current;
            e.preventDefault();
            e.stopPropagation();
            restoreFrameChromeFor(uid);
            onImageContentEditChangeRef.current(null);
            const fr = c
              .getObjects()
              .find((o) => o.get("indesignUid") === uid && o.get("indesignType") === "frame");
            if (fr) {
              selectionRedirectRef.current = true;
              c.setActiveObject(fr);
              selectionRedirectRef.current = false;
            }
            c.requestRenderAll();
            onSelectionChangeRef.current(fr ?? null);
          }
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
        if (hits.length > 0) {
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
        return;
        }

        const removedFrameIdsBatch: string[] = [];

        const removeVectorOrFrame = (o: FabricObject): boolean => {
          const t = o.get("indesignType") as string | undefined;
          if (t === "vectorShape") {
            c.remove(o);
            return true;
          }
          if (t === "frame") {
            const fid = o.get("indesignUid") as string;
            removedFrameIdsBatch.push(fid);
            if (imageContentEditUidRef.current === fid) {
              restoreFrameChromeFor(fid);
              onImageContentEditChangeRef.current(null);
            }
            for (const obj of [...c.getObjects()]) {
              if (obj.get("frameUid") === fid) c.remove(obj);
            }
            c.remove(o);
            return true;
          }
          return false;
        };

        if (active.get("indesignType") === "frameImage") {
          const fid = active.get("frameUid") as string;
          const frameObj = c
            .getObjects()
            .find(
              (x) =>
                x.get("indesignUid") === fid && x.get("indesignType") === "frame",
            ) as FabricObject | undefined;
          if (frameObj) {
            e.preventDefault();
            e.stopPropagation();
            c.remove(active);
            frameObj.set({
              hasImage: false,
              fill: "rgba(0,0,0,0.04)",
            });
            if (imageContentEditUidRef.current === fid) {
              restoreFrameChromeFor(fid);
              onImageContentEditChangeRef.current(null);
            }
            const nextFrames = patchImageFrameRecord(imageFramesRef.current, fid, {
              imageContent: null,
            });
            emitPagePatch(nextFrames);
            c.setActiveObject(frameObj);
            c.requestRenderAll();
            onSelectionChangeRef.current(frameObj);
          }
          return;
        }

        if (isFabricActiveSelection(active)) {
          const group = active as FabricGroup;
          const objs = group.getObjects();
          let removed = false;
          for (const o of objs) {
            if (removeVectorOrFrame(o)) removed = true;
          }
          if (removed) {
            e.preventDefault();
            e.stopPropagation();
            c.discardActiveObject();
            onSelectionChangeRef.current(null);
            c.requestRenderAll();
            if (removedFrameIdsBatch.length > 0) {
              const nextFrames = imageFramesRef.current.filter(
                (r) => !removedFrameIdsBatch.includes(r.id),
              );
              emitPagePatch(nextFrames);
            } else {
              emitChange();
            }
          }
          return;
        }

        if (removeVectorOrFrame(active)) {
          e.preventDefault();
          e.stopPropagation();
          c.discardActiveObject();
          onSelectionChangeRef.current(null);
          c.requestRenderAll();
          if (removedFrameIdsBatch.length > 0) {
            const nextFrames = imageFramesRef.current.filter(
              (r) => !removedFrameIdsBatch.includes(r.id),
            );
            emitPagePatch(nextFrames);
          } else {
            emitChange();
          }
        }
      };

      const onWinResizeOrScroll = () => syncInlineTextareaLayout();

      const onWheelZoom = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const pointer = canvas.getPointer(e, true);
        const z = canvas.getZoom();
        const nextZ = Math.min(24, Math.max(0.05, z * Math.pow(0.999, e.deltaY)));
        canvas.zoomToPoint(new Point(pointer.x, pointer.y), nextZ);
        canvas.requestRenderAll();
        syncInlineAfterViewport();
      };

      const middlePan = { active: false, lastX: 0, lastY: 0 };
      const onMiddleMouseDown = (e: MouseEvent) => {
        if (e.button !== 1) return;
        if (!upper.contains(e.target as Node)) return;
        e.preventDefault();
        e.stopPropagation();
        middlePan.active = true;
        middlePan.lastX = e.clientX;
        middlePan.lastY = e.clientY;
        upper.style.cursor = "grabbing";
      };
      const onMiddleMouseMove = (e: MouseEvent) => {
        if (!middlePan.active) return;
        e.preventDefault();
        const dx = e.clientX - middlePan.lastX;
        const dy = e.clientY - middlePan.lastY;
        middlePan.lastX = e.clientX;
        middlePan.lastY = e.clientY;
        const v = canvas.viewportTransform;
        if (!v) return;
        v[4] += dx;
        v[5] += dy;
        canvas.setViewportTransform(v);
        canvas.requestRenderAll();
        syncInlineAfterViewport();
      };
      const onMiddleMouseUp = (e: MouseEvent) => {
        if (e.button !== 1) return;
        if (middlePan.active) {
          middlePan.active = false;
          upper.style.cursor = "";
        }
      };

      window.addEventListener("keydown", onWinKeyDown, true);
      window.addEventListener("resize", onWinResizeOrScroll);
      window.addEventListener("scroll", onWinResizeOrScroll, true);
      upper.addEventListener("wheel", onWheelZoom, { passive: false });
      upper.addEventListener("mousedown", onMiddleMouseDown);
      window.addEventListener("mousemove", onMiddleMouseMove, true);
      window.addEventListener("mouseup", onMiddleMouseUp, true);
      cleanupWheelZoom = () => {
        upper.removeEventListener("wheel", onWheelZoom);
        upper.removeEventListener("mousedown", onMiddleMouseDown);
        window.removeEventListener("mousemove", onMiddleMouseMove, true);
        window.removeEventListener("mouseup", onMiddleMouseUp, true);
      };
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

        if (t?.get("indesignType") === "frame" && t.get("hasImage")) {
          const uid = t.get("indesignUid") as string;
          const imgObj = canvas
            .getObjects()
            .find((o) => o.get("indesignType") === "frameImage" && o.get("frameUid") === uid);
          if (imgObj) {
            opt.e.preventDefault();
            opt.e.stopPropagation();
            enterImageContentEdit(uid, imgObj);
            return;
          }
        }
        if (t?.get("indesignType") === "frameImage") {
          const uid = t.get("frameUid") as string;
          opt.e.preventDefault();
          opt.e.stopPropagation();
          enterImageContentEdit(uid, t as FabricObject);
          return;
        }

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

      function handleCanvasSelection() {
        const active = canvas.getActiveObject() ?? null;
        syncImageContentEditFromSelection(active);
        redirectFrameImageToFrame(active);
        onSelectionChangeRef.current(canvas.getActiveObject() ?? null);
      }

      canvas.on("selection:created", handleCanvasSelection);
      canvas.on("selection:updated", handleCanvasSelection);
      canvas.on("selection:cleared", () => {
        const cur = imageContentEditUidRef.current;
        if (cur) restoreFrameChromeFor(cur);
        onImageContentEditChangeRef.current(null);
        onSelectionChangeRef.current(null);
      });

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
              const op = hit.opacity;
              tf = updateTextFrameGeometry(tf, fid, {
                x: box.left,
                y: box.top,
                width: Math.max(24, box.width),
                height: Math.max(24, box.height),
                opacity: typeof op === "number" && Number.isFinite(op) ? op : 1,
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
          const op = o.opacity;
          const tf = updateTextFrameGeometry(textFramesRef.current, fid, {
            x: left,
            y: top,
            width: Math.max(24, w),
            height: Math.max(24, h),
            opacity: typeof op === "number" && Number.isFinite(op) ? op : 1,
          });
          textFramesRef.current = tf;
          onTextModelChangeRef.current({
            stories: storiesRef.current,
            textFrames: tf,
          });
          paintTextFromModel();
          return;
        }

        if (o.get("indesignType") === "frame") {
          const uid = o.get("indesignUid") as string;
          const img = canvas
            .getObjects()
            .find(
              (x) =>
                x.get("indesignType") === "frameImage" && x.get("frameUid") === uid,
            ) as FabricObject | undefined;
          if (img) {
            updateImageClipFromFrame(Rect, o, img);
            const rec = getImageFrameRecord(imageFramesRef.current, uid);
            const ic = rec?.imageContent;
            if (ic) {
              const { fw, fh } = frameInnerSize(o);
              const iw = ic.originalWidth;
              const ih = ic.originalHeight;
              const auto = rec?.autoFit ?? true;
              if (auto) {
                const mode =
                  ic.fittingMode === "frame-to-content" ? "fill-proportional" : ic.fittingMode;
                const layout = computeFittingLayout(fw, fh, iw, ih, mode);
                const nextContent: FrameImageContent = {
                  ...ic,
                  scaleX: layout.scaleX,
                  scaleY: layout.scaleY,
                  offsetX: layout.offsetX,
                  offsetY: layout.offsetY,
                };
                applyContentToFabricImage(o, img, nextContent);
                updateImageClipFromFrame(Rect, o, img);
                const nextRec = patchImageFrameRecord(imageFramesRef.current, uid, {
                  imageContent: nextContent,
                });
                emitPagePatch(nextRec);
                return;
              }
              const { fl, ft } = frameOrigin(o);
              img.set({
                left: fl + ic.offsetX,
                top: ft + ic.offsetY,
              });
              img.setCoords();
              updateImageClipFromFrame(Rect, o, img);
            }
          }
          emitChange();
          return;
        }

        if (o.get("indesignType") === "frameImage") {
          const frameUid = o.get("frameUid") as string;
          const frameObj = canvas
            .getObjects()
            .find(
              (x) =>
                x.get("indesignUid") === frameUid && x.get("indesignType") === "frame",
            ) as FabricObject | undefined;
          if (frameObj) {
            updateImageClipFromFrame(Rect, frameObj, o);
            const rec = getImageFrameRecord(imageFramesRef.current, frameUid);
            const ic0 = rec?.imageContent;
            if (ic0) {
              const nextIc = fabricImageToContent(
                frameObj,
                o,
                ic0.src,
                ic0.originalWidth,
                ic0.originalHeight,
                ic0.fittingMode,
              );
              const nextRec = patchImageFrameRecord(imageFramesRef.current, frameUid, {
                imageContent: nextIc,
              });
              emitPagePatch(nextRec);
              return;
            }
          }
          emitChange();
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
        let x1 = Math.min(d.x, p.x);
        let y1 = Math.min(d.y, p.y);
        let w = Math.abs(p.x - d.x);
        let h = Math.abs(p.y - d.y);
        if (e.shiftKey) {
          const s = Math.max(w, h);
          const dx = p.x - d.x;
          const dy = p.y - d.y;
          const signX = dx >= 0 ? 1 : -1;
          const signY = dy >= 0 ? 1 : -1;
          w = s;
          h = s;
          x1 = Math.min(d.x, d.x + signX * s);
          y1 = Math.min(d.y, d.y + signY * s);
        }
        drawRef.current = null;
        if (w < 4 || h < 4) return;
        const mode = toolRef.current;
        let placed = false;
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
          placed = true;
        } else if (mode === "frame") {
          addFrame(x1, y1, w, h);
          placed = true;
        } else if (mode === "rect") {
          addVectorShapeRect(x1, y1, w, h);
          placed = true;
        } else if (mode === "ellipse") {
          addVectorShapeEllipse(x1, y1, w, h);
          placed = true;
        }
        if (placed) queueMicrotask(() => onAfterPlaceDrawRef.current?.());
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

      const onContextMenu = (e: MouseEvent) => {
        const handler = onFrameContextMenuRef.current;
        if (!handler) return;
        if (!upper.contains(e.target as Node)) return;
        e.preventDefault();
        const p = canvas.getPointer(e);
        const pt = new Point(p.x, p.y);
        const target = [...canvas.getObjects()]
          .reverse()
          .find((o) => {
            if (o.get("name") === "indesignPageBg") return false;
            if (o.visible === false) return false;
            return typeof o.containsPoint === "function" && o.containsPoint(pt);
          });
        let frameUid: string | null = null;
        let hasImage = false;
        if (target?.get("indesignType") === "frame") {
          frameUid = target.get("indesignUid") as string;
          hasImage = !!target.get("hasImage");
        } else if (target?.get("indesignType") === "frameImage") {
          frameUid = target.get("frameUid") as string;
          hasImage = true;
        }
        if (frameUid) {
          handler({ clientX: e.clientX, clientY: e.clientY, frameUid, hasImage });
        }
      };
      upper.addEventListener("contextmenu", onContextMenu);

      cleanupDrop = () => {
        upper.removeEventListener("dragover", onDragOver);
        upper.removeEventListener("drop", onDrop);
        upper.removeEventListener("contextmenu", onContextMenu);
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
      const mergedFrames = mergeImageFramesFromCanvas();
      if (JSON.stringify(mergedFrames) !== JSON.stringify(imageFramesRef.current)) {
        emitPagePatch(mergedFrames);
      }
      queueMicrotask(() => resetViewportFitRef.current());
    })();

    return () => {
      disposed = true;
      attachImageToFrameRef.current = null;
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
    emitPagePatch,
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

  const placeImageInFrame = useCallback(async (frameUid: string, url: string) => {
    const c = canvasRef.current;
    const fn = attachImageToFrameRef.current;
    if (!c || !fn) return;
    const frame = c
      .getObjects()
      .find(
        (o) => o.get("indesignUid") === frameUid && o.get("indesignType") === "frame",
      ) as FabricObject | undefined;
    if (frame) await fn(frame, url);
  }, []);

  return {
    getCanvas: () => canvasRef.current,
    toJSON: () => fabricJsonForExport(),
    panViewportBy,
    resetViewportFit,
    placeImageInFrame,
  };
}
