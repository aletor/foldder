import type { Rect } from "./freehand-export";

export type ArtboardDisplayUnit = "px" | "mm" | "cm" | "in" | "pt";

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  displayUnit: ArtboardDisplayUnit;
  /** Relleno del lienzo (export incluye esta área). */
  background: string;
}

/** px por unidad CSS (96 px = 1 in). */
export const PX_PER_DISPLAY_UNIT: Record<ArtboardDisplayUnit, number> = {
  px: 1,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  pt: 96 / 72,
};

export function pxToDisplayUnit(px: number, unit: ArtboardDisplayUnit): number {
  return px / PX_PER_DISPLAY_UNIT[unit];
}

export function displayUnitToPx(val: number, unit: ArtboardDisplayUnit): number {
  return val * PX_PER_DISPLAY_UNIT[unit];
}

let _abId = 0;
function artboardUid(): string {
  return `ab_${Date.now()}_${_abId++}`;
}

export function createArtboard(partial?: Partial<Artboard>): Artboard {
  return {
    id: artboardUid(),
    name: "Artboard",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    displayUnit: "px",
    background: "#ffffff",
    ...partial,
  };
}

export function artboardToRect(ab: Artboard): Rect {
  return { x: ab.x, y: ab.y, w: ab.width, h: ab.height };
}

/** Primera mesa o la seleccionada si sigue existiendo. */
export function pickPrimaryArtboard(artboards: Artboard[], selectedId: string | null): Artboard | null {
  if (artboards.length === 0) return null;
  if (selectedId) {
    const found = artboards.find((a) => a.id === selectedId);
    if (found) return found;
  }
  return artboards[0];
}

/** Union de rectángulos en espacio mundo. */
export function unionRects(parts: Rect[]): Rect | null {
  if (parts.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of parts) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + p.w);
    y2 = Math.max(y2, p.y + p.h);
  }
  if (!Number.isFinite(x1)) return null;
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

export type ArtboardPreset = { label: string; width: number; height: number; unit: ArtboardDisplayUnit };

export const ARTBOARD_PRESETS: ArtboardPreset[] = [
  { label: "Full HD", width: 1920, height: 1080, unit: "px" },
  { label: "HD", width: 1280, height: 720, unit: "px" },
  { label: "Instagram (1:1)", width: 1080, height: 1080, unit: "px" },
  { label: "A4 vertical", width: 210, height: 297, unit: "mm" },
  { label: "A4 horizontal", width: 297, height: 210, unit: "mm" },
  { label: "Letter", width: 8.5, height: 11, unit: "in" },
];

export function pointInArtboard(px: number, py: number, ab: Artboard): boolean {
  return px >= ab.x && py >= ab.y && px <= ab.x + ab.width && py <= ab.y + ab.height;
}

const HANDLE_FRAC = 0.15;

/** Devuelve handle de redimensionado o null (esquinas: nw,ne,se,sw; lados: n,e,s,w). */
interface Point {
  x: number;
  y: number;
}

/** Redimensiona desde el snapshot fijando esquinas/opuestos según el handle (coords. mundo). */
export function applyArtboardResize(handle: string, snap: Artboard, pointer: Point, minSize = 40): Artboard {
  const left = snap.x;
  const right = snap.x + snap.width;
  const top = snap.y;
  const bottom = snap.y + snap.height;
  let L = left, R = right, T = top, B = bottom;
  if (handle.includes("e")) R = Math.max(L + minSize, pointer.x);
  if (handle.includes("w")) L = Math.min(R - minSize, pointer.x);
  if (handle.includes("s")) B = Math.max(T + minSize, pointer.y);
  if (handle.includes("n")) T = Math.min(B - minSize, pointer.y);
  return {
    ...snap,
    x: L,
    y: T,
    width: Math.max(R - L, minSize),
    height: Math.max(B - T, minSize),
  };
}

export function hitArtboardResizeHandle(
  px: number,
  py: number,
  ab: Artboard,
  zoom: number,
): string | null {
  const margin = Math.max(8 / zoom, Math.min(ab.width, ab.height) * HANDLE_FRAC);
  const { x, y, width: w, height: h } = ab;
  const onW = px >= x - margin && px <= x + margin;
  const onE = px >= x + w - margin && px <= x + w + margin;
  const onN = py >= y - margin && py <= y + margin;
  const onS = py >= y + h - margin && py <= y + h + margin;
  const inX = px >= x && px <= x + w;
  const inY = py >= y && py <= y + h;
  if (onN && onW && inX && inY) return "nw";
  if (onN && onE && inX && inY) return "ne";
  if (onS && onE && inX && inY) return "se";
  if (onS && onW && inX && inY) return "sw";
  if (onN && inX && inY) return "n";
  if (onS && inX && inY) return "s";
  if (onW && inX && inY) return "w";
  if (onE && inX && inY) return "e";
  return null;
}
