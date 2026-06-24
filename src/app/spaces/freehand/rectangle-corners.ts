export interface RectangleCornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function safeRadiusValue(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function clampCornerRadius(
  cornerRadius: Partial<RectangleCornerRadius> | null | undefined,
  width: number,
  height: number,
): RectangleCornerRadius {
  const maxR = Math.max(0, Math.min(Math.abs(width), Math.abs(height)) / 2);
  return {
    topLeft: clamp(safeRadiusValue(cornerRadius?.topLeft), 0, maxR),
    topRight: clamp(safeRadiusValue(cornerRadius?.topRight), 0, maxR),
    bottomRight: clamp(safeRadiusValue(cornerRadius?.bottomRight), 0, maxR),
    bottomLeft: clamp(safeRadiusValue(cornerRadius?.bottomLeft), 0, maxR),
  };
}

export function normalizeCornerRadius(
  value: number | Partial<RectangleCornerRadius> | null | undefined,
  width: number,
  height: number,
): RectangleCornerRadius {
  if (typeof value === "number") {
    const r = safeRadiusValue(value);
    return clampCornerRadius(
      { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r },
      width,
      height,
    );
  }
  return clampCornerRadius(value, width, height);
}

export function areCornersLinkedEquivalent(
  cornerRadius: Partial<RectangleCornerRadius> | null | undefined,
  epsilon = 1e-3,
): boolean {
  if (!cornerRadius) return true;
  const tl = safeRadiusValue(cornerRadius.topLeft);
  const tr = safeRadiusValue(cornerRadius.topRight);
  const br = safeRadiusValue(cornerRadius.bottomRight);
  const bl = safeRadiusValue(cornerRadius.bottomLeft);
  return (
    Math.abs(tl - tr) <= epsilon &&
    Math.abs(tl - br) <= epsilon &&
    Math.abs(tl - bl) <= epsilon
  );
}
