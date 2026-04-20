/**
 * Unión / resta de polígonos cerrados para la selección tipo PhotoShop (PhotoRoom).
 * Usa Paper.js en un proyecto mínimo (sin lienzo visible).
 *
 * Importante: no importar `paper` en el nivel superior — en Next.js SSR eso ejecuta Paper
 * en Node y falla (p.ej. `.pjs`). Se carga en el primer uso en cliente con require perezoso.
 */

export type PhotoPolyPoint = { x: number; y: number };

/** Alcance Paper.js (`export =` en los tipos del paquete). */
type PaperLib = typeof import("paper");

const MIN_EDGE = 1e-9;

let cachedPaperLib: PaperLib | null | undefined;

function getPaperLib(): PaperLib | null {
  if (typeof window === "undefined") return null;
  if (cachedPaperLib === null) return null;
  if (cachedPaperLib !== undefined) return cachedPaperLib;
  try {
    // Carga diferida: no se ejecuta al evaluar este módulo en el servidor.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedPaperLib = require("paper").default as PaperLib;
  } catch {
    cachedPaperLib = null;
    return null;
  }
  return cachedPaperLib;
}

function ensurePaper(): PaperLib | null {
  const paper = getPaperLib();
  if (!paper) return null;
  if (!paper.project) {
    paper.setup(new paper.Size(32, 32));
  } else {
    paper.project.clear();
  }
  return paper;
}

/** Ray casting; `ring` cerrado. */
export function pointInPolygon(p: PhotoPolyPoint, ring: PhotoPolyPoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]!.x;
    const yi = ring[i]!.y;
    const xj = ring[j]!.x;
    const yj = ring[j]!.y;
    const denom = yj - yi;
    const intersect =
      (yi > p.y) !== (yj > p.y) &&
      p.x < ((xj - xi) * (p.y - yi)) / (denom + MIN_EDGE) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function sanitizeRing(ring: PhotoPolyPoint[]): PhotoPolyPoint[] {
  const out: PhotoPolyPoint[] = [];
  for (const q of ring) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - q.x) < 1e-9 && Math.abs(last.y - q.y) < 1e-9) continue;
    out.push({ ...q });
  }
  if (out.length >= 2) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop();
  }
  return out;
}

function ringToPath(paper: PaperLib, ring: PhotoPolyPoint[]): InstanceType<PaperLib["Path"]> | null {
  const r = sanitizeRing(ring);
  if (r.length < 3) return null;
  const p = new paper.Path();
  for (const q of r) p.add(new paper.Point(q.x, q.y));
  p.closed = true;
  return p;
}

function pathToRing(path: InstanceType<PaperLib["Path"]>): PhotoPolyPoint[] {
  const out: PhotoPolyPoint[] = [];
  for (let i = 0; i < path.segments.length; i++) {
    const s = path.segments[i]!;
    out.push({ x: s.point.x, y: s.point.y });
  }
  if (out.length >= 2) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop();
  }
  return out;
}

function itemToRings(paper: PaperLib, item: InstanceType<PaperLib["Item"]> | null): PhotoPolyPoint[][] {
  if (!item) return [];
  const out: PhotoPolyPoint[][] = [];
  if (item instanceof paper.CompoundPath) {
    for (const ch of item.children) {
      if (ch instanceof paper.Path) {
        const r = pathToRing(ch);
        if (r.length >= 3) out.push(r);
      }
    }
    return out;
  }
  if (item instanceof paper.Path) {
    const r = pathToRing(item);
    if (r.length >= 3) out.push(r);
    return out;
  }
  return out;
}

function polygonArea(ring: PhotoPolyPoint[]): number {
  if (ring.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y;
  }
  return Math.abs(a * 0.5);
}

function uniteRings(paper: PaperLib, rings: PhotoPolyPoint[][]): InstanceType<PaperLib["PathItem"]> | null {
  let acc: InstanceType<PaperLib["PathItem"]> | null = null;
  for (const ring of rings) {
    const p = ringToPath(paper, ring);
    if (!p) continue;
    if (!acc) {
      acc = p;
      continue;
    }
    const u = (acc as InstanceType<PaperLib["Path"]>).unite(p);
    (acc as InstanceType<PaperLib["Item"]>).remove();
    p.remove();
    acc = u;
  }
  return acc;
}

function mergePhotoPolygonSelectionNoPaper(
  prev: PhotoPolyPoint[][],
  nr: PhotoPolyPoint[],
  mode: "replace" | "add" | "subtract",
): PhotoPolyPoint[][] {
  if (mode === "replace") return nr.length >= 3 ? [nr] : [];
  if (mode === "add") {
    if (prev.length === 0) return nr.length >= 3 ? [nr] : [];
    return [...prev, nr].filter((r) => r.length >= 3);
  }
  return prev;
}

/**
 * Sustituye / suma / resta una región poligonal respecto a la selección previa (`prev` = contornos disjuntos).
 */
export function mergePhotoPolygonSelection(
  prev: PhotoPolyPoint[][],
  newRing: PhotoPolyPoint[],
  mode: "replace" | "add" | "subtract",
): PhotoPolyPoint[][] {
  const nr = sanitizeRing(newRing);
  if (nr.length < 3 || polygonArea(nr) < MIN_EDGE * MIN_EDGE * 10) {
    if (mode === "replace") return [];
    return prev;
  }

  const paper = ensurePaper();
  if (!paper) {
    return mergePhotoPolygonSelectionNoPaper(prev, nr, mode);
  }

  const clip = ringToPath(paper, nr);
  if (!clip) {
    if (mode === "replace") return [];
    return prev;
  }

  try {
    if (mode === "replace") {
      const rings = itemToRings(paper, clip);
      clip.remove();
      return rings;
    }

    if (mode === "subtract") {
      if (prev.length === 0) {
        clip.remove();
        return [];
      }
      const acc = uniteRings(paper, prev);
      if (!acc) {
        clip.remove();
        return [];
      }
      const sub = (acc as InstanceType<PaperLib["PathItem"]>).subtract(clip);
      (acc as InstanceType<PaperLib["Item"]>).remove();
      clip.remove();
      const rings = itemToRings(paper, sub);
      (sub as InstanceType<PaperLib["Item"]>).remove();
      return rings.filter((r) => r.length >= 3);
    }

    // add
    if (prev.length === 0) {
      const rings = itemToRings(paper, clip);
      clip.remove();
      return rings;
    }

    const acc = uniteRings(paper, prev);
    if (!acc) {
      const rings = itemToRings(paper, clip);
      clip.remove();
      return rings;
    }
    const uni = (acc as InstanceType<PaperLib["PathItem"]>).unite(clip);
    (acc as InstanceType<PaperLib["Item"]>).remove();
    clip.remove();
    const rings = itemToRings(paper, uni);
    (uni as InstanceType<PaperLib["Item"]>).remove();
    return rings.filter((r) => r.length >= 3);
  } catch {
    clip.remove();
    return mode === "replace" ? [] : prev;
  } finally {
    try {
      paper.project.clear();
    } catch {
      /* noop */
    }
  }
}

/** `d` de un único anillo (cerrado). */
export function ringToSvgPathD(ring: PhotoPolyPoint[]): string {
  const r = sanitizeRing(ring);
  if (r.length < 2) return "";
  const p0 = r[0]!;
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 1; i < r.length; i++) {
    d += ` L ${r[i]!.x} ${r[i]!.y}`;
  }
  d += " Z";
  return d;
}

/** Polilínea abierta (preview lazo). */
export function polylineToSvgPathD(points: PhotoPolyPoint[]): string {
  if (points.length === 0) return "";
  const p0 = points[0]!;
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]!.x} ${points[i]!.y}`;
  }
  return d;
}
