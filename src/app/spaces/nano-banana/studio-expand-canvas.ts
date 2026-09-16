/**
 * Lienzo y máscara que se envían al modelo para rellenar una ampliación.
 * Gratis (Canvas 2D). La foto original a resolución nativa la monta el servidor al componer.
 */

import { loadCanvasSafeImageElement } from "./studio-compact";
import {
  expandSides,
  frameFromPad,
  pickGeminiContainingRatio,
  type StudioFramePad,
} from "./studio-frame-adjust";

export type StudioExpandPayload = {
  canvasDataUrl: string;
  maskDataUrl: string | null;
  generateAspect: string;
  canvasW: number;
  canvasH: number;
};

function generateMaxSide(resolution: string): number {
  const res = resolution.trim().toLowerCase();
  if (res === "4k") return 2048;
  if (res === "1k") return 1280;
  return 2048;
}

function fillChecker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const step = Math.max(8, Math.round(Math.min(w, h) / 24));
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#9ca3af";
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (((x / step) + (y / step)) % 2 === 0) ctx.fillRect(x, y, step, step);
    }
  }
}

function extendEdges(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  layout: ReturnType<typeof frameFromPad>,
  scale: number,
  imgW: number,
  imgH: number,
): void {
  const photoX = Math.round(layout.photoX * scale);
  const photoY = Math.round(layout.photoY * scale);
  const photoW = Math.max(1, Math.round(layout.photoW * scale));
  const photoH = Math.max(1, Math.round(layout.photoH * scale));
  const sx = (layout.srcX / imgW) * (img as HTMLImageElement).naturalWidth;
  const sy = (layout.srcY / imgH) * (img as HTMLImageElement).naturalHeight;
  const sw = (layout.srcW / imgW) * (img as HTMLImageElement).naturalWidth;
  const sh = (layout.srcH / imgH) * (img as HTMLImageElement).naturalHeight;
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;

  if (photoX > 0) {
    ctx.drawImage(img, sx, sy, 1, sh, 0, photoY, photoX, photoH);
  }
  if (photoX + photoW < canvasW) {
    ctx.drawImage(img, sx + sw - 1, sy, 1, sh, photoX + photoW, photoY, canvasW - photoX - photoW, photoH);
  }
  if (photoY > 0) {
    ctx.drawImage(img, sx, sy, sw, 1, photoX, 0, photoW, photoY);
  }
  if (photoY + photoH < canvasH) {
    ctx.drawImage(img, sx, sy + sh - 1, sw, 1, photoX, photoY + photoH, photoW, canvasH - photoY - photoH);
  }
  if (photoX > 0 && photoY > 0) ctx.drawImage(img, sx, sy, 1, 1, 0, 0, photoX, photoY);
  if (photoX + photoW < canvasW && photoY > 0) {
    ctx.drawImage(img, sx + sw - 1, sy, 1, 1, photoX + photoW, 0, canvasW - photoX - photoW, photoY);
  }
  if (photoX > 0 && photoY + photoH < canvasH) {
    ctx.drawImage(img, sx, sy + sh - 1, 1, 1, 0, photoY + photoH, photoX, canvasH - photoY - photoH);
  }
  if (photoX + photoW < canvasW && photoY + photoH < canvasH) {
    ctx.drawImage(
      img,
      sx + sw - 1,
      sy + sh - 1,
      1,
      1,
      photoX + photoW,
      photoY + photoH,
      canvasW - photoX - photoW,
      canvasH - photoY - photoH,
    );
  }
  ctx.drawImage(img, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
}

/** OpenAI: alfa 0 = editar (zona nueva + costura), alfa 255 = conservar. */
function paintExpandMask(
  ctx: CanvasRenderingContext2D,
  layout: ReturnType<typeof frameFromPad>,
  scale: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(0, 0, w, h);
  const photoX = Math.round(layout.photoX * scale);
  const photoY = Math.round(layout.photoY * scale);
  const photoW = Math.max(1, Math.round(layout.photoW * scale));
  const photoH = Math.max(1, Math.round(layout.photoH * scale));
  const seam = Math.max(2, Math.round(Math.min(photoW, photoH) * 0.025));
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(255,255,255,1)";
  if (photoX + seam > 0) ctx.fillRect(0, 0, photoX + seam, h);
  if (photoX + photoW - seam < w) ctx.fillRect(photoX + photoW - seam, 0, w - (photoX + photoW - seam), h);
  if (photoY + seam > 0) ctx.fillRect(photoX, 0, photoW, photoY + seam);
  if (photoY + photoH - seam < h) ctx.fillRect(photoX, photoY + photoH - seam, photoW, h - (photoY + photoH - seam));
  ctx.globalCompositeOperation = "source-over";
}

function letterboxCanvas(source: HTMLCanvasElement, ratioW: number, ratioH: number): HTMLCanvasElement {
  const srcAspect = source.width / source.height;
  const dstAspect = ratioW / ratioH;
  let outW = source.width;
  let outH = source.height;
  if (srcAspect > dstAspect) {
    outH = Math.max(1, Math.round(source.width / dstAspect));
  } else if (srcAspect < dstAspect) {
    outW = Math.max(1, Math.round(source.height * dstAspect));
  }
  if (outW === source.width && outH === source.height) return source;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(0, 0, outW, outH);
  const x = Math.round((outW - source.width) / 2);
  const y = Math.round((outH - source.height) / 2);
  ctx.drawImage(source, x, y);
  return out;
}

export async function buildStudioExpandPayload(args: {
  src: string;
  origW: number;
  origH: number;
  pad: StudioFramePad;
  provider: "gemini" | "openai";
  resolution: string;
}): Promise<StudioExpandPayload> {
  const pad = expandSides(args.pad);
  const layout = frameFromPad(args.origW, args.origH, pad);
  const maxSide = generateMaxSide(args.resolution);
  const scale = Math.min(1, maxSide / Math.max(layout.canvasW, layout.canvasH));
  const w = Math.max(8, Math.round(layout.canvasW * scale));
  const h = Math.max(8, Math.round(layout.canvasH * scale));
  const { img, cleanup } = await loadCanvasSafeImageElement(args.src);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el lienzo de ampliación.");

    if (args.provider === "openai") {
      ctx.clearRect(0, 0, w, h);
      const photoX = Math.round(layout.photoX * scale);
      const photoY = Math.round(layout.photoY * scale);
      const photoW = Math.max(1, Math.round(layout.photoW * scale));
      const photoH = Math.max(1, Math.round(layout.photoH * scale));
      const nat = img as HTMLImageElement;
      ctx.drawImage(
        img,
        (layout.srcX / args.origW) * nat.naturalWidth,
        (layout.srcY / args.origH) * nat.naturalHeight,
        (layout.srcW / args.origW) * nat.naturalWidth,
        (layout.srcH / args.origH) * nat.naturalHeight,
        photoX,
        photoY,
        photoW,
        photoH,
      );
      const mask = document.createElement("canvas");
      mask.width = w;
      mask.height = h;
      const maskCtx = mask.getContext("2d");
      if (!maskCtx) throw new Error("No se pudo crear la máscara de ampliación.");
      paintExpandMask(maskCtx, layout, scale);
      return {
        canvasDataUrl: canvas.toDataURL("image/png"),
        maskDataUrl: mask.toDataURL("image/png"),
        generateAspect: `${layout.canvasW}:${layout.canvasH}`,
        canvasW: layout.canvasW,
        canvasH: layout.canvasH,
      };
    }

    fillChecker(ctx, w, h);
    extendEdges(ctx, img, layout, scale, args.origW, args.origH);
    const picked = pickGeminiContainingRatio(layout.canvasW, layout.canvasH);
    const [rw, rh] = picked.ratio.split(":").map(Number);
    const framed = rw && rh ? letterboxCanvas(canvas, rw, rh) : canvas;
    return {
      canvasDataUrl: framed.toDataURL("image/jpeg", 0.92),
      maskDataUrl: null,
      generateAspect: picked.ratio,
      canvasW: layout.canvasW,
      canvasH: layout.canvasH,
    };
  } finally {
    cleanup();
  }
}

export async function cropStudioImageDataUrl(args: {
  src: string;
  origW: number;
  origH: number;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
}): Promise<string> {
  const { img, cleanup } = await loadCanvasSafeImageElement(args.src);
  try {
    const nat = img as HTMLImageElement;
    const sx = (args.srcX / args.origW) * nat.naturalWidth;
    const sy = (args.srcY / args.origH) * nat.naturalHeight;
    const sw = (args.srcW / args.origW) * nat.naturalWidth;
    const sh = (args.srcH / args.origH) * nat.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo recortar la imagen.");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.95);
  } finally {
    cleanup();
  }
}
