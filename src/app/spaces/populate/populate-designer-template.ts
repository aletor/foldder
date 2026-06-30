import type { Edge, Node } from "@xyflow/react";
import { POPULATE_MAX_TEMPLATES } from "./populate-types";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import {
  extractDesignerDynamicFields,
  type DesignerDynamicField,
} from "@/app/spaces/loop/loop-designer-fields";
import { isNodeCloneTemplateType } from "@/app/spaces/loop/loop-designer-template";
import type { SpaceMapEntryLike } from "@/app/spaces/space-portal-loop-link";
import {
  findPopulateSpaceTemplateLinkEdges,
  listPopulateDesignerTemplatesFromSpacePortal,
} from "./populate-space-template";
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

function mergePopulateTemplateConfigs(
  configs: PopulateDesignerTemplateConfig[],
): PopulateDesignerTemplateConfig[] {
  const seen = new Set<string>();
  const unique: PopulateDesignerTemplateConfig[] = [];
  for (const cfg of configs) {
    if (seen.has(cfg.templateNodeId)) continue;
    seen.add(cfg.templateNodeId);
    unique.push(cfg);
  }
  return unique.slice(0, POPULATE_MAX_TEMPLATES);
}

/** Plantillas Designer directas + las resueltas desde Spaces conectados (máx. 8). */
export function listPopulateDesignerTemplateConfigs(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
  spacesMap?: Record<string, SpaceMapEntryLike | undefined>,
): PopulateDesignerTemplateConfig[] {
  const direct = findPopulateTemplateLinkEdges(populateId, nodes, edges)
    .map((edge) => configFromLinkEdge(edge, nodes))
    .filter((c): c is PopulateDesignerTemplateConfig => c != null);

  const fromSpaces: PopulateDesignerTemplateConfig[] = [];
  for (const edge of findPopulateSpaceTemplateLinkEdges(populateId, nodes, edges)) {
    const portal = nodes.find((n) => n.id === edge.source);
    if (!portal || portal.type !== "space") continue;
    fromSpaces.push(...listPopulateDesignerTemplatesFromSpacePortal(portal, spacesMap));
  }

  return mergePopulateTemplateConfigs([...direct, ...fromSpaces]);
}

/** Primera plantilla enlazada (compat). */
export function resolvePopulateDesignerTemplateConfig(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
  spacesMap?: Record<string, SpaceMapEntryLike | undefined>,
): PopulateDesignerTemplateConfig | null {
  return listPopulateDesignerTemplateConfigs(populateId, nodes, edges, spacesMap)[0] ?? null;
}

/**
 * Firma reactiva de las plantillas enlazadas (páginas + campos dinámicos). Populate debe suscribirse
 * vía `useStore` — igual que Loop — para detectar huecos nuevos dentro de clips sin remontar el nodo.
 */
export function populateDesignerTemplatesSignature(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
  spacesMap?: Record<string, SpaceMapEntryLike | undefined>,
): string {
  return listPopulateDesignerTemplateConfigs(populateId, nodes, edges, spacesMap)
    .map((cfg) => {
      return [
        cfg.templateNodeId,
        cfg.pages.length,
        cfg.dynamicFields.map((f) => `${f.key}:${f.status}`).join(","),
      ].join("|");
    })
    .filter(Boolean)
    .join("||");
}
