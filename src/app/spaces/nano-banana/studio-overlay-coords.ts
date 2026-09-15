import { pointInPolygon } from "./lasso-to-paint-data";
import type { StudioPoint } from "./studio-types";

export type OverlayRect = { height: number; left: number; top: number; width: number };

/** Map a pointer onto image pixels using the overlay's painted box (works under zoom/pan). */
export function clientPointToImagePoint(
  clientX: number,
  clientY: number,
  overlay: OverlayRect,
  image: { height: number; width: number },
): StudioPoint | null {
  if (overlay.width < 1 || overlay.height < 1 || image.width < 1 || image.height < 1) return null;
  const x = ((clientX - overlay.left) / overlay.width) * image.width;
  const y = ((clientY - overlay.top) / overlay.height) * image.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.max(0, Math.min(image.width, x)),
    y: Math.max(0, Math.min(image.height, y)),
  };
}

export function lassoAnchorPercent(
  points: StudioPoint[],
  image: { height: number; width: number },
): { left: number; top: number } | null {
  if (points.length < 1 || image.width < 1 || image.height < 1) return null;
  let maxX = 0;
  let minY = image.height;
  for (const point of points) {
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
  }
  return {
    left: Math.min(92, Math.max(4, (maxX / image.width) * 100)),
    top: Math.min(88, Math.max(4, (minY / image.height) * 100)),
  };
}

export type ViewerPanZoom = { pan: { x: number; y: number }; zoom: number };

export const STUDIO_VIEWER_PAN_GAIN = 0.42;
export const STUDIO_VIEWER_WHEEL_GAIN = 0.00115;

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * STUDIO_VIEWER_WHEEL_GAIN);
}

export function hitTestLassoCard(
  cards: { id: string; lassoPoints: StudioPoint[] }[],
  point: StudioPoint,
): string | null {
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i]!;
    if (card.lassoPoints.length > 2 && pointInPolygon(point.x, point.y, card.lassoPoints)) return card.id;
  }
  return null;
}

/** Keep the point under the cursor/pinch stable while scaling (origin 0,0). */
export function zoomTowardPoint(
  view: ViewerPanZoom,
  point: { x: number; y: number },
  nextZoom: number,
  limits: { max: number; min: number } = { max: 10, min: 0.25 },
): ViewerPanZoom {
  const prev = view.zoom || 1;
  const zoom = Math.min(limits.max, Math.max(limits.min, nextZoom));
  const ratio = zoom / prev;
  return {
    pan: {
      x: point.x - ratio * (point.x - view.pan.x),
      y: point.y - ratio * (point.y - view.pan.y),
    },
    zoom,
  };
}
