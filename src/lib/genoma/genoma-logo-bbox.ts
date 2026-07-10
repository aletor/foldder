import type { LogoSourceBbox } from "./genoma-types";

export type NormalizedBboxPage = readonly [number, number, number, number];

function scaleBboxCoordsIfNeeded(values: readonly [number, number, number, number]): NormalizedBboxPage {
  const max = Math.max(...values);
  if (max > 1.001 && max <= 1000) {
    return [
      values[0] / 1000,
      values[1] / 1000,
      values[2] / 1000,
      values[3] / 1000,
    ] as const;
  }
  return values;
}

export function logoSourceBboxToPageTuple(bbox: LogoSourceBbox): NormalizedBboxPage {
  return scaleBboxCoordsIfNeeded([bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height]);
}

export function pageTupleToLogoSourceBbox(tuple: NormalizedBboxPage): LogoSourceBbox {
  const [x0, y0, x1, y1] = tuple;
  return {
    x: x0,
    y: y0,
    width: Math.max(0.001, x1 - x0),
    height: Math.max(0.001, y1 - y0),
  };
}

export function isValidBboxPage(tuple: readonly number[]): tuple is NormalizedBboxPage {
  if (tuple.length !== 4) return false;
  if (tuple.some((value) => !Number.isFinite(value))) return false;
  const [x0, y0, x1, y1] = tuple;
  return x1 > x0 && y1 > y0;
}
