/** Utilidades numéricas compartidas del responsive (sin dependencias de layout). */

/** CSS-style clamp(MIN, VAL, MAX). */
export function clampNumber(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
