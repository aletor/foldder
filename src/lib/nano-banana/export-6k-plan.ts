/**
 * Export 6K · geometría (sin sharp, sin llamadas de pago).
 * Seguro para importar desde el cliente.
 */

export const EXPORT_6K_LONG_SIDE = 6144;
/** Tope absoluto para no generar archivos de cientos de MB por accidente. */
export const EXPORT_6K_MAX_LONG_SIDE = 8192;
/** JPEG casi sin pérdida visual (4:4:4). */
export const EXPORT_6K_JPEG_QUALITY = 96;

export type Export6kFormat = "png" | "jpeg";

export type Export6kPlan = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  /** Factor lineal de reescala local (1 = se entrega tal cual). */
  scale: number;
  needsResize: boolean;
  alreadyAtLeast6k: boolean;
};

export function planExport6k(width: number, height: number, longSide = EXPORT_6K_LONG_SIDE): Export6kPlan {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const sourceLong = Math.max(w, h);
  const alreadyAtLeast6k = sourceLong >= longSide;
  const scale = alreadyAtLeast6k ? 1 : longSide / sourceLong;
  const targetWidth = alreadyAtLeast6k ? w : Math.max(1, Math.round(w * scale));
  const targetHeight = alreadyAtLeast6k ? h : Math.max(1, Math.round(h * scale));
  return {
    sourceWidth: w,
    sourceHeight: h,
    targetWidth,
    targetHeight,
    scale,
    needsResize: !alreadyAtLeast6k && (targetWidth !== w || targetHeight !== h),
    alreadyAtLeast6k,
  };
}

export function coerceExport6kFormat(value: unknown): Export6kFormat {
  return value === "jpeg" || value === "jpg" ? "jpeg" : "png";
}
