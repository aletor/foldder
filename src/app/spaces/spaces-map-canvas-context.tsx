"use client";

import { createContext, useContext } from "react";
import type { SpaceMapEntryLike } from "./space-portal-loop-link";

export type SpacesMapCanvasContextValue = Record<string, SpaceMapEntryLike | undefined>;

export const SpacesMapCanvasContext = createContext<SpacesMapCanvasContextValue>({});

export function useSpacesMapCanvas(): SpacesMapCanvasContextValue {
  return useContext(SpacesMapCanvasContext);
}
