import { loadCanvasSafeImageElement } from "./studio-compact";
import {
  STUDIO_PAINT_ALPHA_THRESHOLD,
  type StudioCard,
  type StudioPaletteColor,
} from "./studio-types";

export type StudioPaintSpatial = {
  areaPct: number;
  bboxX1: number;
  bboxX2: number;
  bboxY1: number;
  bboxY2: number;
  cx: number;
  cy: number;
  quadrant: string;
};

export type StudioZoneMapBuildResult = {
  colorMapUrl: string;
  layers: Array<{
    assignedColor: StudioPaletteColor;
    cardId: string;
    paintData: string;
    spatial: StudioPaintSpatial | null;
  }>;
  markedBaseUrl: string | null;
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function cardsWithZonePaint(cards: StudioCard[]): StudioCard[] {
  return cards.filter((card) => Boolean(card.paintData));
}

/**
 * Color-map tint: any paint alpha > 30 becomes the zone color at alpha 255.
 * Copied from today's Studio loop so Gemini still sees the same REF 2 convention.
 */
export function tintImageDataForColorMap(id: { data: Uint8ClampedArray | Uint8Array }, hex: string): void {
  const [cr, cg, cb] = hexToRgb(hex);
  const data = id.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > STUDIO_PAINT_ALPHA_THRESHOLD) {
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
    }
  }
}

/**
 * Marked-base tint: same alpha gate, output alpha min(220, src*3).
 * Copied from today's marked-base loop.
 */
export function tintImageDataForMarkedBase(id: { data: Uint8ClampedArray | Uint8Array }, hex: string): void {
  const [cr, cg, cb] = hexToRgb(hex);
  const data = id.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > STUDIO_PAINT_ALPHA_THRESHOLD) {
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = Math.min(220, data[i + 3]! * 3);
    }
  }
}

/** Bbox-center spatial stats — same formulas as today's Studio scan. */
export function computePaintSpatialStats(
  imageData: { data: Uint8ClampedArray | Uint8Array },
  width: number,
  height: number,
): StudioPaintSpatial | null {
  const data = imageData.data;
  let mx = width;
  let my = height;
  let Mx = 0;
  let My = 0;
  let found = false;
  let paintedPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > STUDIO_PAINT_ALPHA_THRESHOLD) {
        if (x < mx) mx = x;
        if (y < my) my = y;
        if (x > Mx) Mx = x;
        if (y > My) My = y;
        found = true;
        paintedPixels++;
      }
    }
  }
  if (!found) return null;
  const cx = Math.round(((mx + Mx) / 2 / width) * 100);
  const cy = Math.round(((my + My) / 2 / height) * 100);
  const x1 = Math.round((mx / width) * 100);
  const y1 = Math.round((my / height) * 100);
  const x2 = Math.round((Mx / width) * 100);
  const y2 = Math.round((My / height) * 100);
  const areaPct = Math.round((paintedPixels / (width * height)) * 100 * 10) / 10;
  const row = cy < 33 ? "superior" : cy > 66 ? "inferior" : "central";
  const col = cx < 33 ? "izquierdo" : cx > 66 ? "derecho" : "central";
  const quadrant =
    row === "central" && col === "central"
      ? "centro de la imagen"
      : row === col
        ? `tercio ${row}`
        : `tercio ${row}-${col}`;
  return { areaPct, bboxX1: x1, bboxX2: x2, bboxY1: y1, bboxY2: y2, cx, cy, quadrant };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load paint layer."));
    img.src = src;
  });
}

/**
 * Builds REF 2 exactly as today's Studio: black color map always; marked-base
 * when a source image can be drawn under the same tinted strokes.
 */
export async function buildStudioZoneMap(args: {
  baseImageSrc: string | null;
  cards: StudioCard[];
  height: number;
  width: number;
}): Promise<StudioZoneMapBuildResult | null> {
  const layers = cardsWithZonePaint(args.cards);
  if (layers.length === 0 || args.width < 1 || args.height < 1) return null;
  if (typeof document === "undefined") return null;

  const W = args.width;
  const H = args.height;
  const colorMap = document.createElement("canvas");
  colorMap.width = W;
  colorMap.height = H;
  const cmapCtx = colorMap.getContext("2d");
  if (!cmapCtx) return null;
  cmapCtx.fillStyle = "#000000";
  cmapCtx.fillRect(0, 0, W, H);

  const scanned: StudioZoneMapBuildResult["layers"] = [];

  for (const card of layers) {
    const paintData = card.paintData!;
    const img = await loadImage(paintData);
    const tmp = document.createElement("canvas");
    tmp.width = W;
    tmp.height = H;
    const tc = tmp.getContext("2d");
    if (!tc) continue;
    tc.drawImage(img, 0, 0, W, H);
    const id = tc.getImageData(0, 0, W, H);
    const spatial = computePaintSpatialStats(id, W, H);
    tintImageDataForColorMap(id, card.assignedColor.hex);
    tc.putImageData(id, 0, 0);
    cmapCtx.drawImage(tmp, 0, 0);
    scanned.push({
      assignedColor: card.assignedColor,
      cardId: card.id,
      paintData,
      spatial,
    });
  }

  let markedBaseUrl: string | null = null;
  if (args.baseImageSrc) {
    let loadedBase: { img: HTMLImageElement; cleanup: () => void } | null = null;
    try {
      loadedBase = await loadCanvasSafeImageElement(args.baseImageSrc);
      const marked = document.createElement("canvas");
      marked.width = W;
      marked.height = H;
      const mc = marked.getContext("2d");
      if (mc) {
        mc.drawImage(loadedBase.img, 0, 0, W, H);
        for (const card of layers) {
          const strokeImg = await loadImage(card.paintData!);
          const tmp = document.createElement("canvas");
          tmp.width = W;
          tmp.height = H;
          const tc = tmp.getContext("2d");
          if (!tc) continue;
          tc.drawImage(strokeImg, 0, 0, W, H);
          const id = tc.getImageData(0, 0, W, H);
          tintImageDataForMarkedBase(id, card.assignedColor.hex);
          tc.putImageData(id, 0, 0);
          mc.drawImage(tmp, 0, 0);
        }
        markedBaseUrl = marked.toDataURL("image/png");
      }
    } catch {
      markedBaseUrl = null;
    } finally {
      loadedBase?.cleanup();
    }
  }

  return {
    colorMapUrl: colorMap.toDataURL("image/png"),
    layers: scanned,
    markedBaseUrl,
  };
}

export function zoneMapImageForGenerate(map: StudioZoneMapBuildResult): string {
  return map.markedBaseUrl || map.colorMapUrl;
}
