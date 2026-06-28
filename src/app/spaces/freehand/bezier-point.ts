/**
 * Matemática de puntos Bézier para la pluma (estilo Illustrator: smooth / cusp / corner).
 *
 * Extraído de `FreehandStudio.tsx` para testear la geometría de los anclajes de forma aislada. Solo
 * importa TIPOS de `../FreehandStudio` (borrados en runtime → sin ciclo); `dist` es local (1 línea).
 */
import type { BezierPoint, Point, VertexMode } from "../FreehandStudio";

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isCollapsedBezierHandle(anchor: Point, handle: Point): boolean {
  return Math.hypot(handle.x - anchor.x, handle.y - anchor.y) < 1e-5;
}

export function getVertexMode(pt: BezierPoint): VertexMode {
  if (pt.cornerMode) return "corner";
  if (pt.vertexMode === "corner" || pt.vertexMode === "cusp") return pt.vertexMode;
  if (isCollapsedBezierHandle(pt.anchor, pt.handleIn) || isCollapsedBezierHandle(pt.anchor, pt.handleOut)) return "corner";
  if (pt.vertexMode) return pt.vertexMode;
  return "smooth";
}

/** Apply drag to one handle according to vertex mode (see Adobe Illustrator anchor point types). */
export function applyVertexHandleDrag(pt: BezierPoint, ht: "handleIn" | "handleOut", newPos: Point): BezierPoint {
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

export function applyPenCreationHandleDrag(pt: BezierPoint, newHandleOut: Point): BezierPoint {
  return {
    ...pt,
    handleOut: newHandleOut,
    handleIn: {
      x: 2 * pt.anchor.x - newHandleOut.x,
      y: 2 * pt.anchor.y - newHandleOut.y,
    },
    vertexMode: "smooth",
    cornerMode: false,
  };
}

/** When switching mode from UI: normalize handles to a valid state for that mode. */
export function normalizeBezierPointForVertexMode(pt: BezierPoint, mode: VertexMode): BezierPoint {
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
