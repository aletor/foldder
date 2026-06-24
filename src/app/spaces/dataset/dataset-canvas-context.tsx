"use client";

import { createContext, useContext } from "react";

export type DatasetCanvasContextValue = {
  projectScopeId: string;
};

export const DatasetCanvasContext = createContext<DatasetCanvasContextValue>({
  projectScopeId: "__local__",
});

export function useDatasetCanvasContext(): DatasetCanvasContextValue {
  return useContext(DatasetCanvasContext);
}
