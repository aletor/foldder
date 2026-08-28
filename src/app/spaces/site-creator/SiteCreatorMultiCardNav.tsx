"use client";

import React, { useEffect, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { pagePointFromClientRect, resolveMultiCardWheelTarget } from "./site-creator-multicard-wheel";
import {
  clampMultiCardScrollIndex,
  MULTICARD_SCROLL_DURATION_MS,
  multiCardMaxScrollIndex,
  multiCardNavIsVisible,
  type MultiCardContainerLayout,
} from "./site-creator-multicard-layout";
import { SC_VISUAL } from "./site-creator-visual-tokens";

export function SiteCreatorMultiCardNavOverlay({
  containers,
  pageWidth,
  pageHeight,
  scrollRootRef,
  pageAnchorRef,
  extraScrollRootRef,
  onScrollIndex,
}: {
  containers: MultiCardContainerLayout[];
  pageWidth: number;
  pageHeight: number;
  scrollRootRef: React.RefObject<HTMLElement | null>;
  pageAnchorRef: React.RefObject<HTMLElement | null>;
  extraScrollRootRef?: React.RefObject<HTMLElement | null>;
  onScrollIndex: (nodeId: string, index: number) => void;
}) {
  const containersRef = useRef(containers);
  containersRef.current = containers;
  const onScrollIndexRef = useRef(onScrollIndex);
  onScrollIndexRef.current = onScrollIndex;
  const active = containers.filter((container) => container.overflow && container.axis);

  useEffect(() => {
    const roots = [pageAnchorRef.current, scrollRootRef.current, extraScrollRootRef?.current].filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (roots.length === 0) return;
    let lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey) return;
      const pageAnchor = pageAnchorRef.current;
      if (!pageAnchor) return;
      const point = pagePointFromClientRect(
        event.clientX,
        event.clientY,
        pageAnchor.getBoundingClientRect(),
        pageWidth,
        pageHeight,
      );
      if (!point) return;
      const target = resolveMultiCardWheelTarget(containersRef.current, point, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
      });
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now < lockedUntil) return;
      lockedUntil = now + MULTICARD_SCROLL_DURATION_MS;
      onScrollIndexRef.current(target.nodeId, target.nextIndex);
    };
    for (const root of roots) root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      for (const root of roots) root.removeEventListener("wheel", onWheel);
    };
  }, [extraScrollRootRef, pageAnchorRef, pageHeight, pageWidth, scrollRootRef]);

  if (active.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[8]"
      data-testid="site-creator-multicard-nav-layer"
    >
      {active.map((container) => (
        <MultiCardNavChrome
          key={container.nodeId}
          container={container}
          onScrollIndex={onScrollIndex}
        />
      ))}
    </div>
  );
}

function MultiCardNavChrome({
  container,
  onScrollIndex,
}: {
  container: MultiCardContainerLayout;
  onScrollIndex: (nodeId: string, index: number) => void;
}) {
  const { clipRect, axis, count, scrollIndex, nav, visibleCount } = container;
  const visible = multiCardNavIsVisible({ overflow: container.overflow, visibility: nav.visibility });
  if (!visible || !axis) return null;
  const pageIndex = Math.round(scrollIndex);
  const maxScroll = multiCardMaxScrollIndex(count, visibleCount);
  const go = (next: number) => {
    const clamped = clampMultiCardScrollIndex(count, next, visibleCount);
    if (clamped !== pageIndex) onScrollIndex(container.nodeId, clamped);
  };

  return (
    <div
      className="absolute"
      style={{
        left: clipRect.x,
        top: clipRect.y,
        width: clipRect.width,
        height: clipRect.height,
      }}
      data-testid={`site-creator-multicard-nav-${container.nodeId}`}
    >
      {nav.style === "dots" ? (
        <div className="pointer-events-auto absolute bottom-2 left-1/2 z-[9] flex -translate-x-1/2 items-center gap-1">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Card ${i + 1}`}
              aria-current={i === pageIndex}
              data-testid={`site-creator-multicard-dot-${i}`}
              className="h-2 w-2 rounded-full"
              style={{
                background: i === pageIndex ? SC_VISUAL.selection : "rgba(255,255,255,0.45)",
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                go(i);
              }}
            />
          ))}
        </div>
      ) : (
        <>
          <NavArrow
            axis={axis}
            direction={-1}
            disabled={pageIndex <= 0}
            onPress={() => go(pageIndex - 1)}
          />
          <NavArrow
            axis={axis}
            direction={1}
            disabled={pageIndex >= maxScroll}
            onPress={() => go(pageIndex + 1)}
          />
        </>
      )}
    </div>
  );
}

function NavArrow({
  axis,
  direction,
  disabled,
  onPress,
}: {
  axis: "h" | "v";
  direction: -1 | 1;
  disabled: boolean;
  onPress: () => void;
}) {
  const label =
    axis === "h" ? (direction < 0 ? "Anterior" : "Siguiente") : direction < 0 ? "Anterior" : "Siguiente";
  const Icon =
    axis === "h"
      ? direction < 0
        ? ChevronLeft
        : ChevronRight
      : direction < 0
        ? ChevronUp
        : ChevronDown;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={`site-creator-multicard-arrow-${axis}-${direction < 0 ? "prev" : "next"}`}
      className="pointer-events-auto absolute z-[9] flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-[#101820]/80 text-white shadow disabled:opacity-30"
      style={
        axis === "h"
          ? { top: "50%", [direction < 0 ? "left" : "right"]: 6, transform: "translateY(-50%)" }
          : { left: "50%", [direction < 0 ? "top" : "bottom"]: 6, transform: "translateX(-50%)" }
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onPress();
      }}
    >
      <Icon size={14} />
    </button>
  );
}
