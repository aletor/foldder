"use client";

import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react";

const PANEL_WIDTH = 288;
const VIEWPORT_PAD = 16;
const GAP = 10;

export function useGenomaDepthPopoverPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  panelRef?: RefObject<HTMLElement | null>,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const measuredHeight = panelRef?.current?.scrollHeight ?? 0;
    const maxHeight = Math.min(Math.max(measuredHeight, 180), window.innerHeight - VIEWPORT_PAD * 2);
    let top = rect.top - maxHeight - GAP;
    let left = rect.right - PANEL_WIDTH;

    if (top < VIEWPORT_PAD) {
      top = rect.bottom + GAP;
    }
    if (top + maxHeight > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD - maxHeight);
    }

    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_PAD));

    setStyle({
      position: "fixed",
      top,
      left,
      width: PANEL_WIDTH,
      maxHeight,
      zIndex: 10050,
    });
  }, [anchorRef, panelRef]);

  useEffect(() => {
    if (!open) return;
    update();
    const panel = panelRef?.current;
    const observer =
      panel && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => update())
        : null;
    if (observer && panel) {
      observer.observe(panel);
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update, panelRef]);

  return style;
}
