"use client";

import { useCallback, useRef, useState } from "react";
import type { DevelopSettings } from "./lightroom-develop-settings";
import type { LightroomDevelopDocument } from "./lightroom-mask-types";
import { patchDevelopSettings } from "./lightroom-develop-settings";

const MAX_HISTORY = 40;

export type DevelopHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  push: (doc: LightroomDevelopDocument) => void;
  reset: (doc: LightroomDevelopDocument) => void;
};

export function useDevelopHistory(
  current: LightroomDevelopDocument,
  onApply: (doc: LightroomDevelopDocument) => void,
): DevelopHistoryState {
  const pastRef = useRef<LightroomDevelopDocument[]>([]);
  const futureRef = useRef<LightroomDevelopDocument[]>([]);
  const [, tick] = useState(0);
  const bump = () => tick((t) => t + 1);

  const clone = (doc: LightroomDevelopDocument) => structuredClone(doc);

  const reset = useCallback((_doc: LightroomDevelopDocument) => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  const push = useCallback(
    (doc: LightroomDevelopDocument) => {
      pastRef.current.push(clone(current));
      if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
      futureRef.current = [];
      onApply(doc);
      bump();
    },
    [current, onApply],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(clone(current));
    onApply(prev);
    bump();
  }, [current, onApply]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(clone(current));
    onApply(next);
    bump();
  }, [current, onApply]);

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undo,
    redo,
    push,
    reset,
  };
}

/** Empaqueta patch de ajustes globales. */
export function patchGlobalSettings(
  current: DevelopSettings,
  patch: Parameters<typeof patchDevelopSettings>[1],
  doc: LightroomDevelopDocument,
): LightroomDevelopDocument {
  return { ...doc, global: patchDevelopSettings(current, patch) };
}
