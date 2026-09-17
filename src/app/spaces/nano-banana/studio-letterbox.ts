/**
 * Gemini (y a veces ChatGPT) no generan un WxH arbitrario. Metemos la foto en el ratio que
 * sí soportan (letterbox) y recortamos las bandas después. Gratis (Canvas 2D).
 */

import { loadCanvasSafeImageElement } from "./studio-compact";
import { pickGeminiContainingRatio } from "./studio-frame-adjust";
import { buildStudioGenerateImageSlots, type StudioGenerateSlotsInput } from "./studio-generate-payload";

export const STUDIO_ASPECT_TOLERANCE = 0.015;

export const LETTERBOX_OUTPUT_BLOCK =
  "\n\n[LETTERBOX — obligatorio] La BASE está centrada en un lienzo mayor con bandas grises para cumplir el formato de salida. Devuelve ese encuadre COMPLETO (bandas incluidas). El rectángulo interior (la foto) debe quedar en la misma posición y tamaño: no reencuadres, no hagas zoom. Las bandas pueden continuar la escena. El pegado recortará las bandas después.";

export type StudioLetterboxInner = { width: number; height: number };

export function parseRatioToken(ratio: string): { w: number; h: number } | null {
  const parts = ratio.split(":").map((p) => Number(p.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[0]! <= 0 || parts[1]! <= 0) {
    return null;
  }
  return { w: parts[0]!, h: parts[1]! };
}

export function aspectDelta(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-6);
}

/** Rectángulo interior centrado (contain) de `inner` dentro de `outer`. */
export function containInnerRect(
  innerW: number,
  innerH: number,
  outerW: number,
  outerH: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(outerW / Math.max(1, innerW), outerH / Math.max(1, innerH));
  const width = Math.max(1, Math.round(innerW * scale));
  const height = Math.max(1, Math.round(innerH * scale));
  const x = Math.max(0, Math.round((outerW - width) / 2));
  const y = Math.max(0, Math.round((outerH - height) / 2));
  return {
    x,
    y,
    width: Math.min(width, outerW - x),
    height: Math.min(height, outerH - y),
  };
}

export function outerLetterboxSize(innerW: number, innerH: number, ratioW: number, ratioH: number): { width: number; height: number } {
  const srcAspect = innerW / Math.max(1, innerH);
  const dstAspect = ratioW / Math.max(1e-6, ratioH);
  let width = Math.max(1, innerW);
  let height = Math.max(1, innerH);
  if (srcAspect > dstAspect) height = Math.max(1, Math.round(innerW / dstAspect));
  else if (srcAspect < dstAspect) width = Math.max(1, Math.round(innerH * dstAspect));
  return { width, height };
}

export async function letterboxImageDataUrl(
  src: string,
  ratioW: number,
  ratioH: number,
  format: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<string> {
  const { img, cleanup } = await loadCanvasSafeImageElement(src);
  try {
    const innerW = Math.max(1, (img as HTMLImageElement).naturalWidth || img.width);
    const innerH = Math.max(1, (img as HTMLImageElement).naturalHeight || img.height);
    const outer = outerLetterboxSize(innerW, innerH, ratioW, ratioH);
    if (outer.width === innerW && outer.height === innerH) return src;
    const canvas = document.createElement("canvas");
    canvas.width = outer.width;
    canvas.height = outer.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(0, 0, outer.width, outer.height);
    const inner = containInnerRect(innerW, innerH, outer.width, outer.height);
    ctx.drawImage(img, inner.x, inner.y, inner.width, inner.height);
    return format === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    cleanup();
  }
}

export async function unletterboxImageDataUrl(src: string, innerW: number, innerH: number): Promise<string> {
  const { img, cleanup } = await loadCanvasSafeImageElement(src);
  try {
    const gw = Math.max(1, (img as HTMLImageElement).naturalWidth || img.width);
    const gh = Math.max(1, (img as HTMLImageElement).naturalHeight || img.height);
    if (aspectDelta(gw / gh, innerW / Math.max(1, innerH)) <= STUDIO_ASPECT_TOLERANCE && gw === innerW && gh === innerH) {
      return src;
    }
    const rect = containInnerRect(innerW, innerH, gw, gh);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(innerW));
    canvas.height = Math.max(1, Math.round(innerH));
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    cleanup();
  }
}

/** Ratio nativo + si hay que meter bandas. Sin I/O. */
export function planStudioLetterbox(args: {
  width: number;
  height: number;
  provider: "gemini" | "openai";
}): { aspect: string; inner: StudioLetterboxInner | null; ratio: { w: number; h: number } | null } {
  const width = Math.max(1, args.width);
  const height = Math.max(1, args.height);
  if (args.provider === "openai") {
    return { aspect: `${width}:${height}`, inner: null, ratio: null };
  }
  const picked = pickGeminiContainingRatio(width, height);
  const parsed = parseRatioToken(picked.ratio);
  const srcAspect = width / height;
  const dstAspect = parsed ? parsed.w / parsed.h : srcAspect;
  if (!parsed || aspectDelta(srcAspect, dstAspect) <= STUDIO_ASPECT_TOLERANCE) {
    return { aspect: picked.ratio, inner: null, ratio: parsed };
  }
  return { aspect: picked.ratio, inner: { width, height }, ratio: parsed };
}

export async function frameStudioGenerateBase(args: {
  baseSrc: string;
  width: number;
  height: number;
  provider: "gemini" | "openai";
  zoneMapImage?: string | null;
}): Promise<{
  baseSrc: string;
  aspect: string;
  inner: StudioLetterboxInner | null;
  zoneMapImage: string | null;
}> {
  const plan = planStudioLetterbox({ width: args.width, height: args.height, provider: args.provider });
  if (!plan.inner || !plan.ratio) {
    return {
      baseSrc: args.baseSrc,
      aspect: plan.aspect,
      inner: null,
      zoneMapImage: args.zoneMapImage ?? null,
    };
  }
  const baseSrc = await letterboxImageDataUrl(args.baseSrc, plan.ratio.w, plan.ratio.h, "image/jpeg");
  const zoneMapImage = args.zoneMapImage
    ? await letterboxImageDataUrl(args.zoneMapImage, plan.ratio.w, plan.ratio.h, "image/png")
    : null;
  return {
    baseSrc,
    aspect: plan.aspect,
    inner: plan.inner,
    zoneMapImage,
  };
}

export async function applyStudioGenerateFraming(args: {
  images: StudioGenerateSlotsInput;
  prompt: string;
  baseSrc: string | null;
  width: number;
  height: number;
  provider: "gemini" | "openai";
}): Promise<{
  images: StudioGenerateSlotsInput;
  imageList: string[];
  prompt: string;
  aspect: string;
  inner: StudioLetterboxInner | null;
}> {
  const baseSrc = args.images.baseImage || args.baseSrc;
  if (!baseSrc) {
    const plan = planStudioLetterbox({ width: args.width, height: args.height, provider: args.provider });
    return {
      images: args.images,
      imageList: buildStudioGenerateImageSlots(args.images),
      prompt: args.prompt,
      aspect: plan.aspect,
      inner: null,
    };
  }
  const framed = await frameStudioGenerateBase({
    baseSrc,
    width: args.width,
    height: args.height,
    provider: args.provider,
    zoneMapImage: args.images.zoneMapImage,
  });
  const images: StudioGenerateSlotsInput = {
    ...args.images,
    baseImage: framed.baseSrc,
    zoneMapImage: framed.zoneMapImage,
  };
  return {
    images,
    imageList: buildStudioGenerateImageSlots(images),
    prompt: framed.inner ? `${args.prompt}${LETTERBOX_OUTPUT_BLOCK}` : args.prompt,
    aspect: framed.aspect,
    inner: framed.inner,
  };
}
