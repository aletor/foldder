import type { BBoxPage } from "@/lib/brandkit/logo-intake/bbox";

export type BboxCssRect = {
  left: string;
  top: string;
  width: string;
  height: string;
};

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function bboxPageToCssPercent(bbox: BBoxPage | readonly [number, number, number, number]): BboxCssRect {
  const [x1, y1, x2, y2] = bbox;
  const pct = (n: number) => `${Math.round(n * 100000) / 1000}%`;
  return {
    left: pct(x1),
    top: pct(y1),
    width: pct(x2 - x1),
    height: pct(y2 - y1),
  };
}

export function normalizeBBoxPage(bbox: BBoxPage): BBoxPage {
  const [x1, y1, x2, y2] = bbox;
  return [
    clamp01(Math.min(x1, x2)),
    clamp01(Math.min(y1, y2)),
    clamp01(Math.max(x1, x2)),
    clamp01(Math.max(y1, y2)),
  ];
}

export function bboxPageArea(bbox: BBoxPage): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

export function bboxAreaDelta(original: BBoxPage, adjusted: BBoxPage): number {
  const o = bboxPageArea(original);
  const a = bboxPageArea(adjusted);
  if (o <= 0) return 0;
  return Math.round(((a - o) / o) * 1000) / 1000;
}

export function bboxPageToPixel(bbox: BBoxPage, width: number, height: number) {
  return {
    left: Math.round(bbox[0] * width),
    top: Math.round(bbox[1] * height),
    width: Math.max(1, Math.round((bbox[2] - bbox[0]) * width)),
    height: Math.max(1, Math.round((bbox[3] - bbox[1]) * height)),
  };
}

export function pixelRectToBBoxPage(
  left: number,
  top: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
): BBoxPage {
  return normalizeBBoxPage([
    left / pageWidth,
    top / pageHeight,
    (left + width) / pageWidth,
    (top + height) / pageHeight,
  ]);
}

export type BboxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

export function resizeBBoxPage(
  orig: BBoxPage,
  handle: Exclude<BboxHandle, "move">,
  pointer: { x: number; y: number },
  anchor: BBoxPage,
): BBoxPage {
  let [x1, y1, x2, y2] = orig;
  const px = clamp01(pointer.x);
  const py = clamp01(pointer.y);

  if (handle.includes("w")) x1 = px;
  if (handle.includes("e")) x2 = px;
  if (handle.includes("n")) y1 = py;
  if (handle.includes("s")) y2 = py;

  if (handle === "n") {
    x1 = anchor[0];
    x2 = anchor[2];
  }
  if (handle === "s") {
    x1 = anchor[0];
    x2 = anchor[2];
  }
  if (handle === "w") {
    y1 = anchor[1];
    y2 = anchor[3];
  }
  if (handle === "e") {
    y1 = anchor[1];
    y2 = anchor[3];
  }

  const minSize = 0.005;
  if (x2 - x1 < minSize) {
    if (handle.includes("w")) x1 = x2 - minSize;
    else x2 = x1 + minSize;
  }
  if (y2 - y1 < minSize) {
    if (handle.includes("n")) y1 = y2 - minSize;
    else y2 = y1 + minSize;
  }

  return normalizeBBoxPage([x1, y1, x2, y2]);
}

export function moveBBoxPage(orig: BBoxPage, dx: number, dy: number): BBoxPage {
  const w = orig[2] - orig[0];
  const h = orig[3] - orig[1];
  let x1 = orig[0] + dx;
  let y1 = orig[1] + dy;
  x1 = clamp01(Math.min(x1, 1 - w));
  y1 = clamp01(Math.min(y1, 1 - h));
  return [x1, y1, x1 + w, y1 + h];
}
