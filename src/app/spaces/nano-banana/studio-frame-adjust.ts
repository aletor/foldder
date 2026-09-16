/**
 * Recorte (gratis) y ampliación de lienzo (generación aparte) del Image Creation Studio.
 *
 * `pad` está en píxeles de la foto original:
 *  - positivo = se añade lienzo vacío (outpainting),
 *  - negativo = se recorta ese borde.
 */

import type { StudioCard, StudioPoint } from "./studio-types";

const GEMINI_CONTAINING_RATIOS: Array<{ ratio: string; w: number; h: number }> = [
  { ratio: "1:1", w: 1, h: 1 },
  { ratio: "1:4", w: 1, h: 4 },
  { ratio: "1:8", w: 1, h: 8 },
  { ratio: "2:3", w: 2, h: 3 },
  { ratio: "3:2", w: 3, h: 2 },
  { ratio: "3:4", w: 3, h: 4 },
  { ratio: "4:1", w: 4, h: 1 },
  { ratio: "4:3", w: 4, h: 3 },
  { ratio: "4:5", w: 4, h: 5 },
  { ratio: "5:4", w: 5, h: 4 },
  { ratio: "8:1", w: 8, h: 1 },
  { ratio: "9:16", w: 9, h: 16 },
  { ratio: "16:9", w: 16, h: 9 },
  { ratio: "21:9", w: 21, h: 9 },
];

export type StudioFramePad = { left: number; top: number; right: number; bottom: number };

export type StudioFrameHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type StudioFrameLayout = {
  canvasW: number;
  canvasH: number;
  /** Posición del recorte de la original dentro del lienzo. */
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  /** Rectángulo de la original que se conserva (crop). */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
};

export const ZERO_FRAME_PAD: StudioFramePad = { left: 0, top: 0, right: 0, bottom: 0 };

export const STUDIO_FRAME_MIN_SIDE = 64;
/** Tope por lado para no crear lienzos accidentales enormes (una sola pasada). */
export const STUDIO_FRAME_MAX_PAD = 4096;

export function cloneFramePad(pad: StudioFramePad): StudioFramePad {
  return { left: pad.left, top: pad.top, right: pad.right, bottom: pad.bottom };
}

export function isZeroFramePad(pad: StudioFramePad): boolean {
  return pad.left === 0 && pad.top === 0 && pad.right === 0 && pad.bottom === 0;
}

export function expandSides(pad: StudioFramePad): StudioFramePad {
  return {
    left: Math.max(0, pad.left),
    top: Math.max(0, pad.top),
    right: Math.max(0, pad.right),
    bottom: Math.max(0, pad.bottom),
  };
}

export function cropSides(pad: StudioFramePad): StudioFramePad {
  return {
    left: Math.min(0, pad.left),
    top: Math.min(0, pad.top),
    right: Math.min(0, pad.right),
    bottom: Math.min(0, pad.bottom),
  };
}

export function hasExpandPad(pad: StudioFramePad): boolean {
  return pad.left > 0 || pad.top > 0 || pad.right > 0 || pad.bottom > 0;
}

export function hasCropPad(pad: StudioFramePad): boolean {
  return pad.left < 0 || pad.top < 0 || pad.right < 0 || pad.bottom < 0;
}

export function frameFromPad(origW: number, origH: number, pad: StudioFramePad): StudioFrameLayout {
  const srcX = Math.max(0, -pad.left);
  const srcY = Math.max(0, -pad.top);
  const srcW = Math.max(1, origW - srcX - Math.max(0, -pad.right));
  const srcH = Math.max(1, origH - srcY - Math.max(0, -pad.bottom));
  const photoX = Math.max(0, pad.left);
  const photoY = Math.max(0, pad.top);
  return {
    canvasW: Math.max(1, srcW + Math.max(0, pad.left) + Math.max(0, pad.right)),
    canvasH: Math.max(1, srcH + Math.max(0, pad.top) + Math.max(0, pad.bottom)),
    photoX,
    photoY,
    photoW: srcW,
    photoH: srcH,
    srcX,
    srcY,
    srcW,
    srcH,
  };
}

export function clampFramePad(origW: number, origH: number, pad: StudioFramePad): StudioFramePad {
  const maxLeftCrop = Math.max(0, origW - STUDIO_FRAME_MIN_SIDE);
  const maxTopCrop = Math.max(0, origH - STUDIO_FRAME_MIN_SIDE);
  let left = Math.round(Number.isFinite(pad.left) ? pad.left : 0);
  let top = Math.round(Number.isFinite(pad.top) ? pad.top : 0);
  let right = Math.round(Number.isFinite(pad.right) ? pad.right : 0);
  let bottom = Math.round(Number.isFinite(pad.bottom) ? pad.bottom : 0);

  left = Math.min(STUDIO_FRAME_MAX_PAD, Math.max(-maxLeftCrop, left));
  right = Math.min(STUDIO_FRAME_MAX_PAD, Math.max(-(origW + Math.min(0, left) - STUDIO_FRAME_MIN_SIDE), right));
  top = Math.min(STUDIO_FRAME_MAX_PAD, Math.max(-maxTopCrop, top));
  bottom = Math.min(STUDIO_FRAME_MAX_PAD, Math.max(-(origH + Math.min(0, top) - STUDIO_FRAME_MIN_SIDE), bottom));

  const srcW = origW + Math.min(0, left) + Math.min(0, right);
  const srcH = origH + Math.min(0, top) + Math.min(0, bottom);
  if (srcW < STUDIO_FRAME_MIN_SIDE) {
    if (left < 0 && right < 0) right = -(origW + left - STUDIO_FRAME_MIN_SIDE);
    else if (left < 0) left = -(origW + Math.min(0, right) - STUDIO_FRAME_MIN_SIDE);
    else right = -(origW + Math.min(0, left) - STUDIO_FRAME_MIN_SIDE);
  }
  if (srcH < STUDIO_FRAME_MIN_SIDE) {
    if (top < 0 && bottom < 0) bottom = -(origH + top - STUDIO_FRAME_MIN_SIDE);
    else if (top < 0) top = -(origH + Math.min(0, bottom) - STUDIO_FRAME_MIN_SIDE);
    else bottom = -(origH + Math.min(0, top) - STUDIO_FRAME_MIN_SIDE);
  }
  return { left, top, right, bottom };
}

const HANDLE_AXES: Record<StudioFrameHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

/**
 * `dx`/`dy` en píxeles de la foto original. Positivo = el puntero se mueve a la derecha / abajo.
 * Arrastrar un borde hacia fuera aumenta el pad de ese lado; hacia dentro lo recorta.
 */
export function applyFrameHandleDelta(
  pad: StudioFramePad,
  handle: StudioFrameHandle,
  dx: number,
  dy: number,
  options?: { symmetric?: boolean },
): StudioFramePad {
  const axis = HANDLE_AXES[handle];
  const next = cloneFramePad(pad);
  if (axis.x === 1) {
    next.right += dx;
    if (options?.symmetric) next.left += dx;
  } else if (axis.x === -1) {
    next.left -= dx;
    if (options?.symmetric) next.right -= dx;
  }
  if (axis.y === 1) {
    next.bottom += dy;
    if (options?.symmetric) next.top += dy;
  } else if (axis.y === -1) {
    next.top -= dy;
    if (options?.symmetric) next.bottom -= dy;
  }
  return next;
}

export function describeFramePad(pad: StudioFramePad): string {
  const parts: string[] = [];
  const side = (label: string, value: number) => {
    if (value > 0) parts.push(`+${value} px ${label}`);
    else if (value < 0) parts.push(`${value} px ${label}`);
  };
  side("izquierda", pad.left);
  side("arriba", pad.top);
  side("derecha", pad.right);
  side("abajo", pad.bottom);
  return parts.join(", ");
}

export function describeExpandPad(pad: StudioFramePad): string {
  return describeFramePad(expandSides(pad)) || "ampliación";
}

/** Ratio Gemini con menos letterbox que aún contiene el lienzo (la salida se recorta al marco). */
export function pickGeminiContainingRatio(width: number, height: number): {
  ratio: string;
  extraFraction: number;
} {
  const area = Math.max(1, width * height);
  let best: { ratio: string; extraFraction: number } = { ratio: "16:9", extraFraction: Infinity };
  for (const item of GEMINI_CONTAINING_RATIOS) {
    const scale = Math.max(width / item.w, height / item.h);
    const extraFraction = (scale * item.w * scale * item.h) / area - 1;
    if (extraFraction < best.extraFraction) best = { ratio: item.ratio, extraFraction };
  }
  return best;
}

export function studioExpandPrompt(args: { pad: StudioFramePad; userText?: string }): string {
  const where = describeExpandPad(args.pad);
  const user = args.userText?.trim();
  return [
    `[AMPLIACIÓN DE LIENZO — obligatorio] La imagen de referencia es una fotografía con márgenes nuevos (${where}).`,
    "Extiende la escena SOLO en esas zonas nuevas. El rectángulo interior (la foto original) debe permanecer idéntico: mismos píxeles, recorte, perspectiva, iluminación, grano y profundidad de campo.",
    "Continúa el entorno, el suelo, el cielo y los objetos cortados por el borde con la misma óptica y el mismo instante. Prohibido reencuadrar, zoom, bordes, viñetas, texto o marcas de agua.",
    user ? `En la zona nueva: ${user}` : "La zona nueva debe continuar de forma natural lo que ya hay, sin inventar un sujeto distinto salvo que el borde lo recorte a medias.",
    "Devuelve el encuadre completo del lienzo ampliado, sin añadir más margen.",
  ].join("\n");
}

export function translatePointToCanvas(point: StudioPoint, layout: StudioFrameLayout): StudioPoint {
  return {
    x: layout.photoX + (point.x - layout.srcX),
    y: layout.photoY + (point.y - layout.srcY),
  };
}

export function translateCardsForCrop(cards: StudioCard[], layout: StudioFrameLayout): StudioCard[] {
  return cards.map((card) => ({
    ...card,
    paintData: null,
    lassoPoints: card.lassoPoints.map((point) => ({
      x: point.x - layout.srcX,
      y: point.y - layout.srcY,
    })),
  }));
}

export function translateCardsForExpand(cards: StudioCard[], pad: StudioFramePad): StudioCard[] {
  const dx = Math.max(0, pad.left);
  const dy = Math.max(0, pad.top);
  if (!dx && !dy) return cards;
  return cards.map((card) => ({
    ...card,
    paintData: null,
    lassoPoints: card.lassoPoints.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  }));
}

export function expandAspectToken(layout: StudioFrameLayout): string {
  return `${layout.canvasW}:${layout.canvasH}`;
}

export function documentAspectToken(width: number, height: number): string {
  return `${Math.max(1, Math.round(width))}:${Math.max(1, Math.round(height))}`;
}

/** Ratio que se envía al modelo: píxeles reales (ChatGPT) o el Gemini que contiene el lienzo. */
export function resolveStudioGenerateAspect(args: {
  width: number;
  height: number;
  provider: "gemini" | "openai";
}): string {
  const width = Math.max(1, args.width);
  const height = Math.max(1, args.height);
  if (args.provider === "openai") return documentAspectToken(width, height);
  return pickGeminiContainingRatio(width, height).ratio;
}
