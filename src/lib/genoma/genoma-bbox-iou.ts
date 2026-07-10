/** IoU entre bboxes normalizados [x1, y1, x2, y2]. */
export function bboxIoU(a: readonly number[], b: readonly number[]): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

export function logoSourceBboxToTuple(
  bbox?: { x: number; y: number; width: number; height: number },
): [number, number, number, number] | null {
  if (!bbox) return null;
  const x2 = bbox.x + bbox.width;
  const y2 = bbox.y + bbox.height;
  if (x2 <= bbox.x || y2 <= bbox.y) return null;
  return [bbox.x, bbox.y, x2, y2];
}
