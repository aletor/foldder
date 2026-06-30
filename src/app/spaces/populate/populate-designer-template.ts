import type { Edge, Node } from "@xyflow/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import {
  extractDesignerDynamicFields,
  type DesignerDynamicField,
} from "@/app/spaces/loop/loop-designer-fields";
import { isNodeCloneTemplateType } from "@/app/spaces/loop/loop-designer-template";
import { POPULATE_MAX_TEMPLATES } from "./populate-types";
import { findPopulateTemplateLinkEdges } from "./populate-template-link";

export interface PopulateDesignerTemplateConfig {
  templateNodeId: string;
  templateType: string;
  templateLabel: string;
  pages: DesignerPageState[];
  dynamicFields: DesignerDynamicField[];
}

function configFromLinkEdge(
  linkEdge: Edge,
  nodes: Node[],
): PopulateDesignerTemplateConfig | null {
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

/** Todas las plantillas Designer enlazadas (máx. 8). */
export function listPopulateDesignerTemplateConfigs(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
): PopulateDesignerTemplateConfig[] {
  return findPopulateTemplateLinkEdges(populateId, nodes, edges)
    .slice(0, POPULATE_MAX_TEMPLATES)
    .map((edge) => configFromLinkEdge(edge, nodes))
    .filter((c): c is PopulateDesignerTemplateConfig => c != null);
}

/** Primera plantilla enlazada (compat). */
export function resolvePopulateDesignerTemplateConfig(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
): PopulateDesignerTemplateConfig | null {
  return listPopulateDesignerTemplateConfigs(populateId, nodes, edges)[0] ?? null;
}
