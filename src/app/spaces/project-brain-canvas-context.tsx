"use client";

import { createContext, useContext } from "react";

export type ProjectBrainCanvasContextValue = {
  assetsMetadata: unknown;
  openProjectBrain: () => void;
};

export const ProjectBrainCanvasContext = createContext<ProjectBrainCanvasContextValue | null>(null);

export function useProjectBrainCanvas(): ProjectBrainCanvasContextValue | null {
  return useContext(ProjectBrainCanvasContext);
}
