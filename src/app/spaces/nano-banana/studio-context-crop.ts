/**
 * Recorte de contexto para ediciones locales pequeñas.
 *
 * Cuando todas las zonas marcadas caben en una fracción pequeña del fotograma, el modelo recibe
 * la foto entera y resuelve la zona con muy pocos píxeles (un pendiente en 2K son ~30 px), sin
 * margen para integrar luz ni desenfoque. Aquí se planifica un recorte ampliado alrededor de las
 * zonas, con la misma relación de aspecto que el fotograma, que se envía como BASE en lugar de la
 * foto completa; el servidor lo pega de vuelta tras componer. Misma cantidad de llamadas de pago.
 */

import { closeLassoPoints, isValidClosedLasso, rasterizeLassoToPaintData } from "./lasso-to-paint-data";
import { loadCanvasSafeImageElement } from "./studio-compact";
import { cardIsDescribed } from "./studio-generate-payload";
import type { StudioCard, StudioGlobal, StudioPoint } from "./studio-types";

export type StudioContextCrop = { x: number; y: number; width: number; height: number };

/** Zonas cuya bbox conjunta supere esta fracción del fotograma se editan sobre la foto entera. */
export const CONTEXT_CROP_MAX_UNION_AREA = 0.1;
/** Lado largo de la bbox conjunta como fracción del lado homólogo del fotograma. */
export const CONTEXT_CROP_MAX_UNION_SIDE = 0.4;
/** Margen: el recorte mide este múltiplo de la bbox conjunta (antes de imponer mínimos). */
export const CONTEXT_CROP_EXPANSION = 3;
/** Lado mínimo del recorte como fracción del fotograma, para que el modelo tenga contexto. */
export const CONTEXT_CROP_MIN_SIDE_FRACTION = 0.34;

function bboxOfPoints(points: StudioPoint[]): { x1: number; y1: number; x2: number; y2: number } | null {
  if (points.length < 3) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return Number.isFinite(x1) ? { x1, y1, x2, y2 } : null;
}

/**
 * Devuelve el recorte o null si no procede (zonas grandes, cambio global, alguna card sin lazo
 * poligonal, fotograma inválido).
 */
export function planStudioContextCrop(args: {
  cards: StudioCard[];
  global: StudioGlobal;
  frame: { width: number; height: number };
}): StudioContextCrop | null {
  const { width: W, height: H } = args.frame;
  if (W < 64 || H < 64) return null;
  if (args.global.text.trim() || args.global.schemaData) return null;
  const described = args.cards.filter(cardIsDescribed);
  if (described.length === 0) return null;

  let ux1 = Infinity;
  let uy1 = Infinity;
  let ux2 = -Infinity;
  let uy2 = -Infinity;
  for (const card of described) {
    if (!isValidClosedLasso(card.lassoPoints)) return null;
    const b = bboxOfPoints(card.lassoPoints);
    if (!b) return null;
    ux1 = Math.min(ux1, b.x1);
    uy1 = Math.min(uy1, b.y1);
    ux2 = Math.max(ux2, b.x2);
    uy2 = Math.max(uy2, b.y2);
  }
  const bw = Math.max(1, ux2 - ux1);
  const bh = Math.max(1, uy2 - uy1);
  if ((bw * bh) / (W * H) > CONTEXT_CROP_MAX_UNION_AREA) return null;
  if (bw / W > CONTEXT_CROP_MAX_UNION_SIDE || bh / H > CONTEXT_CROP_MAX_UNION_SIDE) return null;

  // Recorte con la relación de aspecto del fotograma, centrado en la bbox conjunta.
  const aspect = W / H;
  let cw = Math.max(bw * CONTEXT_CROP_EXPANSION, W * CONTEXT_CROP_MIN_SIDE_FRACTION);
  let ch = Math.max(bh * CONTEXT_CROP_EXPANSION, H * CONTEXT_CROP_MIN_SIDE_FRACTION);
  if (cw / ch > aspect) ch = cw / aspect;
  else cw = ch * aspect;
  cw = Math.min(W, cw);
  ch = Math.min(H, ch);
  if (cw >= W * 0.98 && ch >= H * 0.98) return null;

  const cx = (ux1 + ux2) / 2;
  const cy = (uy1 + uy2) / 2;
  let x = Math.round(cx - cw / 2);
  let y = Math.round(cy - ch / 2);
  const width = Math.max(8, Math.round(cw));
  const height = Math.max(8, Math.round(ch));
  x = Math.max(0, Math.min(W - width, x));
  y = Math.max(0, Math.min(H - height, y));
  // Par para evitar medio píxel en el reescalado del modelo.
  return { x, y, width: width - (width % 2), height: height - (height % 2) };
}

/** Traduce los lazos al sistema del recorte y re-rasteriza la pintura para ese fotograma. */
export function cropCardsToRect(cards: StudioCard[], crop: StudioContextCrop): StudioCard[] {
  return cards.map((card) => {
    if (!isValidClosedLasso(card.lassoPoints)) return card;
    const lassoPoints = closeLassoPoints(card.lassoPoints).map((p) => ({
      x: Math.max(0, Math.min(crop.width, p.x - crop.x)),
      y: Math.max(0, Math.min(crop.height, p.y - crop.y)),
    }));
    const paintData = rasterizeLassoToPaintData(lassoPoints, crop.width, crop.height) ?? card.paintData;
    return { ...card, lassoPoints, paintData };
  });
}

/**
 * Recorte de la base como PNG (data URL). `crop` va en coordenadas del fotograma del Studio;
 * si la imagen nativa tiene otro tamaño, se reescala el rectángulo y el lienzo resultante mide
 * `crop.width × crop.height` (mismo sistema que los lazos recortados).
 */
export async function cropBaseImageDataUrl(
  baseSrc: string,
  crop: StudioContextCrop,
  frame: { width: number; height: number },
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  let loaded: { img: HTMLImageElement; cleanup: () => void } | null = null;
  try {
    loaded = await loadCanvasSafeImageElement(baseSrc);
    const img = loaded.img;
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (natW < 1 || natH < 1) return null;
    const sx = natW / Math.max(1, frame.width);
    const sy = natH / Math.max(1, frame.height);
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy, 0, 0, crop.width, crop.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    loaded?.cleanup();
  }
}

export function describeContextCrop(crop: StudioContextCrop, frame: { width: number; height: number }): string {
  const pct = Math.round(((crop.width * crop.height) / Math.max(1, frame.width * frame.height)) * 100);
  return `Recorte de contexto · ${crop.width}×${crop.height} px (~${pct} % del fotograma)`;
}
