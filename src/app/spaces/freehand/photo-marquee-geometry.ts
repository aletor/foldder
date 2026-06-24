import { mergePhotoPolygonSelection, pointInPolygon } from "./photo-marquee-polygon-paper";

export type PhotoMarqueePoint = { x: number; y: number };
export type PhotoMarqueeRect = { x: number; y: number; w: number; h: number };
export type PhotoMarqueeEllipse = { cx: number; cy: number; rx: number; ry: number };

/** Muestreo de puntos en lazo libre (canvas world). */
export const PHOTO_LASSO_SAMPLE_PX = 4;
/** Clic cerca del primer vértice para cerrar polígono (se divide por zoom). */
export const PHOTO_POLY_CLOSE_PX = 14;

const PHOTO_MARQUEE_PT_EPS = 1e-9;

type ModifierPointerEvent = {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  nativeEvent?: MouseEvent;
};

export function isPhotoMarqueeAdditivePointerHeld(e: ModifierPointerEvent): boolean {
  if (e.altKey) return false;
  const ne = e.nativeEvent;
  if (ne && typeof ne.getModifierState === "function" && ne.getModifierState("Alt")) return false;
  if (e.ctrlKey || e.metaKey) return true;
  if (!ne || typeof ne.getModifierState !== "function") return false;
  return ne.getModifierState("Control") || ne.getModifierState("Meta");
}

/** Marco PhotoRoom: restar área — Alt / Option. */
export function isPhotoMarqueeSubtractPointerHeld(e: ModifierPointerEvent): boolean {
  if (e.altKey) return true;
  const ne = e.nativeEvent;
  return !!ne && typeof ne.getModifierState === "function" && ne.getModifierState("Alt");
}

/** Mayús al crear rectángulo/elipse: cuadrado / círculo perfecto (lado = max(|dx|,|dy|)). */
export function oppositeCornerForSquareDrag(origin: PhotoMarqueePoint, pointer: PhotoMarqueePoint): PhotoMarqueePoint {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  if (s === 0) return { ...origin };
  const signX = dx !== 0 ? Math.sign(dx) : Math.sign(dy);
  const signY = dy !== 0 ? Math.sign(dy) : Math.sign(dx);
  return { x: origin.x + signX * s, y: origin.y + signY * s };
}

export function pointInWorldRect(p: PhotoMarqueePoint, r: PhotoMarqueeRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function subtractRectFromRect(r: PhotoMarqueeRect, cut: PhotoMarqueeRect): PhotoMarqueeRect[] {
  const rectsIntersect = (a: PhotoMarqueeRect, b: PhotoMarqueeRect) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  if (!rectsIntersect(r, cut)) return [{ ...r }];
  const ix1 = Math.max(r.x, cut.x);
  const iy1 = Math.max(r.y, cut.y);
  const ix2 = Math.min(r.x + r.w, cut.x + cut.w);
  const iy2 = Math.min(r.y + r.h, cut.y + cut.h);
  if (ix2 <= ix1 || iy2 <= iy1) return [{ ...r }];
  const out: PhotoMarqueeRect[] = [];
  if (iy1 > r.y) {
    const h = iy1 - r.y;
    if (h > 0 && r.w > 0) out.push({ x: r.x, y: r.y, w: r.w, h });
  }
  if (iy2 < r.y + r.h) {
    const h = r.y + r.h - iy2;
    if (h > 0 && r.w > 0) out.push({ x: r.x, y: iy2, w: r.w, h });
  }
  const midH = iy2 - iy1;
  if (midH > 0) {
    if (ix1 > r.x) {
      const w = ix1 - r.x;
      if (w > 0) out.push({ x: r.x, y: iy1, w, h: midH });
    }
    if (ix2 < r.x + r.w) {
      const w = r.x + r.w - ix2;
      if (w > 0) out.push({ x: ix2, y: iy1, w, h: midH });
    }
  }
  return out;
}

/** Rectángulo de marco → anillo CCW para operaciones con polígonos (Paper). */
export function rectToPhotoMarqueeRing(r: PhotoMarqueeRect): PhotoMarqueePoint[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function pointInPhotoEllipse(p: PhotoMarqueePoint, e: PhotoMarqueeEllipse): boolean {
  if (e.rx <= 0 || e.ry <= 0) return false;
  const dx = (p.x - e.cx) / e.rx;
  const dy = (p.y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

/** Anillo para Paper.js (aprox. círculo/elipse). */
export function ellipseToPhotoMarqueeRing(e: PhotoMarqueeEllipse, segments = 64): PhotoMarqueePoint[] {
  const { cx, cy, rx, ry } = e;
  if (rx <= 0 || ry <= 0) return [];
  const out: PhotoMarqueePoint[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return out;
}

/** Base poligonal para sumar/restar: polígonos + rectángulos + elipses como anillos. `replace` → []. */
export function buildPhotoMarqueePolyBase(
  prevPoly: PhotoMarqueePoint[][],
  prevRects: PhotoMarqueeRect[],
  prevEllipses: PhotoMarqueeEllipse[],
  mode: "replace" | "add" | "subtract",
): PhotoMarqueePoint[][] {
  if (mode === "replace") return [];
  let acc = prevPoly;
  for (const r of prevRects) {
    acc = mergePhotoPolygonSelection(acc, rectToPhotoMarqueeRing(r), "add");
  }
  for (const el of prevEllipses) {
    const ring = ellipseToPhotoMarqueeRing(el);
    if (ring.length >= 3) acc = mergePhotoPolygonSelection(acc, ring, "add");
  }
  return acc;
}

/** Tipos de `dragState` exclusivos del marco raster (rect/elipse/lazo). */
export function isPhotoMarqueeStudioDragType(t: string): boolean {
  return (
    t === "photoRectMarquee" ||
    t === "photoEllipseMarquee" ||
    t === "photoLassoMarquee" ||
    t === "photoPolygonMarquee" ||
    t === "photoMarqueeNudge" ||
    t === "photoMarqueeFloatRotate" ||
    t === "photoMarqueeFloatResize"
  );
}

export function photoMarqueePointInsideCommitted(
  pos: PhotoMarqueePoint,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
): boolean {
  if (rects.some((r) => pointInWorldRect(pos, r))) return true;
  if (polys.some((ring) => pointInPolygon(pos, ring))) return true;
  if (ellipses.some((el) => pointInPhotoEllipse(pos, el))) return true;
  return false;
}

export function translatePhotoMarqueeCommitted(
  dx: number,
  dy: number,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
): { rects: PhotoMarqueeRect[]; polys: PhotoMarqueePoint[][]; ellipses: PhotoMarqueeEllipse[] } {
  return {
    rects: rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
    polys: polys.map((ring) => ring.map((p) => ({ x: p.x + dx, y: p.y + dy }))),
    ellipses: ellipses.map((e) => ({ ...e, cx: e.cx + dx, cy: e.cy + dy })),
  };
}

export function unionPhotoMarqueeWorldBounds(
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
): PhotoMarqueeRect | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const expand = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const r of rects) {
    expand(r.x, r.y);
    expand(r.x + r.w, r.y + r.h);
  }
  for (const ring of polys) {
    for (const p of ring) expand(p.x, p.y);
  }
  for (const e of ellipses) {
    expand(e.cx - e.rx, e.cy - e.ry);
    expand(e.cx + e.rx, e.cy + e.ry);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function invertPhotoMarqueePolysWithinBounds(
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
  bounds: PhotoMarqueeRect,
): PhotoMarqueePoint[][] {
  if (bounds.w < 1e-9 || bounds.h < 1e-9) return [];

  if (polys.length === 0 && ellipses.length === 0 && rects.length > 0) {
    let pieces: PhotoMarqueeRect[] = [{ ...bounds }];
    for (const s of rects) {
      pieces = pieces.flatMap((p) => subtractRectFromRect(p, s));
    }
    return pieces
      .filter((r) => r.w > 1e-9 && r.h > 1e-9)
      .map((r) => rectToPhotoMarqueeRing(r))
      .filter((ring) => ring.length >= 3);
  }

  let acc: PhotoMarqueePoint[][] = [rectToPhotoMarqueeRing(bounds)];
  for (const r of rects) {
    acc = mergePhotoPolygonSelection(acc, rectToPhotoMarqueeRing(r), "subtract");
  }
  for (const ring of polys) {
    if (ring.length >= 3) acc = mergePhotoPolygonSelection(acc, ring, "subtract");
  }
  for (const el of ellipses) {
    const ring = ellipseToPhotoMarqueeRing(el);
    if (ring.length >= 3) acc = mergePhotoPolygonSelection(acc, ring, "subtract");
  }
  return acc.filter((r) => r.length >= 3);
}

type MarqueeImageCandidate = {
  id: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  src?: string;
};

/** Exactamente una capa `image` visible y no bloqueada en la selección. */
export function findSingleSelectedImageForPhotoMarquee<T extends MarqueeImageCandidate>(
  sel: Set<string>,
  objs: readonly T[],
): T | undefined {
  let found: T | undefined;
  for (const id of sel) {
    const o = objs.find((x) => x.id === id);
    if (o?.type !== "image" || !o.visible || o.locked) continue;
    if (found) return undefined;
    found = o;
  }
  return found;
}

export type PhotoMarqueeHitTestFn = (
  pos: PhotoMarqueePoint,
  obj: unknown,
  threshold: number,
  all: readonly unknown[],
) => boolean;

function pickTopVisibleObjectForCursor<T extends { visible?: boolean; locked?: boolean; isClipMask?: boolean; clipMaskId?: string | null; type: string }>(
  pos: PhotoMarqueePoint,
  objs: readonly T[],
  threshold: number,
  hitTest: PhotoMarqueeHitTestFn,
): T | null {
  for (let i = objs.length - 1; i >= 0; i--) {
    const obj = objs[i]!;
    if (!obj.visible || obj.locked) continue;
    if (obj.isClipMask || obj.clipMaskId) continue;
    if (hitTest(pos, obj, threshold, objs)) return obj;
  }
  return null;
}

/** Marcos raster: requieren una única imagen activa; si la selección no es eso o el hover cae en no-imagen, inactivo. */
export function photoRoomMarqueeToolCursorBlocked(
  pos: PhotoMarqueePoint,
  sel: Set<string>,
  objs: readonly MarqueeImageCandidate[],
  threshold: number,
  hitTest: PhotoMarqueeHitTestFn,
): boolean {
  const sole = findSingleSelectedImageForPhotoMarquee(sel, objs);
  if (sole) return false;
  if (sel.size > 0) return true;
  const top = pickTopVisibleObjectForCursor(pos, objs, threshold, hitTest);
  if (!top) return false;
  return top.type !== "image";
}

function photoMarqueePtKey(p: PhotoMarqueePoint): string {
  return `${p.x},${p.y}`;
}

function photoMarqueeSamePt(a: PhotoMarqueePoint, b: PhotoMarqueePoint): boolean {
  return Math.abs(a.x - b.x) < PHOTO_MARQUEE_PT_EPS && Math.abs(a.y - b.y) < PHOTO_MARQUEE_PT_EPS;
}

function cellOverlapsRectUnion(x1: number, x2: number, y1: number, y2: number, rects: PhotoMarqueeRect[]): boolean {
  for (const r of rects) {
    if (x2 <= r.x || x1 >= r.x + r.w || y2 <= r.y || y1 >= r.y + r.h) continue;
    return true;
  }
  return false;
}

/**
 * Contorno ortogonal de la unión de rectángulos alineados a ejes: un solo trazo por componente
 * conexa (sin aristas internas donde los rectángulos se solapan o comparten lado).
 */
export function rectUnionBoundarySvgPathDs(rects: PhotoMarqueeRect[]): string[] {
  const valid = rects.filter((r) => r.w > 0 && r.h > 0);
  if (valid.length === 0) return [];

  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const r of valid) {
    xs.add(r.x);
    xs.add(r.x + r.w);
    ys.add(r.y);
    ys.add(r.y + r.h);
  }
  const xsa = [...xs].sort((a, b) => a - b);
  const ysa = [...ys].sort((a, b) => a - b);
  const nx = xsa.length - 1;
  const ny = ysa.length - 1;
  if (nx <= 0 || ny <= 0) return [];

  const filled = new Array<boolean>(nx * ny);
  const fi = (i: number, j: number) => i + j * nx;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      filled[fi(i, j)] = cellOverlapsRectUnion(xsa[i]!, xsa[i + 1]!, ysa[j]!, ysa[j + 1]!, valid);
    }
  }

  type Pt = PhotoMarqueePoint;
  type Seg = { a: Pt; b: Pt; id: number };
  const segs: Seg[] = [];
  let sid = 0;

  for (let vi = 0; vi <= nx; vi++) {
    const x = xsa[vi]!;
    for (let j = 0; j < ny; j++) {
      const L = vi > 0 && filled[fi(vi - 1, j)]!;
      const R = vi < nx && filled[fi(vi, j)]!;
      if (L !== R) {
        segs.push({ a: { x, y: ysa[j]! }, b: { x, y: ysa[j + 1]! }, id: sid++ });
      }
    }
  }

  for (let hj = 0; hj <= ny; hj++) {
    const y = ysa[hj]!;
    for (let i = 0; i < nx; i++) {
      const B = hj > 0 && filled[fi(i, hj - 1)]!;
      const T = hj < ny && filled[fi(i, hj)]!;
      if (B !== T) {
        segs.push({ a: { x: xsa[i]!, y }, b: { x: xsa[i + 1]!, y }, id: sid++ });
      }
    }
  }

  if (segs.length === 0) return [];

  const adj = new Map<string, { other: Pt; id: number }[]>();
  const addAdj = (u: Pt, v: Pt, id: number) => {
    const ku = photoMarqueePtKey(u);
    const kv = photoMarqueePtKey(v);
    if (!adj.has(ku)) adj.set(ku, []);
    if (!adj.has(kv)) adj.set(kv, []);
    adj.get(ku)!.push({ other: v, id });
    adj.get(kv)!.push({ other: u, id });
  };
  for (const s of segs) addAdj(s.a, s.b, s.id);

  const used = new Set<number>();
  const loops: Pt[][] = [];

  for (const s of segs) {
    if (used.has(s.id)) continue;
    const trial = new Set<number>([s.id]);
    let cur = s.b;
    let lastSeg = s.id;
    const loop: Pt[] = [s.a, s.b];
    let guard = 0;
    let closed = false;
    while (guard++ <= segs.length + 4) {
      const list = adj.get(photoMarqueePtKey(cur));
      if (!list) break;
      const nbrs = list.filter((n) => n.id !== lastSeg);
      if (nbrs.length !== 1) break;
      const nbr = nbrs[0]!;
      trial.add(nbr.id);
      lastSeg = nbr.id;
      cur = nbr.other;
      if (photoMarqueeSamePt(cur, s.a)) {
        closed = true;
        break;
      }
      loop.push(cur);
    }
    if (closed && loop.length >= 3) {
      trial.forEach((id) => used.add(id));
      loops.push(loop);
    } else {
      trial.forEach((id) => used.add(id));
    }
  }

  return loops.map((loop) => {
    if (loop.length < 2) return "";
    const p0 = loop[0]!;
    let d = `M ${p0.x} ${p0.y}`;
    for (let i = 1; i < loop.length; i++) d += ` L ${loop[i]!.x} ${loop[i]!.y}`;
    return `${d} Z`;
  }).filter((d) => d.length > 0);
}
