"use client";

import { createContext, useContext } from "react";
import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";

export type DatasetCanvasContextValue = {
  projectScopeId: string;
  assetsMetadata?: unknown;
  onAssetsMetadataChange?: (next: ProjectAssetsMetadata) => void;
  openProjectBrain?: () => void;
};

export const DatasetCanvasContext = createContext<DatasetCanvasContextValue>({
  projectScopeId: "__local__",
});

export function useDatasetCanvasContext(): DatasetCanvasContextValue {
  return useContext(DatasetCanvasContext);
}
