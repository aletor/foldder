"use client";

import { createContext, useContext } from "react";

export type FoldderCanvasIntroContextValue = {
  scheduleFoldderCanvasIntroEnd: (nodeId: string) => void;
  isNodeInCanvasIntro: (nodeId: string) => boolean;
};

export const FoldderCanvasIntroContext = createContext<FoldderCanvasIntroContextValue | null>(null);

export function useFoldderCanvasIntroContext(): FoldderCanvasIntroContextValue {
  const ctx = useContext(FoldderCanvasIntroContext);
  if (!ctx) {
    return {
      scheduleFoldderCanvasIntroEnd: () => {},
      isNodeInCanvasIntro: () => false,
    };
  }
  return ctx;
}
