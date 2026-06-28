import type { FreehandObject, PathObject, Point } from "../FreehandStudio";

function degToRad(d: number) { return (d * Math.PI) / 180; }

/** Rotación + espejo alrededor del centro del bounding box (mismo espíritu que el texto con scale). */
export function buildObjTransform(o: FreehandObject): string | undefined {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const fx = o.flipX ? -1 : 1;
  const fy = o.flipY ? -1 : 1;
  const r = o.rotation || 0;
  const skewX = o.skewX || 0;
  const skewY = o.skewY || 0;
  const parts: string[] = [];
  if (fx !== 1 || fy !== 1 || r || skewX || skewY) {
    parts.push(`translate(${cx} ${cy})`);
    if (r) parts.push(`rotate(${r})`);
    if (skewX) parts.push(`skewX(${skewX})`);
    if (skewY) parts.push(`skewY(${skewY})`);
    if (fx !== 1 || fy !== 1) parts.push(`scale(${fx} ${fy})`);
    parts.push(`translate(${-cx} ${-cy})`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

/** Inversa del transform del objeto (hit-test de paths con el mismo `d` que en pantalla). */
export function inverseObjMatrix(o: FreehandObject): DOMMatrix | null {
  if (typeof DOMMatrix === "undefined") return null;
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const m = new DOMMatrix();
  m.translateSelf(cx, cy);
  if (o.rotation) m.rotateSelf(0, 0, o.rotation);
  if (o.skewX) m.multiplySelf(new DOMMatrix([1, 0, Math.tan(degToRad(o.skewX)), 1, 0, 0]));
  if (o.skewY) m.multiplySelf(new DOMMatrix([1, Math.tan(degToRad(o.skewY)), 0, 1, 0, 0]));
  const fx = o.flipX ? -1 : 1;
  const fy = o.flipY ? -1 : 1;
  if (fx !== 1 || fy !== 1) m.scaleSelf(fx, fy);
  m.translateSelf(-cx, -cy);
  return m.inverse();
}

/**
 * Un punto en el mismo espacio que los `points` del path (el de `distToPathSegments` / `d` antes del `transform` SVG de giro/espejo)
 * → coordenadas de mundo en el lienzo. Los trazos de pluma guardan anclas en ese espacio, no como locales 0…w del marco;
 * por eso no debe usarse `objLocalToWorldPoint` (que suma o.x/o.y como si fueran locales del rectángulo).
 */
export function pathBezierPointToWorld(pt: Point, o: FreehandObject): Point {
  const inv = inverseObjMatrix(o);
  if (!inv) return { x: pt.x, y: pt.y };
  const t = inv.inverse().transformPoint(new DOMPoint(pt.x, pt.y));
  return { x: t.x, y: t.y };
}

export function worldPointToPathBezierPoint(pt: Point, o: FreehandObject): Point {
  const inv = inverseObjMatrix(o);
  if (!inv) return { x: pt.x, y: pt.y };
  const t = inv.transformPoint(new DOMPoint(pt.x, pt.y));
  return { x: t.x, y: t.y };
}

export function pathAnchorsToWorld(p: PathObject): PathObject {
  return {
    ...p,
    points: p.points.map((pt) => ({
      ...pt,
      anchor: pathBezierPointToWorld(pt.anchor, p),
      handleIn: pathBezierPointToWorld(pt.handleIn, p),
      handleOut: pathBezierPointToWorld(pt.handleOut, p),
    })),
  };
}
