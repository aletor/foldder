/**
 * Apilar: conserva gutters y padding del diseño al colapsar en columna.
 */
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";

export type StackInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const ZERO_INSETS: StackInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/** Padding del contenedor/superficie respecto a la unión del contenido (espacio Original). */
export function designedStackInsets(parent: PageRect, content: PageRect): StackInsets {
  return {
    left: Math.max(0, content.x - parent.x),
    right: Math.max(0, parent.x + parent.width - (content.x + content.width)),
    top: Math.max(0, content.y - parent.y),
    bottom: Math.max(0, parent.y + parent.height - (content.y + content.height)),
  };
}

export function scaleStackInsets(insets: StackInsets, scale: number): StackInsets {
  if (!Number.isFinite(scale) || scale <= 0) return { ...insets };
  return {
    left: insets.left * scale,
    right: insets.right * scale,
    top: insets.top * scale,
    bottom: insets.bottom * scale,
  };
}

/** Escala uniforme para apilar un bloque de unidades dentro de `contentWidth`. */
export function stackLayoutScale(origin: PageRect | null, contentWidth: number): number {
  if (!origin) return 1;
  return Math.min(1, contentWidth / Math.max(1, origin.width));
}

/**
 * Hueco vertical entre dos unidades apiladas.
 * Prioriza gutter vertical del diseño; si comparten fila, usa el horizontal; si no, fallback editorial.
 */
export function preservedStackGapPx(
  prev: PageRect,
  next: PageRect,
  layoutScale: number,
  fallbackGap: number,
): number {
  const vertical = (next.y - (prev.y + prev.height)) * layoutScale;
  const horizontal = (next.x - (prev.x + prev.width)) * layoutScale;
  const designed = vertical > 0.5 ? vertical : horizontal > 0.5 ? horizontal : 0;
  if (designed > 0.5) return Math.max(designed, fallbackGap);
  return fallbackGap;
}

export function preservedStackGaps(
  units: Array<{ bounds: PageRect }>,
  layoutScale: number,
  fallbackGap: number,
): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < units.length - 1; i++) {
    gaps.push(
      preservedStackGapPx(units[i]!.bounds, units[i + 1]!.bounds, layoutScale, fallbackGap),
    );
  }
  return gaps;
}

export type MeasuredStackColumn = {
  width: number;
  height: number;
  scales: number[];
  gaps: number[];
  origin: PageRect | null;
  layoutScale: number;
  /** Insets ya escalados al display (padding del contenedor). */
  insets: StackInsets;
  /** Marco interior relativo al ancho de contenido (x desde el borde izquierdo). */
  inner: { x: number; width: number };
};

/**
 * Mide la columna apilada.
 * Si hay `parentBounds` (fondo/superficie), el padding Original se conserva:
 * el padre llena `contentWidth` y el contenido se escala al hueco interior.
 */
export function measureStackColumn(args: {
  units: Array<{ bounds: PageRect }>;
  contentWidth: number;
  fallbackGap: number;
  parentBounds?: PageRect | null;
}): MeasuredStackColumn {
  const origin = unionPageRects(args.units.map((u) => u.bounds));
  if (!origin) {
    return {
      width: args.contentWidth,
      height: 0,
      scales: [],
      gaps: [],
      origin: null,
      layoutScale: 1,
      insets: { ...ZERO_INSETS },
      inner: { x: 0, width: args.contentWidth },
    };
  }

  const parent =
    args.parentBounds && args.parentBounds.width > 1 ? args.parentBounds : null;
  const parentScale = parent
    ? args.contentWidth / Math.max(1, parent.width)
    : args.contentWidth / Math.max(1, origin.width);
  const insets = parent
    ? scaleStackInsets(designedStackInsets(parent, origin), parentScale)
    : { ...ZERO_INSETS };
  const innerWidth = Math.max(1, args.contentWidth - insets.left - insets.right);
  const layoutScale = innerWidth / Math.max(1, origin.width);
  const scales = args.units.map(() => layoutScale);
  const gaps = preservedStackGaps(args.units, layoutScale, args.fallbackGap);

  let contentH = 0;
  for (let i = 0; i < args.units.length; i++) {
    contentH += args.units[i]!.bounds.height * layoutScale;
    if (i > 0) contentH += gaps[i - 1]!;
  }

  return {
    width: args.contentWidth,
    height: insets.top + contentH + insets.bottom,
    scales,
    gaps,
    origin,
    layoutScale,
    insets,
    inner: { x: insets.left, width: innerWidth },
  };
}

export function stackColumnX(
  _unitBounds: PageRect,
  _origin: PageRect | null,
  _layoutScale: number,
  targetX: number,
  targetWidth: number,
  unitWidth: number,
): number {
  return targetX + (targetWidth - unitWidth) / 2;
}
