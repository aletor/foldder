import { validateBlueprintOwnership } from "./site-blueprint-ownership";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";

export type SiteBlueprintValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
};

export type SiteBlueprintValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: SiteBlueprintValidationIssue[] };

export function validateSiteBlueprintTree(
  blueprint: SiteBlueprintV1,
  selectionIndex?: SiteCreatorSelectionIndex,
): SiteBlueprintValidationResult {
  const issues: SiteBlueprintValidationIssue[] = [];
  const nodes = blueprint.nodes ?? {};
  const rootChildIds = blueprint.rootChildIds ?? [];

  if (new Set(rootChildIds).size !== rootChildIds.length) {
    issues.push({ code: "duplicate_root", message: "rootChildIds contiene duplicados." });
  }

  for (const [key, node] of Object.entries(nodes)) {
    if (node.id !== key) {
      issues.push({
        code: "id_mismatch",
        message: `La clave del record (${key}) no coincide con node.id (${node.id}).`,
        nodeId: node.id,
      });
    }
    if (new Set(node.childIds).size !== node.childIds.length) {
      issues.push({
        code: "duplicate_children",
        message: "childIds contiene duplicados.",
        nodeId: node.id,
      });
    }
  }

  for (const rootId of rootChildIds) {
    if (!nodes[rootId]) {
      issues.push({
        code: "missing_root_child",
        message: `rootChildIds referencia un nodo inexistente: ${rootId}.`,
        nodeId: rootId,
      });
    }
  }

  for (const node of Object.values(nodes)) {
    if (node.parentId != null && !nodes[node.parentId]) {
      issues.push({
        code: "missing_parent",
        message: `parentId inexistente: ${node.parentId}.`,
        nodeId: node.id,
      });
    }
    for (const childId of node.childIds) {
      const child = nodes[childId];
      if (!child) {
        issues.push({
          code: "missing_child",
          message: `childId inexistente: ${childId}.`,
          nodeId: node.id,
        });
        continue;
      }
      if (child.parentId !== node.id) {
        issues.push({
          code: "parent_child_mismatch",
          message: `El hijo ${childId} no apunta al padre ${node.id}.`,
          nodeId: node.id,
        });
      }
    }
    if (node.parentId != null) {
      const parent = nodes[node.parentId];
      if (parent && !parent.childIds.includes(node.id) && !rootChildIds.includes(node.id)) {
        // parent exists but doesn't list child — unless it's also a root (invalid)
        if (!parent.childIds.includes(node.id)) {
          issues.push({
            code: "parent_child_mismatch",
            message: `El padre ${node.parentId} no lista al hijo ${node.id}.`,
            nodeId: node.id,
          });
        }
      }
    } else if (!rootChildIds.includes(node.id) && Object.keys(nodes).length > 0) {
      // orphan roots not in rootChildIds checked later via reachability
    }

    if (node.kind === "section") {
      const sectionParentId = (node as { parentId: string | null }).parentId;
      if (sectionParentId !== null) {
        issues.push({
          code: "section_parent",
          message: "Una Section debe tener parentId null.",
          nodeId: node.id,
        });
        issues.push({
          code: "nested_section",
          message: "No se pueden anidar Sections.",
          nodeId: node.id,
        });
      }
    }

    if (isSiteButtonNode(node)) {
      for (const childId of node.childIds) {
        const child = nodes[childId];
        if (child && isSiteButtonNode(child)) {
          issues.push({
            code: "button_in_button",
            message: "Un Button no puede contener otro Button.",
            nodeId: node.id,
          });
        }
        if (child && isSiteSectionNode(child)) {
          issues.push({
            code: "section_in_button",
            message: "Un Button no puede contener una Section.",
            nodeId: node.id,
          });
        }
      }
    }
  }

  // Cycles + reachability
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visiting.has(id)) {
      issues.push({ code: "cycle", message: `Ciclo detectado en ${id}.`, nodeId: id });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = nodes[id];
    if (node) {
      for (const childId of node.childIds) walk(childId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const rootId of rootChildIds) walk(rootId);

  for (const id of Object.keys(nodes)) {
    if (!visited.has(id)) {
      issues.push({
        code: "unreachable",
        message: `Nodo inaccesible desde rootChildIds: ${id}.`,
        nodeId: id,
      });
    }
  }

  const ownership = validateBlueprintOwnership(blueprint, selectionIndex);
  if (!ownership.ok) {
    issues.push({
      code: ownership.duplicateLayerIds ? "duplicate_layer" : "ownership",
      message: ownership.message,
    });
  }

  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

export function assertValidBlueprint(
  blueprint: SiteBlueprintV1,
  selectionIndex?: SiteCreatorSelectionIndex,
): SiteBlueprintV1 {
  const result = validateSiteBlueprintTree(blueprint, selectionIndex);
  if (!result.ok) {
    throw new Error(result.issues.map((i) => i.message).join(" "));
  }
  return blueprint;
}

export function cloneBlueprint(blueprint: SiteBlueprintV1): SiteBlueprintV1 {
  const next: SiteBlueprintV1 = {
    schemaVersion: blueprint.schemaVersion,
    rootChildIds: [...blueprint.rootChildIds],
    nodes: Object.fromEntries(
      Object.entries(blueprint.nodes).map(([id, node]) => [id, cloneNode(node)]),
    ),
  };
  if (blueprint.responsive) {
    next.responsive = {
      version: 1,
      rules: blueprint.responsive.rules.map((rule) => ({
        target: { ...rule.target },
        byBand: { ...rule.byBand },
      })),
    };
  }
  return next;
}

function cloneNode(node: SiteBlueprintNode): SiteBlueprintNode {
  const base = {
    ...node,
    childIds: [...node.childIds],
    layerIds: [...node.layerIds],
  };
  if (node.kind === "component") {
    return { ...base, kind: "component", componentType: node.componentType, config: { ...node.config } };
  }
  if (node.kind === "section") {
    return {
      ...base,
      kind: "section",
      sectionType: node.sectionType,
      parentId: null,
      sourceRange: { ...node.sourceRange },
    };
  }
  return { ...base, kind: "layoutGroup" };
}
