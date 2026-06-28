"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "foldder-canvas-animated-edges";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

/** Preferencia: conexiones con puntos animados (sí) o líneas fijas optimizadas (no). */
export function readCanvasAnimatedEdgesEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* noop */
  }
  return true;
}

export function writeCanvasAnimatedEdgesEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* noop */
  }
  notify();
}

export function subscribeCanvasAnimatedEdgesPreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCanvasAnimatedEdgesEnabledSnapshot(): boolean {
  return readCanvasAnimatedEdgesEnabled();
}

export function useCanvasAnimatedEdgesEnabled(): boolean {
  return useSyncExternalStore(
    subscribeCanvasAnimatedEdgesPreference,
    getCanvasAnimatedEdgesEnabledSnapshot,
    () => true,
  );
}

/** Tests / Strict Mode */
export function resetCanvasAnimatedEdgesPreferenceForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  notify();
}
