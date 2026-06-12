import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CANVAS_BACKGROUNDS,
  CANVAS_BG_COLOR_STORAGE_KEY,
  CANVAS_BG_STORAGE_KEY,
  CANVAS_SOLID_COLOR_BG_ID,
  DEFAULT_CANVAS_SOLID_COLOR,
  isValidCanvasBackgroundId,
  normalizeCanvasSolidColor,
} from "../canvas-backgrounds";

export function useSpacesCanvasBackground() {
  const [canvasBgId, setCanvasBgId] = useState<string>("studio");
  const [canvasBgColor, setCanvasBgColor] = useState<string>(DEFAULT_CANVAS_SOLID_COLOR);
  const [canvasBgMenuOpen, setCanvasBgMenuOpen] = useState(false);
  const canvasBgMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storedId = localStorage.getItem(CANVAS_BG_STORAGE_KEY);
      if (storedId && isValidCanvasBackgroundId(storedId, CANVAS_BACKGROUNDS)) {
        setCanvasBgId(storedId);
      }
      const storedColor = localStorage.getItem(CANVAS_BG_COLOR_STORAGE_KEY);
      if (storedColor) setCanvasBgColor(normalizeCanvasSolidColor(storedColor));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_BG_STORAGE_KEY, canvasBgId);
    } catch {
      /* ignore */
    }
  }, [canvasBgId]);

  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_BG_COLOR_STORAGE_KEY, canvasBgColor);
    } catch {
      /* ignore */
    }
  }, [canvasBgColor]);

  useEffect(() => {
    if (!canvasBgMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof globalThis.Node)) return;
      if (canvasBgMenuRef.current && !canvasBgMenuRef.current.contains(t)) {
        setCanvasBgMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [canvasBgMenuOpen]);

  const selectCanvasSolidColor = (color: string) => {
    setCanvasBgColor(normalizeCanvasSolidColor(color));
    setCanvasBgId(CANVAS_SOLID_COLOR_BG_ID);
  };

  /** Fondo en `CanvasWallpaperTransition`; el lienzo XY Flow va transparente para ver la transición. */
  const reactFlowCanvasStyle = useMemo(
    (): CSSProperties => ({
      backgroundColor: "transparent",
    }),
    [],
  );

  return {
    canvasBgId,
    setCanvasBgId,
    canvasBgColor,
    setCanvasBgColor,
    selectCanvasSolidColor,
    canvasBgMenuOpen,
    setCanvasBgMenuOpen,
    canvasBgMenuRef,
    reactFlowCanvasStyle,
  };
}
