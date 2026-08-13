/** Conversión centralizada: client CSS px ↔ coordenadas de página Designer. */

export interface StageClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PagePoint {
  x: number;
  y: number;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `stage` es el wrapper ya escalado (getBoundingClientRect).
 * `scale` es el zoom CSS del preview (fit / 0.5 / 1).
 * El scroll queda incluido en `stage.left/top`.
 */
export function clientPointToPagePoint(
  clientX: number,
  clientY: number,
  stage: StageClientRect,
  scale: number,
): PagePoint {
  const safeScale = scale > 0 ? scale : 1;
  return {
    x: (clientX - stage.left) / safeScale,
    y: (clientY - stage.top) / safeScale,
  };
}

export function pagePointToClientPoint(
  page: PagePoint,
  stage: StageClientRect,
  scale: number,
): PagePoint {
  const safeScale = scale > 0 ? scale : 1;
  return {
    x: stage.left + page.x * safeScale,
    y: stage.top + page.y * safeScale,
  };
}

export function pageRectToStageRect(rect: PageRect, scale: number): PageRect {
  const safeScale = scale > 0 ? scale : 1;
  return {
    x: rect.x * safeScale,
    y: rect.y * safeScale,
    width: rect.width * safeScale,
    height: rect.height * safeScale,
  };
}

export function clientRectToPageRect(
  client: { x: number; y: number; width: number; height: number },
  stage: StageClientRect,
  scale: number,
): PageRect {
  const a = clientPointToPagePoint(client.x, client.y, stage, scale);
  const b = clientPointToPagePoint(client.x + client.width, client.y + client.height, stage, scale);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function normalizePageRect(x0: number, y0: number, x1: number, y1: number): PageRect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export function pointInPageRect(point: PagePoint, rect: PageRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function pageRectFullyContains(outer: PageRect, inner: PageRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function unionPageRects(rects: PageRect[]): PageRect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}
