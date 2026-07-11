import type { BBoxXYXY } from "@/lib/brandkit/ingest/page-vision-pass-bbox";
import {
  classifyModelBboxTuple,
  resolveAuditBbox,
} from "@/lib/brandkit/ingest/page-vision-pass-bbox";

export type BboxCssRect = {
  left: string;
  top: string;
  width: string;
  height: string;
};

/** Bbox normalizado [x1,y1,x2,y2] → porcentajes CSS sobre el frame del modelo. */
export function bboxXYXYToCssPercent(bbox: BBoxXYXY | readonly [number, number, number, number]): BboxCssRect {
  const [x1, y1, x2, y2] = bbox;
  const pct = (n: number) => `${Math.round(n * 100000) / 1000}%`;
  return {
    left: pct(x1),
    top: pct(y1),
    width: pct(x2 - x1),
    height: pct(y2 - y1),
  };
}

export const LOGO_LAB_BBOX_COLORS = ["#FFBD1B", "#3B82F6", "#22C55E", "#EC4899", "#A855F7"] as const;

/** Tupla cruda del audit → xyxy para overlay (misma lógica que ingesta). */
export function resolveLogoLabBbox(
  stored: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return resolveAuditBbox(stored);
}

export function logoLabBboxInterpretation(
  stored: readonly [number, number, number, number],
): "xyxy_literal" | "xywh_legacy" | "degenerate" {
  return classifyModelBboxTuple(stored);
}

export function logoLabBboxColor(index: number): string {
  return LOGO_LAB_BBOX_COLORS[index % LOGO_LAB_BBOX_COLORS.length];
}
