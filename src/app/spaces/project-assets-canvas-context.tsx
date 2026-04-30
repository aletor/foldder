"use client";

import type { Node } from "@xyflow/react";
import { createContext, useContext } from "react";
import type { ProjectFilesMetadata } from "./project-files";
import type { GuionistaGeneratedTextAssetsMetadata, GuionistaTextAsset } from "./guionista-types";

export type ProjectAssetsCanvasContextValue = {
  /** Nodos del grafo actual (para inventario multimedia en la tarjeta). */
  flowNodes: Node[];
  assetsMetadata: unknown;
  projectFiles?: ProjectFilesMetadata;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
  /** Aislamiento por proyecto para evitar mezclar assets/caché entre proyectos. */
  projectScopeId: string;
  openProjectAssets: () => void;
  saveGuionistaTextAsset?: (asset: GuionistaTextAsset) => void;
  openGuionistaTextAsset?: (assetId: string) => void;
};

export const ProjectAssetsCanvasContext = createContext<ProjectAssetsCanvasContextValue | null>(null);

export function useProjectAssetsCanvas(): ProjectAssetsCanvasContextValue | null {
  return useContext(ProjectAssetsCanvasContext);
}
