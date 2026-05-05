/**
 * Convierte rectángulo / elipse en PathObject con puntos Bézier (Selección directa).
 */

import paper from "paper";
import {
  type PathObject,
  type RectObject,
  type EllipseObject,
  rectangleToRoundedPath,
  normalizeCornerRadius,
} from "../FreehandStudio";

type BezierPoint = NonNullable<PathObject["points"]>[number];

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

function transformPointLikePrimitive(
  p: { x: number; y: number },
  o: { x: number; y: number; width: number; height: number; rotation?: number; flipX?: boolean; flipY?: boolean },
): { x: number; y: number } {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  let x = p.x;
  let y = p.y;
  if (o.rotation) {
    const rad = (o.rotation * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * c - dy * s;
    y = cy + dx * s + dy * c;
  }
  if (o.flipX) x = cx - (x - cx);
  if (o.flipY) y = cy - (y - cy);
  return { x, y };
}

function rectToSharpCornerPath(r: RectObject): PathObject {
  const raw = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ].map((p) => transformPointLikePrimitive(p, r));
  const points: BezierPoint[] = raw.map((anchor) => ({
    anchor: { ...anchor },
    handleIn: { ...anchor },
    handleOut: { ...anchor },
    vertexMode: "corner",
    cornerMode: true,
    cornerRadius: 0,
  }));
  const pb = boundsFromBezierPoints(points);
  const name = r.name.endsWith("(trazo)") ? r.name : `${r.name} (trazo)`;
  const rest = stripRectProps(r);
  return {
    ...rest,
    type: "path",
    name,
    x: pb.x,
    y: pb.y,
    width: pb.w,
    height: pb.h,
    rotation: 0,
    flipX: false,
    flipY: false,
    points,
    closed: true,
  } as PathObject;
}

function applyObjTransformToItem(
  item: paper.Item,
  o: { x: number; y: number; width: number; height: number; rotation?: number; flipX?: boolean; flipY?: boolean },
): void {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const c = new paper.Point(cx, cy);
  if (o.rotation) item.rotate(o.rotation, c);
  const fx = o.flipX ? -1 : 1;
  const fy = o.flipY ? -1 : 1;
  if (fx !== 1 || fy !== 1) item.scale(fx, fy, c);
}

function stripRectProps(r: RectObject): Omit<RectObject, "type" | "rx" | "cornerRadius" | "cornersLinked"> {
  const out = { ...r } as Partial<RectObject>;
  delete out.type;
  delete out.rx;
  delete out.cornerRadius;
  delete out.cornersLinked;
  return out as Omit<RectObject, "type" | "rx" | "cornerRadius" | "cornersLinked">;
}

function stripEllipseProps(e: EllipseObject): Omit<EllipseObject, "type"> {
  const out = { ...e } as Partial<EllipseObject>;
  delete out.type;
  return out as Omit<EllipseObject, "type">;
}

function buildPathFromShape(shape: paper.Shape, source: RectObject | EllipseObject): PathObject | null {
  applyObjTransformToItem(shape, source);
  const path = shape.toPath(false);
  if (!path || path.segments.length < 2) return null;

  const rings = [pathItemToRing(path)];
  const { points, contourStarts } = ringsToFlat(rings);
  const pb = boundsFromBezierPoints(points);
  const name = source.name.endsWith("(trazo)") ? source.name : `${source.name} (trazo)`;

  const stripped =
    source.type === "rect"
      ? stripRectProps(source as RectObject)
      : stripEllipseProps(source as EllipseObject);

  return {
    ...stripped,
    type: "path",
    name,
    x: pb.x,
    y: pb.y,
    width: pb.w,
    height: pb.h,
    rotation: 0,
    flipX: false,
    flipY: false,
    points,
    contourStarts: contourStarts.length > 1 ? contourStarts : undefined,
    closed: path.closed !== false,
  } as PathObject;
}

export function bakeRectToPath(r: RectObject): PathObject | null {
  if (typeof window === "undefined") return null;
  if (r.isImageFrame) return null;

  const canvas = document.createElement("canvas");
  paper.setup(canvas);

  const corners = normalizeCornerRadius(r.cornerRadius ?? r.rx ?? 0, r.width, r.height);
  const hasRadius =
    corners.topLeft > 1e-6 ||
    corners.topRight > 1e-6 ||
    corners.bottomRight > 1e-6 ||
    corners.bottomLeft > 1e-6;
  if (!hasRadius) return rectToSharpCornerPath(r);

  const d = rectangleToRoundedPath(
    { x: r.x, y: r.y, width: r.width, height: r.height },
    corners,
  );
  const compound = new paper.CompoundPath(d);
  const shape = compound.children[0] as paper.Path | undefined;
  if (!shape || shape.segments.length < 2) {
    paper.project.clear();
    return null;
  }
  applyObjTransformToItem(shape, r);
  const rings = [pathItemToRing(shape)];
  const { points, contourStarts } = ringsToFlat(rings);
  const pb = boundsFromBezierPoints(points);
  const name = r.name.endsWith("(trazo)") ? r.name : `${r.name} (trazo)`;
  const rest = stripRectProps(r);
  const out = {
    ...rest,
    type: "path",
    name,
    x: pb.x,
    y: pb.y,
    width: pb.w,
    height: pb.h,
    rotation: 0,
    flipX: false,
    flipY: false,
    points,
    contourStarts: contourStarts.length > 1 ? contourStarts : undefined,
    closed: true,
  } as PathObject;
  paper.project.clear();
  return out;
}

export function bakeEllipseToPath(e: EllipseObject): PathObject | null {
  if (typeof window === "undefined") return null;

  const canvas = document.createElement("canvas");
  paper.setup(canvas);

  const rect = new paper.Rectangle(e.x, e.y, e.width, e.height);
  const shape = new paper.Shape.Ellipse(rect);

  const out = buildPathFromShape(shape, e);
  paper.project.clear();
  return out;
}
