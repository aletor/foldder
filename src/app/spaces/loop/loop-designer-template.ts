/**
 * Loop — resolución de una plantilla de tipo `node-clone` (Designer).
 *
 * A diferencia de `resolveTemplateConfig` (Image Creation: prompt + refs de imagen), aquí la
 * plantilla es el documento del Designer y sus campos dinámicos se descubren de los enlaces
 * internos de sus páginas (`_designerDatasetBinding`).
 */

import type { Edge, Node } from "@xyflow/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { getNodeOrchestrationDeclaration } from "./loop-declaration";
import { findLoopTemplateLinkEdge } from "./loop-template-link";
import {
  extractDesignerDynamicFields,
  type DesignerDynamicField,
} from "./loop-designer-fields";

export interface DesignerTemplateConfig {
  templateNodeId: string;
  templateType: string;
  templateLabel: string;
  pages: DesignerPageState[];
  dynamicFields: DesignerDynamicField[];
}

/** ¿El tipo de nodo se orquesta clonándose entero por fila (Designer)? */
export function isNodeCloneTemplateType(nodeType: string | undefined | null): boolean {
  return getNodeOrchestrationDeclaration(nodeType).mode === "node-clone";
}

/**
 * Resuelve la plantilla Designer enlazada a un Loop. Devuelve null si no hay enlace o el nodo
 * enlazado no es de orquestación por clonado.
 */
export function resolveDesignerTemplateConfig(
  loopId: string,
  nodes: Node[],
  edges: Edge[],
): DesignerTemplateConfig | null {
  const linkEdge = findLoopTemplateLinkEdge(loopId, nodes, edges);
  if (!linkEdge) return null;
  const tpl = nodes.find((n) => n.id === linkEdge.source);
  if (!tpl || !isNodeCloneTemplateType(tpl.type)) return null;

  const data = (tpl.data ?? {}) as { label?: string; pages?: DesignerPageState[] };
  const pages = Array.isArray(data.pages) ? data.pages : [];

  return {
    templateNodeId: tpl.id,
    templateType: tpl.type ?? "",
    templateLabel: typeof data.label === "string" && data.label.trim() ? data.label : "Designer",
    pages,
    dynamicFields: extractDesignerDynamicFields(pages),
  };
}
