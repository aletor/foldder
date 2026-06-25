"use client";

import { materializeProjectSpacesMediaForSave } from "../project-media-s3-save";
import { normalizeFlowForSave } from "../flow/flow-graph";
import { addFlowToLibrary, type InspirationLibraryItem } from "./inspiration-library-api";

type FlowNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: unknown;
  parentId?: string;
  [key: string]: unknown;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
};

/**
 * Guarda un flujo (subgrafo de nodos + aristas) en la librería de Inspiración del usuario.
 *
 * 1) Normaliza posiciones al origen y limpia campos efímeros de UI.
 * 2) Materializa la media embebida (data URLs) a S3 para que el flujo sea portable entre proyectos.
 * 3) Persiste nodos + aristas vía la API de librería (kind = "flow").
 */
export async function saveFlowToInspiration(args: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  title: string;
  projectId: string | null;
}): Promise<InspirationLibraryItem> {
  const normalized = normalizeFlowForSave(args.nodes, args.edges);
  const cloned = JSON.parse(JSON.stringify(normalized)) as { nodes: FlowNode[]; edges: FlowEdge[] };

  const { spaces: materialized } = await materializeProjectSpacesMediaForSave(cloned, {
    cache: new Map(),
    projectId: args.projectId,
  });

  return addFlowToLibrary({
    title: args.title,
    flow: { nodes: materialized.nodes, edges: materialized.edges },
  });
}
