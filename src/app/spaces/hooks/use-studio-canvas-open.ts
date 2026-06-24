"use client";

import { useEffect, useState } from "react";
import { FOLDDER_STUDIO_BODY_CLASS } from "../studio-node/studio-node-architecture";

const STUDIO_CANVAS_SELECTOR = "[data-foldder-studio-canvas]";
const STUDIO_PANEL_SELECTOR = "[data-foldder-studio-panel]";
const STUDIO_BLOCK_SELECTOR = `${STUDIO_CANVAS_SELECTOR}, ${STUDIO_PANEL_SELECTOR}`;

/** True while a full-screen studio blocks canvas file drops / drag previews. */
export function isFoldderStudioBlockingCanvas(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.classList.contains(FOLDDER_STUDIO_BODY_CLASS)) return true;
  return Boolean(document.querySelector(STUDIO_BLOCK_SELECTOR));
}

export function isPointerOverFoldderStudio(clientX: number, clientY: number): boolean {
  if (typeof document === "undefined") return false;
  const top = document.elementFromPoint(clientX, clientY);
  return Boolean(top instanceof HTMLElement && top.closest(STUDIO_BLOCK_SELECTOR));
}

function isStudioCanvasOpen(): boolean {
  return isFoldderStudioBlockingCanvas();
}

function mutationMayAffectStudioOpen(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    if (m.type === "attributes") {
      const el = m.target;
      if (el instanceof Element) {
        if (el.matches(STUDIO_CANVAS_SELECTOR) || el.closest(STUDIO_CANVAS_SELECTOR)) {
          return true;
        }
        if (el.matches(STUDIO_PANEL_SELECTOR) || el.closest(STUDIO_PANEL_SELECTOR)) {
          return true;
        }
        if (el === document.body && m.attributeName === "class") {
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
        if (n.matches(STUDIO_PANEL_SELECTOR) || n.querySelector(STUDIO_PANEL_SELECTOR)) {
          return true;
        }
      }
    }
    for (const n of m.removedNodes) {
      if (n instanceof Element) {
        if (n.matches(STUDIO_CANVAS_SELECTOR) || n.querySelector(STUDIO_CANVAS_SELECTOR)) {
          return true;
        }
        if (n.matches(STUDIO_PANEL_SELECTOR) || n.querySelector(STUDIO_PANEL_SELECTOR)) {
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
      attributeFilter: ["data-foldder-studio-canvas", "data-foldder-studio-panel", "class"],
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, []);

  return open;
}
