"use client";

import type { Node } from "@xyflow/react";
import { createContext, useContext } from "react";

export type ProjectAssetsCanvasContextValue = {
  /** Nodos del grafo actual (para inventario multimedia en la tarjeta). */
  flowNodes: Node[];
  assetsMetadata: unknown;
  /** Aislamiento por proyecto para evitar mezclar assets/caché entre proyectos. */
  projectScopeId: string;
  openProjectAssets: () => void;
};

export const ProjectAssetsCanvasContext = createContext<ProjectAssetsCanvasContextValue | null>(null);

export function useProjectAssetsCanvas(): ProjectAssetsCanvasContextValue | null {
  return useContext(ProjectAssetsCanvasContext);
}
