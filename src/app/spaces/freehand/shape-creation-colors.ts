/** Gris oscuro por defecto si relleno y trazo del panel están vacíos al crear. */
export const SHAPE_CREATION_DEFAULT_COLOR = "#333333";

export function fillAppearanceIsEmpty(fillColor: string): boolean {
  return fillColor === "none";
}

export function strokeAppearanceIsEmpty(strokeColor: string, strokeWidth: number): boolean {
  return strokeColor === "none" || strokeWidth <= 0;
}

export function bothFillAndStrokeEmpty(
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
): boolean {
  return fillAppearanceIsEmpty(fillColor) && strokeAppearanceIsEmpty(strokeColor, strokeWidth);
}

/** Texto: si relleno vacío, usa trazo o el gris por defecto. */
export function resolveTextCreationFillHex(
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
): string {
  if (bothFillAndStrokeEmpty(fillColor, strokeColor, strokeWidth)) return SHAPE_CREATION_DEFAULT_COLOR;
  if (fillAppearanceIsEmpty(fillColor)) {
    return strokeColor === "none" ? SHAPE_CREATION_DEFAULT_COLOR : strokeColor;
  }
  return fillColor;
}

/** Rect/ellipse: relleno gris solo si ambos vacíos; si solo falta relleno, queda hueco. */
export function resolveShapeCreationFillHex(
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
): string {
  if (bothFillAndStrokeEmpty(fillColor, strokeColor, strokeWidth)) return SHAPE_CREATION_DEFAULT_COLOR;
  if (fillAppearanceIsEmpty(fillColor)) return "none";
  return fillColor;
}

/** Línea y pluma: el gris va al trazo, no al relleno. */
export function resolveStrokeOnlyCreationHex(
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
): string {
  if (!strokeAppearanceIsEmpty(strokeColor, strokeWidth)) return strokeColor;
  if (fillAppearanceIsEmpty(fillColor)) return SHAPE_CREATION_DEFAULT_COLOR;
  return fillColor;
}

export function resolveStrokeOnlyCreationWidth(strokeColor: string, strokeWidth: number): number {
  return strokeAppearanceIsEmpty(strokeColor, strokeWidth) ? Math.max(strokeWidth, 2) : strokeWidth;
}

/** Path cerrado con pluma: sin relleno gris por defecto (solo trazo). */
export function resolvePenClosedFillHex(fillColor: string): string {
  return fillAppearanceIsEmpty(fillColor) ? "none" : fillColor;
}
