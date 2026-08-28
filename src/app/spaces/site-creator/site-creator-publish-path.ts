/**
 * Serializa paths de Designer a `d` + viewBox para el HTML publicado.
 * No importa FreehandStudio: el compilador no puede usar el renderer SVG.
 */
import type { FreehandObject } from "@/app/spaces/FreehandStudio";

type BezierLike = {
  anchor: { x: number; y: number };
  handleIn: { x: number; y: number };
  handleOut: { x: number; y: number };
};

export type PublishedPathGeom = {
  d: string;
  viewBox: { x: number; y: number; width: number; height: number };
  matrix?: { a: number; b: number; c: number; d: number; e: number; f: number };
};

function handlesCollapsed(
  handle: { x: number; y: number },
  anchor: { x: number; y: number },
): boolean {
  return Math.hypot(handle.x - anchor.x, handle.y - anchor.y) < 0.75;
}

function bezierRingToD(points: BezierLike[], closed: boolean): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  let d = `M ${first.anchor.x} ${first.anchor.y}`;
  const append = (prev: BezierLike, curr: BezierLike, target: { x: number; y: number }) => {
    const straight =
      handlesCollapsed(prev.handleOut, prev.anchor) && handlesCollapsed(curr.handleIn, curr.anchor);
    if (straight) d += ` L ${target.x} ${target.y}`;
    else {
      d += ` C ${prev.handleOut.x} ${prev.handleOut.y} ${curr.handleIn.x} ${curr.handleIn.y} ${target.x} ${target.y}`;
    }
  };
  for (let i = 1; i < points.length; i++) append(points[i - 1]!, points[i]!, points[i]!.anchor);
  if (closed && points.length > 1) {
    append(points[points.length - 1]!, first, first.anchor);
    d += " Z";
  }
  return d;
}

function ringsFromPath(obj: {
  points?: BezierLike[];
  contourStarts?: number[];
  closed?: boolean;
}): string {
  const points = obj.points ?? [];
  if (points.length < 2) return "";
  const starts = obj.contourStarts && obj.contourStarts.length > 1 ? obj.contourStarts : [0];
  const closed = obj.closed === true || starts.length > 1;
  const parts: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i]!;
    const b = i + 1 < starts.length ? starts[i + 1]! : points.length;
    const ring = points.slice(a, b);
    const d = bezierRingToD(ring, closed);
    if (d) parts.push(d);
  }
  return parts.join(" ");
}

export function publishedPathGeom(obj: FreehandObject): PublishedPathGeom | null {
  if (obj.type !== "path") return null;
  const path = obj as FreehandObject & {
    svgPathD?: string;
    svgPathIntrinsicW?: number;
    svgPathIntrinsicH?: number;
    svgPathMatrix?: { a: number; b: number; c: number; d: number; e: number; f: number };
    points?: BezierLike[];
    contourStarts?: number[];
    closed?: boolean;
  };
  const svgD = typeof path.svgPathD === "string" ? path.svgPathD.trim() : "";
  const useSvgD = svgD.length > 0 && (!path.points || path.points.length < 2);
  const d = useSvgD ? svgD : ringsFromPath(path);
  if (!d) return null;

  const iw = path.svgPathIntrinsicW;
  const ih = path.svgPathIntrinsicH;
  const matrix = path.svgPathMatrix;
  if (useSvgD && typeof iw === "number" && iw > 0 && typeof ih === "number" && ih > 0) {
    return { d, viewBox: { x: 0, y: 0, width: iw, height: ih }, matrix };
  }
  if (useSvgD) {
    return {
      d,
      viewBox: { x: 0, y: 0, width: Math.max(1, obj.width), height: Math.max(1, obj.height) },
      matrix,
    };
  }
  return {
    d,
    viewBox: {
      x: obj.x,
      y: obj.y,
      width: Math.max(1, obj.width),
      height: Math.max(1, obj.height),
    },
    matrix,
  };
}

export function ellipseClipPathCss(): string {
  return "ellipse(50% 50% at 50% 50%)";
}
