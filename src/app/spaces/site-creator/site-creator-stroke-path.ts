/**
 * Líneas y trazos abiertos que llegan del Designer conectado.
 * Site Creator no toca Designer: aquí se reconoce el `path` de línea y se
 * mide el trazo, no la caja de los puntos.
 */
import type { FreehandObject, PathObject } from "../FreehandStudio";
import { pointInPageRect, type PagePoint, type PageRect } from "./site-creator-coordinate-space";

/** Umbral de clic en espacio de página (equivalente al de Designer a zoom 1). */
export const STROKE_PATH_HIT_SLOP = 8;
const STROKE_LIKE_MAX_THIN = 12;
const SAMPLES_PER_SEGMENT = 16;

type Pt = { x: number; y: number };

function pathHasPaintedFill(path: PathObject): boolean {
  const fill = path.fill as { type?: string; color?: string } | string | undefined;
  if (fill == null) return false;
  if (typeof fill === "string") {
    const c = fill.trim().toLowerCase();
    return c !== "" && c !== "none" && c !== "transparent";
  }
  if (fill.type === "none") return false;
  if (fill.type === "solid") {
    const c = (fill.color ?? "").trim().toLowerCase();
    return c !== "" && c !== "none" && c !== "transparent";
  }
  return true;
}

function cubicAt(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function asPath(obj: FreehandObject | null | undefined): PathObject | null {
  if (!obj || obj.type !== "path") return null;
  return obj as PathObject;
}

/** Caja muy estrecha: filete horizontal o vertical. */
export function isStrokeLikeBox(box: Pick<PageRect, "width" | "height">): boolean {
  const thin = Math.min(box.width, box.height);
  const long = Math.max(box.width, box.height);
  return thin > 0 && thin <= STROKE_LIKE_MAX_THIN && long >= thin * 8;
}

/** Línea de la herramienta o trazo abierto sin relleno. */
export function isLineLikePath(obj: FreehandObject | null | undefined): boolean {
  const path = asPath(obj);
  if (!path) return false;
  if (path.isLineTool === true) return true;
  if (path.closed === true && pathHasPaintedFill(path)) return false;
  if (path.closed === true) return false;
  if (pathHasPaintedFill(path)) return false;
  const points = path.points ?? [];
  if (points.length >= 2) return true;
  if (path.svgPathD && path.svgPathD.trim()) return true;
  return isStrokeLikeBox(path);
}

function hitRadius(path: PathObject): number {
  const stroke = typeof path.strokeWidth === "number" && path.strokeWidth > 0 ? path.strokeWidth / 2 : 0;
  return Math.max(STROKE_PATH_HIT_SLOP, stroke + 2);
}

function samplePathPoints(path: PathObject): Pt[] {
  const points = path.points ?? [];
  if (points.length < 2) return [];
  const out: Pt[] = [];
  const last = path.closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    for (let s = 0; s <= SAMPLES_PER_SEGMENT; s += 1) {
      out.push(
        cubicAt(
          s / SAMPLES_PER_SEGMENT,
          a.anchor,
          a.handleOut ?? a.anchor,
          b.handleIn ?? b.anchor,
          b.anchor,
        ),
      );
    }
  }
  return out;
}

function paddedObjectRect(path: PathObject, pad: number): PageRect {
  return {
    x: path.x - pad,
    y: path.y - pad,
    width: Math.max(1, path.width) + pad * 2,
    height: Math.max(1, path.height) + pad * 2,
  };
}

function minDistToSamples(point: PagePoint, samples: Pt[]): number {
  let best = Infinity;
  for (const pt of samples) {
    const d = Math.hypot(point.x - pt.x, point.y - pt.y);
    if (d < best) best = d;
  }
  return best;
}

/** Clic sobre el trazo, no sobre el AABB vacío de una diagonal. */
export function strokePathHitsPoint(obj: FreehandObject, point: PagePoint): boolean {
  const path = asPath(obj);
  if (!path) return false;
  const pad = hitRadius(path);
  const samples = samplePathPoints(path);
  if (samples.length === 0) {
    return pointInPageRect(point, paddedObjectRect(path, pad));
  }
  return minDistToSamples(point, samples) <= pad;
}

function pointInExpandedRect(point: Pt, rect: PageRect, pad: number): boolean {
  return pointInPageRect(point, {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  });
}

/** Marquee: el recuadro tiene que rozar el trazo, no toda la caja diagonal. */
export function strokePathIntersectsRect(obj: FreehandObject, rect: PageRect): boolean {
  const path = asPath(obj);
  if (!path) return false;
  const pad = hitRadius(path);
  const samples = samplePathPoints(path);
  if (samples.length === 0) {
    const box = paddedObjectRect(path, pad);
    const x0 = Math.max(box.x, rect.x);
    const y0 = Math.max(box.y, rect.y);
    const x1 = Math.min(box.x + box.width, rect.x + rect.width);
    const y1 = Math.min(box.y + box.height, rect.y + rect.height);
    return x1 > x0 && y1 > y0;
  }
  return samples.some((pt) => pointInExpandedRect(pt, rect, pad));
}

/** Caja de overlay/handles: el filete de 1 px se puede agarrar. No usar en layout. */
export function strokePathOutlineBounds(obj: FreehandObject, geometric: PageRect): PageRect {
  const path = asPath(obj);
  if (!path || !isLineLikePath(path)) return geometric;
  const pad = hitRadius(path);
  return {
    x: geometric.x - pad,
    y: geometric.y - pad,
    width: geometric.width + pad * 2,
    height: geometric.height + pad * 2,
  };
}
