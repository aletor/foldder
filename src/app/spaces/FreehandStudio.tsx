"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  X,
  MousePointer2,
  Square,
  Circle,
  PenTool,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Download,
  Undo2,
  Redo2,
  Upload,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Group,
  Ungroup,
  Minus,
  RectangleHorizontal,
  Triangle,
  Diamond,
  Layers,
  Crop,
  Split,
  Spline,
  Unlink2,
  Type,
  Blend,
  Magnet,
  Grid3x3,
  Image as ImageIconLucide,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Hand,
  ZoomIn,
  Droplet,
} from "lucide-react";
import { FreehandExportModal, type ProfessionalExportOptions } from "./freehand/FreehandExportModal";
import {
  buildStandaloneSvgFromCanvasDom,
  boundsOfObjects,
  expandExportIds,
  type Rect as ExportRect,
} from "./freehand/freehand-export";
import {
  type FillAppearance,
  migrateFill,
  solidFill,
  cloneFill,
  defaultLinearGradient,
  defaultRadialGradient,
  fillPaintValue,
  renderFillDef,
  fillDefSvgString,
  gradientDefId,
  fillHasPaint,
  linearGradientFromAngle,
  angleFromLinearGradient,
  reverseGradientStops,
  addMidStop,
  textFillCssProperties,
} from "./freehand/fill";
import { textToOutlinePaths } from "./freehand/text-outline";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Tool =
  | "select"
  | "directSelect"
  | "pen"
  | "rect"
  | "ellipse"
  | "gradient"
  | "text"
  | "eyedropper"
  | "handTool"
  | "zoomTool";

interface Point { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }

/** Illustrator-style: smooth = symmetric tangents; cusp = G1 continuous, independent lengths; corner = independent handles (sharp). */
type VertexMode = "smooth" | "cusp" | "corner";

interface BezierPoint {
  anchor: Point;
  handleIn: Point;
  handleOut: Point;
  /** @deprecated Prefer `vertexMode`. Kept for older saved paths. */
  cornerMode?: boolean;
  vertexMode?: VertexMode;
}

function getVertexMode(pt: BezierPoint): VertexMode {
  if (pt.vertexMode) return pt.vertexMode;
  if (pt.cornerMode) return "corner";
  return "smooth";
}

/** Apply drag to one handle according to vertex mode (see Adobe Illustrator anchor point types). */
function applyVertexHandleDrag(pt: BezierPoint, ht: "handleIn" | "handleOut", newPos: Point): BezierPoint {
  const mode = getVertexMode(pt);
  if (mode === "corner") {
    return { ...pt, [ht]: newPos };
  }
  if (mode === "smooth") {
    if (ht === "handleOut") {
      const handleIn = { x: 2 * pt.anchor.x - newPos.x, y: 2 * pt.anchor.y - newPos.y };
      return { ...pt, handleOut: newPos, handleIn };
    }
    const handleOut = { x: 2 * pt.anchor.x - newPos.x, y: 2 * pt.anchor.y - newPos.y };
    return { ...pt, handleIn: newPos, handleOut };
  }
  // cusp: opposite tangent directions, preserve each side's handle length (asymmetric smooth / "broken" handles)
  if (ht === "handleOut") {
    const dx = newPos.x - pt.anchor.x, dy = newPos.y - pt.anchor.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / len, uy = dy / len;
    const lenIn = Math.max(1e-6, dist(pt.anchor, pt.handleIn));
    return {
      ...pt,
      handleOut: newPos,
      handleIn: { x: pt.anchor.x - ux * lenIn, y: pt.anchor.y - uy * lenIn },
    };
  }
  const dx = newPos.x - pt.anchor.x, dy = newPos.y - pt.anchor.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  const ux = dx / len, uy = dy / len;
  const lenOut = Math.max(1e-6, dist(pt.anchor, pt.handleOut));
  return {
    ...pt,
    handleIn: newPos,
    handleOut: { x: pt.anchor.x - ux * lenOut, y: pt.anchor.y - uy * lenOut },
  };
}

/** When switching mode from UI: normalize handles to a valid state for that mode. */
function normalizeBezierPointForVertexMode(pt: BezierPoint, mode: VertexMode): BezierPoint {
  const a = pt.anchor;
  if (mode === "corner") {
    return { ...pt, vertexMode: "corner", cornerMode: true };
  }
  let out = pt.handleOut;
  let inn = pt.handleIn;
  if (dist(a, out) < 1e-6 && dist(a, inn) < 1e-6) {
    out = { x: a.x + 48, y: a.y };
    inn = { x: a.x - 48, y: a.y };
  }
  if (mode === "smooth") {
    const handleIn = { x: 2 * a.x - out.x, y: 2 * a.y - out.y };
    return { ...pt, vertexMode: "smooth", cornerMode: false, handleOut: out, handleIn };
  }
  const dx = out.x - a.x, dy = out.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const ux = dx / L, uy = dy / L;
  const lenIn = Math.max(1e-6, dist(a, inn));
  const lenOut = Math.max(1e-6, dist(a, out));
  return {
    ...pt,
    vertexMode: "cusp",
    cornerMode: false,
    handleOut: { x: a.x + ux * lenOut, y: a.y + uy * lenOut },
    handleIn: { x: a.x - ux * lenIn, y: a.y - uy * lenIn },
  };
}

interface FreehandObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: FillAppearance;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "butt" | "round" | "square";
  strokeLinejoin: "miter" | "round" | "bevel";
  strokeDasharray: string;
  opacity: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  name: string;
  groupId?: string;
  clipMaskId?: string;
  isClipMask?: boolean;
}

interface RectObject extends FreehandObjectBase { type: "rect"; rx: number }
interface EllipseObject extends FreehandObjectBase { type: "ellipse" }
interface PathObject extends FreehandObjectBase { type: "path"; points: BezierPoint[]; closed: boolean }
interface ImageObject extends FreehandObjectBase { type: "image"; src: string }

interface TextObject extends FreehandObjectBase {
  type: "text";
  textMode: "point" | "area";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right" | "justify";
}

type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";

interface BooleanGroupObject extends FreehandObjectBase {
  type: "booleanGroup";
  operation: BooleanOperation;
  children: FreehandObject[];
  cachedResult?: string;
}

/** Non-destructive clip: vector mask + nested content (supports nesting). */
export interface ClippingContainerObject extends FreehandObjectBase {
  type: "clippingContainer";
  mask: RectObject | EllipseObject | PathObject;
  content: FreehandObject[];
}

export type FreehandObject = RectObject | EllipseObject | PathObject | ImageObject | TextObject | BooleanGroupObject | ClippingContainerObject;

interface FreehandStudioProps {
  nodeId: string;
  inputImages: string[];
  initialObjects: FreehandObject[];
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onUpdateObjects: (objects: FreehandObject[]) => void;
}

interface ContextMenuItem {
  label: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

type IsolationFrame =
  | {
      kind: "boolean";
      groupId: string;
      parentObjects: FreehandObject[];
      parentSelectedIds: Set<string>;
      parentHistory: { objects: FreehandObject[]; sel: string[] }[];
      parentHistoryIdx: number;
    }
  | {
      kind: "clipping";
      containerId: string;
      editMode: "content" | "mask";
      /** When editing mask, clipboard for content. */
      storedContent: FreehandObject[] | null;
      parentObjects: FreehandObject[];
      parentSelectedIds: Set<string>;
      parentHistory: { objects: FreehandObject[]; sel: string[] }[];
      parentHistoryIdx: number;
    };

interface SnapGuide { axis: "x" | "y"; pos: number }

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let _idC = 0;
function uid() { return `fh_${Date.now()}_${_idC++}`; }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function dist(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Normalized 0–1 in object box → world (respects rotation). */
function localBoxToWorld(o: FreehandObject, lx: number, ly: number): Point {
  const p = { x: o.x + lx * o.width, y: o.y + ly * o.height };
  const c = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
  return rotatePointAround(p, c, o.rotation);
}

function worldToLocalBox(o: FreehandObject, p: Point): { lx: number; ly: number } {
  const c = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
  const u = rotatePointAround(p, c, -o.rotation);
  return { lx: (u.x - o.x) / Math.max(o.width, 1e-9), ly: (u.y - o.y) / Math.max(o.height, 1e-9) };
}

function supportsGradientFill(o: FreehandObject): boolean {
  if (!o.visible || o.locked) return false;
  if (o.type === "image" || o.type === "booleanGroup" || o.type === "clippingContainer") return false;
  if (o.type === "path" && !(o as PathObject).closed) return false;
  return true;
}

const DEFAULT_STROKE_PROPS = {
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeDasharray: "",
};

function defaultObj(partial: Partial<FreehandObjectBase>): FreehandObjectBase {
  return {
    id: uid(),
    type: "rect",
    x: 0, y: 0, width: 100, height: 100,
    fill: solidFill("#6366f1"),
    stroke: "#ffffff",
    strokeWidth: 2,
    ...DEFAULT_STROKE_PROPS,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    name: "Object",
    ...partial,
  } as FreehandObjectBase;
}

// ── Geometry ────────────────────────────────────────────────────────────

function pointInRotatedRect(px: number, py: number, obj: FreehandObject): boolean {
  const rad = (-obj.rotation * Math.PI) / 180;
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const dx = px - cx, dy = py - cy;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + obj.width / 2;
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad) + obj.height / 2;
  return rx >= 0 && rx <= obj.width && ry >= 0 && ry <= obj.height;
}

function pointInEllipse(px: number, py: number, obj: FreehandObject): boolean {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const rad = (-obj.rotation * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  const rx2 = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry2 = dx * Math.sin(rad) + dy * Math.cos(rad);
  const a = obj.width / 2, b = obj.height / 2;
  return (rx2 * rx2) / (a * a) + (ry2 * ry2) / (b * b) <= 1;
}

function cubicBezierAt(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function distToSegmentBezier(pos: Point, p0: Point, cp1: Point, cp2: Point, p3: Point, samples = 24): number {
  let minD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const pt = cubicBezierAt(i / samples, p0, cp1, cp2, p3);
    minD = Math.min(minD, dist(pos, pt));
  }
  return minD;
}

function distToPathSegments(pos: Point, path: PathObject): { dist: number; segIdx: number; t: number } {
  let best = { dist: Infinity, segIdx: -1, t: 0 };
  const pts = path.points;
  const segCount = path.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % pts.length;
    const p0 = pts[i].anchor;
    const cp1 = pts[i].handleOut;
    const cp2 = pts[j].handleIn;
    const p3 = pts[j].anchor;
    const samples = 24;
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const pt = cubicBezierAt(t, p0, cp1, cp2, p3);
      const d = dist(pos, pt);
      if (d < best.dist) best = { dist: d, segIdx: i, t };
    }
  }
  return best;
}

function hitTestObject(pos: Point, obj: FreehandObject, threshold: number): boolean {
  if (!obj.visible || obj.locked) return false;
  if (obj.isClipMask) return false;
  switch (obj.type) {
    case "text":
      return pointInRotatedRect(pos.x, pos.y, obj);
    case "ellipse": return pointInEllipse(pos.x, pos.y, obj);
    case "path": {
      const pathObj = obj as PathObject;
      if (pathObj.closed && pointInRotatedRect(pos.x, pos.y, obj)) return true;
      return distToPathSegments(pos, pathObj).dist < threshold;
    }
    case "booleanGroup":
    case "rect":
    case "image":
      return pointInRotatedRect(pos.x, pos.y, obj);
    case "clippingContainer": {
      const c = obj as ClippingContainerObject;
      const lp = worldPointToLocal(c, pos);
      const m = c.mask;
      if (m.type === "ellipse") {
        const pseudo = { ...m, rotation: 0 } as EllipseObject;
        return pointInEllipse(lp.x, lp.y, pseudo);
      }
      if (m.type === "rect") {
        const pseudo = { ...m, rotation: 0 } as RectObject;
        return pointInRotatedRect(lp.x, lp.y, pseudo);
      }
      const pathObj = m as PathObject;
      if (pathObj.closed && pointInRotatedRect(lp.x, lp.y, { ...pathObj, rotation: 0 })) return true;
      return distToPathSegments(lp, pathObj).dist < threshold;
    }
    default: return pointInRotatedRect(pos.x, pos.y, obj);
  }
}

function getPathBoundsFromPoints(points: BezierPoint[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const pt of points) {
    for (const p of [pt.anchor, pt.handleIn, pt.handleOut]) {
      x1 = Math.min(x1, p.x);
      y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x);
      y2 = Math.max(y2, p.y);
    }
  }
  // Also sample curve segments for tighter bounds
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      const pt = cubicBezierAt(t, a.anchor, a.handleOut, b.handleIn, b.anchor);
      x1 = Math.min(x1, pt.x); y1 = Math.min(y1, pt.y);
      x2 = Math.max(x2, pt.x); y2 = Math.max(y2, pt.y);
    }
  }
  if (points.length > 1) {
    const last = points[points.length - 1], first = points[0];
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      const pt = cubicBezierAt(t, last.anchor, last.handleOut, first.handleIn, first.anchor);
      x1 = Math.min(x1, pt.x); y1 = Math.min(y1, pt.y);
      x2 = Math.max(x2, pt.x); y2 = Math.max(y2, pt.y);
    }
  }
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

function degToRad(d: number) { return (d * Math.PI) / 180; }

/** Mayús durante arrastre = control fino (mover / escalar). */
/**
 * Píxeles de puntero → delta en espacio del lienzo. Con zoom < 1, 1/zoom dispara demasiado el tamaño
 * al redimensionar; amortiguamos solo en resize. El movimiento mantiene 1/zoom para seguir el cursor.
 */
function canvasScaleFromPointer(zoom: number, kind: "move" | "resize"): number {
  const inv = 1 / zoom;
  if (kind === "resize" && zoom < 1) return inv * Math.sqrt(zoom);
  return inv;
}

function isShiftHeld(e: ReactMouseEvent): boolean {
  return e.shiftKey || (typeof e.getModifierState === "function" && e.getModifierState("Shift"));
}

function constrainToAxis(dx: number, dy: number): { x: number; y: number } {
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx, y: 0 };
  return { x: 0, y: dy };
}

/** Delta angular más corto entre dos ángulos (rad), evita saltos de atan2 al cruzar ±π. */
function shortestAngleDeltaRad(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Rotate point around center (degrees, SVG-style). */
function rotatePointAround(p: Point, c: Point, deg: number): Point {
  if (!deg) return p;
  const r = degToRad(deg);
  const dx = p.x - c.x, dy = p.y - c.y;
  return {
    x: c.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: c.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

function aabbFromPoints(pts: Point[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

/** Four corners of the object's local rect in world space (after rotation). */
function rectWorldCorners(o: FreehandObject): Point[] {
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
  const pts: Point[] = [
    { x: o.x, y: o.y },
    { x: o.x + o.width, y: o.y },
    { x: o.x + o.width, y: o.y + o.height },
    { x: o.x, y: o.y + o.height },
  ];
  if (!o.rotation) return pts;
  return pts.map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
}

/** Axis-aligned bounding box of the painted shape (accounts for rotation). */
function getVisualAABB(o: FreehandObject): Rect {
  switch (o.type) {
    case "path": {
      const pb = getPathBoundsFromPoints((o as PathObject).points);
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
      if (!o.rotation) return pb;
      const corners = [
        { x: pb.x, y: pb.y },
        { x: pb.x + pb.w, y: pb.y },
        { x: pb.x + pb.w, y: pb.y + pb.h },
        { x: pb.x, y: pb.y + pb.h },
      ].map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
      return aabbFromPoints(corners);
    }
    case "clippingContainer":
      return aabbFromPoints(rectWorldCorners(o));
    case "text":
    case "ellipse":
    case "rect":
    case "image":
    case "booleanGroup":
    default:
      return aabbFromPoints(rectWorldCorners(o));
  }
}

function getObjBounds(o: FreehandObject): Rect {
  return getVisualAABB(o);
}

function isClosedPathForMask(p: PathObject): boolean {
  return p.closed && p.points.length >= 3;
}

/** Single closed shape usable as Paste Inside mask. */
function isValidPasteInsideMask(o: FreehandObject): boolean {
  if (!o.visible || o.locked) return false;
  if (o.type === "rect" || o.type === "ellipse") return true;
  if (o.type === "path") return isClosedPathForMask(o as PathObject);
  return false;
}

function translateBezierPoints(pts: BezierPoint[], dx: number, dy: number): BezierPoint[] {
  return pts.map((p) => ({
    ...p,
    anchor: { x: p.anchor.x + dx, y: p.anchor.y + dy },
    handleIn: { x: p.handleIn.x + dx, y: p.handleIn.y + dy },
    handleOut: { x: p.handleOut.x + dx, y: p.handleOut.y + dy },
  }));
}

function translateMaskShape(m: RectObject | EllipseObject | PathObject, dx: number, dy: number): RectObject | EllipseObject | PathObject {
  if (m.type === "rect" || m.type === "ellipse") return { ...m, x: m.x + dx, y: m.y + dy };
  return { ...m, points: translateBezierPoints(m.points, dx, dy) };
}

/** Mask + content live in container local space (origin top-left of unrotated box). */
function offsetShapeWorldToLocal(m: RectObject | EllipseObject | PathObject, ox: number, oy: number): RectObject | EllipseObject | PathObject {
  if (m.type === "rect" || m.type === "ellipse") return { ...m, x: m.x - ox, y: m.y - oy };
  return { ...m, points: translateBezierPoints(m.points, -ox, -oy) };
}

function offsetShapeLocalToWorld(m: RectObject | EllipseObject | PathObject, ox: number, oy: number): RectObject | EllipseObject | PathObject {
  if (m.type === "rect" || m.type === "ellipse") return { ...m, x: m.x + ox, y: m.y + oy };
  return { ...m, points: translateBezierPoints(m.points, ox, oy) };
}

function offsetObjectWorldToLocal(o: FreehandObject, ox: number, oy: number): FreehandObject {
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return {
      ...c,
      x: c.x - ox,
      y: c.y - oy,
      mask: offsetShapeWorldToLocal(c.mask, ox, oy),
      content: c.content.map((ch) => offsetObjectWorldToLocal(ch, ox, oy)),
    };
  }
  if (o.type === "booleanGroup") {
    return { ...o, children: o.children.map((ch) => offsetObjectWorldToLocal(ch, ox, oy)) };
  }
  if (o.type === "path") {
    const p = o as PathObject;
    const pts = translateBezierPoints(p.points, -ox, -oy);
    const pb = getPathBoundsFromPoints(pts);
    return { ...p, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: pts };
  }
  if (o.type === "rect" || o.type === "ellipse" || o.type === "image" || o.type === "text") {
    return { ...o, x: o.x - ox, y: o.y - oy };
  }
  return o;
}

function localPointToWorld(c: ClippingContainerObject, lp: Point): Point {
  const cx = c.width / 2, cy = c.height / 2;
  const r = rotatePointAround(lp, { x: cx, y: cy }, c.rotation);
  return { x: c.x + r.x, y: c.y + r.y };
}

function worldPointToLocal(c: ClippingContainerObject, wp: Point): Point {
  const cx = c.width / 2, cy = c.height / 2;
  const rel = { x: wp.x - c.x, y: wp.y - c.y };
  return rotatePointAround(rel, { x: cx, y: cy }, -c.rotation);
}

function translateFreehandObject(o: FreehandObject, dx: number, dy: number): FreehandObject {
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return { ...c, x: c.x + dx, y: c.y + dy };
  }
  if (o.type === "booleanGroup") {
    return { ...o, children: o.children.map((ch) => translateFreehandObject(ch, dx, dy)) };
  }
  if (o.type === "path") {
    const p = o as PathObject;
    const newPts = translateBezierPoints(p.points, dx, dy);
    const pb = getPathBoundsFromPoints(newPts);
    return { ...p, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: newPts };
  }
  if (o.type === "rect" || o.type === "ellipse" || o.type === "image" || o.type === "text") {
    return { ...o, x: o.x + dx, y: o.y + dy };
  }
  return o;
}

/** Outer box of a clipping container = mask bounds only. Content may extend outside; it is clipped visually. */
function clipContainerOuterBoundsFromMask(mask: RectObject | EllipseObject | PathObject): Rect {
  return getObjBounds(mask as FreehandObject);
}

function deepCloneFreehandObject(o: FreehandObject, newId: () => string): FreehandObject {
  const id = newId();
  if (o.type === "path") {
    const p = o as PathObject;
    return {
      ...p,
      id,
      points: p.points.map((pt) => ({
        ...pt,
        anchor: { ...pt.anchor },
        handleIn: { ...pt.handleIn },
        handleOut: { ...pt.handleOut },
      })),
    };
  }
  if (o.type === "booleanGroup") {
    const g = o as BooleanGroupObject;
    return {
      ...g,
      id,
      children: g.children.map((ch) => deepCloneFreehandObject(ch, newId)),
      cachedResult: g.cachedResult,
    };
  }
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    return {
      ...c,
      id,
      mask: deepCloneFreehandObject(c.mask, newId) as RectObject | EllipseObject | PathObject,
      content: c.content.map((ch) => deepCloneFreehandObject(ch, newId)),
    };
  }
  return { ...o, id, fill: cloneFill(migrateFill(o.fill)) };
}

function deepCloneFreehandObjectKeepIds(o: FreehandObject): FreehandObject {
  return deepCloneFreehandObject(o, () => o.id);
}

function flattenObjectsForGradientDefs(list: FreehandObject[]): FreehandObject[] {
  const out: FreehandObject[] = [];
  for (const o of list) {
    out.push(o);
    if (o.type === "clippingContainer") {
      const c = o as ClippingContainerObject;
      out.push(c.mask as FreehandObject);
      out.push(...flattenObjectsForGradientDefs(c.content));
    }
    if (o.type === "booleanGroup") out.push(...flattenObjectsForGradientDefs((o as BooleanGroupObject).children));
  }
  return out;
}

function mapMaskShapeWithWorldMap(
  m: RectObject | EllipseObject | PathObject,
  mapWorld: (p: Point) => Point,
): RectObject | EllipseObject | PathObject {
  if (m.type === "rect" || m.type === "ellipse") {
    const c1 = mapWorld({ x: m.x, y: m.y });
    const c2 = mapWorld({ x: m.x + m.width, y: m.y + m.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...m, x, y, width: w, height: h };
  }
  const p = m as PathObject;
  const pts = p.points.map((pt) => ({
    ...pt,
    anchor: mapWorld(pt.anchor),
    handleIn: mapWorld(pt.handleIn),
    handleOut: mapWorld(pt.handleOut),
  }));
  const pb = getPathBoundsFromPoints(pts);
  return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
}

function mapObjectPointsWithWorld(
  o: FreehandObject,
  mapWorld: (p: Point) => Point,
): FreehandObject {
  if (o.type === "clippingContainer") {
    const c = o as ClippingContainerObject;
    const newMask = mapMaskShapeWithWorldMap(c.mask, mapWorld);
    const newContent = c.content.map((ch) => mapObjectPointsWithWorld(ch, mapWorld));
    const ub = clipContainerOuterBoundsFromMask(newMask);
    return {
      ...c,
      x: ub.x,
      y: ub.y,
      width: ub.w,
      height: ub.h,
      mask: offsetShapeWorldToLocal(newMask, ub.x, ub.y),
      content: newContent.map((ch) => offsetObjectWorldToLocal(ch, ub.x, ub.y)),
    };
  }
  if (o.type === "booleanGroup") {
    return {
      ...o,
      children: o.children.map((ch) => mapObjectPointsWithWorld(ch, mapWorld)),
    };
  }
  if (o.type === "path") {
    const p = o as PathObject;
    const pts = p.points.map((pt) => ({
      ...pt,
      anchor: mapWorld(pt.anchor),
      handleIn: mapWorld(pt.handleIn),
      handleOut: mapWorld(pt.handleOut),
    }));
    const pb = getPathBoundsFromPoints(pts);
    return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
  }
  if (o.type === "rect" || o.type === "ellipse" || o.type === "image" || o.type === "text") {
    const c1 = mapWorld({ x: o.x, y: o.y });
    const c2 = mapWorld({ x: o.x + o.width, y: o.y + o.height });
    const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    const w = Math.max(Math.abs(c2.x - c1.x), 1), h = Math.max(Math.abs(c2.y - c1.y), 1);
    return { ...o, x, y, width: w, height: h };
  }
  return o;
}

/** Map nested content to world by composing parent → child local transforms. */
function mapChildToWorldWithChain(outerChain: (p: Point) => Point, o: FreehandObject): FreehandObject {
  if (o.type === "clippingContainer") {
    const inner = o as ClippingContainerObject;
    const chain = (p: Point) => outerChain(localPointToWorld(inner, p));
    const maskW = mapMaskShapeWithWorldMap(inner.mask, chain);
    const contentW = inner.content.map((ch) => mapChildToWorldWithChain(chain, ch));
    const ub = clipContainerOuterBoundsFromMask(maskW);
    return {
      ...inner,
      x: ub.x,
      y: ub.y,
      width: ub.w,
      height: ub.h,
      mask: offsetShapeWorldToLocal(maskW, ub.x, ub.y),
      content: contentW.map((ch) => offsetObjectWorldToLocal(ch, ub.x, ub.y)),
    } as ClippingContainerObject;
  }
  return mapObjectPointsWithWorld(o, outerChain);
}

function releaseClippingContainerToObjects(c: ClippingContainerObject): FreehandObject[] {
  const root = (p: Point) => localPointToWorld(c, p);
  const maskW = mapMaskShapeWithWorldMap(c.mask, root);
  const contentW = c.content.map((ch) => mapChildToWorldWithChain(root, ch));
  return [maskW as FreehandObject, ...contentW];
}

function renderMaskShapeClipInner(m: RectObject | EllipseObject | PathObject): React.ReactNode {
  if (m.type === "rect") {
    const r = m as RectObject;
    return <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} />;
  }
  if (m.type === "ellipse") {
    return <ellipse cx={m.x + m.width / 2} cy={m.y + m.height / 2} rx={m.width / 2} ry={m.height / 2} />;
  }
  const p = m as PathObject;
  return <path d={bezierToSvgD(p.points, p.closed)} />;
}

/** All world-space corners contributing to selection bounds. */
function objectWorldCorners(o: FreehandObject): Point[] {
  if (o.type === "path") {
    const pb = getPathBoundsFromPoints((o as PathObject).points);
    const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
    if (!o.rotation) {
      return [
        { x: pb.x, y: pb.y },
        { x: pb.x + pb.w, y: pb.y },
        { x: pb.x + pb.w, y: pb.y + pb.h },
        { x: pb.x, y: pb.y + pb.h },
      ];
    }
    return [
      { x: pb.x, y: pb.y },
      { x: pb.x + pb.w, y: pb.y },
      { x: pb.x + pb.w, y: pb.y + pb.h },
      { x: pb.x, y: pb.y + pb.h },
    ].map((p) => rotatePointAround(p, { x: cx, y: cy }, o.rotation));
  }
  return rectWorldCorners(o);
}

interface OrientedSelectionFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angleDeg: number;
}

/** Oriented box aligned with mean rotation that tightly wraps all selected corners. */
function computeOrientedSelectionFrame(objs: FreehandObject[]): OrientedSelectionFrame | null {
  if (objs.length === 0) return null;
  const angleDeg = objs.reduce((s, o) => s + o.rotation, 0) / objs.length;
  const allCorners: Point[] = [];
  for (const o of objs) allCorners.push(...objectWorldCorners(o));
  const gb = aabbFromPoints(allCorners);
  const C = { x: gb.x + gb.w / 2, y: gb.y + gb.h / 2 };
  const r = degToRad(-angleDeg);
  const cos = Math.cos(r), sin = Math.sin(r);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allCorners) {
    const dx = p.x - C.x, dy = p.y - C.y;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
    minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
  }
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const lc = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const th = degToRad(angleDeg);
  const cx = C.x + lc.x * Math.cos(th) - lc.y * Math.sin(th);
  const cy = C.y + lc.x * Math.sin(th) + lc.y * Math.cos(th);
  return { cx, cy, w, h, angleDeg };
}

function worldToLocalOBB(p: Point, cx: number, cy: number, angleDeg: number): Point {
  const dx = p.x - cx, dy = p.y - cy;
  const r = degToRad(-angleDeg);
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

function localToWorldOBB(p: Point, cx: number, cy: number, angleDeg: number): Point {
  const th = degToRad(angleDeg);
  return {
    x: cx + p.x * Math.cos(th) - p.y * Math.sin(th),
    y: cy + p.x * Math.sin(th) + p.y * Math.cos(th),
  };
}

/** Rotate a direction vector by -angleDeg (same basis as worldToLocalOBB). */
function worldDeltaToLocal(delta: Point, angleDeg: number): Point {
  const r = degToRad(-angleDeg);
  return {
    x: delta.x * Math.cos(r) - delta.y * Math.sin(r),
    y: delta.x * Math.sin(r) + delta.y * Math.cos(r),
  };
}

function getGroupBounds(objs: FreehandObject[]): Rect {
  if (objs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of objs) {
    const b = getObjBounds(o);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Snap ────────────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 6;

function computeSnap(
  movingBounds: Rect,
  allObjects: FreehandObject[],
  excludeIds: Set<string>,
  zoom: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const thr = SNAP_THRESHOLD / zoom;
  const guides: SnapGuide[] = [];
  let snapDx = 0, snapDy = 0;
  let bestDx = thr + 1, bestDy = thr + 1;
  const mxs = [movingBounds.x, movingBounds.x + movingBounds.w / 2, movingBounds.x + movingBounds.w];
  const mys = [movingBounds.y, movingBounds.y + movingBounds.h / 2, movingBounds.y + movingBounds.h];

  for (const obj of allObjects) {
    if (excludeIds.has(obj.id) || !obj.visible || obj.isClipMask) continue;
    const vb = getVisualAABB(obj);
    const oxs = [vb.x, vb.x + vb.w / 2, vb.x + vb.w];
    const oys = [vb.y, vb.y + vb.h / 2, vb.y + vb.h];
    for (const mx of mxs) {
      for (const ox of oxs) {
        const d = Math.abs(mx - ox);
        if (d < bestDx) { bestDx = d; snapDx = ox - mx; }
      }
    }
    for (const my of mys) {
      for (const oy of oys) {
        const d = Math.abs(my - oy);
        if (d < bestDy) { bestDy = d; snapDy = oy - my; }
      }
    }
  }
  if (bestDx > thr) snapDx = 0; else {
    const snapX = mxs[0] + snapDx;
    guides.push({ axis: "x", pos: snapX });
  }
  if (bestDy > thr) snapDy = 0; else {
    const snapY = mys[0] + snapDy;
    guides.push({ axis: "y", pos: snapY });
  }
  return { dx: snapDx, dy: snapDy, guides };
}

// ── SVG Path ────────────────────────────────────────────────────────────

function bezierToSvgD(points: BezierPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].anchor.x} ${points[0].anchor.y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    d += ` C ${prev.handleOut.x} ${prev.handleOut.y} ${curr.handleIn.x} ${curr.handleIn.y} ${curr.anchor.x} ${curr.anchor.y}`;
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1], first = points[0];
    d += ` C ${last.handleOut.x} ${last.handleOut.y} ${first.handleIn.x} ${first.handleIn.y} ${first.anchor.x} ${first.anchor.y} Z`;
  }
  return d;
}

function splitBezierSegment(pts: BezierPoint[], segIdx: number, t: number): BezierPoint[] {
  const j = (segIdx + 1) % pts.length;
  const p0 = pts[segIdx].anchor, cp1 = pts[segIdx].handleOut;
  const cp2 = pts[j].handleIn, p3 = pts[j].anchor;

  const a = lerp2(p0, cp1, t);
  const b = lerp2(cp1, cp2, t);
  const c = lerp2(cp2, p3, t);
  const d = lerp2(a, b, t);
  const e = lerp2(b, c, t);
  const f = lerp2(d, e, t);

  const newPts = [...pts];
  newPts[segIdx] = { ...newPts[segIdx], handleOut: a };
  const newPt: BezierPoint = { anchor: f, handleIn: d, handleOut: e, vertexMode: "smooth" };
  newPts[j] = { ...newPts[j], handleIn: c };
  newPts.splice(segIdx + 1, 0, newPt);
  return newPts;
}

function lerp2(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Normalize dash input: commas → spaces (e.g. "4,2" or "4 2") for valid SVG stroke-dasharray. */
function svgStrokeDashArray(raw: string | undefined): string | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const n = String(raw).trim().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return undefined;
  const parts = n.split(" ");
  if (!parts.every((p) => p !== "" && !Number.isNaN(Number(p)))) return undefined;
  return parts.join(" ");
}

// ── Render SVG object ───────────────────────────────────────────────────

function renderObj(obj: FreehandObject): React.ReactNode {
  if (!obj.visible || obj.isClipMask) return null;
  const transform = obj.rotation
    ? `rotate(${obj.rotation} ${obj.x + obj.width / 2} ${obj.y + obj.height / 2})`
    : undefined;
  const fill = migrateFill(obj.fill);
  const gid = gradientDefId(obj.id);
  const fillAttr = fillPaintValue(fill, gid);
  const strokeProps = {
    stroke: obj.stroke,
    strokeWidth: obj.strokeWidth,
    strokeLinecap: obj.strokeLinecap,
    strokeLinejoin: obj.strokeLinejoin,
    strokeDasharray: svgStrokeDashArray(obj.strokeDasharray),
    opacity: obj.opacity,
  };

  switch (obj.type) {
    case "rect":
      return <rect key={obj.id} x={obj.x} y={obj.y} width={obj.width} height={obj.height} rx={(obj as RectObject).rx} fill={fillAttr} transform={transform} {...strokeProps} />;
    case "ellipse":
      return <ellipse key={obj.id} cx={obj.x + obj.width / 2} cy={obj.y + obj.height / 2} rx={obj.width / 2} ry={obj.height / 2} fill={fillAttr} transform={transform} {...strokeProps} />;
    case "path": {
      const p = obj as PathObject;
      const fp = p.closed && fillHasPaint(fill) ? fillAttr : "none";
      return <path key={obj.id} d={bezierToSvgD(p.points, p.closed)} fill={fp} transform={transform} {...strokeProps} />;
    }
    case "text": {
      const t = obj as TextObject;
      const foW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
      const foH = t.textMode === "point" ? Math.max(t.height, t.fontSize * t.lineHeight + 4) : t.height;
      const ta = t.textAlign === "justify" ? "justify" : t.textAlign;
      return (
        <g key={obj.id} transform={transform}>
          <foreignObject x={t.x} y={t.y} width={foW} height={foH} style={{ overflow: "visible" }}>
            <div
              {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, unknown>)}
              style={{
                margin: 0,
                padding: t.textMode === "area" ? 4 : 0,
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                fontFamily: t.fontFamily,
                fontSize: t.fontSize,
                fontWeight: t.fontWeight,
                lineHeight: t.lineHeight,
                letterSpacing: t.letterSpacing,
                textAlign: ta,
                whiteSpace: t.textMode === "point" ? "pre" : "pre-wrap",
                wordBreak: t.textMode === "area" ? "break-word" as const : "normal",
                ...textFillCssProperties(fill),
                opacity: t.opacity,
                userSelect: "none",
              }}
            >
              {t.text || "\u00a0"}
            </div>
          </foreignObject>
        </g>
      );
    }
    case "image":
      return <image key={obj.id} href={(obj as ImageObject).src} x={obj.x} y={obj.y} width={obj.width} height={obj.height} preserveAspectRatio="none" transform={transform} opacity={obj.opacity} />;
    case "booleanGroup": {
      const bg = obj as BooleanGroupObject;
      if (bg.cachedResult) {
        return <image key={obj.id} href={bg.cachedResult} x={obj.x} y={obj.y} width={obj.width} height={obj.height} preserveAspectRatio="none" transform={transform} opacity={obj.opacity} />;
      }
      return null;
    }
    case "clippingContainer": {
      const cc = obj as ClippingContainerObject;
      const cid = `clip-cc-${cc.id}`;
      const innerT = `translate(${cc.x} ${cc.y}) rotate(${cc.rotation} ${cc.width / 2} ${cc.height / 2})`;
      return (
        <g key={cc.id} opacity={cc.opacity}>
          <g transform={innerT}>
            <defs>
              <clipPath id={cid} clipPathUnits="userSpaceOnUse">
                {renderMaskShapeClipInner(cc.mask)}
              </clipPath>
            </defs>
            <g clipPath={`url(#${cid})`}>{cc.content.map((ch) => renderObj(ch))}</g>
          </g>
        </g>
      );
    }
    default: return null;
  }
}

function renderClipDef(clipObj: FreehandObject): React.ReactNode {
  if (!clipObj.isClipMask) return null;
  let shape: React.ReactNode = null;
  switch (clipObj.type) {
    case "rect":
      shape = <rect x={clipObj.x} y={clipObj.y} width={clipObj.width} height={clipObj.height} rx={(clipObj as RectObject).rx} />;
      break;
    case "ellipse":
      shape = <ellipse cx={clipObj.x + clipObj.width / 2} cy={clipObj.y + clipObj.height / 2} rx={clipObj.width / 2} ry={clipObj.height / 2} />;
      break;
    case "path": {
      const p = clipObj as PathObject;
      shape = <path d={bezierToSvgD(p.points, p.closed)} />;
      break;
    }
  }
  return <clipPath key={`clip-${clipObj.id}`} id={`clip-${clipObj.id}`}>{shape}</clipPath>;
}

// ── Boolean rendering helpers ───────────────────────────────────────────

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function objToSvgStringStatic(obj: FreehandObject, w: number, h: number, ox: number, oy: number): string {
  const parts: string[] = [];
  const fill = migrateFill(obj.fill);
  const gid = gradientDefId(obj.id);
  const fillAttr = fillPaintValue(fill, gid);
  const defStr = fill.type === "solid" ? "" : fillDefSvgString(fill, gid);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${ox} ${oy} ${w} ${h}">`);
  if (defStr) parts.push(`<defs>${defStr}</defs>`);
  const transform = obj.rotation ? `transform="rotate(${obj.rotation} ${obj.x + obj.width / 2} ${obj.y + obj.height / 2})"` : "";
  const dash = svgStrokeDashArray(obj.strokeDasharray);
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  const capJoin = ` stroke-linecap="${obj.strokeLinecap}" stroke-linejoin="${obj.strokeLinejoin}"`;
  switch (obj.type) {
    case "rect":
      parts.push(`<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="${(obj as RectObject).rx}" fill="${escapeXmlAttr(fillAttr)}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr} ${transform}/>`);
      break;
    case "ellipse":
      parts.push(`<ellipse cx="${obj.x + obj.width / 2}" cy="${obj.y + obj.height / 2}" rx="${obj.width / 2}" ry="${obj.height / 2}" fill="${escapeXmlAttr(fillAttr)}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr} ${transform}/>`);
      break;
    case "path": {
      const p = obj as PathObject;
      const fp = p.closed && fillHasPaint(fill) ? escapeXmlAttr(fillAttr) : "none";
      parts.push(`<path d="${bezierToSvgD(p.points, p.closed)}" fill="${fp}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${capJoin}${dashAttr} ${transform}/>`);
      break;
    }
    case "text": {
      const t = obj as TextObject;
      const foW = t.textMode === "point" ? Math.max(t.width, 32) : t.width;
      const foH = t.textMode === "point" ? Math.max(t.height, t.fontSize * t.lineHeight + 4) : t.height;
      const inner = escapeXmlAttr(t.text || " ").replace(/\n/g, "&#10;");
      parts.push(
        `<g ${transform}><foreignObject x="${t.x}" y="${t.y}" width="${foW}" height="${foH}">` +
          `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:${t.textMode === "area" ? 4 : 0}px;width:100%;height:100%;font-family:${escapeXmlAttr(t.fontFamily)};font-size:${t.fontSize}px;font-weight:${t.fontWeight};line-height:${t.lineHeight};letter-spacing:${t.letterSpacing}px;text-align:${t.textAlign};white-space:${t.textMode === "point" ? "pre" : "pre-wrap"};opacity:${t.opacity}">${inner}</div>` +
        `</foreignObject></g>`,
      );
      break;
    }
    case "image":
      parts.push(`<image href="${(obj as ImageObject).src}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="none" ${transform}/>`);
      break;
    case "booleanGroup": {
      const bg = obj as BooleanGroupObject;
      if (bg.cachedResult) {
        parts.push(`<image href="${bg.cachedResult}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="none"/>`);
      }
      break;
    }
  }
  parts.push(`</svg>`);
  return parts.join("");
}

async function computeBooleanCachedResult(children: FreehandObject[], operation: BooleanOperation): Promise<{ dataUrl: string; bounds: Rect }> {
  const visible = children.filter((o) => o.visible);
  if (visible.length === 0) return { dataUrl: "", bounds: { x: 0, y: 0, w: 1, h: 1 } };
  const bounds = getGroupBounds(visible);
  const pad = 4;
  const w = Math.ceil(bounds.w + pad * 2);
  const h = Math.ceil(bounds.h + pad * 2);
  const ox = bounds.x - pad;
  const oy = bounds.y - pad;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < visible.length; i++) {
    const svgStr = objToSvgStringStatic(visible[i], w, h, ox, oy);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(im);
      im.src = url;
    });
    if (i === 0) {
      ctx.drawImage(img, 0, 0);
    } else {
      switch (operation) {
        case "union": ctx.globalCompositeOperation = "source-over"; break;
        case "subtract": ctx.globalCompositeOperation = "destination-out"; break;
        case "intersect": ctx.globalCompositeOperation = "destination-in"; break;
        case "exclude": ctx.globalCompositeOperation = "xor"; break;
      }
      ctx.drawImage(img, 0, 0);
    }
    URL.revokeObjectURL(url);
  }
  ctx.globalCompositeOperation = "source-over";

  return { dataUrl: canvas.toDataURL("image/png"), bounds: { x: ox, y: oy, w, h } };
}

// ── Export helpers ──────────────────────────────────────────────────────

function buildExportBounds(objects: FreehandObject[]): Rect {
  const visible = objects.filter((o) => o.visible);
  if (visible.length === 0) return { x: 0, y: 0, w: 1920, h: 1080 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of visible) {
    x1 = Math.min(x1, o.x); y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.width); y2 = Math.max(y2, o.y + o.height);
  }
  const pad = 20;
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}

function buildExportSvgString(svgEl: SVGSVGElement, bounds: Rect): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui]").forEach((el) => el.remove());
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
  clone.setAttribute("width", String(Math.round(bounds.w)));
  clone.setAttribute("height", String(Math.round(bounds.h)));
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function svgStringToCanvas(svgStr: string, w: number, h: number, bgColor?: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d")!;
      if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-150 ease-out ${
        active
          ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
          : "text-zinc-500 hover:bg-white/[0.06] hover:text-white"
      }`}
    >{children}</button>
  );
}

function CtxMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const h = (e: MouseEvent) => { onClose(); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div className="fixed z-[99999] bg-zinc-900/98 border border-white/12 rounded-lg shadow-2xl py-1 min-w-[220px] backdrop-blur-sm" style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {item.separator && <div className="h-px bg-white/10 my-1 mx-1" />}
          <button type="button" disabled={item.disabled}
            className="w-full flex items-center justify-between gap-6 text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-violet-600 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
            onClick={() => { item.action(); onClose(); }}
          >
            <span>{item.label}</span>
            {item.shortcut ? <span className="text-[9px] text-zinc-500 font-mono tabular-nums shrink-0">{item.shortcut}</span> : null}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function clipMapFromObjects(objs: FreehandObject[]): Map<string, FreehandObject[]> {
  const map = new Map<string, FreehandObject[]>();
  for (const o of objs) {
    if (o.clipMaskId) {
      const arr = map.get(o.clipMaskId) || [];
      arr.push(o);
      map.set(o.clipMaskId, arr);
    }
  }
  return map;
}

function layerRowIcon(o: FreehandObject) {
  const cls = "shrink-0 text-zinc-500";
  switch (o.type) {
    case "rect": return <Square size={12} className={cls} />;
    case "ellipse": return <Circle size={12} className={cls} />;
    case "path": return <PenTool size={12} className={cls} />;
    case "text": return <Type size={12} className={cls} />;
    case "image": return <ImageIconLucide size={12} className={cls} />;
    case "booleanGroup": return <Layers size={12} className={cls} />;
    case "clippingContainer": return <Crop size={12} className={cls} />;
    default: return <Square size={12} className={cls} />;
  }
}

function selectionKindLabel(objs: FreehandObject[]): string {
  if (objs.length === 0) return "No selection";
  if (objs.length > 1) return `${objs.length} objects selected`;
  const o = objs[0];
  switch (o.type) {
    case "rect": return "Rectangle";
    case "ellipse": return "Ellipse";
    case "path": return "Path";
    case "text": return "Text";
    case "image": return "Image";
    case "booleanGroup": return "Boolean group";
    case "clippingContainer": return "Clipping container";
    default: return "Object";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function FreehandStudio({
  nodeId, inputImages, initialObjects, onClose, onExport, onUpdateObjects,
}: FreehandStudioProps) {

  // ── Core state ─────────────────────────────────────────────────────
  const [objects, setObjects] = useState<FreehandObject[]>(() =>
    initialObjects.length > 0
      ? (initialObjects.map((o) => ({ ...o, fill: migrateFill((o as FreehandObject).fill as unknown) })) as FreehandObject[])
      : [],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Pen tool
  const [penPoints, setPenPoints] = useState<BezierPoint[]>([]);
  const [isPenDrawing, setIsPenDrawing] = useState(false);
  const [penDragging, setPenDragging] = useState(false);

  // Drag state
  const [dragState, setDragState] = useState<{
    type: "move" | "resize" | "pan" | "create" | "createText" | "directSelect" | "marquee" | "penHandle" | "rotate" | "gradient";
    startX: number;
    startY: number;
    startCanvas?: Point;
    currentCanvas?: Point;
    svpX?: number; svpY?: number;
    positions?: Map<string, Point>;
    pathPointsMap?: Map<string, BezierPoint[]>;
    handle?: string;
    bounds?: Rect;
    /** Initial OBB when resize/rotate started (for oriented transform UI). */
    initialOrientedFrame?: OrientedSelectionFrame;
    /** Deep copy of selected objects at resize start — transforms must not compound per frame. */
    resizeSnapshot?: Map<string, FreehandObject>;
    allBounds?: Map<string, Rect>;
    createType?: "rect" | "ellipse";
    createOrigin?: Point;
    gradientHandle?: "linA" | "linB" | "radC" | "radR" | "stop";
    gradientPrimaryId?: string;
    gradientStopIndex?: number;
    dsObjId?: string;
    dsPtIdx?: number;
    dsHtType?: "anchor" | "handleIn" | "handleOut";
    dsStartPt?: Point;
    marqueeOrigin?: Point;
    snapDelta?: Point;
    shiftKey?: boolean;
    rotateCenter?: Point;
    rotateStartAngle?: number;
    rotateInitialRotations?: Map<string, number>;
  } | null>(null);

  // Layer drag reorder
  const [layerDragId, setLayerDragId] = useState<string | null>(null);
  const [layerDropTarget, setLayerDropTarget] = useState<string | null>(null);

  /** Multi-select: object that gets primary handles / full opacity. */
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  /** Object under cursor (canvas). */
  const [hoverCanvasId, setHoverCanvasId] = useState<string | null>(null);
  /** Layer row hover (panel). */
  const [layerHoverId, setLayerHoverId] = useState<string | null>(null);
  /** Quick fill/stroke popover: which channel is being edited from canvas. */
  const [quickEditMode, setQuickEditMode] = useState<"fill" | "stroke" | null>(null);

  // Live boolean preview during isolation editing
  const [livePreview, setLivePreview] = useState<{ dataUrl: string; bounds: Rect } | null>(null);

  // Direct-select: selected anchor points
  const [selectedPoints, setSelectedPoints] = useState<Map<string, Set<number>>>(new Map());

  // History
  const historyRef = useRef<{ objects: FreehandObject[]; sel: string[] }[]>([
    {
      objects:
        initialObjects.length > 0
          ? (initialObjects.map((o) => ({ ...o, fill: migrateFill((o as FreehandObject).fill as unknown) })) as FreehandObject[])
          : [],
      sel: [],
    },
  ]);
  const historyIdxRef = useRef(0);
  const [, forceRender] = useState(0);

  // Default colors
  const [fillColor, setFillColor] = useState("#6366f1");
  const [strokeColor, setStrokeColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeLinecap, setStrokeLinecap] = useState<"butt" | "round" | "square">("round");
  const [strokeLinejoin, setStrokeLinejoin] = useState<"miter" | "round" | "bevel">("round");
  const [strokeDasharray, setStrokeDasharray] = useState("");

  // UI state
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; canvas?: Point } | null>(null);
  const [textEditingId, setTextEditingId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalScope, setExportModalScope] = useState<"selection" | "full">("selection");
  const [toast, setToast] = useState<string | null>(null);
  const [exportFlash, setExportFlash] = useState<ExportRect | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  // Isolation mode for BooleanGroups
  const [isolationDepth, setIsolationDepth] = useState(0);
  const isolationStackRef = useRef<IsolationFrame[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const selectedPointsRef = useRef(selectedPoints);
  selectedPointsRef.current = selectedPoints;
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  // ── History helpers (using refs to avoid stale closures) ──────────

  const pushHistory = useCallback((newObjects: FreehandObject[], newSel: Set<string>) => {
    const h = historyRef.current;
    const idx = historyIdxRef.current;
    historyRef.current = [...h.slice(0, idx + 1), { objects: [...newObjects], sel: Array.from(newSel) }];
    historyIdxRef.current = idx + 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const entry = historyRef.current[historyIdxRef.current];
    setObjects([...entry.objects]);
    setSelectedIds(new Set(entry.sel));
    forceRender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const entry = historyRef.current[historyIdxRef.current];
    setObjects([...entry.objects]);
    setSelectedIds(new Set(entry.sel));
    forceRender((n) => n + 1);
  }, []);

  // ── Sync to node ──────────────────────────────────────────────────

  const syncRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => {
      let fullObjects = objects;
      for (let i = isolationStackRef.current.length - 1; i >= 0; i--) {
        const frame = isolationStackRef.current[i];
        if (frame.kind === "clipping") {
          const parentC = frame.parentObjects.find((o) => o.id === frame.containerId) as ClippingContainerObject | undefined;
          if (!parentC) continue;
          let mask = parentC.mask;
          let contentLayers = fullObjects;
          if (frame.editMode === "mask") {
            const m = fullObjects[0] as RectObject | EllipseObject | PathObject | undefined;
            if (m) mask = m;
            contentLayers = frame.storedContent ?? [];
          }
          const ub = clipContainerOuterBoundsFromMask(mask);
          const merged: ClippingContainerObject = {
            ...parentC,
            width: ub.w,
            height: ub.h,
            mask: offsetShapeWorldToLocal(mask, ub.x, ub.y),
            content: contentLayers.map((c) => offsetObjectWorldToLocal(c, ub.x, ub.y)),
          };
          fullObjects = frame.parentObjects.map((o) =>
            o.id === frame.containerId ? merged : o
          );
        } else {
          fullObjects = frame.parentObjects.map((o) =>
            o.id === frame.groupId ? { ...o, children: fullObjects } : o
          );
        }
      }
      onUpdateObjects(fullObjects);
    }, 500);
    return () => clearTimeout(syncRef.current);
  }, [objects, onUpdateObjects]);

  // ── Live boolean preview during isolation ───────────────────────

  const livePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (isolationDepth === 0) {
      setLivePreview(null);
      return;
    }
    const stack = isolationStackRef.current;
    if (stack.length === 0) return;
    const frame = stack[stack.length - 1];
    if (frame.kind === "clipping") {
      setLivePreview(null);
      return;
    }
    const parentGroup = frame.parentObjects.find((o) => o.id === frame.groupId) as BooleanGroupObject | undefined;
    if (!parentGroup) return;

    clearTimeout(livePreviewTimerRef.current);
    livePreviewTimerRef.current = setTimeout(async () => {
      try {
        const result = await computeBooleanCachedResult(objects, parentGroup.operation);
        setLivePreview(result);
      } catch { /* ignore compute errors */ }
    }, 300);
    return () => clearTimeout(livePreviewTimerRef.current);
  }, [objects, isolationDepth]);

  // ── Coordinate transform ──────────────────────────────────────────

  const screenToCanvas = useCallback((sx: number, sy: number): Point => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return { x: sx, y: sy };
    return { x: (sx - r.left - viewport.x) / viewport.zoom, y: (sy - r.top - viewport.y) / viewport.zoom };
  }, [viewport]);

  // ── Derived ───────────────────────────────────────────────────────

  const selectedObjects = useMemo(() => objects.filter((o) => selectedIds.has(o.id)), [objects, selectedIds]);
  const firstSelected = selectedObjects[0] ?? null;

  useEffect(() => {
    if (selectedIds.size === 0) setPrimarySelectedId(null);
    else if (selectedIds.size === 1) setPrimarySelectedId(Array.from(selectedIds)[0] ?? null);
  }, [selectedIds]);

  useEffect(() => {
    if (dragState) setHoverCanvasId(null);
  }, [dragState]);

  useEffect(() => {
    if (quickEditMode && selectedIds.size !== 1) setQuickEditMode(null);
  }, [selectedIds, quickEditMode]);
  const groupBounds = useMemo(() => getGroupBounds(selectedObjects), [selectedObjects]);
  const selectionFrame = useMemo(() => computeOrientedSelectionFrame(selectedObjects), [selectedObjects]);

  /** Vertex modes of currently selected anchors (direct select). */
  const selectedAnchorVertexHint = useMemo(() => {
    if (selectedPoints.size === 0) return null;
    const modes = new Set<VertexMode>();
    selectedPoints.forEach((idxs, oid) => {
      const o = objects.find((x) => x.id === oid);
      if (!o || o.type !== "path") return;
      idxs.forEach((pi) => modes.add(getVertexMode((o as PathObject).points[pi])));
    });
    if (modes.size === 0) return null;
    const unified = modes.size === 1 ? [...modes][0]! : null;
    return { modes: [...modes], unified };
  }, [selectedPoints, objects]);

  // Resolve group: if an object has a groupId, selecting it selects the whole group
  const resolveSelection = useCallback((objId: string, shiftKey: boolean): Set<string> => {
    const objs = objectsRef.current;
    const sel = selectedIdsRef.current;
    const obj = objs.find((o) => o.id === objId);
    if (!obj) return sel;
    const gid = obj.groupId;
    const groupMembers = gid ? objs.filter((o) => o.groupId === gid).map((o) => o.id) : [objId];

    if (shiftKey) {
      const s = new Set(sel);
      const allIn = groupMembers.every((id) => s.has(id));
      if (allIn) groupMembers.forEach((id) => s.delete(id));
      else groupMembers.forEach((id) => s.add(id));
      return s;
    }
    return new Set(groupMembers);
  }, []);

  // ── Import connected images ───────────────────────────────────────

  const prevImagesRef = useRef<string[]>([]);
  useEffect(() => {
    const prevSet = new Set(prevImagesRef.current);
    const newImgs = inputImages.filter((s) => !prevSet.has(s));
    prevImagesRef.current = inputImages;
    if (newImgs.length === 0) return;
    const imgObjs: ImageObject[] = newImgs.map((src, i) => ({
      ...defaultObj({ name: `Image ${objects.length + i + 1}` }),
      type: "image" as const,
      x: 100 + i * 40, y: 100 + i * 40,
      width: 300, height: 300,
      fill: solidFill("none"), stroke: "none", strokeWidth: 0,
      src,
    } as ImageObject));
    setObjects((prev) => {
      const next = [...prev, ...imgObjs];
      pushHistory(next, selectedIds);
      return next;
    });
  }, [inputImages]);

  // ── Image import from file / drop / paste ─────────────────────────

  const importImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 600;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w *= scale; h *= scale;
        }
        const newObj: ImageObject = {
          ...defaultObj({ name: `Image ${objects.length + 1}` }),
          type: "image",
          x: 200, y: 200, width: w, height: h,
          fill: solidFill("none"), stroke: "none", strokeWidth: 0,
          src,
        } as ImageObject;
        setObjects((prev) => {
          const next = [...prev, newObj];
          pushHistory(next, new Set([newObj.id]));
          return next;
        });
        setSelectedIds(new Set([newObj.id]));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [objects.length, pushHistory]);

  const handleDrop = useCallback((e: ReactDragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    files.forEach(importImageFile);
  }, [importImageFile]);

  const handleDragOver = useCallback((e: ReactDragEvent) => { e.preventDefault(); }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) importImageFile(file);
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importImageFile]);

  // ── Pen finish ────────────────────────────────────────────────────

  const finishPenPath = useCallback((closed: boolean) => {
    if (penPoints.length < 2) { setPenPoints([]); setIsPenDrawing(false); return; }
    const bounds = getPathBoundsFromPoints(penPoints);
    const pathObj: PathObject = {
      ...defaultObj({ name: `Path ${objects.length + 1}` }),
      type: "path",
      x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h,
      fill: closed ? solidFill(fillColor) : solidFill("none"),
      stroke: strokeColor, strokeWidth,
      strokeLinecap, strokeLinejoin, strokeDasharray,
      points: penPoints.map((p) => ({ ...p, vertexMode: p.vertexMode ?? "smooth" })),
      closed,
    } as PathObject;
    const next = [...objects, pathObj];
    setObjects(next);
    setSelectedIds(new Set([pathObj.id]));
    setPenPoints([]); setIsPenDrawing(false);
    pushHistory(next, new Set([pathObj.id]));
  }, [penPoints, objects, fillColor, strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray, pushHistory]);

  // ── Object mutations ──────────────────────────────────────────────

  const updateSelectedProp = useCallback((key: string, value: any) => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.map((o) => sel.has(o.id) ? { ...o, [key]: value } : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const updateSelectedFill = useCallback((updater: (f: FillAppearance) => FillAppearance) => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.map((o) => (sel.has(o.id) ? { ...o, fill: updater(migrateFill(o.fill)) } : o));
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const objectClipboardRef = useRef<FreehandObject[] | null>(null);

  const copySelectedObjects = useCallback(() => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current.filter((o) => sel.has(o.id));
    if (objs.length === 0) return;
    objectClipboardRef.current = objs.map((o) => deepCloneFreehandObject(o, uid));
  }, []);

  const pasteClipboardObjects = useCallback(() => {
    const clip = objectClipboardRef.current;
    if (!clip || clip.length === 0) return;
    const dupes = clip.map((o) => {
      const c = deepCloneFreehandObject(o, uid);
      return translateFreehandObject(c, 24, 24);
    });
    const next = [...objectsRef.current, ...dupes];
    const ns = new Set(dupes.map((d) => d.id));
    setObjects(next);
    setSelectedIds(ns);
    pushHistory(next, ns);
  }, [pushHistory]);

  const convertTextToOutlines = useCallback(async () => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    const t = objs.find((o) => sel.has(o.id) && o.type === "text") as TextObject | undefined;
    if (!t || !t.text.trim()) return;
    const baselineY = t.y + t.fontSize;
    const result = await textToOutlinePaths(t.text, t.fontFamily, t.fontSize, t.fontWeight, t.x, baselineY);
    if (!result || result.points.length < 2) return;
    const pts: BezierPoint[] = result.points.map((p) => ({
      anchor: { ...p.anchor },
      handleIn: { ...p.handleIn },
      handleOut: { ...p.handleOut },
      vertexMode: (p.vertexMode === "corner" || p.vertexMode === "cusp") ? p.vertexMode : "smooth",
    }));
    const pb = getPathBoundsFromPoints(pts);
    const pathObj: PathObject = {
      ...defaultObj({ name: `${t.name} (outlines)` }),
      type: "path",
      x: pb.x,
      y: pb.y,
      width: pb.w,
      height: pb.h,
      fill: cloneFill(migrateFill(t.fill)),
      stroke: t.stroke,
      strokeWidth: t.strokeWidth,
      strokeLinecap: t.strokeLinecap,
      strokeLinejoin: t.strokeLinejoin,
      strokeDasharray: t.strokeDasharray,
      points: pts,
      closed: result.closed,
    } as PathObject;
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== t.id).concat(pathObj);
      pushHistory(next, new Set([pathObj.id]));
      return next;
    });
    setSelectedIds(new Set([pathObj.id]));
    setTextEditingId(null);
  }, [pushHistory]);

  const fitAllCanvas = useCallback(() => {
    const b = buildExportBounds(objects);
    const el = containerRef.current;
    if (!el) return;
    const rw = el.clientWidth, rh = el.clientHeight;
    if (b.w < 2 || b.h < 2) return;
    const margin = 40;
    const zx = (rw - margin * 2) / b.w, zy = (rh - margin * 2) / b.h;
    const z = clamp(Math.min(zx, zy), 0.05, 8);
    setViewport({
      zoom: z,
      x: margin - b.x * z + (rw - margin * 2 - b.w * z) / 2,
      y: margin - b.y * z + (rh - margin * 2 - b.h * z) / 2,
    });
  }, [objects]);

  const resetZoomCanvas = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: 1 }));
  }, []);

  const deleteSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.filter((o) => !sel.has(o.id));
      pushHistory(next, new Set());
      return next;
    });
    setSelectedIds(new Set());
  }, [pushHistory]);

  const cutSelectedObjects = useCallback(() => {
    copySelectedObjects();
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const next = prev.filter((o) => !sel.has(o.id));
      pushHistory(next, new Set());
      return next;
    });
    setSelectedIds(new Set());
  }, [copySelectedObjects, pushHistory]);

  const duplicateSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    if (sel.size === 0) return;
    const dupes = objs.filter((o) => sel.has(o.id))
      .map((o) => translateFreehandObject(deepCloneFreehandObject(o, uid), 20, 20));
    const next = [...objs, ...dupes];
    const ns = new Set(dupes.map((d) => d.id));
    setObjects(next); setSelectedIds(ns);
    pushHistory(next, ns);
  }, [pushHistory]);

  const bringForward = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = [...prev];
      const ids = Array.from(sel);
      for (let j = ids.length - 1; j >= 0; j--) {
        const idx = next.findIndex((o) => o.id === ids[j]);
        if (idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      }
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const sendBackward = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = [...prev];
      for (const sid of sel) {
        const idx = next.findIndex((o) => o.id === sid);
        if (idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      }
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const bringToFront = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const rest = prev.filter((o) => !sel.has(o.id));
      const moved = prev.filter((o) => sel.has(o.id));
      const next = [...rest, ...moved];
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const sendToBack = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return;
    setObjects((prev) => {
      const moved = prev.filter((o) => sel.has(o.id));
      const rest = prev.filter((o) => !sel.has(o.id));
      const next = [...moved, ...rest];
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Grouping ──────────────────────────────────────────────────────

  const groupSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size < 2) return;
    const gid = uid();
    setObjects((prev) => {
      const next = prev.map((o) => sel.has(o.id) ? { ...o, groupId: gid } : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const ungroupSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => sel.has(o.id) ? { ...o, groupId: undefined } : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Clipping mask ─────────────────────────────────────────────────

  const createClipMask = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size < 2) return;
    setObjects((prev) => {
      const selArr = prev.filter((o) => sel.has(o.id));
      const clipObj = selArr[selArr.length - 1];
      const clippedIds = selArr.slice(0, -1).map((o) => o.id);
      const next = prev.map((o) => {
        if (o.id === clipObj.id) return { ...o, isClipMask: true };
        if (clippedIds.includes(o.id)) return { ...o, clipMaskId: clipObj.id };
        return o;
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const releaseClipMask = useCallback(() => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const selArr = prev.filter((o) => sel.has(o.id));
      const clipIds = new Set<string>();
      selArr.forEach((o) => { if (o.clipMaskId) clipIds.add(o.clipMaskId); if (o.isClipMask) clipIds.add(o.id); });
      if (clipIds.size === 0) return prev;
      const next = prev.map((o) => {
        if (clipIds.has(o.id)) return { ...o, isClipMask: false };
        if (o.clipMaskId && clipIds.has(o.clipMaskId)) return { ...o, clipMaskId: undefined };
        return o;
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Paste Inside (non-destructive clipping container) ───────────

  const pasteInside = useCallback(() => {
    const clip = objectClipboardRef.current;
    if (!clip || clip.length === 0) return;
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const objs = objectsRef.current;
    const maskSrc = objs.find((o) => o.id === Array.from(sel)[0]);
    if (!maskSrc || !isValidPasteInsideMask(maskSrc)) return;
    const maskClone = deepCloneFreehandObject(maskSrc, uid) as RectObject | EllipseObject | PathObject;
    const contentWorld = clip.map((o) => deepCloneFreehandObject(o, uid));
    const ub = clipContainerOuterBoundsFromMask(maskClone);
    const newId = uid();
    const container: ClippingContainerObject = {
      ...defaultObj({
        id: newId,
        name: `Clip ${objs.filter((o) => o.type === "clippingContainer").length + 1}`,
        x: ub.x,
        y: ub.y,
        width: ub.w,
        height: ub.h,
        fill: solidFill("none"),
        stroke: "none",
        strokeWidth: 0,
      }),
      type: "clippingContainer",
      mask: offsetShapeWorldToLocal(maskClone, ub.x, ub.y),
      content: contentWorld.map((c) => offsetObjectWorldToLocal(c, ub.x, ub.y)),
    } as ClippingContainerObject;
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== maskSrc.id).concat(container);
      pushHistory(next, new Set([newId]));
      return next;
    });
    setSelectedIds(new Set([newId]));
  }, [pushHistory]);

  const releaseClippingStructure = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const objs = objectsRef.current;
    const cid = Array.from(sel)[0];
    const c = objs.find((o) => o.id === cid && o.type === "clippingContainer") as ClippingContainerObject | undefined;
    if (!c) return;
    const flat = releaseClippingContainerToObjects(c);
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== c.id).concat(flat);
      pushHistory(next, new Set(flat.map((o) => o.id)));
      return next;
    });
    setSelectedIds(new Set(flat.map((o) => o.id)));
  }, [pushHistory]);

  // ── Boolean operations (non-destructive BooleanGroup) ────────────

  const booleanOp = useCallback(async (mode: BooleanOperation) => {
    const sel = selectedIdsRef.current;
    if (sel.size < 2) return;
    const objs = objectsRef.current;
    const selArr = objs.filter((o) => sel.has(o.id));
    if (selArr.length < 2) return;

    const bounds = getGroupBounds(selArr);
    const { dataUrl, bounds: resultBounds } = await computeBooleanCachedResult(selArr, mode);

    const groupObj: BooleanGroupObject = {
      ...defaultObj({ name: `Boolean ${mode}` }),
      type: "booleanGroup",
      x: resultBounds.x, y: resultBounds.y,
      width: resultBounds.w, height: resultBounds.h,
      fill: solidFill("none"), stroke: "none", strokeWidth: 0,
      operation: mode,
      children: selArr.map((o) => ({ ...o })),
      cachedResult: dataUrl,
    } as BooleanGroupObject;

    setObjects((prev) => {
      const next = prev.filter((o) => !sel.has(o.id));
      next.push(groupObj);
      const ns = new Set([groupObj.id]);
      pushHistory(next, ns);
      return next;
    });
    setSelectedIds(new Set([groupObj.id]));
  }, [pushHistory]);

  const changeBooleanOp = useCallback(async (newOp: BooleanOperation) => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    const group = objs.find((o) => sel.has(o.id) && o.type === "booleanGroup") as BooleanGroupObject | undefined;
    if (!group) return;
    const { dataUrl, bounds } = await computeBooleanCachedResult(group.children, newOp);
    const updated: BooleanGroupObject = {
      ...group,
      operation: newOp,
      cachedResult: dataUrl,
      x: bounds.x, y: bounds.y,
      width: bounds.w, height: bounds.h,
    };
    setObjects((prev) => {
      const next = prev.map((o) => o.id === group.id ? updated : o);
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const expandBoolean = useCallback(async () => {
    const sel = selectedIdsRef.current;
    const objs = objectsRef.current;
    const group = objs.find((o) => sel.has(o.id) && o.type === "booleanGroup") as BooleanGroupObject | undefined;
    if (!group) return;

    const resultObj: ImageObject = {
      ...defaultObj({ name: group.name + " (expanded)" }),
      type: "image",
      x: group.x, y: group.y,
      width: group.width, height: group.height,
      fill: solidFill("none"), stroke: "none", strokeWidth: 0,
      src: group.cachedResult || "",
    } as ImageObject;

    setObjects((prev) => {
      const next = prev.map((o) => o.id === group.id ? resultObj : o);
      const ns = new Set([resultObj.id]);
      pushHistory(next, ns);
      return next;
    });
    setSelectedIds(new Set([resultObj.id]));
  }, [pushHistory]);

  const enterIsolation = useCallback((groupId: string) => {
    const objs = objectsRef.current;
    const group = objs.find((o) => o.id === groupId && o.type === "booleanGroup") as BooleanGroupObject | undefined;
    if (!group) return;
    isolationStackRef.current.push({
      kind: "boolean",
      groupId,
      parentObjects: objs.map((o) => ({ ...o })),
      parentSelectedIds: new Set(selectedIdsRef.current),
      parentHistory: [...historyRef.current],
      parentHistoryIdx: historyIdxRef.current,
    });
    const children = group.children.map((c) => ({ ...c }));
    setObjects(children);
    setSelectedIds(new Set());
    historyRef.current = [{ objects: [...children], sel: [] }];
    historyIdxRef.current = 0;
    setIsolationDepth((d) => d + 1);
  }, []);

  const enterClippingIsolation = useCallback((containerId: string, mode: "content" | "mask" = "content") => {
    const objs = objectsRef.current;
    const container = objs.find((o) => o.id === containerId && o.type === "clippingContainer") as ClippingContainerObject | undefined;
    if (!container) return;
    const entry: IsolationFrame = {
      kind: "clipping",
      containerId,
      editMode: mode,
      storedContent: mode === "mask" ? container.content.map((c) => ({ ...c })) : null,
      parentObjects: objs.map((o) => ({ ...o })),
      parentSelectedIds: new Set(selectedIdsRef.current),
      parentHistory: [...historyRef.current],
      parentHistoryIdx: historyIdxRef.current,
    };
    isolationStackRef.current.push(entry);
    if (mode === "content") {
      const children = container.content.map((c) => ({ ...c }));
      setObjects(children);
      historyRef.current = [{ objects: [...children], sel: [] }];
    } else {
      const maskOnly: FreehandObject[] = [{ ...container.mask } as FreehandObject];
      setObjects(maskOnly);
      historyRef.current = [{ objects: [...maskOnly], sel: [] }];
    }
    historyIdxRef.current = 0;
    setSelectedIds(new Set());
    setIsolationDepth((d) => d + 1);
  }, []);

  const switchClippingIsolationMode = useCallback((target: "content" | "mask") => {
    const top = isolationStackRef.current[isolationStackRef.current.length - 1];
    if (!top || top.kind !== "clipping") return;
    const parentC = top.parentObjects.find((o) => o.id === top.containerId) as ClippingContainerObject | undefined;
    if (!parentC) return;
    if (top.editMode === target) return;
    if (target === "mask") {
      if (top.editMode !== "content") return;
      top.storedContent = objectsRef.current.map((c) => ({ ...c }));
      top.editMode = "mask";
      setObjects([{ ...parentC.mask } as FreehandObject]);
      setSelectedIds(new Set([parentC.mask.id]));
    } else {
      const m = objectsRef.current[0] as RectObject | EllipseObject | PathObject | undefined;
      if (!m) return;
      top.editMode = "content";
      top.parentObjects = top.parentObjects.map((o) =>
        o.id === top.containerId ? { ...(o as ClippingContainerObject), mask: m } : o
      );
      const sc = top.storedContent ?? [];
      top.storedContent = null;
      setObjects(sc.map((c) => ({ ...c })));
      setSelectedIds(new Set());
    }
  }, []);

  const exitIsolation = useCallback(async () => {
    const frame = isolationStackRef.current.pop();
    if (!frame) return;
    if (frame.kind === "clipping") {
      const current = objectsRef.current;
      const parentC = frame.parentObjects.find((o) => o.id === frame.containerId) as ClippingContainerObject | undefined;
      if (!parentC) return;
      let mask: RectObject | EllipseObject | PathObject = parentC.mask;
      let content: FreehandObject[];
      if (frame.editMode === "mask") {
        const m = current[0] as RectObject | EllipseObject | PathObject | undefined;
        if (m) mask = m;
        content = (frame.storedContent ?? []).map((c) => ({ ...c }));
      } else {
        content = current.map((c) => ({ ...c }));
      }
      const ub = clipContainerOuterBoundsFromMask(mask);
      const updated: ClippingContainerObject = {
        ...parentC,
        width: ub.w,
        height: ub.h,
        mask: offsetShapeWorldToLocal(mask, ub.x, ub.y),
        content: content.map((c) => offsetObjectWorldToLocal(c, ub.x, ub.y)),
      };
      const restoredObjects = frame.parentObjects.map((o) =>
        o.id === frame.containerId ? updated : o
      );
      objectsRef.current = restoredObjects;
      setObjects(restoredObjects);
      setSelectedIds(new Set([frame.containerId]));
      historyRef.current = frame.parentHistory;
      historyIdxRef.current = frame.parentHistoryIdx;
      setIsolationDepth((d) => d - 1);
      setLivePreview(null);
      return;
    }
    const currentChildren = objectsRef.current;
    const parentGroup = frame.parentObjects.find((o) => o.id === frame.groupId) as BooleanGroupObject;
    if (!parentGroup) return;

    const { dataUrl, bounds } = await computeBooleanCachedResult(currentChildren, parentGroup.operation);
    const updatedGroup: BooleanGroupObject = {
      ...parentGroup,
      children: currentChildren.map((c) => ({ ...c })),
      cachedResult: dataUrl,
      x: bounds.x, y: bounds.y,
      width: bounds.w, height: bounds.h,
    };

    const restoredObjects = frame.parentObjects.map((o) =>
      o.id === frame.groupId ? updatedGroup : o
    );
    objectsRef.current = restoredObjects;
    setObjects(restoredObjects);
    setSelectedIds(new Set([frame.groupId]));
    historyRef.current = frame.parentHistory;
    historyIdxRef.current = frame.parentHistoryIdx;
    setIsolationDepth((d) => d - 1);
    setLivePreview(null);
  }, []);

  const exitToLevel = useCallback(async (targetLevel: number) => {
    while (isolationStackRef.current.length > targetLevel) {
      await exitIsolation();
    }
  }, [exitIsolation]);

  // ── Alignment ─────────────────────────────────────────────────────

  const alignObjects = useCallback((mode: string) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const selObjs = prev.filter((o) => sel.has(o.id));
      if (selObjs.length < 2) return prev;
      const b = getGroupBounds(selObjs);
      const next = prev.map((o) => {
        if (!sel.has(o.id)) return o;
        switch (mode) {
          case "left": return { ...o, x: b.x };
          case "centerH": return { ...o, x: b.x + (b.w - o.width) / 2 };
          case "right": return { ...o, x: b.x + b.w - o.width };
          case "top": return { ...o, y: b.y };
          case "centerV": return { ...o, y: b.y + (b.h - o.height) / 2 };
          case "bottom": return { ...o, y: b.y + b.h - o.height };
          case "distH": {
            const sorted = [...selObjs].sort((a, c) => a.x - c.x);
            const totalW = sorted.reduce((s, oo) => s + oo.width, 0);
            const gap = (b.w - totalW) / Math.max(sorted.length - 1, 1);
            const idx = sorted.findIndex((s) => s.id === o.id);
            let xPos = b.x;
            for (let i = 0; i < idx; i++) xPos += sorted[i].width + gap;
            return { ...o, x: xPos };
          }
          case "distV": {
            const sorted = [...selObjs].sort((a, c) => a.y - c.y);
            const totalH = sorted.reduce((s, oo) => s + oo.height, 0);
            const gap = (b.h - totalH) / Math.max(sorted.length - 1, 1);
            const idx = sorted.findIndex((s) => s.id === o.id);
            let yPos = b.y;
            for (let i = 0; i < idx; i++) yPos += sorted[i].height + gap;
            return { ...o, y: yPos };
          }
          default: return o;
        }
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Path editing helpers ──────────────────────────────────────────

  const deleteSelectedPoints = useCallback(() => {
    if (selectedPoints.size === 0) return;
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.type !== "path") return o;
        const ptIdxs = selectedPoints.get(o.id);
        if (!ptIdxs || ptIdxs.size === 0) return o;
        const p = o as PathObject;
        const newPts = p.points.filter((_, i) => !ptIdxs.has(i));
        if (newPts.length < 1) return null;
        return { ...p, points: newPts };
      }).filter(Boolean) as FreehandObject[];
      pushHistory(next, sel);
      return next;
    });
    setSelectedPoints(new Map());
  }, [selectedPoints, pushHistory]);

  const addPointOnSegment = useCallback((objId: string, segIdx: number, t: number) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.id !== objId || o.type !== "path") return o;
        const p = o as PathObject;
        const newPts = splitBezierSegment(p.points, segIdx, t);
        return { ...p, points: newPts };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const togglePathClosed = useCallback((objId: string) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.id !== objId || o.type !== "path") return o;
        return { ...o, closed: !(o as PathObject).closed };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const cycleVertexMode = useCallback((objId: string, ptIdx: number) => {
    const sel = selectedIdsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.id !== objId || o.type !== "path") return o;
        const p = o as PathObject;
        const pts = p.points.map((pt, i) => {
          if (i !== ptIdx) return pt;
          const cur = getVertexMode(pt);
          const order: VertexMode[] = ["smooth", "cusp", "corner"];
          const nextMode = order[(order.indexOf(cur) + 1) % order.length];
          return normalizeBezierPointForVertexMode(pt, nextMode);
        });
        const pb = getPathBoundsFromPoints(pts);
        return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  const setVertexModeOnSelectedAnchors = useCallback((mode: VertexMode) => {
    const sel = selectedIdsRef.current;
    const sp = selectedPointsRef.current;
    setObjects((prev) => {
      const next = prev.map((o) => {
        if (o.type !== "path" || !sel.has(o.id)) return o;
        const idxs = sp.get(o.id);
        if (!idxs || idxs.size === 0) return o;
        const p = o as PathObject;
        const pts = p.points.map((pt, i) => {
          if (!idxs.has(i)) return pt;
          return normalizeBezierPointForVertexMode(pt, mode);
        });
        const pb = getPathBoundsFromPoints(pts);
        return { ...p, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
      });
      pushHistory(next, sel);
      return next;
    });
  }, [pushHistory]);

  // ── Export ────────────────────────────────────────────────────────

  const doExportSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = buildExportBounds(objects);
    const str = buildExportSvgString(svg, bounds);
    downloadBlob(new Blob([str], { type: "image/svg+xml" }), "freehand.svg");
  }, [objects]);

  const doExportPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = buildExportBounds(objects);
    const str = buildExportSvgString(svg, bounds);
    const canvas = await svgStringToCanvas(str, bounds.w, bounds.h);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "freehand.png"); }, "image/png");
  }, [objects]);

  const doExportJpg = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = buildExportBounds(objects);
    const str = buildExportSvgString(svg, bounds);
    const canvas = await svgStringToCanvas(str, bounds.w, bounds.h, "#ffffff");
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "freehand.jpg"); }, "image/jpeg", 0.92);
  }, [objects]);

  const doExportNode = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = buildExportBounds(objects);
    const str = buildExportSvgString(svg, bounds);
    const canvas = await svgStringToCanvas(str, bounds.w, bounds.h);
    onExport(canvas.toDataURL("image/png"));
  }, [objects, onExport]);

  const triggerExportFlash = useCallback((b: ExportRect) => {
    setExportFlash(b);
    window.setTimeout(() => setExportFlash(null), 700);
  }, []);

  const quickExportSelectionPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const objs = objectsRef.current;
    const sel = selectedIdsRef.current;
    if (sel.size === 0) {
      setToast("Select objects to export");
      window.setTimeout(() => setToast(null), 2200);
      return;
    }
    const cmap = clipMapFromObjects(objs);
    const exportIds = expandExportIds(new Set(sel), objs, cmap);
    const targets = objs.filter((o) => exportIds.has(o.id) && o.visible);
    const b = getGroupBounds(targets);
    if (b.w < 1 || b.h < 1) return;
    const str = buildStandaloneSvgFromCanvasDom(svg, {
      exportIds,
      bounds: b,
      scale: 1,
      background: "transparent",
    });
    const w = Math.max(1, Math.round(b.w));
    const h = Math.max(1, Math.round(b.h));
    const canvas = await svgStringToCanvas(str, w, h);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `export-${Date.now()}.png`);
    }, "image/png");
    triggerExportFlash(b);
    setToast("Exported PNG (1×)");
    window.setTimeout(() => setToast(null), 2600);
  }, [triggerExportFlash]);

  const runProfessionalExport = useCallback(
    async (opts: ProfessionalExportOptions) => {
      const svg = svgRef.current;
      if (!svg) return;
      const objs = objectsRef.current;
      const sel = selectedIdsRef.current;
      const cmap = clipMapFromObjects(objs);
      const scope = exportModalScope;

      const bgForCanvas =
        opts.format === "jpg"
          ? opts.background === "transparent"
            ? "#ffffff"
            : opts.background
          : opts.background === "transparent"
            ? undefined
            : opts.background;

      const downloadSvg = (str: string, name: string) => {
        downloadBlob(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), name);
      };

      const rasterize = (str: string, bw: number, bh: number, name: string) => {
        return svgStringToCanvas(str, bw, bh, bgForCanvas).then((canvas) => {
          const mime = opts.format === "jpg" ? "image/jpeg" : "image/png";
          const quality = opts.format === "jpg" ? 0.92 : undefined;
          return new Promise<void>((res) => {
            canvas.toBlob(
              (blob) => {
                if (blob) downloadBlob(blob, name);
                res();
              },
              mime,
              quality,
            );
          });
        });
      };

      const runOne = async (exportIds: Set<string> | null, b: ExportRect, suffix: string) => {
        const bg =
          opts.format === "jpg"
            ? opts.background === "transparent"
              ? "#ffffff"
              : opts.background
            : opts.background;
        const str = buildStandaloneSvgFromCanvasDom(svg, {
          exportIds,
          bounds: b,
          scale: opts.scale,
          background: bg,
        });
        const base = opts.filename.replace(/\.(png|svg|jpg|jpeg)$/i, "");
        const ext = opts.format === "svg" ? "svg" : opts.format === "jpg" ? "jpg" : "png";
        const name = suffix ? `${base}-${suffix}.${ext}` : `${base}.${ext}`;
        const pw = Math.max(1, Math.round(b.w * opts.scale));
        const ph = Math.max(1, Math.round(b.h * opts.scale));
        if (opts.format === "svg") downloadSvg(str, name);
        else await rasterize(str, pw, ph, name);
        triggerExportFlash(b);
      };

      try {
        if (scope === "full") {
          const visible = objs.filter((o) => o.visible);
          const b = getGroupBounds(visible);
          if (b.w < 1 || b.h < 1) return;
          await runOne(null, b, "");
        } else {
          if (sel.size === 0) return;
          const exportIds = expandExportIds(new Set(sel), objs, cmap);
          const targets = objs.filter((o) => exportIds.has(o.id) && o.visible);
          const b = getGroupBounds(targets);
          if (b.w < 1 || b.h < 1) return;

          if (
            !opts.merged &&
            sel.size > 1 &&
            (opts.format === "png" || opts.format === "svg" || opts.format === "jpg")
          ) {
            let i = 0;
            for (const id of sel) {
              const oneIds = expandExportIds(new Set([id]), objs, cmap);
              const targs = objs.filter((o) => oneIds.has(o.id) && o.visible);
              const bb = getGroupBounds(targs);
              if (bb.w >= 1 && bb.h >= 1) await runOne(oneIds, bb, `${++i}`);
            }
            setToast(`Exported ${sel.size} assets`);
            window.setTimeout(() => setToast(null), 2800);
            setShowExportModal(false);
            return;
          }
          await runOne(exportIds, b, "");
        }
        setToast(`Exported ${opts.format.toUpperCase()}${opts.scale !== 1 ? ` (${opts.scale}×)` : ""}`);
        window.setTimeout(() => setToast(null), 2800);
        setShowExportModal(false);
      } catch (err) {
        console.error(err);
        setToast("Export failed");
        window.setTimeout(() => setToast(null), 3000);
      }
    },
    [exportModalScope, triggerExportFlash],
  );

  // ── Keyboard ──────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;

      e.stopPropagation();

      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setSpaceHeld(true); return; }
      // Plain V = select tool; must not steal Ctrl/Meta+V (paste) or Ctrl+Shift+V (paste inside)
      if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setActiveTool("select"); return;
      }
      if (e.key === "a" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("directSelect"); return; }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); setActiveTool("pen"); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); setActiveTool("rect"); return; }
      if (e.key === "e" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("ellipse"); return; }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); setActiveTool("text"); return; }
      if ((e.key === "g" || e.key === "G") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("gradient"); return; }
      if ((e.key === "o" || e.key === "O") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("ellipse"); return; }
      if ((e.key === "i" || e.key === "I") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("eyedropper"); return; }
      if ((e.key === "z" || e.key === "Z") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("zoomTool"); return; }
      if ((e.key === "h" || e.key === "H") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setActiveTool("handTool"); return; }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        void quickExportSelectionPng();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c") { e.preventDefault(); copySelectedObjects(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "x") { e.preventDefault(); cutSelectedObjects(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (e.shiftKey) pasteInside();
        else pasteClipboardObjects();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        if (activeTool === "directSelect" && selectedPoints.size > 0) { deleteSelectedPoints(); return; }
        deleteSelected();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); setSelectedIds(new Set(objects.map((o) => o.id))); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); duplicateSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && !e.shiftKey) { e.preventDefault(); groupSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && e.shiftKey) { e.preventDefault(); ungroupSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "G") { e.preventDefault(); ungroupSelected(); return; }

      if ((e.metaKey || e.ctrlKey) && (e.key === "]" || e.key === "}")) { e.preventDefault(); bringForward(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "[" || e.key === "{")) { e.preventDefault(); sendBackward(); return; }

      if (e.key === "Escape") {
        e.preventDefault();
        setQuickEditMode(null);
        if (isPenDrawing && penPoints.length > 0) finishPenPath(false);
        else if (isolationStackRef.current.length > 0) exitIsolation();
        else { setSelectedIds(new Set()); setSelectedPoints(new Map()); }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => { e.stopPropagation(); if (e.code === "Space") setSpaceHeld(false); };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [objects, selectedIds, selectedPoints, isPenDrawing, penPoints, activeTool,
      undo, redo, pushHistory, deleteSelected, duplicateSelected, groupSelected,
      ungroupSelected, bringForward, sendBackward, finishPenPath, deleteSelectedPoints, exitIsolation,
      copySelectedObjects, cutSelectedObjects, pasteClipboardObjects, pasteInside, quickExportSelectionPng]);

  // ── Mouse handlers ────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    setCtxMenu(null);

    // Right-click → context menu
    if (e.button === 2) {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      // If right-clicking an object, select it first
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (hitTestObject(pos, obj, 8 / viewport.zoom)) {
          if (!selectedIds.has(obj.id)) setSelectedIds(resolveSelection(obj.id, false));
          break;
        }
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, canvas: pos });
      return;
    }

    // Pan: middle click, space+drag, or hand tool
    if (e.button === 1 || spaceHeld || (activeTool === "handTool" && e.button === 0)) {
      setDragState({ type: "pan", startX: e.clientX, startY: e.clientY, svpX: viewport.x, svpY: viewport.y });
      return;
    }

    const pos = screenToCanvas(e.clientX, e.clientY);

    // ── Zoom tool (click = zoom in toward point, Alt = zoom out) ─
    if (activeTool === "zoomTool" && e.button === 0) {
      e.preventDefault();
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const factor = e.altKey ? 1 / 1.2 : 1.2;
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setViewport((v) => {
        const nz = clamp(v.zoom * factor, 0.05, 20);
        const ratio = nz / v.zoom;
        return { zoom: nz, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
      });
      return;
    }

    // ── Eyedropper ────────────────────────────────────────────────
    if (activeTool === "eyedropper" && e.button === 0) {
      e.preventDefault();
      const th = 8 / viewport.zoom;
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!obj.visible || obj.locked) continue;
        if (!hitTestObject(pos, obj, th)) continue;
        const f = migrateFill(obj.fill);
        if (f.type === "solid" && f.color !== "none") {
          const c = f.color;
          setFillColor(c);
          if (selectedIds.size > 0) {
            setObjects((prev) =>
              prev.map((o) => (selectedIds.has(o.id) ? { ...o, fill: solidFill(c) } : o)),
            );
          }
        }
        setActiveTool("select");
        return;
      }
      setActiveTool("select");
      return;
    }

    // ── Pen tool ──────────────────────────────────────────────────
    if (activeTool === "pen") {
      const newPt: BezierPoint = { anchor: { ...pos }, handleIn: { ...pos }, handleOut: { ...pos }, vertexMode: "smooth" };

      if (!isPenDrawing) {
        setPenPoints([newPt]);
        setIsPenDrawing(true);
        setPenDragging(true);
        setDragState({ type: "penHandle", startX: e.clientX, startY: e.clientY, startCanvas: pos });
      } else {
        if (penPoints.length > 1 && dist(pos, penPoints[0].anchor) < 12 / viewport.zoom) {
          finishPenPath(true);
          return;
        }
        setPenPoints((prev) => [...prev, newPt]);
        setPenDragging(true);
        setDragState({ type: "penHandle", startX: e.clientX, startY: e.clientY, startCanvas: pos });
      }
      return;
    }

    // ── Create shapes ─────────────────────────────────────────────
    if (activeTool === "rect" || activeTool === "ellipse") {
      setDragState({ type: "create", startX: e.clientX, startY: e.clientY, createType: activeTool, createOrigin: pos, currentCanvas: pos });
      return;
    }

    if (activeTool === "text") {
      setDragState({ type: "createText", startX: e.clientX, startY: e.clientY, createOrigin: pos, currentCanvas: pos });
      return;
    }

    // ── Direct select ─────────────────────────────────────────────
    if (activeTool === "directSelect") {
      const threshold = 8 / viewport.zoom;
      // Check anchor points and handles on all paths
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.locked || !obj.visible || obj.type !== "path") continue;
        const p = obj as PathObject;
        for (let pi = 0; pi < p.points.length; pi++) {
          const pt = p.points[pi];
          for (const ht of ["anchor", "handleIn", "handleOut"] as const) {
            if (dist(pos, pt[ht]) < threshold) {
              // Select this point
              if (e.shiftKey || e.nativeEvent.getModifierState?.("Shift")) {
                setSelectedPoints((prev) => {
                  const m = new Map(prev);
                  const s = new Set(m.get(obj.id) || []);
                  if (ht === "anchor") { if (s.has(pi)) s.delete(pi); else s.add(pi); }
                  else s.add(pi);
                  m.set(obj.id, s);
                  return m;
                });
              } else {
                const m = new Map<string, Set<number>>();
                m.set(obj.id, new Set([pi]));
                setSelectedPoints(m);
              }
              setSelectedIds(new Set([obj.id]));
              setDragState({
                type: "directSelect", startX: e.clientX, startY: e.clientY,
                dsObjId: obj.id, dsPtIdx: pi, dsHtType: ht, dsStartPt: { ...pt[ht] },
              });
              return;
            }
          }
        }
      }

      // Check path segments for adding points
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.locked || !obj.visible || obj.type !== "path") continue;
        const p = obj as PathObject;
        const seg = distToPathSegments(pos, p);
        if (seg.dist < threshold) {
          addPointOnSegment(obj.id, seg.segIdx, seg.t);
          setSelectedIds(new Set([obj.id]));
          return;
        }
      }

      // Click on empty → marquee
      setSelectedPoints(new Map());
      setDragState({ type: "marquee", startX: e.clientX, startY: e.clientY, marqueeOrigin: pos, currentCanvas: pos });
      return;
    }

    // ── Select & gradient tools ─────────────────────────────────────
    const threshold = 6 / viewport.zoom;
    const shiftHeld = e.shiftKey || (typeof e.getModifierState === "function" && e.getModifierState("Shift"));

    if (activeTool === "gradient" && selectedIds.size > 0) {
      const gTh = 12 / viewport.zoom;
      for (const oid of Array.from(selectedIds)) {
        const o = objects.find((x) => x.id === oid);
        if (!o || !supportsGradientFill(o)) continue;
        const f = migrateFill(o.fill);
        if (f.type === "gradient-linear") {
          const wa = localBoxToWorld(o, f.x1, f.y1);
          const wb = localBoxToWorld(o, f.x2, f.y2);
          if (dist(pos, wa) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "linA", gradientPrimaryId: o.id });
            return;
          }
          if (dist(pos, wb) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "linB", gradientPrimaryId: o.id });
            return;
          }
          for (let si = 0; si < f.stops.length; si++) {
            const tt = clamp(f.stops[si].position / 100, 0, 1);
            const wx = wa.x + (wb.x - wa.x) * tt;
            const wy = wa.y + (wb.y - wa.y) * tt;
            if (dist(pos, { x: wx, y: wy }) < gTh * 0.85) {
              setDragState({
                type: "gradient",
                startX: e.clientX,
                startY: e.clientY,
                gradientHandle: "stop",
                gradientPrimaryId: o.id,
                gradientStopIndex: si,
              });
              return;
            }
          }
        } else if (f.type === "gradient-radial") {
          const wc = localBoxToWorld(o, f.cx, f.cy);
          const wr = localBoxToWorld(o, Math.min(1, f.cx + f.r), f.cy);
          if (dist(pos, wc) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "radC", gradientPrimaryId: o.id });
            return;
          }
          if (dist(pos, wr) < gTh) {
            setDragState({ type: "gradient", startX: e.clientX, startY: e.clientY, gradientHandle: "radR", gradientPrimaryId: o.id });
            return;
          }
        }
      }
    }

    // Resize/rotate handles (skip when Shift so Shift+click can add to selection)
    if (selectedObjects.length > 0 && selectionFrame && !shiftHeld) {
      const f = selectionFrame;
      const handleSize = 8 / viewport.zoom;
      const rotOffset = 14 / viewport.zoom;
      const hw = f.w / 2, hh = f.h / 2;

      const rotLocal = [
        { x: -hw - rotOffset, y: -hh - rotOffset },
        { x: hw + rotOffset, y: -hh - rotOffset },
        { x: hw + rotOffset, y: hh + rotOffset },
        { x: -hw - rotOffset, y: hh + rotOffset },
      ];
      for (const rl of rotLocal) {
        const rc = localToWorldOBB(rl, f.cx, f.cy, f.angleDeg);
        if (dist(pos, rc) < handleSize) {
          const startAngle = Math.atan2(pos.y - f.cy, pos.x - f.cx);
          const initRots = new Map<string, number>();
          for (const so of selectedObjects) initRots.set(so.id, so.rotation);
          setDragState({
            type: "rotate", startX: e.clientX, startY: e.clientY,
            rotateCenter: { x: f.cx, y: f.cy }, rotateStartAngle: startAngle, rotateInitialRotations: initRots,
          });
          return;
        }
      }

      const hDefs: { id: string; lx: number; ly: number }[] = [
        { id: "nw", lx: -hw, ly: -hh }, { id: "ne", lx: hw, ly: -hh },
        { id: "se", lx: hw, ly: hh }, { id: "sw", lx: -hw, ly: hh },
        { id: "n", lx: 0, ly: -hh }, { id: "e", lx: hw, ly: 0 },
        { id: "s", lx: 0, ly: hh }, { id: "w", lx: -hw, ly: 0 },
      ];
      for (const hi of hDefs) {
        const hp = localToWorldOBB({ x: hi.lx, y: hi.ly }, f.cx, f.cy, f.angleDeg);
        if (dist(pos, hp) < handleSize) {
          const allBounds = new Map<string, Rect>();
          const resizeSnapshot = new Map<string, FreehandObject>();
          for (const so of selectedObjects) {
            allBounds.set(so.id, getVisualAABB(so));
            resizeSnapshot.set(so.id, deepCloneFreehandObjectKeepIds(so));
          }
          setDragState({
            type: "resize", startX: e.clientX, startY: e.clientY,
            handle: hi.id,
            bounds: { ...groupBounds },
            initialOrientedFrame: { ...f },
            allBounds,
            resizeSnapshot,
          });
          return;
        }
      }
    }

    // Hit test objects (top to bottom)
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (hitTestObject(pos, obj, threshold)) {
        // Alt/Option + drag → duplicate then drag the clones
        if (e.altKey) {
          const baseSel = selectedIds.has(obj.id) ? selectedIds : resolveSelection(obj.id, false);
          const toClone = objects.filter((o) => baseSel.has(o.id));
          if (toClone.length > 0) {
            const clones = toClone.map((o) => deepCloneFreehandObject(o, uid));
            const next = [...objects, ...clones];
            setObjects(next);
            const cloneSel = new Set(clones.map((c) => c.id));
            setSelectedIds(cloneSel);
            const positions = new Map<string, Point>();
            const pathPointsMap = new Map<string, BezierPoint[]>();
            for (const c of clones) {
              positions.set(c.id, { x: c.x, y: c.y });
              if (c.type === "path") pathPointsMap.set(c.id, (c as PathObject).points.map(pt => ({ ...pt, anchor: { ...pt.anchor }, handleIn: { ...pt.handleIn }, handleOut: { ...pt.handleOut } })));
            }
            setDragState({ type: "move", startX: e.clientX, startY: e.clientY, positions, pathPointsMap });
            pushHistory(next, cloneSel);
            return;
          }
        }

        const newSel = resolveSelection(obj.id, shiftHeld);
        setSelectedIds(newSel);
        setPrimarySelectedId(obj.id);
        const positions = new Map<string, Point>();
        const pathPointsMap = new Map<string, BezierPoint[]>();
        for (const sid of newSel) {
          const o = objects.find((x) => x.id === sid);
          if (o) {
            positions.set(sid, { x: o.x, y: o.y });
            if (o.type === "path") pathPointsMap.set(sid, (o as PathObject).points.map(pt => ({ ...pt, anchor: { ...pt.anchor }, handleIn: { ...pt.handleIn }, handleOut: { ...pt.handleOut } })));
          }
        }
        setDragState({ type: "move", startX: e.clientX, startY: e.clientY, positions, pathPointsMap });
        return;
      }
    }

    // Empty click → start marquee
    if (!shiftHeld) setSelectedIds(new Set());
    setDragState({ type: "marquee", startX: e.clientX, startY: e.clientY, marqueeOrigin: pos, currentCanvas: pos, shiftKey: shiftHeld });
  }, [activeTool, viewport, spaceHeld, objects, selectedIds, selectedObjects, groupBounds, selectionFrame,
      screenToCanvas, isPenDrawing, penPoints, finishPenPath, resolveSelection, addPointOnSegment, pushHistory]);

  const handleMouseMove = useCallback((e: ReactMouseEvent) => {
    if (!dragState) {
      if (activeTool === "select" || activeTool === "gradient") {
        const pos = screenToCanvas(e.clientX, e.clientY);
        const threshold = 8 / viewport.zoom;
        let found: string | null = null;
        for (let i = objects.length - 1; i >= 0; i--) {
          const obj = objects[i];
          if (!obj.visible || obj.locked) continue;
          if (obj.isClipMask || obj.clipMaskId) continue;
          if (hitTestObject(pos, obj, threshold)) {
            found = obj.id;
            break;
          }
        }
        setHoverCanvasId((prev) => (prev === found ? prev : found));
      }
      return;
    }
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    if (dragState.type === "pan") {
      setViewport((v) => ({ ...v, x: (dragState.svpX ?? 0) + dx, y: (dragState.svpY ?? 0) + dy }));
      return;
    }

    if (dragState.type === "penHandle" && penPoints.length > 0) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setPenPoints((prev) => {
        const pts = [...prev];
        const last = pts[pts.length - 1];
        pts[pts.length - 1] = applyVertexHandleDrag(last, "handleOut", pos);
        return pts;
      });
      return;
    }

    if (dragState.type === "marquee" && dragState.marqueeOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDragState((prev) => prev ? { ...prev, currentCanvas: pos } : null);
      return;
    }

    if (dragState.type === "create" && dragState.createOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDragState((prev) => prev ? { ...prev, currentCanvas: pos } : null);
      return;
    }

    if (dragState.type === "createText" && dragState.createOrigin) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDragState((prev) => prev ? { ...prev, currentCanvas: pos } : null);
      return;
    }

    if (dragState.type === "gradient" && dragState.gradientPrimaryId && dragState.gradientHandle) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const primary = objects.find((o) => o.id === dragState.gradientPrimaryId);
      if (!primary) return;
      const f0 = migrateFill(primary.fill);

      if (dragState.gradientHandle === "stop" && dragState.gradientStopIndex != null && f0.type === "gradient-linear") {
        const ff = f0;
        const a = localBoxToWorld(primary, ff.x1, ff.y1);
        const b = localBoxToWorld(primary, ff.x2, ff.y2);
        const abx = b.x - a.x, aby = b.y - a.y;
        const len2 = abx * abx + aby * aby || 1e-9;
        const apx = pos.x - a.x, apy = pos.y - a.y;
        let t = (apx * abx + apy * aby) / len2;
        t = clamp(t, 0, 1);
        const posPct = t * 100;
        const si = dragState.gradientStopIndex;
        const sel = selectedIdsRef.current;
        setObjects((prev) =>
          prev.map((o) => {
            if (o.id !== dragState.gradientPrimaryId || !sel.has(o.id)) return o;
            const mf = migrateFill(o.fill);
            if (mf.type !== "gradient-linear") return o;
            const stops = mf.stops.map((s, i) => (i === si ? { ...s, position: posPct } : { ...s }));
            stops.sort((x, y) => x.position - y.position);
            return { ...o, fill: { ...mf, stops } };
          }),
        );
        return;
      }

      const loc = worldToLocalBox(primary, pos);
      const lx = clamp(loc.lx, 0, 1);
      const ly = clamp(loc.ly, 0, 1);
      const sel = selectedIdsRef.current;
      setObjects((prev) =>
        prev.map((o) => {
          if (!sel.has(o.id) || !supportsGradientFill(o)) return o;
          const f = migrateFill(o.fill);
          if (f.type === "gradient-linear") {
            let nf = { ...f, stops: f.stops.map((s) => ({ ...s })) };
            if (dragState.gradientHandle === "linA") nf = { ...nf, x1: lx, y1: ly };
            else if (dragState.gradientHandle === "linB") nf = { ...nf, x2: lx, y2: ly };
            return { ...o, fill: nf };
          }
          if (f.type === "gradient-radial") {
            let nf = { ...f, stops: f.stops.map((s) => ({ ...s })) };
            if (dragState.gradientHandle === "radC") {
              nf = { ...nf, cx: lx, cy: ly, fx: lx, fy: ly };
            } else if (dragState.gradientHandle === "radR") {
              const rr = Math.hypot(lx - f.cx, ly - f.cy);
              nf = { ...nf, r: clamp(rr, 0.02, 1.5) };
            }
            return { ...o, fill: nf };
          }
          return o;
        }),
      );
      return;
    }

    if (dragState.type === "move" && dragState.positions) {
      const scale = canvasScaleFromPointer(viewport.zoom, "move");
      let mdx = dx * scale, mdy = dy * scale;

      if (isShiftHeld(e)) {
        const c = constrainToAxis(mdx, mdy);
        mdx = c.x; mdy = c.y;
      }

      if (snapEnabled && dragState.positions.size > 0) {
        const firstPos = Array.from(dragState.positions.values())[0];
        const tentBounds = getGroupBounds(
          Array.from(dragState.positions.entries()).map(([id, p]) => {
            const obj = objects.find((o) => o.id === id)!;
            return { ...obj, x: p.x + mdx, y: p.y + mdy };
          })
        );
        const snap = computeSnap(tentBounds, objects, selectedIds, viewport.zoom);
        mdx += snap.dx;
        mdy += snap.dy;
        setSnapGuides(snap.guides);
      } else {
        setSnapGuides([]);
      }

      setObjects((prev) => prev.map((o) => {
        const sp = dragState.positions!.get(o.id);
        if (!sp) return o;
        if (o.type === "path" && dragState.pathPointsMap?.has(o.id)) {
          const origPts = dragState.pathPointsMap.get(o.id)!;
          const newPts = origPts.map(pt => ({
            ...pt,
            anchor: { x: pt.anchor.x + mdx, y: pt.anchor.y + mdy },
            handleIn: { x: pt.handleIn.x + mdx, y: pt.handleIn.y + mdy },
            handleOut: { x: pt.handleOut.x + mdx, y: pt.handleOut.y + mdy },
          }));
          const pb = getPathBoundsFromPoints(newPts);
          return { ...o, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: newPts };
        }
        return { ...o, x: sp.x + mdx, y: sp.y + mdy };
      }));
      return;
    }

    if (dragState.type === "resize" && dragState.allBounds && dragState.initialOrientedFrame) {
      const scale = canvasScaleFromPointer(viewport.zoom, "resize");
      const dCanvas = { x: dx * scale, y: dy * scale };
      const f0 = dragState.initialOrientedFrame;
      const h = dragState.handle!;
      const dLocal = worldDeltaToLocal(dCanvas, f0.angleDeg);
      let nw = f0.w, nh = f0.h;
      if (h.includes("e")) nw = Math.max(10, f0.w + dLocal.x);
      if (h.includes("w")) nw = Math.max(10, f0.w - dLocal.x);
      if (h.includes("s")) nh = Math.max(10, f0.h + dLocal.y);
      if (h.includes("n")) nh = Math.max(10, f0.h - dLocal.y);

      if (isShiftHeld(e)) {
        const aspect = f0.w / f0.h;
        if (h === "n" || h === "s") nw = Math.max(10, nh * aspect);
        else if (h === "e" || h === "w") nh = Math.max(10, nw / aspect);
        else {
          const avgScale = ((nw / f0.w) + (nh / f0.h)) / 2;
          nw = Math.max(10, f0.w * avgScale);
          nh = Math.max(10, f0.h * avgScale);
        }
      }

      const dw = nw - f0.w, dh = nh - f0.h;
      const th = degToRad(f0.angleDeg);
      const ux = Math.cos(th), uy = Math.sin(th);
      const vx = -Math.sin(th), vy = Math.cos(th);
      const ncx = f0.cx + (dw / 2) * ux + (dh / 2) * vx;
      const ncy = f0.cy + (dw / 2) * uy + (dh / 2) * vy;
      const sx = nw / f0.w, sy = nh / f0.h;

      setObjects((prev) => prev.map((o) => {
        if (!dragState.allBounds!.has(o.id)) return o;
        const src = dragState.resizeSnapshot?.get(o.id);
        if (!src) return o;
        const mapWorld = (p: Point) => {
          const L = worldToLocalOBB(p, f0.cx, f0.cy, f0.angleDeg);
          return localToWorldOBB({ x: L.x * sx, y: L.y * sy }, ncx, ncy, f0.angleDeg);
        };
        if (src.type === "path") {
          const pts = (src as PathObject).points.map((pt) => ({
            ...pt,
            anchor: mapWorld(pt.anchor),
            handleIn: mapWorld(pt.handleIn),
            handleOut: mapWorld(pt.handleOut),
          }));
          const pb = getPathBoundsFromPoints(pts);
          return { ...o, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: pts };
        }
        if (src.type === "clippingContainer") {
          return mapObjectPointsWithWorld(src, mapWorld) as ClippingContainerObject;
        }
        const newW = Math.max(4, src.width * sx);
        const newH = Math.max(4, src.height * sy);
        const pivot = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
        const newC = mapWorld(pivot);
        return { ...o, x: newC.x - newW / 2, y: newC.y - newH / 2, width: newW, height: newH };
      }));
      return;
    }

    if (dragState.type === "resize" && dragState.bounds && dragState.allBounds && !dragState.initialOrientedFrame) {
      const scale = canvasScaleFromPointer(viewport.zoom, "resize");
      const b = dragState.bounds;
      const h = dragState.handle!;
      let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
      if (h.includes("e")) nw = Math.max(10, b.w + dx * scale);
      if (h.includes("s")) nh = Math.max(10, b.h + dy * scale);
      if (h.includes("w")) { nw = Math.max(10, b.w - dx * scale); nx = b.x + (b.w - nw); }
      if (h.includes("n")) { nh = Math.max(10, b.h - dy * scale); ny = b.y + (b.h - nh); }

      if (isShiftHeld(e)) {
        const aspect = b.w / b.h;
        if (h === "n" || h === "s") { nw = Math.max(10, nh * aspect); nx = b.x + (b.w - nw) / 2; }
        else if (h === "e" || h === "w") { nh = Math.max(10, nw / aspect); ny = b.y + (b.h - nh) / 2; }
        else {
          const avgScale = ((nw / b.w) + (nh / b.h)) / 2;
          nw = Math.max(10, b.w * avgScale); nh = Math.max(10, b.h * avgScale);
          if (h.includes("w")) nx = b.x + b.w - nw;
          if (h.includes("n")) ny = b.y + b.h - nh;
        }
      }

      const sx = nw / b.w, sy = nh / b.h;
      setObjects((prev) => prev.map((o) => {
        const ob = dragState.allBounds!.get(o.id);
        const src = dragState.resizeSnapshot?.get(o.id);
        if (!ob || !src) return o;
        const newX = nx + (ob.x - b.x) * sx;
        const newY = ny + (ob.y - b.y) * sy;
        if (src.type === "path") {
          const pts = (src as PathObject).points.map(pt => ({
            ...pt,
            anchor: { x: nx + (pt.anchor.x - b.x) * sx, y: ny + (pt.anchor.y - b.y) * sy },
            handleIn: { x: nx + (pt.handleIn.x - b.x) * sx, y: ny + (pt.handleIn.y - b.y) * sy },
            handleOut: { x: nx + (pt.handleOut.x - b.x) * sx, y: ny + (pt.handleOut.y - b.y) * sy },
          }));
          const pb = getPathBoundsFromPoints(pts);
          return { ...o, x: pb.x, y: pb.y, width: pb.w, height: pb.h, points: pts };
        }
        if (src.type === "clippingContainer") {
          const mapWorld = (p: Point) => ({
            x: nx + (p.x - b.x) * sx,
            y: ny + (p.y - b.y) * sy,
          });
          return mapObjectPointsWithWorld(src, mapWorld) as ClippingContainerObject;
        }
        return {
          ...o,
          x: newX, y: newY,
          width: ob.w * sx,
          height: ob.h * sy,
        };
      }));
      return;
    }

    if (dragState.type === "rotate" && dragState.rotateCenter && dragState.rotateStartAngle != null) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const center = dragState.rotateCenter;
      const currentAngle = Math.atan2(pos.y - center.y, pos.x - center.x);
      const radDelta = shortestAngleDeltaRad(currentAngle, dragState.rotateStartAngle);
      let angleDelta = (radDelta * 180) / Math.PI;
      if (e.shiftKey) angleDelta = Math.round(angleDelta / 15) * 15;
      setObjects((prev) => prev.map((o) => {
        const initRot = dragState.rotateInitialRotations?.get(o.id);
        if (initRot == null) return o;
        return { ...o, rotation: initRot + angleDelta };
      }));
      return;
    }

    if (dragState.type === "directSelect" && dragState.dsObjId) {
      const scale = 1 / viewport.zoom;
      const start = dragState.dsStartPt!;
      const newPos: Point = { x: start.x + dx * scale, y: start.y + dy * scale };
      setObjects((prev) => prev.map((o) => {
        if (o.id !== dragState.dsObjId || o.type !== "path") return o;
        const pts = (o as PathObject).points.map((pt, pi) => {
          if (pi !== dragState.dsPtIdx) return pt;
          const ht = dragState.dsHtType!;
          if (ht === "anchor") {
            const adx = newPos.x - pt.anchor.x, ady = newPos.y - pt.anchor.y;
            return { ...pt, anchor: newPos, handleIn: { x: pt.handleIn.x + adx, y: pt.handleIn.y + ady }, handleOut: { x: pt.handleOut.x + adx, y: pt.handleOut.y + ady } };
          }
          return applyVertexHandleDrag(pt, ht, newPos);
        });
        const pb = getPathBoundsFromPoints(pts);
        return { ...o, points: pts, x: pb.x, y: pb.y, width: pb.w, height: pb.h };
      }));
      return;
    }
  }, [dragState, viewport, objects, selectedIds, snapEnabled, screenToCanvas, penPoints.length, activeTool]);

  const handleMouseUp = useCallback((e: ReactMouseEvent) => {
    if (!dragState) return;
    setSnapGuides([]);

    if (dragState.type === "penHandle") {
      setPenDragging(false);
      setDragState(null);
      return;
    }

    if (dragState.type === "marquee" && dragState.marqueeOrigin && dragState.currentCanvas) {
      const o = dragState.marqueeOrigin, c = dragState.currentCanvas;
      const mx = Math.min(o.x, c.x), my = Math.min(o.y, c.y);
      const mw = Math.abs(c.x - o.x), mh = Math.abs(c.y - o.y);
      if (mw > 2 && mh > 2) {
        const marqueeRect: Rect = { x: mx, y: my, w: mw, h: mh };

        if (activeTool === "directSelect") {
          const newPts = new Map<string, Set<number>>();
          for (const obj of objects) {
            if (obj.type !== "path" || obj.locked || !obj.visible) continue;
            const p = obj as PathObject;
            const idxs = new Set<number>();
            p.points.forEach((pt, i) => {
              if (pt.anchor.x >= mx && pt.anchor.x <= mx + mw && pt.anchor.y >= my && pt.anchor.y <= my + mh) {
                idxs.add(i);
              }
            });
            if (idxs.size > 0) newPts.set(obj.id, idxs);
          }
          setSelectedPoints(newPts);
          setSelectedIds(new Set(newPts.keys()));
        } else {
          const marqueeSel = new Set<string>();
          for (const obj of objects) {
            if (obj.locked || !obj.visible || obj.isClipMask) continue;
            const objRect = getObjBounds(obj);
            if (rectsIntersect(marqueeRect, objRect)) {
              const gid = obj.groupId;
              if (gid) objects.filter((oo) => oo.groupId === gid).forEach((oo) => marqueeSel.add(oo.id));
              else marqueeSel.add(obj.id);
            }
          }
          if (dragState.shiftKey) {
            setSelectedIds((prev) => {
              const merged = new Set(prev);
              marqueeSel.forEach((id) => merged.add(id));
              return merged;
            });
          } else {
            setSelectedIds(marqueeSel);
          }
        }
      }
      setDragState(null);
      return;
    }

    if (dragState.type === "createText" && dragState.createOrigin && dragState.currentCanvas) {
      const o = dragState.createOrigin, c = dragState.currentCanvas;
      const dx = c.x - o.x, dy = c.y - o.y;
      const dragLen = Math.hypot(dx, dy);
      const pointClick = dragLen * viewport.zoom < 6;
      if (pointClick) {
        const newObj = {
          ...defaultObj({ name: `Text ${objects.length + 1}` }),
          type: "text" as const,
          textMode: "point" as const,
          text: "",
          x: o.x,
          y: o.y,
          width: 200,
          height: 32,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 1.35,
          letterSpacing: 0,
          textAlign: "left" as const,
          fill: solidFill(fillColor),
          stroke: "none",
          strokeWidth: 0,
        } as TextObject;
        const next = [...objects, newObj];
        setObjects(next);
        const ns = new Set([newObj.id]);
        setSelectedIds(ns);
        pushHistory(next, ns);
        setTextEditingId(newObj.id);
      } else {
        const x = Math.min(o.x, c.x), y = Math.min(o.y, c.y);
        const w = Math.max(Math.abs(c.x - o.x), 40), h = Math.max(Math.abs(c.y - o.y), 32);
        const newObj = {
          ...defaultObj({ name: `Text ${objects.length + 1}` }),
          type: "text" as const,
          textMode: "area" as const,
          text: "",
          x, y,
          width: w,
          height: h,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 1.35,
          letterSpacing: 0,
          textAlign: "left" as const,
          fill: solidFill(fillColor),
          stroke: "none",
          strokeWidth: 0,
        } as TextObject;
        const next = [...objects, newObj];
        setObjects(next);
        const ns = new Set([newObj.id]);
        setSelectedIds(ns);
        pushHistory(next, ns);
        setTextEditingId(newObj.id);
      }
      setActiveTool("select");
    }

    if (dragState.type === "create" && dragState.createOrigin && dragState.currentCanvas) {
      const o = dragState.createOrigin, c = dragState.currentCanvas;
      const x = Math.min(o.x, c.x), y = Math.min(o.y, c.y);
      const w = Math.max(Math.abs(c.x - o.x), 4), h = Math.max(Math.abs(c.y - o.y), 4);

      const newObj: FreehandObject = dragState.createType === "ellipse"
        ? { ...defaultObj({ name: `Ellipse ${objects.length + 1}` }), type: "ellipse", x, y, width: w, height: h, fill: solidFill(fillColor), stroke: strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray } as EllipseObject
        : { ...defaultObj({ name: `Rect ${objects.length + 1}` }), type: "rect", x, y, width: w, height: h, fill: solidFill(fillColor), stroke: strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray, rx: 0 } as RectObject;

      const next = [...objects, newObj];
      setObjects(next);
      const ns = new Set([newObj.id]);
      setSelectedIds(ns);
      pushHistory(next, ns);
      setActiveTool("select");
    }

    if (dragState.type === "move" || dragState.type === "resize" || dragState.type === "directSelect" || dragState.type === "rotate" || dragState.type === "gradient") {
      pushHistory(objects, selectedIds);
    }

    setDragState(null);
  }, [dragState, objects, selectedIds, fillColor, strokeColor, strokeWidth, strokeLinecap, strokeLinejoin, strokeDasharray, activeTool, pushHistory, screenToCanvas, viewport.zoom]);

  const handleWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault();
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setViewport((v) => {
      const nz = clamp(v.zoom * factor, 0.05, 20);
      const ratio = nz / v.zoom;
      return { zoom: nz, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  }, []);

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    // Same as right-button mousedown: some platforms deliver contextmenu without a reliable button-2 path
    const pos = screenToCanvas(e.clientX, e.clientY);
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (hitTestObject(pos, obj, 8 / viewport.zoom)) {
        if (!selectedIds.has(obj.id)) setSelectedIds(resolveSelection(obj.id, false));
        break;
      }
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, canvas: pos });
  }, [objects, selectedIds, screenToCanvas, viewport.zoom, resolveSelection]);

  const renameSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.size !== 1) return;
    const o = objectsRef.current.find((x) => sel.has(x.id));
    if (!o) return;
    const name = window.prompt("Layer name", o.name);
    if (name != null && name.trim()) updateSelectedProp("name", name.trim());
  }, [updateSelectedProp]);

  // ── Context menu items ────────────────────────────────────────────

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const hasSel = selectedIds.size > 0;
    const multiSel = selectedIds.size >= 2;
    const single = selectedIds.size === 1 ? selectedObjects[0] : null;
    const hasClip = selectedObjects.some((o) => o.clipMaskId || o.isClipMask);
    const hasPath = selectedObjects.some((o) => o.type === "path");
    const hasBoolGroup = selectedObjects.some((o) => o.type === "booleanGroup");

    if (isolationDepth > 0) {
      const top = isolationStackRef.current[isolationStackRef.current.length - 1];
      const clipIso = top?.kind === "clipping";
      return [
        { label: "Exit isolation mode", shortcut: "Esc", action: () => { void exitIsolation(); } },
        ...(clipIso
          ? [
              { label: "Edit content", action: () => switchClippingIsolationMode("content"), disabled: top.editMode === "content" },
              { label: "Edit mask", action: () => switchClippingIsolationMode("mask"), disabled: top.editMode === "mask" },
            ]
          : []),
        { label: "Arrange (use toolbar / ] [)", action: () => {}, disabled: true, separator: true },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, disabled: !hasSel },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected, disabled: !hasSel },
        { label: "Delete", action: deleteSelected, disabled: !hasSel },
      ];
    }

    if (!hasSel) {
      return [
        { label: "Paste", shortcut: "⌘V", action: pasteClipboardObjects },
        { label: "Import image…", action: () => fileInputRef.current?.click(), separator: true },
        { label: "Add text", shortcut: "T", action: () => setActiveTool("text") },
        { label: "Rectangle", shortcut: "R", action: () => setActiveTool("rect") },
        { label: "Ellipse", shortcut: "E", action: () => setActiveTool("ellipse") },
        { label: "Select all", shortcut: "⌘A", action: () => setSelectedIds(new Set(objects.map((o) => o.id))) },
        { label: "Export artboard…", action: () => { setExportModalScope("full"); setShowExportModal(true); }, separator: true },
        { label: "Reset zoom", action: resetZoomCanvas, separator: true },
        { label: "Fit all", action: fitAllCanvas },
        { label: showGrid ? "Hide grid" : "Show grid", action: () => setShowGrid((g) => !g) },
        { label: snapEnabled ? "Disable snap" : "Enable snap", action: () => setSnapEnabled((s) => !s) },
      ];
    }

    if (multiSel) {
      return [
        { label: "Cut", shortcut: "⌘X", action: cutSelectedObjects },
        { label: "Copy", shortcut: "⌘C", action: copySelectedObjects },
        { label: "Paste", shortcut: "⌘V", action: pasteClipboardObjects, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Group", shortcut: "⌘G", action: groupSelected, separator: true },
        { label: "Align left", action: () => alignObjects("left") },
        { label: "Align center (H)", action: () => alignObjects("centerH") },
        { label: "Align right", action: () => alignObjects("right") },
        { label: "Distribute H", action: () => alignObjects("distH"), separator: true },
        { label: "Union", action: () => void booleanOp("union") },
        { label: "Subtract", action: () => void booleanOp("subtract") },
        { label: "Intersect", action: () => void booleanOp("intersect") },
        { label: "Exclude", action: () => void booleanOp("exclude") },
        { label: "Create clipping mask", action: createClipMask, separator: true },
        { label: "Lock", action: () => { const locked = selectedObjects.every((o) => o.locked); updateSelectedProp("locked", !locked); } },
        { label: "Hide", action: () => { const vis = selectedObjects.every((o) => o.visible); updateSelectedProp("visible", !vis); } },
      ];
    }

    if (single?.type === "text") {
      return [
        { label: "Edit text", action: () => setTextEditingId(single.id), shortcut: "dbl-click" },
        { label: "Convert to outlines", action: () => { void convertTextToOutlines(); }, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Bring to front", action: bringToFront, separator: true },
        { label: "Send to back", action: sendToBack },
      ];
    }

    if (single?.type === "booleanGroup") {
      return [
        { label: "Edit boolean group", action: () => enterIsolation(single.id) },
        { label: "Expand boolean", action: () => void expandBoolean(), separator: true },
        { label: "Duplicate", action: duplicateSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Lock / Unlock", action: () => updateSelectedProp("locked", !single.locked) },
        { label: "Hide / Show", action: () => updateSelectedProp("visible", !single.visible) },
      ];
    }

    if (single?.type === "clippingContainer") {
      const cc = single as ClippingContainerObject;
      return [
        { label: "Edit content", action: () => enterClippingIsolation(cc.id, "content") },
        { label: "Edit mask", action: () => enterClippingIsolation(cc.id, "mask") },
        { label: "Release clipping", action: releaseClippingStructure, separator: true },
        { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
        { label: "Lock / Unlock", action: () => updateSelectedProp("locked", !cc.locked) },
        { label: "Hide / Show", action: () => updateSelectedProp("visible", !cc.visible) },
      ];
    }

    if (single && (single.isClipMask || single.clipMaskId)) {
      return [
        { label: "Edit mask", action: () => {}, disabled: !single.isClipMask },
        { label: "Edit contents", action: () => {}, disabled: !single.clipMaskId },
        { label: "Release clipping mask", action: releaseClipMask, separator: true },
        { label: "Duplicate", action: duplicateSelected },
        { label: "Delete", action: deleteSelected },
        { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
      ];
    }

    const clipBuf = objectClipboardRef.current;
    const canPasteInsideMenu = !!(single && clipBuf && clipBuf.length > 0 && isValidPasteInsideMask(single));

    return [
      { label: "Cut", shortcut: "⌘X", action: cutSelectedObjects },
      { label: "Copy", shortcut: "⌘C", action: copySelectedObjects },
      { label: "Paste", shortcut: "⌘V", action: pasteClipboardObjects },
      { label: "Paste inside", shortcut: "⇧⌘V / Ctrl+⇧V", action: pasteInside, disabled: !canPasteInsideMenu, separator: true },
      { label: "Duplicate", shortcut: "⌘D", action: duplicateSelected },
      { label: "Delete", action: deleteSelected },
      { label: "Export selection", action: () => { setExportModalScope("selection"); setShowExportModal(true); }, separator: true },
      { label: "Rename…", action: renameSelected, separator: true },
      { label: "Bring forward", shortcut: "⌘]", action: bringForward },
      { label: "Send backward", shortcut: "⌘[", action: sendBackward },
      { label: "Bring to front", action: bringToFront },
      { label: "Send to back", action: sendToBack },
      { label: "Group", shortcut: "⌘G", action: groupSelected, disabled: !multiSel, separator: true },
      { label: "Lock / Unlock", action: () => { const locked = selectedObjects.every((o) => o.locked); updateSelectedProp("locked", !locked); } },
      { label: "Hide / Show", action: () => { const vis = selectedObjects.every((o) => o.visible); updateSelectedProp("visible", !vis); } },
      { label: "Create clipping mask", action: createClipMask, disabled: selectedIds.size < 2, separator: true },
      { label: "Release clipping mask", action: releaseClipMask, disabled: !hasClip },
      { label: "Boolean union", action: () => void booleanOp("union"), disabled: selectedIds.size < 2, separator: true },
      { label: "Boolean subtract", action: () => void booleanOp("subtract"), disabled: selectedIds.size < 2 },
      { label: "Boolean intersect", action: () => void booleanOp("intersect"), disabled: selectedIds.size < 2 },
      { label: "Boolean exclude", action: () => void booleanOp("exclude"), disabled: selectedIds.size < 2 },
      { label: "Edit boolean group", action: () => { const bg = selectedObjects.find((o) => o.type === "booleanGroup"); if (bg) enterIsolation(bg.id); }, disabled: !hasBoolGroup, separator: true },
      { label: "Expand boolean", action: () => void expandBoolean(), disabled: !hasBoolGroup },
      { label: "Open / close path", action: () => { if (hasPath) togglePathClosed(selectedObjects.find((o) => o.type === "path")!.id); }, disabled: !hasPath, separator: true },
      { label: "Cycle anchor type", action: () => { selectedPoints.forEach((idxs, objId) => { idxs.forEach((idx) => cycleVertexMode(objId, idx)); }); }, disabled: selectedPoints.size === 0 },
    ];
  }, [ctxMenu, selectedIds, selectedObjects, selectedPoints, isolationDepth, objects, showGrid, snapEnabled,
      setShowExportModal, setExportModalScope,
      duplicateSelected, deleteSelected, bringForward, sendBackward, bringToFront, sendToBack,
      updateSelectedProp, groupSelected, ungroupSelected, createClipMask, releaseClipMask, togglePathClosed,
      cycleVertexMode, booleanOp, enterIsolation, expandBoolean, exitIsolation, alignObjects, fitAllCanvas,
      resetZoomCanvas, pasteClipboardObjects, pasteInside, cutSelectedObjects, copySelectedObjects, renameSelected,
      convertTextToOutlines, releaseClippingStructure, enterClippingIsolation, switchClippingIsolationMode]);

  // ── Cursor ────────────────────────────────────────────────────────

  const cursor = useMemo(() => {
    if (spaceHeld || dragState?.type === "pan") return "grab";
    if (dragState?.type === "resize" && dragState.handle) {
      const h = dragState.handle;
      const map: Record<string, string> = {
        nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize",
        e: "ew-resize", w: "ew-resize",
        se: "nwse-resize", s: "ns-resize", sw: "nesw-resize",
      };
      return map[h] ?? "default";
    }
    if (dragState?.type === "rotate") return "grab";
    if (dragState?.type === "move") return "move";
    if (activeTool === "pen" || activeTool === "rect" || activeTool === "ellipse" || activeTool === "text") return "crosshair";
    if (activeTool === "gradient") return "cell";
    return "default";
  }, [activeTool, spaceHeld, dragState]);

  const quickEditPos = useMemo(() => {
    if (!quickEditMode || !selectionFrame || typeof window === "undefined") return null;
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = selectionFrame.cx * viewport.zoom + viewport.x;
    const bottomCanvas = selectionFrame.cy * viewport.zoom + viewport.y + (selectionFrame.h / 2) * viewport.zoom + 12;
    return { left: r.left + cx, top: r.top + bottomCanvas };
  }, [quickEditMode, selectionFrame, viewport.x, viewport.y, viewport.zoom]);

  // ── Marquee rect ──────────────────────────────────────────────────

  const marqueeRect = useMemo(() => {
    if (!dragState || (dragState.type !== "marquee") || !dragState.marqueeOrigin || !dragState.currentCanvas) return null;
    const o = dragState.marqueeOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
  }, [dragState]);

  // Create preview rect
  const createPreviewRect = useMemo(() => {
    if (!dragState || dragState.type !== "create" || !dragState.createOrigin || !dragState.currentCanvas) return null;
    const o = dragState.createOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y), type: dragState.createType };
  }, [dragState]);

  const createTextPreviewRect = useMemo(() => {
    if (!dragState || dragState.type !== "createText" || !dragState.createOrigin || !dragState.currentCanvas) return null;
    const o = dragState.createOrigin, c = dragState.currentCanvas;
    return { x: Math.min(o.x, c.x), y: Math.min(o.y, c.y), w: Math.abs(c.x - o.x), h: Math.abs(c.y - o.y) };
  }, [dragState]);

  // ── Clip path defs ────────────────────────────────────────────────

  const clipObjects = useMemo(() => objects.filter((o) => o.isClipMask), [objects]);
  const clippedGroups = useMemo(() => {
    const map = new Map<string, FreehandObject[]>();
    for (const o of objects) {
      if (o.clipMaskId) {
        const arr = map.get(o.clipMaskId) || [];
        arr.push(o);
        map.set(o.clipMaskId, arr);
      }
    }
    return map;
  }, [objects]);

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════

  const studioMode: "Object" | "Edit" | "Mask" =
    isolationDepth === 0
      ? "Object"
      : (() => {
          const fr = isolationStackRef.current[isolationStackRef.current.length - 1];
          return fr?.kind === "clipping" && fr.editMode === "mask" ? "Mask" : "Edit";
        })();

  return (
    <div
      data-foldder-studio-canvas
      className="fixed inset-0 z-[9999] flex min-h-0 flex-col bg-[#0b0d10] text-zinc-200"
      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, Inter, system-ui" }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) importImageFile(f);
        e.target.value = "";
      }} />

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#12151a] px-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight text-white">Freehand</div>
          <div className="truncate text-[10px] text-zinc-500">Vector document</div>
        </div>
        <div
          className="hidden items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 sm:flex"
          title="Editing context"
        >
          {(["Object", "Edit", "Mask"] as const).map((m) => (
            <span
              key={m}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
                (m === "Object" && studioMode === "Object") ||
                (m === "Edit" && studioMode === "Edit") ||
                (m === "Mask" && studioMode === "Mask")
                  ? "bg-white/[0.1] text-white"
                  : "text-zinc-500"
              }`}
            >
              {m}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0d10] px-1 py-0.5">
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            onClick={() =>
              setViewport((v) => {
                const nz = clamp(v.zoom / 1.15, 0.05, 20);
                return { ...v, zoom: nz };
              })
            }
            title="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3.25rem] text-center font-mono text-[11px] tabular-nums text-zinc-300">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            onClick={() =>
              setViewport((v) => {
                const nz = clamp(v.zoom * 1.15, 0.05, 20);
                return { ...v, zoom: nz };
              })
            }
            title="Zoom in"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            title="Undo (⌘Z)"
          >
            <Undo2 size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={redo}
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            title="Redo (⇧⌘Z)"
          >
            <Redo2 size={18} strokeWidth={1.5} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setExportModalScope(selectedIds.size > 0 ? "selection" : "full");
            setShowExportModal(true);
          }}
          className="ml-auto flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-[12px] font-semibold text-white shadow-lg shadow-sky-900/25 transition-colors duration-150 hover:bg-sky-500"
        >
          <Download size={16} strokeWidth={1.5} />
          Export
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-row">
      <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.08] bg-[#12151a] py-3">
        <ToolBtn active={activeTool === "select"} onClick={() => { setActiveTool("select"); setSelectedPoints(new Map()); }} title="Selection (V)">
          <MousePointer2 size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "directSelect"} onClick={() => setActiveTool("directSelect")} title="Direct Selection (A)">
          <MousePointer2 size={20} strokeWidth={1.5} className="opacity-60" />
        </ToolBtn>
        <ToolBtn active={activeTool === "pen"} onClick={() => setActiveTool("pen")} title="Pen (P)">
          <PenTool size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "rect"} onClick={() => setActiveTool("rect")} title="Rectangle (R)">
          <Square size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "ellipse"} onClick={() => setActiveTool("ellipse")} title="Ellipse (O)">
          <Circle size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "text"} onClick={() => setActiveTool("text")} title="Text (T)">
          <Type size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "gradient"} onClick={() => setActiveTool("gradient")} title="Gradient (G)">
          <Blend size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "eyedropper"} onClick={() => setActiveTool("eyedropper")} title="Eyedropper (I)">
          <Droplet size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "handTool"} onClick={() => setActiveTool("handTool")} title="Hand (H) — drag to pan">
          <Hand size={20} strokeWidth={1.5} />
        </ToolBtn>
        <ToolBtn active={activeTool === "zoomTool"} onClick={() => setActiveTool("zoomTool")} title="Zoom (Z) — click: in, Alt+click: out">
          <ZoomIn size={20} strokeWidth={1.5} />
        </ToolBtn>

        <div className="my-1 h-px w-6 bg-white/[0.08]" />

        <ToolBtn onClick={() => fileInputRef.current?.click()} title="Import image">
          <Upload size={18} strokeWidth={1.5} />
        </ToolBtn>

        <div className="flex-1 min-h-[8px]" />

        <ToolBtn active={snapEnabled} onClick={() => setSnapEnabled((p) => !p)} title={`Snap ${snapEnabled ? "on" : "off"}`}>
          <Magnet size={18} strokeWidth={1.5} />
        </ToolBtn>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0B0D10]">

        {/* Isolation breadcrumb */}
        {isolationDepth > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-violet-900/40 border-b border-violet-500/30 text-[10px] font-bold uppercase tracking-wider">
            <button type="button" onClick={() => exitToLevel(0)}
              className="text-violet-300 hover:text-white transition-colors">Scene</button>
            {isolationStackRef.current.map((frame, i) => {
              const id = frame.kind === "clipping" ? frame.containerId : frame.groupId;
              const label = frame.kind === "clipping"
                ? (frame.parentObjects.find((o) => o.id === frame.containerId)?.name ?? "Clip container")
                : (frame.parentObjects.find((o) => o.id === frame.groupId)?.name ?? "Boolean Group");
              const sub = frame.kind === "clipping" && frame.editMode === "mask" ? " · mask" : "";
              return (
                <React.Fragment key={id}>
                  <span className="text-violet-500/60">/</span>
                  <button type="button"
                    onClick={() => exitToLevel(i)}
                    className={`${i === isolationStackRef.current.length - 1 ? "text-white" : "text-violet-300 hover:text-white"} transition-colors`}>
                    {label}{sub}
                  </button>
                </React.Fragment>
              );
            })}
            <span className="text-violet-500/40 ml-2 normal-case tracking-normal font-normal italic">Esc to exit · editing limited to this scope</span>
          </div>
        )}

        {/* Selection + z-order context bar */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-zinc-950/95 text-[11px]">
          <span className="text-zinc-200 font-medium truncate min-w-0 max-w-[min(280px,45vw)]">
            {isolationDepth === 0 ? (
              <span className="text-zinc-500 font-normal mr-2">Object mode</span>
            ) : (
              <span className="text-amber-400/95 font-bold mr-2 uppercase text-[9px] tracking-wide">
                {(() => {
                  const fr = isolationStackRef.current[isolationStackRef.current.length - 1];
                  if (!fr) return "Isolation";
                  if (fr.kind === "clipping") return fr.editMode === "mask" ? "Edit mask" : "Edit content";
                  return "Edit content";
                })()}
              </span>
            )}
            {selectionKindLabel(selectedObjects)}
          </span>
          <div className="flex-1 min-w-0" />
          {selectedIds.size > 0 && isolationDepth === 0 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" title="Bring to front" onClick={() => bringToFront()}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                <ChevronsUp size={15} strokeWidth={2} />
              </button>
              <button type="button" title="Bring forward (⌘])" onClick={() => bringForward()}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                <ChevronUp size={15} strokeWidth={2} />
              </button>
              <button type="button" title="Send backward (⌘[)" onClick={() => sendBackward()}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                <ChevronDown size={15} strokeWidth={2} />
              </button>
              <button type="button" title="Send to back" onClick={() => sendToBack()}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                <ChevronsDown size={15} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ cursor }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoverCanvasId(null); }}
        onWheel={handleWheel} onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          const pos = screenToCanvas(e.clientX, e.clientY);
          const threshold = 6 / viewport.zoom;
          if (activeTool === "select" || activeTool === "text") {
            for (let i = objects.length - 1; i >= 0; i--) {
              const obj = objects[i];
              if (obj.type === "text" && hitTestObject(pos, obj, threshold)) {
                setSelectedIds(new Set([obj.id]));
                setTextEditingId(obj.id);
                return;
              }
            }
          }
          if (activeTool !== "select") return;
          for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (obj.type === "booleanGroup" && hitTestObject(pos, obj, threshold)) {
              enterIsolation(obj.id);
              return;
            }
            if (obj.type === "clippingContainer" && hitTestObject(pos, obj, threshold)) {
              enterClippingIsolation(obj.id, "content");
              return;
            }
          }
          for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (!obj.visible || obj.locked) continue;
            if (obj.isClipMask || obj.clipMaskId) continue;
            if (hitTestObject(pos, obj, threshold)) {
              setSelectedIds(new Set([obj.id]));
              setPrimarySelectedId(obj.id);
              setQuickEditMode(e.altKey ? "stroke" : "fill");
              return;
            }
          }
          if (isolationStackRef.current.length > 0) exitIsolation();
          if (activeTool === "select") fitAllCanvas();
        }}>

        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ userSelect: "none" }}>
          <defs>
            <pattern id="fh-grid" width={20 * viewport.zoom} height={20 * viewport.zoom} patternUnits="userSpaceOnUse"
              x={viewport.x % (20 * viewport.zoom)} y={viewport.y % (20 * viewport.zoom)}>
              <circle cx={1} cy={1} r={0.5} fill="rgba(255,255,255,0.04)" />
            </pattern>
            {flattenObjectsForGradientDefs(objects).map((o) => {
              const f = migrateFill(o.fill);
              return f.type === "solid" ? null : renderFillDef(f, gradientDefId(o.id));
            })}
            {clipObjects.map((co) => renderClipDef(co))}
            <filter id="fh-selection-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </defs>
          {showGrid ? (
            <rect width="100%" height="100%" fill="url(#fh-grid)" data-ui="grid" />
          ) : (
            <rect width="100%" height="100%" fill="transparent" data-ui="grid" />
          )}

          <g data-fh-world transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {/* Render objects (multi-select: non-primary slightly faded) */}
            {objects.map((obj) => {
              if (obj.isClipMask) return null;
              if (obj.clipMaskId) return null;
              const inSel = selectedIds.has(obj.id);
              const multi = selectedIds.size > 1;
              const isPrimary = !multi || !inSel || primarySelectedId === obj.id || primarySelectedId == null;
              const op = multi && inSel && !isPrimary ? 0.62 : 1;
              return (
                <g key={obj.id} opacity={op} data-fh-obj={obj.id}>
                  {renderObj(obj)}
                </g>
              );
            })}

            {/* Render clipped groups */}
            {Array.from(clippedGroups.entries()).map(([clipId, members]) => (
              <g key={`cg-${clipId}`} data-fh-clip-root={clipId} clipPath={`url(#clip-${clipId})`}>
                {members.map((m) => {
                  const inSel = selectedIds.has(m.id);
                  const multi = selectedIds.size > 1;
                  const isPrimary = !multi || !inSel || primarySelectedId === m.id || primarySelectedId == null;
                  const op = multi && inSel && !isPrimary ? 0.62 : 1;
                  return (
                    <g key={m.id} data-fh-obj={m.id} opacity={op}>
                      {renderObj(m)}
                    </g>
                  );
                })}
              </g>
            ))}

            {/* Hover outline: canvas hover or layers panel hover (sync) */}
            {(hoverCanvasId || layerHoverId) && (activeTool === "select" || activeTool === "gradient") && (() => {
              const hid = hoverCanvasId ?? layerHoverId;
              const ho = objects.find((o) => o.id === hid);
              if (!ho || selectedIds.has(ho.id)) return null;
              const ob = getVisualAABB(ho);
              const fromPanel = !!(layerHoverId && layerHoverId === hid && !hoverCanvasId);
              return (
                <rect x={ob.x} y={ob.y} width={ob.w} height={ob.h} fill="none"
                  stroke={fromPanel ? "rgba(56,189,248,0.85)" : "rgba(148,163,184,0.92)"}
                  strokeWidth={(fromPanel ? 1.25 : 1) / viewport.zoom}
                  strokeDasharray={fromPanel ? `${4 / viewport.zoom}` : undefined}
                  pointerEvents="none" data-ui="hover-outline" />
              );
            })()}

            {/* Pen WIP */}
            {isPenDrawing && penPoints.length > 0 && (
              <>
                <path d={bezierToSvgD(penPoints, false)} fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
                  strokeDasharray="4 2" opacity={0.7} data-ui="pen-wip" />
                {penPoints.map((pt, i) => (
                  <React.Fragment key={`pp-${i}`}>
                    {(dist(pt.handleIn, pt.anchor) > 1 || dist(pt.handleOut, pt.anchor) > 1) && (
                      <>
                        <line x1={pt.handleIn.x} y1={pt.handleIn.y} x2={pt.anchor.x} y2={pt.anchor.y}
                          stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                        <line x1={pt.anchor.x} y1={pt.anchor.y} x2={pt.handleOut.x} y2={pt.handleOut.y}
                          stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                        <circle cx={pt.handleIn.x} cy={pt.handleIn.y} r={3 / viewport.zoom}
                          fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                        <circle cx={pt.handleOut.x} cy={pt.handleOut.y} r={3 / viewport.zoom}
                          fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} data-ui="pen" />
                      </>
                    )}
                    <circle cx={pt.anchor.x} cy={pt.anchor.y} r={4 / viewport.zoom}
                      fill="#6366f1" stroke="#fff" strokeWidth={1.5 / viewport.zoom} data-ui="pen" />
                  </React.Fragment>
                ))}
              </>
            )}

            {/* Create preview */}
            {createPreviewRect && (
              createPreviewRect.type === "ellipse"
                ? <ellipse cx={createPreviewRect.x + createPreviewRect.w / 2} cy={createPreviewRect.y + createPreviewRect.h / 2}
                    rx={createPreviewRect.w / 2} ry={createPreviewRect.h / 2}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} opacity={0.5} data-ui="preview" />
                : <rect x={createPreviewRect.x} y={createPreviewRect.y} width={createPreviewRect.w} height={createPreviewRect.h}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} opacity={0.5} data-ui="preview" />
            )}

            {createTextPreviewRect && createTextPreviewRect.w > 1 && createTextPreviewRect.h > 1 && (
              <rect x={createTextPreviewRect.x} y={createTextPreviewRect.y} width={createTextPreviewRect.w} height={createTextPreviewRect.h}
                fill="rgba(167,139,250,0.06)" stroke="#a78bfa" strokeWidth={1 / viewport.zoom} strokeDasharray={`${5 / viewport.zoom}`} data-ui="text-preview" />
            )}

            {/* Marquee */}
            {marqueeRect && marqueeRect.w > 2 && marqueeRect.h > 2 && (
              <rect x={marqueeRect.x} y={marqueeRect.y} width={marqueeRect.w} height={marqueeRect.h}
                fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${3 / viewport.zoom}`} data-ui="marquee" />
            )}

            {/* Per-object selection outlines (multi-select): primary stronger, secondary lighter */}
            {selectedObjects.length > 1 && (activeTool === "select" || activeTool === "gradient") && selectedObjects.map((obj) => {
              const ob = getVisualAABB(obj);
              const isPr = primarySelectedId === obj.id || primarySelectedId == null;
              return (
                <rect key={`sel-outline-${obj.id}`} x={ob.x} y={ob.y} width={ob.w} height={ob.h}
                  fill="none"
                  stroke={isPr ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.42)"}
                  strokeWidth={(isPr ? 1.1 : 0.9) / viewport.zoom}
                  strokeDasharray={isPr ? undefined : `${3 / viewport.zoom}`}
                  pointerEvents="none"
                  data-ui="per-sel" />
              );
            })}

            {/* Selection: oriented bounding box + handles (matches object rotation) */}
            {activeTool === "gradient" && selectedObjects.length === 1 && supportsGradientFill(selectedObjects[0]) && (() => {
              const o = selectedObjects[0];
              const f = migrateFill(o.fill);
              const hz = 5 / viewport.zoom;
              if (f.type === "gradient-linear") {
                const a = localBoxToWorld(o, f.x1, f.y1);
                const b = localBoxToWorld(o, f.x2, f.y2);
                return (
                  <g key="grad-ui" data-ui="gradient-edit" pointerEvents="none">
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#93c5fd" strokeWidth={1.5 / viewport.zoom} opacity={0.95} />
                    <circle cx={a.x} cy={a.y} r={hz} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2 / viewport.zoom} />
                    <circle cx={b.x} cy={b.y} r={hz} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2 / viewport.zoom} />
                    {f.stops.map((st, si) => {
                      const tt = clamp(st.position / 100, 0, 1);
                      const sx = a.x + (b.x - a.x) * tt;
                      const sy = a.y + (b.y - a.y) * tt;
                      return (
                        <circle key={`gstop-${si}`} cx={sx} cy={sy} r={hz * 0.78} fill="#0f172a" stroke="#7dd3fc" strokeWidth={1 / viewport.zoom} />
                      );
                    })}
                  </g>
                );
              }
              if (f.type === "gradient-radial") {
                const c = localBoxToWorld(o, f.cx, f.cy);
                const r = localBoxToWorld(o, Math.min(1, f.cx + f.r), f.cy);
                return (
                  <g key="grad-ui-r" data-ui="gradient-edit" pointerEvents="none">
                    <circle cx={c.x} cy={c.y} r={Math.hypot(r.x - c.x, r.y - c.y)} fill="none" stroke="#c4b5fd" strokeWidth={1.2 / viewport.zoom} strokeDasharray={`${4 / viewport.zoom}`} opacity={0.85} />
                    <circle cx={c.x} cy={c.y} r={hz} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={1.2 / viewport.zoom} />
                    <circle cx={r.x} cy={r.y} r={hz} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={1.2 / viewport.zoom} />
                  </g>
                );
              }
              return null;
            })()}

            {selectedObjects.length > 0 && (activeTool === "select" || activeTool === "gradient") && selectionFrame && (
              <g data-ui="selection-box" transform={`translate(${selectionFrame.cx},${selectionFrame.cy}) rotate(${selectionFrame.angleDeg})`} filter="url(#fh-selection-shadow)">
                <rect x={-selectionFrame.w / 2 - 1 / viewport.zoom} y={-selectionFrame.h / 2 - 1 / viewport.zoom}
                  width={selectionFrame.w + 2 / viewport.zoom} height={selectionFrame.h + 2 / viewport.zoom}
                  fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.92)" strokeWidth={1 / viewport.zoom}
                  pointerEvents="none" />
                {["nw", "ne", "se", "sw", "n", "e", "s", "w"].map((h) => {
                  const sz = 7 / viewport.zoom;
                  const hw = selectionFrame.w / 2, hh = selectionFrame.h / 2;
                  let hx = 0, hy = 0;
                  if (h.includes("e")) hx = hw;
                  if (h.includes("w")) hx = -hw;
                  if (h === "n" || h === "s") hx = 0;
                  if (h.includes("s")) hy = hh;
                  if (h.includes("n")) hy = -hh;
                  if (h === "e" || h === "w") hy = 0;
                  return (
                    <rect key={h} x={hx - sz / 2} y={hy - sz / 2} width={sz} height={sz}
                      fill="#1a1d24" stroke="rgba(255,255,255,0.95)" strokeWidth={1 / viewport.zoom}
                      rx={1.5 / viewport.zoom} style={{ cursor: `${h}-resize` }} data-ui="handle" />
                  );
                })}
                {(() => {
                  const rotOff = 14 / viewport.zoom;
                  const rotR = 4 / viewport.zoom;
                  const hw = selectionFrame.w / 2, hh = selectionFrame.h / 2;
                  const corners = [
                    { x: -hw - rotOff, y: -hh - rotOff },
                    { x: hw + rotOff, y: -hh - rotOff },
                    { x: hw + rotOff, y: hh + rotOff },
                    { x: -hw - rotOff, y: hh + rotOff },
                  ];
                  return corners.map((c, ci) => (
                    <circle key={`rot-${ci}`} cx={c.x} cy={c.y} r={rotR}
                      fill="transparent" stroke="rgba(255,255,255,0.75)" strokeWidth={1.1 / viewport.zoom}
                      style={{ cursor: "grab" }} data-ui="rotate-handle" />
                  ));
                })()}
              </g>
            )}

            {exportFlash && (
              <rect
                x={exportFlash.x}
                y={exportFlash.y}
                width={exportFlash.w}
                height={exportFlash.h}
                fill="none"
                stroke="rgba(56,189,248,0.95)"
                strokeWidth={2 / viewport.zoom}
                pointerEvents="none"
                data-ui="export-flash"
              />
            )}

            {/* Direct select: anchor points and handles for selected paths */}
            {activeTool === "directSelect" && selectedObjects.filter((o) => o.type === "path").map((obj) => {
              const p = obj as PathObject;
              const selPts = selectedPoints.get(obj.id);
              return p.points.map((pt, pi) => {
                const isSel = selPts?.has(pi);
                const vm = getVertexMode(pt);
                const anchorFill = isSel ? "#6366f1" : vm === "corner" ? "#fcd34d" : vm === "cusp" ? "#7dd3fc" : "#fff";
                const anchorStroke = isSel ? "#fff" : "#6366f1";
                return (
                  <g key={`ds-${obj.id}-${pi}`} data-ui="ds-points">
                    <title>{vm === "smooth" ? "Suave (simétrico)" : vm === "cusp" ? "Partir (tangente continua asimétrica)" : "Esquina (independiente)"}</title>
                    <line x1={pt.handleIn.x} y1={pt.handleIn.y} x2={pt.anchor.x} y2={pt.anchor.y}
                      stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} />
                    <line x1={pt.anchor.x} y1={pt.anchor.y} x2={pt.handleOut.x} y2={pt.handleOut.y}
                      stroke="rgba(99,102,241,0.5)" strokeWidth={1 / viewport.zoom} />
                    <circle cx={pt.handleIn.x} cy={pt.handleIn.y} r={3.5 / viewport.zoom}
                      fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} />
                    <circle cx={pt.handleOut.x} cy={pt.handleOut.y} r={3.5 / viewport.zoom}
                      fill="#fff" stroke="#6366f1" strokeWidth={1 / viewport.zoom} />
                    {vm === "corner" ? (
                      <polygon
                        points={`${pt.anchor.x},${pt.anchor.y - 5 / viewport.zoom} ${pt.anchor.x + 4.5 / viewport.zoom},${pt.anchor.y + 4 / viewport.zoom} ${pt.anchor.x - 4.5 / viewport.zoom},${pt.anchor.y + 4 / viewport.zoom}`}
                        fill={anchorFill} stroke={anchorStroke} strokeWidth={1 / viewport.zoom} />
                    ) : vm === "cusp" ? (
                      <rect x={pt.anchor.x - 4 / viewport.zoom} y={pt.anchor.y - 4 / viewport.zoom}
                        width={8 / viewport.zoom} height={8 / viewport.zoom}
                        fill={anchorFill} stroke={anchorStroke} strokeWidth={1 / viewport.zoom} rx={1 / viewport.zoom} />
                    ) : (
                      <circle cx={pt.anchor.x} cy={pt.anchor.y} r={4.2 / viewport.zoom}
                        fill={anchorFill} stroke={anchorStroke} strokeWidth={1 / viewport.zoom} />
                    )}
                  </g>
                );
              });
            })}

            {/* Snap guides */}
            {snapGuides.map((g, i) => (
              g.axis === "x"
                ? <line key={`sg-${i}`} x1={g.pos} y1={-99999} x2={g.pos} y2={99999} stroke="#f472b6" strokeWidth={1 / viewport.zoom} data-ui="snap" />
                : <line key={`sg-${i}`} x1={-99999} y1={g.pos} x2={99999} y2={g.pos} stroke="#f472b6" strokeWidth={1 / viewport.zoom} data-ui="snap" />
            ))}
          </g>
        </svg>

        {/* Zoom indicator */}
        <div className="absolute bottom-3 left-3 text-[10px] text-white/30 font-mono select-none pointer-events-none">
          {Math.round(viewport.zoom * 100)}%
        </div>

        {quickEditMode && firstSelected && quickEditPos && (
          <div
            className="absolute z-[10002] flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-sky-500/35 bg-zinc-950/98 shadow-xl pointer-events-auto"
            style={{ left: quickEditPos.left, top: quickEditPos.top, transform: "translate(-50%, 0)" }}
            data-ui="quick-fill-stroke">
            <span className="text-[9px] font-bold uppercase tracking-wider text-sky-400/95">{quickEditMode}</span>
            <input
              type="color"
              className="w-7 h-7 rounded border border-white/15 cursor-pointer bg-transparent"
              value={
                quickEditMode === "stroke"
                  ? (firstSelected.stroke || "#ffffff")
                  : (() => {
                      const f = migrateFill(firstSelected.fill);
                      if (f.type === "solid") return f.color;
                      if (f.type === "gradient-linear" || f.type === "gradient-radial") return f.stops[0]?.color ?? "#6366f1";
                      return "#6366f1";
                    })()
              }
              onChange={(e) => {
                const v = e.target.value;
                if (quickEditMode === "stroke") updateSelectedProp("stroke", v);
                else {
                  updateSelectedFill(() => solidFill(v));
                }
              }}
            />
            <button type="button" className="text-[10px] text-zinc-500 hover:text-white px-1" onClick={() => setQuickEditMode(null)} title="Close">×</button>
          </div>
        )}

        {textEditingId && (() => {
          const to = objects.find((o) => o.id === textEditingId) as TextObject | undefined;
          if (!to) return null;
          const r = containerRef.current?.getBoundingClientRect();
          if (!r) return null;
          const left = r.left + viewport.x + to.x * viewport.zoom;
          const top = r.top + viewport.y + to.y * viewport.zoom;
          const w = Math.max(to.width * viewport.zoom, 120);
          const h = Math.max(to.height * viewport.zoom, to.fontSize * to.lineHeight * viewport.zoom);
          return (
            <textarea
              data-fh-text-editor
              className="absolute z-[10001] rounded-md border border-violet-500/45 bg-zinc-950/98 text-white p-2 shadow-2xl outline-none resize-none"
              style={{
                left,
                top,
                width: w,
                minHeight: h,
                fontFamily: to.fontFamily,
                fontSize: Math.max(10, to.fontSize * viewport.zoom * 0.95),
                lineHeight: to.lineHeight,
                letterSpacing: to.letterSpacing ? to.letterSpacing * viewport.zoom : undefined,
                textAlign: to.textAlign,
                transform: to.rotation ? `rotate(${to.rotation}deg)` : undefined,
                transformOrigin: "top left",
              }}
              value={to.text}
              onChange={(e) => {
                const v = e.target.value;
                setObjects((prev) =>
                  prev.map((o) => {
                    if (o.id !== to.id || o.type !== "text") return o;
                    const t = o as TextObject;
                    let width = t.width;
                    if (t.textMode === "point") {
                      const lines = v.split("\n");
                      const maxLen = lines.reduce((m, line) => Math.max(m, line.length), 0);
                      width = Math.max(80, maxLen * t.fontSize * 0.52 + 24);
                    }
                    return { ...t, text: v, width };
                  }),
                );
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  (ev.target as HTMLTextAreaElement).blur();
                  ev.stopPropagation();
                }
              }}
              onBlur={() => {
                pushHistory(objectsRef.current, selectedIdsRef.current);
                setTextEditingId(null);
              }}
              autoFocus
            />
          );
        })()}

        {/* Isolation dimming overlay - renders dimmed parent objects behind current editing context */}
        {isolationDepth > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: -1, opacity: 0.32 }}>
            <svg className="w-full h-full">
              <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
                {isolationStackRef.current.length > 0 && (() => {
                  const f = isolationStackRef.current[isolationStackRef.current.length - 1];
                  const hid = f.kind === "clipping" ? f.containerId : f.groupId;
                  return f.parentObjects.filter((o) => o.id !== hid).map((o) => renderObj(o));
                })()}
              </g>
            </svg>
          </div>
        )}

        {/* Live boolean result preview during isolation */}
        {livePreview && isolationDepth > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: -1, opacity: 0.3 }}>
            <svg className="w-full h-full">
              <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
                <image href={livePreview.dataUrl}
                  x={livePreview.bounds.x} y={livePreview.bounds.y}
                  width={livePreview.bounds.w} height={livePreview.bounds.h}
                  preserveAspectRatio="none" data-ui="live-preview" />
                <rect x={livePreview.bounds.x} y={livePreview.bounds.y}
                  width={livePreview.bounds.w} height={livePreview.bounds.h}
                  fill="none" stroke="#a78bfa" strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${4 / viewport.zoom}`} data-ui="live-preview" />
              </g>
            </svg>
          </div>
        )}
      </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────── */}
      <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-white/[0.08] bg-[#12151a]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Freehand Studio</span>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10" title="Close Studio">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Properties ──────────────────────────────────────── */}
          <div className="p-3 border-b border-white/10 space-y-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Properties</div>

            {firstSelected ? (
              <>
                {/* Fill */}
                {firstSelected.type === "image" || firstSelected.type === "booleanGroup" ? (
                  <p className="text-[9px] text-zinc-500 leading-relaxed">
                    {firstSelected.type === "booleanGroup"
                      ? "Boolean preview is rasterized. Gradient fill applies after vector boolean in a future update."
                      : "Bitmap images do not use vector fill."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Fill</label>
                    <div className="flex rounded-md overflow-hidden border border-white/10 p-0.5 gap-0.5 bg-black/20">
                      {([
                        { id: "solid" as const, label: "Solid" },
                        { id: "gradient-linear" as const, label: "Linear" },
                        { id: "gradient-radial" as const, label: "Radial" },
                      ]).map((m) => {
                        const cur = migrateFill(firstSelected.fill).type;
                        const active = cur === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`flex-1 py-1 text-[8px] font-bold uppercase tracking-wide rounded ${active ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                            onClick={() => {
                              if (m.id === "solid") {
                                const prev = migrateFill(firstSelected.fill);
                                const c = prev.type === "solid" ? prev.color : "#6366f1";
                                updateSelectedFill(() => solidFill(c));
                                setFillColor(c === "none" ? "#6366f1" : c);
                              } else if (m.id === "gradient-linear") {
                                updateSelectedFill(() => defaultLinearGradient());
                              } else {
                                updateSelectedFill(() => defaultRadialGradient());
                              }
                            }}
                          >{m.label}</button>
                        );
                      })}
                    </div>
                    {migrateFill(firstSelected.fill).type === "solid" && (() => {
                      const sf = migrateFill(firstSelected.fill);
                      const solidHex = sf.type === "solid" && sf.color !== "none" ? sf.color : "#000000";
                      return (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={solidHex}
                          onChange={(e) => {
                            updateSelectedFill(() => solidFill(e.target.value));
                            setFillColor(e.target.value);
                          }}
                          className="w-7 h-7 rounded cursor-pointer border border-white/20 bg-transparent"
                        />
                        <button type="button" className="text-[8px] text-zinc-500 hover:text-white" title="No fill"
                          onClick={() => updateSelectedFill(() => solidFill("none"))}>✕</button>
                      </div>
                      );
                    })()}
                    {migrateFill(firstSelected.fill).type === "gradient-linear" && (() => {
                      const gf = migrateFill(firstSelected.fill) as Extract<FillAppearance, { type: "gradient-linear" }>;
                      const ang = Math.round(angleFromLinearGradient(gf));
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8px] text-zinc-500">Angle</span>
                            <input
                              type="number"
                              value={ang}
                              onChange={(e) => {
                                const deg = Number(e.target.value) || 0;
                                const xy = linearGradientFromAngle(deg);
                                updateSelectedFill((f) =>
                                  f.type === "gradient-linear" ? { ...f, ...xy, stops: f.stops.map((s) => ({ ...s })) } : f,
                                );
                              }}
                              className="w-16 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white font-mono"
                            />
                          </div>
                          <div className="h-3 rounded-full border border-white/10 relative overflow-hidden"
                            style={{
                              background: `linear-gradient(90deg, ${gf.stops.map((s) => `rgba(${parseInt(s.color.slice(1, 3), 16)},${parseInt(s.color.slice(3, 5), 16)},${parseInt(s.color.slice(5, 7), 16)},${s.opacity}) ${s.position}%`).join(",")})`,
                            }}
                          />
                          <div className="flex flex-wrap gap-1">
                            <button type="button" className="text-[8px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20" onClick={() => updateSelectedFill((f) => (f.type === "gradient-linear" ? { ...f, stops: addMidStop(f.stops) } : f))}>+ Stop</button>
                            <button type="button" className="text-[8px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20" onClick={() => updateSelectedFill((f) => (f.type === "gradient-linear" ? { ...f, stops: reverseGradientStops(f.stops) } : f))}>Reverse</button>
                          </div>
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {gf.stops.map((s, si) => (
                              <div key={si} className="flex items-center gap-1">
                                <input type="color" value={s.color} className="w-6 h-6 rounded border border-white/20"
                                  onChange={(e) => {
                                    const c = e.target.value;
                                    updateSelectedFill((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, color: c } : st));
                                      return { ...f, stops };
                                    });
                                  }} />
                                <input type="range" min={0} max={1} step={0.01} value={s.opacity} className="flex-1 accent-violet-500"
                                  onChange={(e) => {
                                    const op = Number(e.target.value);
                                    updateSelectedFill((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, opacity: op } : st));
                                      return { ...f, stops };
                                    });
                                  }} />
                                <input type="number" value={s.position} className="w-10 bg-white/5 border border-white/10 rounded px-1 text-[9px] text-white"
                                  onChange={(e) => {
                                    const p = Number(e.target.value);
                                    updateSelectedFill((f) => {
                                      if (f.type !== "gradient-linear") return f;
                                      const stops = f.stops.map((st, j) => (j === si ? { ...st, position: clamp(p, 0, 100) } : st));
                                      return { ...f, stops };
                                    });
                                  }} />
                                <button type="button" className="text-zinc-500 text-[8px]" disabled={gf.stops.length <= 2}
                                  onClick={() => updateSelectedFill((f) => {
                                    if (f.type !== "gradient-linear" || f.stops.length <= 2) return f;
                                    return { ...f, stops: f.stops.filter((_, j) => j !== si) };
                                  })}>✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {migrateFill(firstSelected.fill).type === "gradient-radial" && (() => {
                      const gf = migrateFill(firstSelected.fill) as Extract<FillAppearance, { type: "gradient-radial" }>;
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8px] text-zinc-500">Radius</span>
                            <input
                              type="number"
                              value={Math.round(gf.r * 100) / 100}
                              step={0.02}
                              min={0.02}
                              max={2}
                              onChange={(e) => {
                                const r = Number(e.target.value);
                                updateSelectedFill((f) => (f.type === "gradient-radial" ? { ...f, r: clamp(r, 0.02, 2) } : f));
                              }}
                              className="w-16 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white font-mono"
                            />
                          </div>
                          <div className="h-3 rounded-full border border-white/10" style={{ background: `radial-gradient(circle, ${gf.stops.map((s) => `${s.color} ${s.position}%`).join(",")})` }} />
                          <div className="flex flex-wrap gap-1">
                            <button type="button" className="text-[8px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20" onClick={() => updateSelectedFill((f) => (f.type === "gradient-radial" ? { ...f, stops: addMidStop(f.stops) } : f))}>+ Stop</button>
                            <button type="button" className="text-[8px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20" onClick={() => updateSelectedFill((f) => (f.type === "gradient-radial" ? { ...f, stops: reverseGradientStops(f.stops) } : f))}>Reverse</button>
                          </div>
                          {gf.stops.map((s, si) => (
                            <div key={si} className="flex items-center gap-1">
                              <input type="color" value={s.color} className="w-6 h-6 rounded border border-white/20"
                                onChange={(e) => {
                                  const c = e.target.value;
                                  updateSelectedFill((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, color: c } : st));
                                    return { ...f, stops };
                                  });
                                }} />
                              <input type="range" min={0} max={1} step={0.01} value={s.opacity} className="flex-1 accent-violet-500"
                                onChange={(e) => {
                                  const op = Number(e.target.value);
                                  updateSelectedFill((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, opacity: op } : st));
                                    return { ...f, stops };
                                  });
                                }} />
                              <input type="number" value={s.position} className="w-10 bg-white/5 border border-white/10 rounded px-1 text-[9px]"
                                onChange={(e) => {
                                  const p = Number(e.target.value);
                                  updateSelectedFill((f) => {
                                    if (f.type !== "gradient-radial") return f;
                                    const stops = f.stops.map((st, j) => (j === si ? { ...st, position: clamp(p, 0, 100) } : st));
                                    return { ...f, stops };
                                  });
                                }} />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {activeTool === "gradient" && !supportsGradientFill(firstSelected) && (
                      <p className="text-[9px] text-amber-400/90">Select a closed shape to edit gradient on canvas.</p>
                    )}
                  </div>
                )}

                {/* Stroke */}
                <div className="space-y-1">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Stroke</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={firstSelected.stroke === "none" ? "#000000" : firstSelected.stroke}
                      onChange={(e) => { updateSelectedProp("stroke", e.target.value); setStrokeColor(e.target.value); }}
                      className="w-7 h-7 rounded cursor-pointer border border-white/20 bg-transparent" />
                    <input type="number" value={firstSelected.strokeWidth}
                      onChange={(e) => updateSelectedProp("strokeWidth", Number(e.target.value))}
                      className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono" min={0} max={50} step={0.5} />
                  </div>
                  {/* Stroke cap / join — icon toggles */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center gap-1" title="Line cap">
                      {([
                        { v: "butt" as const, Icon: Minus, label: "Butt" },
                        { v: "round" as const, Icon: Circle, label: "Round" },
                        { v: "square" as const, Icon: RectangleHorizontal, label: "Square" },
                      ]).map(({ v, Icon, label }) => (
                        <button key={v} type="button" title={label}
                          onClick={() => { updateSelectedProp("strokeLinecap", v); setStrokeLinecap(v); }}
                          className={`p-1.5 rounded border transition-colors ${firstSelected.strokeLinecap === v ? "bg-violet-600/40 border-violet-400 text-white" : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"}`}>
                          <Icon size={14} strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1" title="Line join">
                      {([
                        { v: "miter" as const, Icon: Triangle, label: "Miter" },
                        { v: "round" as const, Icon: Circle, label: "Round" },
                        { v: "bevel" as const, Icon: Diamond, label: "Bevel" },
                      ]).map(({ v, Icon, label }) => (
                        <button key={v} type="button" title={label}
                          onClick={() => { updateSelectedProp("strokeLinejoin", v); setStrokeLinejoin(v); }}
                          className={`p-1.5 rounded border transition-colors ${firstSelected.strokeLinejoin === v ? "bg-violet-600/40 border-violet-400 text-white" : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"}`}>
                          <Icon size={14} strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                    <input type="text" value={firstSelected.strokeDasharray ?? ""} placeholder="Dash e.g. 8 4"
                      onChange={(e) => {
                        const v = e.target.value.replace(/,/g, " ");
                        updateSelectedProp("strokeDasharray", v);
                        setStrokeDasharray(v);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white font-mono" title="Guiones: números separados por espacio (ej. 8 4)" />
                  </div>
                </div>

                {/* Opacity */}
                <div className="space-y-1">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Opacity</label>
                  <input type="range" min={0} max={1} step={0.01} value={firstSelected.opacity}
                    onChange={(e) => updateSelectedProp("opacity", Number(e.target.value))}
                    className="w-full accent-violet-500" />
                </div>

                {/* Dimensions */}
                <div className="grid grid-cols-2 gap-1.5">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <div key={key} className="space-y-0.5">
                      <label className="text-[8px] text-zinc-600 uppercase">{key.charAt(0).toUpperCase()}</label>
                      <input type="number" value={Math.round(firstSelected[key])}
                        onChange={(e) => updateSelectedProp(key, Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono" />
                    </div>
                  ))}
                </div>

                {/* Rotation */}
                <div className="space-y-1">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Rotation (°)</label>
                  <input type="number" value={Math.round(firstSelected.rotation * 1000) / 1000}
                    onChange={(e) => updateSelectedProp("rotation", Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono" step={0.1} />
                </div>

                {firstSelected.type === "text" && (() => {
                  const tx = firstSelected as TextObject;
                  return (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Typography</div>
                      <input type="text" value={tx.fontFamily}
                        onChange={(e) => updateSelectedProp("fontFamily", e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white" placeholder="Font family" />
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-600">Size</label>
                          <input type="number" value={tx.fontSize} min={4} max={400}
                            onChange={(e) => updateSelectedProp("fontSize", Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono" />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-600">Weight</label>
                          <input type="number" value={tx.fontWeight} min={100} max={900} step={100}
                            onChange={(e) => updateSelectedProp("fontWeight", Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-600">Line height</label>
                          <input type="number" value={tx.lineHeight} min={0.5} max={4} step={0.05}
                            onChange={(e) => updateSelectedProp("lineHeight", Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono" />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] text-zinc-600">Tracking</label>
                          <input type="number" value={tx.letterSpacing} step={0.1}
                            onChange={(e) => updateSelectedProp("letterSpacing", Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono" />
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(["left", "center", "right", "justify"] as const).map((al) => (
                          <button key={al} type="button"
                            onClick={() => updateSelectedProp("textAlign", al)}
                            className={`flex-1 py-1 rounded text-[8px] font-bold uppercase ${tx.textAlign === al ? "bg-violet-600/50 text-white" : "bg-white/5 text-zinc-500 hover:text-white"}`}>
                            {al.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                      <p className="text-[8px] text-zinc-500">Double-click text on canvas to edit. Esc exits edit.</p>
                      <button type="button"
                        onClick={() => { if (window.confirm("Convert to outlines will make text non-editable. Continue?")) void convertTextToOutlines(); }}
                        className="w-full py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-wider text-zinc-300 hover:bg-white/10 hover:text-white transition-colors">
                        Convert to outlines
                      </button>
                    </div>
                  );
                })()}

                {activeTool === "directSelect" && selectedAnchorVertexHint && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Punto de ancla (Bezier)</div>
                    {selectedAnchorVertexHint.modes.length > 1 && (
                      <div className="text-[9px] text-amber-400/90">Selección mixta — elige un modo para aplicar a todos</div>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {([
                        { mode: "smooth" as const, Icon: Spline, title: "Continuo en curva (tangentes simétricas)", label: "Suave" },
                        { mode: "cusp" as const, Icon: Unlink2, title: "Partir tangente: curva continua con longitudes independientes", label: "Partir" },
                        { mode: "corner" as const, Icon: Diamond, title: "Esquina: manejadores independientes (ángulo agudo posible)", label: "Esquina" },
                      ]).map(({ mode, Icon, title, label }) => (
                        <button key={mode} type="button" title={title}
                          onClick={() => setVertexModeOnSelectedAnchors(mode)}
                          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded border min-w-[3.25rem] transition-colors ${
                            selectedAnchorVertexHint.unified === mode
                              ? "bg-violet-600/45 border-violet-400 text-white"
                              : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"
                          }`}>
                          <Icon size={15} strokeWidth={2} />
                          <span className="text-[7px] font-bold uppercase tracking-wide">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {firstSelected.type === "booleanGroup" && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Boolean Group</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {([
                        { op: "union" as const, Icon: Layers, title: "Union" },
                        { op: "subtract" as const, Icon: Minus, title: "Subtract" },
                        { op: "intersect" as const, Icon: Crop, title: "Intersect" },
                        { op: "exclude" as const, Icon: Split, title: "Exclude" },
                      ]).map(({ op, Icon, title }) => (
                        <button key={op} type="button" title={title}
                          onClick={() => changeBooleanOp(op)}
                          className={`p-2 rounded border transition-colors ${(firstSelected as BooleanGroupObject).operation === op ? "bg-violet-600/50 border-violet-400 text-white" : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"}`}>
                          <Icon size={16} strokeWidth={2} />
                        </button>
                      ))}
                      <span className="text-[9px] text-zinc-500 ml-1">{(firstSelected as BooleanGroupObject).children.length} children</span>
                    </div>
                    <button type="button" onClick={() => enterIsolation(firstSelected.id)}
                      className="w-full py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-white text-[9px] font-bold uppercase tracking-wider hover:bg-violet-600/50 transition-colors">
                      Edit Children (double-click)
                    </button>
                    <button type="button" onClick={expandBoolean}
                      className="w-full py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-[9px] font-bold uppercase tracking-wider hover:bg-white/10 hover:text-white transition-colors">
                      Expand Boolean (destructive)
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-[10px] text-zinc-600 italic">No object selected</div>
            )}

            {/* Default colors */}
            <div className="pt-2 border-t border-white/5 space-y-1">
              <label className="text-[8px] text-zinc-600 uppercase tracking-wider">Defaults</label>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-0.5">
                  <input type="color" value={fillColor} onChange={(e) => setFillColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-white/20 bg-transparent" />
                  <span className="text-[7px] text-zinc-600">Fill</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-white/20 bg-transparent" />
                  <span className="text-[7px] text-zinc-600">Stroke</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <input type="number" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))}
                    className="w-10 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white font-mono" min={0} max={50} step={0.5} />
                  <span className="text-[7px] text-zinc-600">W</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Alignment (when multi-selected) ─────────────────── */}
          {selectedObjects.length >= 2 && (
            <div className="p-3 border-b border-white/10 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Align</div>
              <div className="flex items-center gap-1">
                <ToolBtn onClick={() => alignObjects("left")} title="Align Left"><AlignStartVertical size={14} /></ToolBtn>
                <ToolBtn onClick={() => alignObjects("centerH")} title="Align Center H"><AlignCenterVertical size={14} /></ToolBtn>
                <ToolBtn onClick={() => alignObjects("right")} title="Align Right"><AlignEndVertical size={14} /></ToolBtn>
                <div className="w-px h-5 bg-white/10 mx-0.5" />
                <ToolBtn onClick={() => alignObjects("top")} title="Align Top"><AlignStartHorizontal size={14} /></ToolBtn>
                <ToolBtn onClick={() => alignObjects("centerV")} title="Align Center V"><AlignCenterHorizontal size={14} /></ToolBtn>
                <ToolBtn onClick={() => alignObjects("bottom")} title="Align Bottom"><AlignEndHorizontal size={14} /></ToolBtn>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => alignObjects("distH")}
                  className="flex-1 py-1 rounded text-[8px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase font-bold tracking-wider">Dist H</button>
                <button type="button" onClick={() => alignObjects("distV")}
                  className="flex-1 py-1 rounded text-[8px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase font-bold tracking-wider">Dist V</button>
              </div>
              <div className="flex items-center gap-1">
                <ToolBtn onClick={groupSelected} title="Group (⌘G)"><Group size={14} /></ToolBtn>
                <ToolBtn onClick={ungroupSelected} title="Ungroup (⇧⌘G)"><Ungroup size={14} /></ToolBtn>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mt-2">Boolean</div>
              <div className="grid grid-cols-2 gap-1">
                <button type="button" onClick={() => booleanOp("union")}
                  className="py-1 rounded text-[8px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase font-bold tracking-wider">Union</button>
                <button type="button" onClick={() => booleanOp("subtract")}
                  className="py-1 rounded text-[8px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase font-bold tracking-wider">Subtract</button>
                <button type="button" onClick={() => booleanOp("intersect")}
                  className="py-1 rounded text-[8px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase font-bold tracking-wider">Intersect</button>
                <button type="button" onClick={() => booleanOp("exclude")}
                  className="py-1 rounded text-[8px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase font-bold tracking-wider">Exclude</button>
              </div>
            </div>
          )}

          {/* ── Layers ──────────────────────────────────────────── */}
          <div className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Layers ({objects.length})</div>
            <div className="space-y-0.5">
              {[...objects].reverse().map((obj) => {
                const isSel = selectedIds.has(obj.id);
                const isDropTarget = layerDropTarget === obj.id;
                return (
                  <div key={obj.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setLayerDragId(obj.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (layerDragId && layerDragId !== obj.id) setLayerDropTarget(obj.id);
                    }}
                    onDragLeave={() => { if (layerDropTarget === obj.id) setLayerDropTarget(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (layerDragId && layerDragId !== obj.id) {
                        setObjects((prev) => {
                          const fromIdx = prev.findIndex((o) => o.id === layerDragId);
                          const toIdx = prev.findIndex((o) => o.id === obj.id);
                          if (fromIdx < 0 || toIdx < 0) return prev;
                          const n = [...prev];
                          const [moved] = n.splice(fromIdx, 1);
                          n.splice(toIdx, 0, moved);
                          pushHistory(n, selectedIds);
                          return n;
                        });
                      }
                      setLayerDragId(null);
                      setLayerDropTarget(null);
                    }}
                    onDragEnd={() => { setLayerDragId(null); setLayerDropTarget(null); }}
                    onMouseEnter={() => setLayerHoverId(obj.id)}
                    onMouseLeave={() => setLayerHoverId((h) => (h === obj.id ? null : h))}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-grab transition-colors text-[10px] border border-transparent ${
                      isSel ? "bg-violet-600/30 text-white border-violet-500/25" : "text-zinc-400 hover:bg-white/5"
                    } ${obj.isClipMask ? "italic opacity-50" : ""} ${isDropTarget ? "ring-1 ring-violet-400" : ""} ${layerDragId === obj.id ? "opacity-40" : ""} ${
                      (hoverCanvasId === obj.id || layerHoverId === obj.id) && !isSel ? "ring-1 ring-sky-500/50 bg-sky-500/10" : ""
                    }`}
                    onClick={(e) => {
                      const ns = resolveSelection(obj.id, e.shiftKey || e.nativeEvent.getModifierState?.("Shift"));
                      setSelectedIds(ns);
                      if (ns.has(obj.id)) setPrimarySelectedId(obj.id);
                    }}>
                    <button type="button" title="Toggle visibility" className="hover:text-white shrink-0"
                      onClick={(e) => { e.stopPropagation(); setObjects((p) => p.map((o) => o.id === obj.id ? { ...o, visible: !o.visible } : o)); }}>
                      {obj.visible ? <Eye size={12} /> : <EyeOff size={12} className="opacity-40" />}
                    </button>
                    <button type="button" title="Toggle lock" className="hover:text-white shrink-0"
                      onClick={(e) => { e.stopPropagation(); setObjects((p) => p.map((o) => o.id === obj.id ? { ...o, locked: !o.locked } : o)); }}>
                      {obj.locked ? <Lock size={12} className="text-amber-400" /> : <Unlock size={12} className="opacity-40" />}
                    </button>
                    {layerRowIcon(obj)}
                    <span className="flex-1 truncate"
                      onDoubleClick={(e) => {
                        if (obj.type === "booleanGroup") { e.stopPropagation(); enterIsolation(obj.id); }
                        if (obj.type === "clippingContainer") { e.stopPropagation(); enterClippingIsolation(obj.id, "content"); }
                      }}>
                      {obj.name}{obj.groupId ? " ◆" : ""}{obj.isClipMask ? " [clip]" : ""}
                      {obj.type === "booleanGroup" && <span className="text-violet-400 ml-1 text-[8px]">◇{(obj as BooleanGroupObject).operation} ({(obj as BooleanGroupObject).children.length})</span>}
                      {obj.type === "clippingContainer" && <span className="text-emerald-400/90 ml-1 text-[8px]">▣ clip ({(obj as ClippingContainerObject).content.length})</span>}
                    </span>
                    <button type="button" title="Delete" className="hover:text-red-400 shrink-0"
                      onClick={(e) => { e.stopPropagation(); setObjects((p) => { const n = p.filter((o) => o.id !== obj.id); pushHistory(n, new Set()); return n; }); setSelectedIds((s) => { const ns = new Set(s); ns.delete(obj.id); return ns; }); }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t border-white/[0.08] px-3 py-2 text-[9px] text-zinc-500">
          <span>{objects.length} objects · {selectedIds.size} selected{isolationDepth > 0 ? ` · Isolation (depth ${isolationDepth})` : ""}</span>
        </div>
      </div>
      </div>

      {/* ── Context menu ─────────────────────────────────────────── */}
      {ctxMenu && <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenuItems} onClose={() => setCtxMenu(null)} />}

      {showExportModal && (
        <FreehandExportModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          bounds={
            exportModalScope === "full"
              ? boundsOfObjects(objects.filter((o) => o.visible)) ?? { x: 0, y: 0, w: 100, h: 100 }
              : selectedObjects.length > 0
                ? getGroupBounds(selectedObjects)
                : null
          }
          defaultFilename={
            exportModalScope === "selection" && firstSelected
              ? `${firstSelected.name || "selection"}`
              : "artboard"
          }
          selectionLabel={
            exportModalScope === "full"
              ? "Entire artboard"
              : selectedObjects.length === 0
                ? "Nothing selected"
                : selectedObjects.length === 1
                  ? `Selection · ${firstSelected?.name ?? "layer"}`
                  : `${selectedObjects.length} objects`
          }
          hasSelection={selectedIds.size > 0}
          onExport={runProfessionalExport}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[100001] -translate-x-1/2 rounded-lg border border-white/[0.12] bg-[#1a1f28] px-4 py-2 text-[12px] font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
