import type { AdvancedImageBox, AdvancedImagePoint } from "./domain";

export type AdvancedImageCanvasSize = {
  height: number;
  width: number;
};

export type AdvancedImageRenderedRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export function computeContainedImageRect(
  container: AdvancedImageCanvasSize,
  image: AdvancedImageCanvasSize,
): AdvancedImageRenderedRect {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    height,
    width,
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
  };
}

export function canvasToMasterPoint(
  point: AdvancedImagePoint,
  renderedRect: AdvancedImageRenderedRect,
  master: AdvancedImageCanvasSize,
): AdvancedImagePoint {
  if (renderedRect.width <= 0 || renderedRect.height <= 0 || master.width <= 0 || master.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp(((point.x - renderedRect.x) / renderedRect.width) * master.width, 0, master.width),
    y: clamp(((point.y - renderedRect.y) / renderedRect.height) * master.height, 0, master.height),
  };
}

export function masterToCanvasPoint(
  point: AdvancedImagePoint,
  renderedRect: AdvancedImageRenderedRect,
  master: AdvancedImageCanvasSize,
): AdvancedImagePoint {
  if (master.width <= 0 || master.height <= 0) return { x: renderedRect.x, y: renderedRect.y };
  return {
    x: renderedRect.x + (point.x / master.width) * renderedRect.width,
    y: renderedRect.y + (point.y / master.height) * renderedRect.height,
  };
}

export function masterBoxToCanvasBox(
  box: AdvancedImageBox,
  renderedRect: AdvancedImageRenderedRect,
  master: AdvancedImageCanvasSize,
): AdvancedImageBox {
  const start = masterToCanvasPoint({ x: box.x, y: box.y }, renderedRect, master);
  const end = masterToCanvasPoint({ x: box.x + box.width, y: box.y + box.height }, renderedRect, master);
  return {
    height: Math.max(0, end.y - start.y),
    width: Math.max(0, end.x - start.x),
    x: start.x,
    y: start.y,
  };
}

export function computePointsBox(points: AdvancedImagePoint[]): AdvancedImageBox {
  if (points.length === 0) return { height: 0, width: 0, x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    height: Math.max(0, maxY - minY),
    width: Math.max(0, maxX - minX),
    x: minX,
    y: minY,
  };
}

export function isValidClosedLasso(
  points: AdvancedImagePoint[],
  options: { minBoxPx?: number; minPoints?: number } = {},
): boolean {
  const minPoints = options.minPoints ?? 20;
  const minBoxPx = options.minBoxPx ?? 30;
  if (points.length < minPoints) return false;
  const box = computePointsBox(points);
  return box.width >= minBoxPx && box.height >= minBoxPx;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
