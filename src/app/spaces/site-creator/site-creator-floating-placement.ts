/**
 * Posicionamiento de UI flotante en coordenadas client (position: fixed).
 * Un solo sistema: getBoundingClientRect → left/top. Sin previewZoom extra.
 */
import type { PageRect } from "./site-creator-coordinate-space";
import { intersectionArea } from "./site-creator-microbar-placement";

export type FloatingEditorPlacementResult = {
  left: number;
  top: number;
  rect: PageRect;
  candidate:
    | "near-above"
    | "near-below"
    | "near-right"
    | "near-left"
    | "frame-right"
    | "frame-left"
    | "frame-above"
    | "frame-below"
    | "fallback";
  outsideFrame: boolean;
  /** Distancia al ancla (px client). */
  distanceToAnchor: number;
};

function containsFully(outer: PageRect, inner: PageRect, pad = 0): boolean {
  return (
    inner.x >= outer.x - pad &&
    inner.y >= outer.y - pad &&
    inner.x + inner.width <= outer.x + outer.width + pad &&
    inner.y + inner.height <= outer.y + outer.height + pad
  );
}

function distToRect(px: number, py: number, r: PageRect): number {
  const cx = Math.min(Math.max(px, r.x), r.x + r.width);
  const cy = Math.min(Math.max(py, r.y), r.y + r.height);
  return Math.hypot(px - cx, py - cy);
}

/**
 * Microbarra / popover en client coords.
 * Preferencia: 8–12 px del ancla (selección o botón).
 */
export function resolveFloatingEditorPlacement(args: {
  anchorRect: PageRect;
  floatingSize: { width: number; height: number };
  selectionRect: PageRect;
  relevantContentRects?: PageRect[];
  pageFrameRect: PageRect;
  studioViewportRect: PageRect;
  preferNearRect?: PageRect | null;
  /** Evitar explícitamente (microbarra al colocar popover). */
  avoidRects?: PageRect[];
  headerRect?: PageRect | null;
  footerRect?: PageRect | null;
  /** Gap preferido al ancla (default 10). */
  gap?: number;
}): FloatingEditorPlacementResult {
  const gap = args.gap ?? 10;
  const {
    floatingSize: size,
    selectionRect: sel,
    pageFrameRect: frame,
    studioViewportRect: studio,
  } = args;
  const content = args.relevantContentRects ?? [];
  const avoid = [...(args.avoidRects ?? [])];
  if (args.headerRect) avoid.push(args.headerRect);
  if (args.footerRect) avoid.push(args.footerRect);
  const prefer = args.preferNearRect ?? args.anchorRect;

  type Cand = {
    left: number;
    top: number;
    candidate: FloatingEditorPlacementResult["candidate"];
    outsideFrame: boolean;
    score: number;
  };

  const candidates: Cand[] = [];

  const push = (
    left: number,
    top: number,
    candidate: FloatingEditorPlacementResult["candidate"],
    outsideFrame: boolean,
    base: number,
  ) => {
    const rect: PageRect = { x: left, y: top, width: size.width, height: size.height };
    if (!containsFully(studio, rect, 2)) return;
    if (intersectionArea(rect, sel) > 0) return;
    for (const a of avoid) {
      if (intersectionArea(rect, a) > 0) return;
    }

    let score = base;
    if (!outsideFrame) score -= 15;
    for (const c of content) {
      const hit = intersectionArea(rect, c);
      if (hit > 0) score -= Math.min(60, 15 + hit / 300);
    }
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const d = distToRect(cx, cy, prefer);
    // Preferir 8–12 px del ancla; penalizar distancias grandes.
    if (d <= 14) score += 40;
    else score -= Math.min(120, d / 3);

    candidates.push({ left, top, candidate, outsideFrame, score });
  };

  const ax = prefer.x;
  const ay = prefer.y;
  const aw = prefer.width;
  const ah = prefer.height;

  // Cerca del ancla (prioridad)
  push(ax, ay - size.height - gap, "near-above", false, 120);
  push(ax, ay + ah + gap, "near-below", false, 115);
  push(ax + aw + gap, ay, "near-right", false, 110);
  push(ax - size.width - gap, ay, "near-left", false, 105);

  // Clamp horizontal cerca del ancla
  const clampX = (x: number) =>
    Math.max(studio.x + 4, Math.min(x, studio.x + studio.width - size.width - 4));
  push(clampX(ax), ay - size.height - gap, "near-above", false, 118);
  push(clampX(ax), ay + ah + gap, "near-below", false, 113);

  // Exterior del frame (solo si ancla cerca del borde)
  push(
    frame.x + frame.width + gap,
    Math.min(Math.max(studio.y + 4, ay), studio.y + studio.height - size.height - 4),
    "frame-right",
    true,
    70,
  );
  push(
    frame.x - size.width - gap,
    Math.min(Math.max(studio.y + 4, ay), studio.y + studio.height - size.height - 4),
    "frame-left",
    true,
    65,
  );
  push(
    clampX(ax),
    frame.y - size.height - gap,
    "frame-above",
    true,
    60,
  );
  push(
    clampX(ax),
    frame.y + frame.height + gap,
    "frame-below",
    true,
    55,
  );

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best) {
    const rect = { x: best.left, y: best.top, width: size.width, height: size.height };
    return {
      left: best.left,
      top: best.top,
      rect,
      candidate: best.candidate,
      outsideFrame: best.outsideFrame,
      distanceToAnchor: distToRect(rect.x + rect.width / 2, rect.y + rect.height / 2, prefer),
    };
  }

  const left = Math.max(studio.x + 4, Math.min(ax, studio.x + studio.width - size.width - 4));
  const top = Math.max(studio.y + 4, Math.min(ay - size.height - gap, studio.y + studio.height - size.height - 4));
  const rect = { x: left, y: top, width: size.width, height: size.height };
  return {
    left,
    top,
    rect,
    candidate: "fallback",
    outsideFrame: true,
    distanceToAnchor: distToRect(rect.x + rect.width / 2, rect.y + rect.height / 2, prefer),
  };
}

/**
 * Popover anclado al botón Adaptación (client rect del trigger).
 */
export function resolveAdaptationPopoverPlacement(args: {
  triggerRect: PageRect;
  microbarRect: PageRect;
  selectionRect: PageRect;
  studioViewportRect: PageRect;
  popoverSize?: { width: number; height: number };
  headerRect?: PageRect | null;
  footerRect?: PageRect | null;
}): FloatingEditorPlacementResult {
  const size = args.popoverSize ?? { width: 240, height: 148 };
  const gap = 8;
  const studio = args.studioViewportRect;
  const trigger = args.triggerRect;
  const avoid = [args.microbarRect, args.selectionRect];
  if (args.headerRect) avoid.push(args.headerRect);
  if (args.footerRect) avoid.push(args.footerRect);

  const order: Array<{
    left: number;
    top: number;
    candidate: FloatingEditorPlacementResult["candidate"];
  }> = [
    { left: trigger.x, top: trigger.y - size.height - gap, candidate: "near-above" },
    { left: trigger.x, top: trigger.y + trigger.height + gap, candidate: "near-below" },
    { left: trigger.x + trigger.width + gap, top: trigger.y, candidate: "near-right" },
    { left: trigger.x - size.width - gap, top: trigger.y, candidate: "near-left" },
  ];

  for (const c of order) {
    const left = Math.max(studio.x + 4, Math.min(c.left, studio.x + studio.width - size.width - 4));
    const top = Math.max(studio.y + 4, Math.min(c.top, studio.y + studio.height - size.height - 4));
    const rect = { x: left, y: top, width: size.width, height: size.height };
    if (!containsFully(studio, rect, 2)) continue;
    if (avoid.some((a) => intersectionArea(rect, a) > 0)) continue;
    return {
      left,
      top,
      rect,
      candidate: c.candidate,
      outsideFrame: false,
      distanceToAnchor: distToRect(rect.x + rect.width / 2, rect.y + rect.height / 2, trigger),
    };
  }

  // Mejor libre: encima de microbarra con clamp
  const left = Math.max(
    studio.x + 4,
    Math.min(args.microbarRect.x, studio.x + studio.width - size.width - 4),
  );
  const top = Math.max(studio.y + 4, args.microbarRect.y - size.height - gap);
  const rect = { x: left, y: top, width: size.width, height: size.height };
  return {
    left,
    top,
    rect,
    candidate: "fallback",
    outsideFrame: false,
    distanceToAnchor: distToRect(rect.x + rect.width / 2, rect.y + rect.height / 2, trigger),
  };
}
