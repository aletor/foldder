"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "foldder-canvas-animated-edges";

/**
 * Modo de las líneas de conexión del lienzo:
 * - "animated": enrutado inteligente (evita nodos) + puntos animados. Lo más vistoso, mayor coste.
 * - "basic": conector bézier por defecto, sin cálculos de evitación. Buen rendimiento.
 * - "none": sin líneas (no se renderizan). Máximo rendimiento.
 */
export type CanvasEdgeLineMode = "animated" | "basic" | "none";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function readCanvasEdgeLineMode(): CanvasEdgeLineMode {
  if (typeof window === "undefined") return "animated";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "animated" || raw === "basic" || raw === "none") return raw;
    // Compatibilidad con el ajuste booleano anterior ("1" = animadas, "0" = fijas).
    if (raw === "1") return "animated";
    if (raw === "0") return "basic";
  } catch {
    /* noop */
  }
  return "animated";
}

export function writeCanvasEdgeLineMode(mode: CanvasEdgeLineMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* noop */
  }
  notify();
}

export function subscribeCanvasEdgeLinePreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCanvasEdgeLineModeSnapshot(): CanvasEdgeLineMode {
  return readCanvasEdgeLineMode();
}

export function useCanvasEdgeLineMode(): CanvasEdgeLineMode {
  return useSyncExternalStore(
    subscribeCanvasEdgeLinePreference,
    getCanvasEdgeLineModeSnapshot,
    () => "animated",
  );
}

/** Tests / Strict Mode */
export function resetCanvasEdgeLinePreferenceForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  notify();
}

// ── Compatibilidad: API booleana anterior (enabled = líneas animadas) ───────────────
// Se conserva para no romper consumidores/tests existentes. "enabled=false" pasa a "basic".

export function readCanvasAnimatedEdgesEnabled(): boolean {
  return readCanvasEdgeLineMode() === "animated";
}

export function writeCanvasAnimatedEdgesEnabled(enabled: boolean): void {
  writeCanvasEdgeLineMode(enabled ? "animated" : "basic");
}

export function subscribeCanvasAnimatedEdgesPreference(listener: Listener): () => void {
  return subscribeCanvasEdgeLinePreference(listener);
}

export function getCanvasAnimatedEdgesEnabledSnapshot(): boolean {
  return readCanvasAnimatedEdgesEnabled();
}

export function useCanvasAnimatedEdgesEnabled(): boolean {
  return useCanvasEdgeLineMode() === "animated";
}

export function resetCanvasAnimatedEdgesPreferenceForTests(): void {
  resetCanvasEdgeLinePreferenceForTests();
}
