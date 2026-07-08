/**
 * Conversión determinista box_2d Gemini → bboxPage (x1,y1,x2,y2) 0–1 y-down.
 * box_2d = [ymin, xmin, ymax, xmax] enteros 0–1000. Sin heurísticas.
 */

export type BBoxPage = [number, number, number, number];
export type Box2d = [number, number, number, number];

const MIN_AREA = 0.0002;

export function box2dToBBoxPage(box: Box2d): BBoxPage | null {
  const [ymin, xmin, ymax, xmax] = box.map((n) => Math.round(n)) as Box2d;
  if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000) return null;
  if (ymax <= ymin || xmax <= xmin) return null;

  const x1 = xmin / 1000;
  const y1 = ymin / 1000;
  const x2 = xmax / 1000;
  const y2 = ymax / 1000;
  const area = (x2 - x1) * (y2 - y1);
  if (area < MIN_AREA) return null;

  return [x1, y1, x2, y2];
}

export function expandBBoxPage(bbox: BBoxPage, padRatio: number): BBoxPage {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0;
  const h = y1 - y0;
  const padX = w * padRatio;
  const padY = h * padRatio;
  return [
    Math.max(0, x0 - padX),
    Math.max(0, y0 - padY),
    Math.min(1, x1 + padX),
    Math.min(1, y1 + padY),
  ];
}

export function isValidBox2d(raw: unknown): raw is Box2d {
  if (!Array.isArray(raw) || raw.length !== 4) return false;
  return raw.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000);
}

export function bboxArea(bbox: BBoxPage): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

export function shrinkBBoxPage(bbox: BBoxPage, insetRatio = 0.04): BBoxPage {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0;
  const h = y1 - y0;
  const dx = w * insetRatio;
  const dy = h * insetRatio;
  return [x0 + dx, y0 + dy, x1 - dx, y1 - dy];
}
