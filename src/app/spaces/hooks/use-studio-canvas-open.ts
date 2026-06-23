"use client";

import { useEffect, useState } from "react";

const STUDIO_CANVAS_SELECTOR = "[data-foldder-studio-canvas]";

function isStudioCanvasOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector(STUDIO_CANVAS_SELECTOR));
}

function mutationMayAffectStudioOpen(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    if (m.type === "attributes") {
      const el = m.target;
      if (el instanceof Element) {
        if (el.matches(STUDIO_CANVAS_SELECTOR) || el.closest(STUDIO_CANVAS_SELECTOR)) {
          return true;
        }
      }
      continue;
    }
    if (m.type !== "childList") continue;
    for (const n of m.addedNodes) {
      if (n instanceof Element) {
        if (n.matches(STUDIO_CANVAS_SELECTOR) || n.querySelector(STUDIO_CANVAS_SELECTOR)) {
          return true;
        }
      }
    }
    for (const n of m.removedNodes) {
      if (n instanceof Element) {
        if (n.matches(STUDIO_CANVAS_SELECTOR) || n.querySelector(STUDIO_CANVAS_SELECTOR)) {
          return true;
        }
      }
    }
  }
  return false;
}

/** True while PhotoRoom / Designer full-screen studio is mounted. */
export function useStudioCanvasOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let rafId = 0;

    const sync = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const next = isStudioCanvasOpen();
        setOpen((prev) => (prev === next ? prev : next));
      });
    };

    sync();

    const obs = new MutationObserver((mutations) => {
      if (!mutationMayAffectStudioOpen(mutations)) return;
      sync();
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-foldder-studio-canvas"],
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, []);

  return open;
}
