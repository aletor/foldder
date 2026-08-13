/**
 * Posicionamiento de la microbarra (coordenadas de stage / cliente del preview).
 */
import type { PageRect } from "./site-creator-coordinate-space";

export function intersectionArea(a: PageRect, b: PageRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

export type MicrobarPlacementResult = {
  left: number;
  top: number;
  barRect: PageRect;
  outsideFrame: boolean;
};

/**
 * Elige una posición que no intersecte la selección.
 * En viewport estrecho prefiere fuera del frame (arriba del stage).
 */
export function resolveMicrobarPlacement(args: {
  selectionStageRect: PageRect;
  barWidth: number;
  barHeight: number;
  stageWidth: number;
  stageHeight: number;
  /** Contenido relevante a no cubrir (título, botón, etc.) en coords stage. */
  avoidRects?: PageRect[];
  /** Ancho de stage por debajo del cual se prefiere fuera del frame. */
  narrowStageWidth?: number;
}): MicrobarPlacementResult {
  const gap = 6;
  const {
    selectionStageRect: sel,
    barWidth,
    barHeight,
    stageWidth,
    stageHeight,
    avoidRects = [],
  } = args;
  const narrow = stageWidth <= (args.narrowStageWidth ?? 420);

  const candidates: Array<{ left: number; top: number; outsideFrame: boolean; score: number }> = [];

  const push = (left: number, top: number, outsideFrame: boolean, baseScore: number) => {
    const barRect: PageRect = { x: left, y: top, width: barWidth, height: barHeight };
    if (intersectionArea(barRect, sel) > 0) return;
    let score = baseScore;
    for (const avoid of avoidRects) {
      if (intersectionArea(barRect, avoid) > 0) score -= 50;
    }
    // Preferir dentro del área visible ampliada (permite top negativo = fuera del frame)
    if (top + barHeight < -4 || top > stageHeight + 4) score -= 20;
    if (left < -barWidth || left > stageWidth) score -= 20;
    candidates.push({ left, top, outsideFrame, score });
  };

  // Fuera del frame (arriba del stage) — prioritario en estrecho
  push(Math.max(4, Math.min(sel.x, stageWidth - barWidth - 4)), -barHeight - gap, true, narrow ? 100 : 40);
  // Debajo del frame
  push(Math.max(4, Math.min(sel.x, stageWidth - barWidth - 4)), stageHeight + gap, true, narrow ? 80 : 30);

  // Arriba de la selección (dentro del stage)
  push(sel.x, sel.y - barHeight - gap, false, 70);
  // Debajo de la selección
  push(sel.x, sel.y + sel.height + gap, false, 65);
  // Izquierda / derecha de la selección
  push(sel.x - barWidth - gap, sel.y, false, 55);
  push(sel.x + sel.width + gap, sel.y, false, 55);
  // Esquinas del stage lejos del centro de selección
  push(4, 4, false, 25);
  push(Math.max(4, stageWidth - barWidth - 4), 4, false, 25);

  // Clamp suave horizontal para candidatos dentro/fuera
  const normalized = candidates.map((c) => {
    let left = c.left;
    if (!c.outsideFrame) {
      left = Math.max(4, Math.min(left, stageWidth - barWidth - 4));
    } else {
      left = Math.max(4, Math.min(left, Math.max(4, stageWidth - barWidth - 4)));
    }
    return { ...c, left };
  });

  // Re-filtrar tras clamp
  const viable = normalized.filter((c) => {
    const barRect: PageRect = { x: c.left, y: c.top, width: barWidth, height: barHeight };
    return intersectionArea(barRect, sel) === 0;
  });

  viable.sort((a, b) => b.score - a.score);
  const best = viable[0] ?? {
    left: Math.max(4, Math.min(sel.x, stageWidth - barWidth - 4)),
    top: -barHeight - gap,
    outsideFrame: true,
    score: 0,
  };

  return {
    left: best.left,
    top: best.top,
    outsideFrame: best.outsideFrame,
    barRect: { x: best.left, y: best.top, width: barWidth, height: barHeight },
  };
}
