/**
 * Convierte un PathObject con solo `svgPathD` (y opcionalmente intrínsecos) en puntos Bézier editables.
 * Usa Paper.js (mismo motor que el boolean). Solo cliente.
 */

import paper from "paper";

type BezierPoint = {
  anchor: { x: number; y: number };
  handleIn: { x: number; y: number };
  handleOut: { x: number; y: number };
  vertexMode?: "smooth" | "cusp" | "corner";
  cornerMode?: boolean;
};

/** Campos mínimos + resto por referencia (se devuelve objeto extendido). */
export type SvgPathBakeInput = {
  id: string;
  type: "path";
  x: number;
  y: number;
  width: number;
  height: number;
  points: BezierPoint[];
  closed: boolean;
  contourStarts?: number[];
  svgPathD?: string;
  svgPathIntrinsicW?: number;
  svgPathIntrinsicH?: number;
  svgPathMatrix?: { a: number; b: number; c: number; d: number; e: number; f: number };
  [key: string]: unknown;
};

function paperSegmentToBezier(seg: paper.Segment): BezierPoint {
  const ax = seg.point.x;
  const ay = seg.point.y;
  const inCollapsed = Math.hypot(seg.handleIn.x, seg.handleIn.y) < 1e-5;
  const outCollapsed = Math.hypot(seg.handleOut.x, seg.handleOut.y) < 1e-5;
  const isCorner = inCollapsed || outCollapsed;
  return {
    anchor: { x: ax, y: ay },
    handleIn: { x: ax + seg.handleIn.x, y: ay + seg.handleIn.y },
    handleOut: { x: ax + seg.handleOut.x, y: ay + seg.handleOut.y },
    vertexMode: isCorner ? "corner" : "smooth",
    cornerMode: isCorner,
  };
}

function pathItemToRing(paperPath: paper.Path): BezierPoint[] {
  return paperPath.segments.map((s) => paperSegmentToBezier(s));
}

function ringsToFlat(rings: BezierPoint[][]): { points: BezierPoint[]; contourStarts: number[] } {
  const points: BezierPoint[] = [];
  const contourStarts: number[] = [];
  for (const r of rings) {
    contourStarts.push(points.length);
    points.push(...r);
  }
  return { points, contourStarts };
}

function extractRingsFromPaperItem(item: paper.Item): BezierPoint[][] {
  if (item instanceof paper.CompoundPath && item.children?.length) {
    return item.children.map((ch) => pathItemToRing(ch as paper.Path));
  }
  if (item instanceof paper.Path) {
    return [pathItemToRing(item)];
  }
  return [];
}

function boundsFromBezierPoints(points: BezierPoint[]): { x: number; y: number; w: number; h: number } {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const pt of points) {
    for (const q of [pt.anchor, pt.handleIn, pt.handleOut]) {
      x1 = Math.min(x1, q.x);
      y1 = Math.min(y1, q.y);
      x2 = Math.max(x2, q.x);
      y2 = Math.max(y2, q.y);
    }
  }
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1e-6), h: Math.max(y2 - y1, 1e-6) };
}

export function bakeSvgPathObjectToBezier(p: SvgPathBakeInput): SvgPathBakeInput | null {
  if (typeof window === "undefined") return null;
  if (!p.svgPathD || String(p.svgPathD).trim().length === 0) return null;
  if (p.points && p.points.length >= 2) return null;

  const canvas = document.createElement("canvas");
  paper.setup(canvas);

  const localD = String(p.svgPathD).trim();
  const iw = p.svgPathIntrinsicW;
  const ih = p.svgPathIntrinsicH;

  let geom: paper.Item | null = null;
  try {
    geom = new paper.CompoundPath({ pathData: localD, insert: true });
  } catch {
    paper.project.clear();
    return null;
  }

  if (!geom) {
    paper.project.clear();
    return null;
  }

  if (iw != null && ih != null) {
    const sx = p.width / Math.max(iw, 1e-9);
    const sy = p.height / Math.max(ih, 1e-9);
    const m = new paper.Matrix(sx, 0, 0, sy, p.x, p.y);
    geom.transform(m);
  } else if (p.svgPathMatrix) {
    const m = p.svgPathMatrix;
    geom.transform(new paper.Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
  }

  const rings = extractRingsFromPaperItem(geom).filter((r) => r.length >= 2);
  paper.project.clear();

  if (rings.length === 0) return null;

  const { points, contourStarts } = ringsToFlat(rings);
  const pb = boundsFromBezierPoints(points);

  return {
    ...p,
    points,
    contourStarts: contourStarts.length > 1 ? contourStarts : undefined,
    closed: true,
    svgPathD: undefined,
    svgPathIntrinsicW: undefined,
    svgPathIntrinsicH: undefined,
    svgPathMatrix: undefined,
    x: pb.x,
    y: pb.y,
    width: pb.w,
    height: pb.h,
  };
}
