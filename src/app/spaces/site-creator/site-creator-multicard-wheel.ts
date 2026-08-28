/**
 * Decisión de rueda MultiCard vs scroll de sección.
 * scrollV consume mientras quede recorrido; al límite encadena.
 * scrollH: vertical pasa a la sección; horizontal / Shift+rueda las consume el MultiCard.
 */
import { pointInPageRect, type PagePoint } from "./site-creator-coordinate-space";
import type { MultiCardContainerLayout } from "./site-creator-multicard-layout";
import { clampMultiCardScrollIndex } from "./site-creator-multicard-layout";

export type MultiCardWheelGesture = {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
};

export function multiCardWheelAxisDelta(
  axis: "h" | "v",
  gesture: MultiCardWheelGesture,
): number {
  if (axis === "h") {
    if (gesture.shiftKey) return gesture.deltaY || gesture.deltaX;
    if (Math.abs(gesture.deltaX) >= Math.abs(gesture.deltaY)) return gesture.deltaX;
    return 0;
  }
  if (Math.abs(gesture.deltaY) >= Math.abs(gesture.deltaX) && !gesture.shiftKey) return gesture.deltaY;
  return 0;
}

export function multiCardWheelDecision(args: {
  axis: "h" | "v" | null;
  overflow: boolean;
  scrollIndex: number;
  count: number;
  gesture: MultiCardWheelGesture;
}): { action: "take"; nextIndex: number } | { action: "pass" } {
  if (!args.overflow || !args.axis) return { action: "pass" };
  const delta = multiCardWheelAxisDelta(args.axis, args.gesture);
  if (Math.abs(delta) < 4) return { action: "pass" };
  const dir = delta > 0 ? 1 : -1;
  const next = clampMultiCardScrollIndex(args.count, args.scrollIndex + dir);
  if (next === args.scrollIndex) return { action: "pass" };
  return { action: "take", nextIndex: next };
}

export function resolveMultiCardWheelTarget(
  containers: MultiCardContainerLayout[],
  point: PagePoint,
  gesture: MultiCardWheelGesture,
): { nodeId: string; nextIndex: number } | null {
  for (const container of containers) {
    if (!container.overflow || !container.axis) continue;
    if (!pointInPageRect(point, container.clipRect)) continue;
    const decision = multiCardWheelDecision({
      axis: container.axis,
      overflow: container.overflow,
      scrollIndex: container.scrollIndex,
      count: container.count,
      gesture,
    });
    if (decision.action === "take") {
      return { nodeId: container.nodeId, nextIndex: decision.nextIndex };
    }
    return null;
  }
  return null;
}

export function pagePointFromClientRect(
  clientX: number,
  clientY: number,
  pageAnchor: DOMRect,
  pageWidth: number,
  pageHeight: number,
): PagePoint | null {
  if (pageAnchor.width < 1 || pageAnchor.height < 1) return null;
  return {
    x: ((clientX - pageAnchor.left) / pageAnchor.width) * pageWidth,
    y: ((clientY - pageAnchor.top) / pageAnchor.height) * pageHeight,
  };
}
