/**
 * Baseline vertical alineada con el `foreignObject` HTML del lienzo (`line-height` CSS),
 * no con `y + fontSize` (que desplaza el texto hacia abajo al rasterizar).
 */

export interface TextForeignObjectBaselineInput {
  y: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: number | string;
  fontStyle?: string;
  textMode: "point" | "area";
}

export function textForeignObjectPad(textMode: "point" | "area"): number {
  return textMode === "area" ? 4 : 0;
}

export function textForeignObjectLineHeightPx(t: Pick<TextForeignObjectBaselineInput, "fontSize" | "lineHeight">): number {
  return t.fontSize * t.lineHeight;
}

/** Aproximación em-cuadrado cuando no hay métricas de canvas (p. ej. SSR / jsdom). */
export function textForeignObjectApproxFirstBaselineOffset(t: TextForeignObjectBaselineInput): number {
  const pad = textForeignObjectPad(t.textMode);
  const lhPx = textForeignObjectLineHeightPx(t);
  const contentHeight = t.fontSize;
  const halfLeading = Math.max(0, (lhPx - contentHeight) / 2);
  const ascent = t.fontSize * 0.8;
  return pad + halfLeading + ascent;
}

/** Offset desde `y` del objeto hasta la baseline de la primera línea (como en el foreignObject). */
export function textForeignObjectFirstBaselineOffset(t: TextForeignObjectBaselineInput): number {
  const pad = textForeignObjectPad(t.textMode);
  const lhPx = textForeignObjectLineHeightPx(t);
  const approx = textForeignObjectApproxFirstBaselineOffset(t);

  if (typeof document === "undefined") return approx;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return approx;

  const fst = t.fontStyle && t.fontStyle !== "normal" ? `${t.fontStyle} ` : "";
  ctx.font = `${fst}${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
  const metrics = ctx.measureText("Hg");
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent <= 0) {
    return approx;
  }
  const contentHeight = ascent + descent;
  const halfLeading = Math.max(0, (lhPx - contentHeight) / 2);
  return pad + halfLeading + ascent;
}

export function textForeignObjectLineBaselineY(
  t: TextForeignObjectBaselineInput,
  lineIndex: number,
): number {
  const lhPx = textForeignObjectLineHeightPx(t);
  return t.y + textForeignObjectFirstBaselineOffset(t) + lineIndex * lhPx;
}
