/**
 * Jerarquía de presentación Site Creator (5D).
 * No modifica Designer; oculta wrappers técnicos (clipping/máscaras).
 */
import type { DesignerPageState } from "../designer/DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import type { DesignerSourceSnapshotV1, SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { PageRect } from "./site-creator-coordinate-space";
import { unionPageRects } from "./site-creator-coordinate-space";
import { worldVisualBoundsForLayer } from "./site-creator-layer-world-bounds";
import {
  buildBlueprintOwnershipIndexWithTree,
  collectSemanticCoverageLayerIds,
  findLayerSemanticOwner,
} from "./site-blueprint-ownership";
import {
  deriveBlueprintNodeDisplayLabel,
  deriveLayerDisplayLabel,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import { looksTechnicalName } from "./site-creator-display-labels";
import {
  collectDesignerGroupIdClusters,
  designerGroupIdClusterLabel,
  designerGroupIdMirrorNodeId,
} from "./site-creator-designer-group-id";
import {
  isDesignerContainerMirrorDismissed,
  isDesignerGroupIdMirrorDismissed,
} from "./site-creator-designer-group-dismiss";

export type SiteCreatorPresentationNode =
  | {
      kind: "semantic";
      id: string;
      nodeId: string;
      label: string;
      childCount: number;
      children: SiteCreatorPresentationNode[];
      unit: SiteCreatorSelectionUnit;
      isContainer: boolean;
    }
  | {
      kind: "layer";
      id: string;
      layerId: string;
      label: string;
      childCount: number;
      children: SiteCreatorPresentationNode[];
      unit: SiteCreatorSelectionUnit;
      isContainer: boolean;
    }
  | {
      kind: "unorganized";
      id: "unorganized";
      label: string;
      childCount: number;
      children: SiteCreatorPresentationNode[];
      unit: null;
      isContainer: true;
    };

export type SiteCreatorPresentationTree = {
  roots: SiteCreatorPresentationNode[];
  /** Bounds presentables por clave de unidad (`node:id` / `layer:id`). */
  boundsByKey: Record<string, PageRect>;
};

function isTechnicalWrapper(obj: FreehandObject | null | undefined, name: string): boolean {
  if (!obj) return false;
  if (obj.type === "clippingContainer") return true;
  if (obj.type === "booleanGroup" && looksTechnicalName(name, obj.type)) return true;
  if (obj.type === "adjustmentLayer") return true;
  return false;
}

function isUsefulDesignerGroup(obj: FreehandObject, name: string): boolean {
  if (obj.type !== "groupContainer") return false;
  if (looksTechnicalName(name, obj.type)) return false;
  return Boolean(name.trim());
}

function presentationLayerLabel(
  layerId: string,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): string {
  const entry = index.byId[layerId];
  if (!entry) return "Elemento";
  if (entry.type === "clippingContainer") {
    // Nunca mostrar wrapper: no debería llegar aquí como fila.
    return "Grupo visual";
  }
  if (entry.type === "groupContainer") {
    if (looksTechnicalName(entry.name, entry.type) || !entry.name.trim() || entry.name === entry.layerId) {
      return "Grupo visual";
    }
    return entry.name.trim();
  }
  return deriveLayerDisplayLabel(layerId, index, snapshot);
}

/** Promote capas útiles bajo un wrapper técnico (clipping, etc.). */
function expandTechnicalLayer(
  layerId: string,
  index: SiteCreatorSelectionIndex,
  owned: Set<string>,
  snapshot: DesignerSourceSnapshotV1 | null,
): SiteCreatorPresentationNode[] {
  const entry = index.byId[layerId];
  if (!entry) return [];
  if (!isTechnicalWrapper(entry.object, entry.name)) {
    if (owned.has(layerId) && entry.type !== "groupContainer") {
      // Capas poseídas por semántica no van en unorganized
    }
    return [
      {
        kind: "layer",
        id: `layer:${layerId}`,
        layerId,
        label: presentationLayerLabel(layerId, index, snapshot),
        childCount: 0,
        children: [],
        unit: { kind: "layer", layerId },
        isContainer: entry.type === "groupContainer",
      },
    ];
  }
  // Hijos Designer (descendants in index)
  const kids = index.entries.filter(
    (e) => e.parentLayerId === layerId || e.ancestorIds[e.ancestorIds.length - 1] === layerId,
  );
  const direct = index.entries.filter((e) => e.parentLayerId === layerId);
  const source = direct.length ? direct : kids.filter((e) => e.ancestorIds.includes(layerId));
  const out: SiteCreatorPresentationNode[] = [];
  const clipMaskId =
    entry.object?.type === "clippingContainer"
      ? (entry.object as { mask?: { id?: string } }).mask?.id
      : undefined;
  for (const child of source) {
    if (child.layerId === layerId) continue;
    if (clipMaskId && child.layerId === clipMaskId) continue;
    if (child.type === "adjustmentLayer") continue;
    if (isTechnicalWrapper(child.object, child.name)) {
      out.push(...expandTechnicalLayer(child.layerId, index, owned, snapshot));
      continue;
    }
    // Solo promover hojas / grupos útiles (no máscaras)
    out.push({
      kind: "layer",
      id: `layer:${child.layerId}`,
      layerId: child.layerId,
      label: presentationLayerLabel(child.layerId, index, snapshot),
      childCount: 0,
      children: [],
      unit: { kind: "layer", layerId: child.layerId },
      isContainer: child.type === "groupContainer" && isUsefulDesignerGroup(child.object, child.name),
    });
  }
  return out;
}

function buildDesignerContainerDirectChildren(
  containerLayerId: string,
  parentBlueprintNodeId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): SiteCreatorPresentationNode[] {
  const directChildren = index.entries
    .filter((e) => e.parentLayerId === containerLayerId && e.visible)
    .sort((a, b) => a.siblingIndex - b.siblingIndex);

  const clusters = collectDesignerGroupIdClusters(index).filter(
    (c) => c.parentLayerId === containerLayerId,
  );
  const memberToCluster = new Map<string, (typeof clusters)[number]>();
  for (const cluster of clusters) {
    for (const id of cluster.memberIds) memberToCluster.set(id, cluster);
  }
  const processedClusters = new Set<string>();
  const parentNode = blueprint.nodes[parentBlueprintNodeId];
  const out: SiteCreatorPresentationNode[] = [];

  for (const child of directChildren) {
    if (!child.selectableFromCanvas && child.type !== "groupContainer") continue;
    if (isTechnicalWrapper(child.object, child.name) || child.type === "adjustmentLayer") {
      out.push(...expandTechnicalLayer(child.layerId, index, new Set(), snapshot));
      continue;
    }

    const cluster = memberToCluster.get(child.layerId);
    if (cluster) {
      if (isDesignerGroupIdMirrorDismissed(blueprint, cluster.designerGroupId)) {
        if (!child.selectableFromCanvas) continue;
        out.push({
          kind: "layer",
          id: `layer:${child.layerId}`,
          layerId: child.layerId,
          label: presentationLayerLabel(child.layerId, index, snapshot),
          childCount: 0,
          children: [],
          unit: { kind: "layer", layerId: child.layerId },
          isContainer: false,
        });
        continue;
      }
      if (processedClusters.has(cluster.designerGroupId)) continue;
      processedClusters.add(cluster.designerGroupId);

      const mirrorId = designerGroupIdMirrorNodeId(cluster.designerGroupId);
      if (parentNode?.childIds.includes(mirrorId)) {
        const mirrorNode = buildSemanticSubtree(mirrorId, blueprint, index, snapshot);
        if (mirrorNode) out.push(mirrorNode);
        continue;
      }

      const memberNodes: SiteCreatorPresentationNode[] = [];
      for (const layerId of cluster.memberIds) {
        const entry = index.byId[layerId];
        if (!entry?.selectableFromCanvas) continue;
        memberNodes.push({
          kind: "layer",
          id: `layer:${layerId}`,
          layerId,
          label: presentationLayerLabel(layerId, index, snapshot),
          childCount: 0,
          children: [],
          unit: { kind: "layer", layerId },
          isContainer: entry.type === "groupContainer",
        });
      }
      if (memberNodes.length === 0) continue;
      out.push({
        kind: "layer",
        id: `gid:${cluster.designerGroupId}`,
        layerId: cluster.memberIds[0]!,
        label: designerGroupIdClusterLabel(cluster.memberIds, index),
        childCount: memberNodes.length,
        children: memberNodes,
        unit: { kind: "layer", layerId: cluster.memberIds[0]! },
        isContainer: true,
      });
      continue;
    }

    if (child.type === "groupContainer") {
      out.push({
        kind: "layer",
        id: `layer:${child.layerId}`,
        layerId: child.layerId,
        label: presentationLayerLabel(child.layerId, index, snapshot),
        childCount: 0,
        children: buildDesignerContainerDirectChildren(
          child.layerId,
          parentBlueprintNodeId,
          blueprint,
          index,
          snapshot,
        ),
        unit: { kind: "layer", layerId: child.layerId },
        isContainer: isUsefulDesignerGroup(child.object, child.name),
      });
      continue;
    }

    out.push({
      kind: "layer",
      id: `layer:${child.layerId}`,
      layerId: child.layerId,
      label: presentationLayerLabel(child.layerId, index, snapshot),
      childCount: 0,
      children: [],
      unit: { kind: "layer", layerId: child.layerId },
      isContainer: false,
    });
  }
  return out;
}

function buildSemanticSubtree(
  nodeId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): SiteCreatorPresentationNode | null {
  const node = blueprint.nodes[nodeId];
  if (!node) return null;
  const children: SiteCreatorPresentationNode[] = [];
  for (const childId of node.childIds) {
    const child = buildSemanticSubtree(childId, blueprint, index, snapshot);
    if (child) children.push(child);
  }
  for (const layerId of node.layerIds) {
    const entry = index.byId[layerId];
    if (!entry) continue;
    if (entry.type === "groupContainer") {
      children.push(
        ...buildDesignerContainerDirectChildren(layerId, nodeId, blueprint, index, snapshot),
      );
      continue;
    }
    if (isTechnicalWrapper(entry.object, entry.name)) {
      children.push(...expandTechnicalLayer(layerId, index, new Set(), snapshot));
      continue;
    }
    children.push({
      kind: "layer",
      id: `layer:${layerId}`,
      layerId,
      label: presentationLayerLabel(layerId, index, snapshot),
      childCount: 0,
      children: [],
      unit: { kind: "layer", layerId },
      isContainer: entry.type === "groupContainer" && isUsefulDesignerGroup(entry.object, entry.name),
    });
  }

  const labelBase = isSiteButtonNode(node)
    ? deriveBlueprintNodeDisplayLabel(node, snapshot, index)
    : isSiteSectionNode(node)
      ? node.sectionType === "hero"
        ? "Hero"
        : node.label?.trim() || "Sección"
      : node.kind === "layoutGroup"
        ? node.label?.trim() || "Grupo"
        : deriveBlueprintNodeDisplayLabel(node, snapshot, index);

  const n = children.length;
  const label =
    isSiteButtonNode(node) || n === 0
      ? labelBase
      : `${labelBase} · ${n} ${n === 1 ? "elemento" : "elementos"}`;

  return {
    kind: "semantic",
    id: `node:${nodeId}`,
    nodeId,
    label,
    childCount: n,
    children,
    unit: { kind: "blueprintNode", nodeId },
    isContainer: true,
  };
}

function collectPresentationBounds(
  node: SiteCreatorPresentationNode,
  index: SiteCreatorSelectionIndex,
  blueprint: SiteBlueprintV1,
  into: Record<string, PageRect>,
): PageRect | null {
  if (node.kind === "unorganized") {
    const rects: PageRect[] = [];
    for (const c of node.children) {
      const b = collectPresentationBounds(c, index, blueprint, into);
      if (b) rects.push(b);
    }
    return unionPageRects(rects);
  }
  if (node.kind === "layer") {
    const entry = index.byId[node.layerId];
    if (!entry || !entry.visible) return null;
    if (isTechnicalWrapper(entry.object, entry.name)) {
      // No debería ser fila; por si acaso union hijos
      return null;
    }
    const b = worldVisualBoundsForLayer(node.layerId, index) ?? entry.visualBounds;
    into[`layer:${node.layerId}`] = b;
    return b;
  }
  // semantic: union de hijos de presentación (no máscaras / wrappers)
  const rects: PageRect[] = [];
  for (const c of node.children) {
    const b = collectPresentationBounds(c, index, blueprint, into);
    if (b) rects.push(b);
  }
  // Capas de cobertura no listadas (fallback) — solo entries visibles no técnicas
  if (rects.length === 0) {
    for (const layerId of collectSemanticCoverageLayerIds(blueprint, node.nodeId)) {
      const entry = index.byId[layerId];
      if (!entry?.visible) continue;
      if (isTechnicalWrapper(entry.object, entry.name)) continue;
      rects.push(entry.visualBounds);
    }
  }
  const u = unionPageRects(rects);
  if (u) into[`node:${node.nodeId}`] = u;
  return u;
}

export function buildSiteCreatorPresentationTree(args: {
  page: DesignerPageState | null;
  blueprint: SiteBlueprintV1;
  selectionIndex: SiteCreatorSelectionIndex | null;
  snapshot: DesignerSourceSnapshotV1 | null;
}): SiteCreatorPresentationTree {
  const { blueprint, selectionIndex: index, snapshot } = args;
  const roots: SiteCreatorPresentationNode[] = [];
  const boundsByKey: Record<string, PageRect> = {};
  if (!index) return { roots, boundsByKey };

  for (const id of blueprint.rootChildIds) {
    const node = buildSemanticSubtree(id, blueprint, index, snapshot);
    if (node) {
      roots.push(node);
      collectPresentationBounds(node, index, blueprint, boundsByKey);
    }
  }

  const ownership = buildBlueprintOwnershipIndexWithTree(blueprint, index);
  const unorganizedChildren: SiteCreatorPresentationNode[] = [];
  const seen = new Set<string>();

  for (const entry of index.entries) {
    if (!entry.visible || !entry.selectableFromCanvas) continue;
    if (
      ownership.ownerByLayerId[entry.layerId] ||
      ownership.coveredByContainerOwner[entry.layerId] ||
      entry.ancestorIds.some(
        (id) => ownership.ownerByLayerId[id] || ownership.coveredByContainerOwner[id],
      )
    ) {
      continue;
    }
    // Saltar descendientes de unorganized wrappers ya expandidos
    if (entry.ancestorIds.some((a) => seen.has(a))) continue;
    if (isTechnicalWrapper(entry.object, entry.name) || entry.type === "clippingContainer" || entry.type === "adjustmentLayer") {
      const promoted = expandTechnicalLayer(entry.layerId, index, new Set(), snapshot);
      for (const p of promoted) {
        if (p.kind === "layer" && seen.has(p.layerId)) continue;
        if (p.kind === "layer") {
          if (ownership.ownerByLayerId[p.layerId] || ownership.coveredByContainerOwner[p.layerId]) {
            continue;
          }
          seen.add(p.layerId);
          const childEntry = index.byId[p.layerId];
          if (childEntry && !isTechnicalWrapper(childEntry.object, childEntry.name)) {
            boundsByKey[`layer:${p.layerId}`] = worldVisualBoundsForLayer(p.layerId, index) ?? childEntry.visualBounds;
            unorganizedChildren.push(p);
          }
        }
      }
      seen.add(entry.layerId);
      continue;
    }
    if (
      entry.type === "groupContainer" &&
      isDesignerContainerMirrorDismissed(blueprint, entry.layerId)
    ) {
      const promoted = buildDesignerContainerDirectChildren(
        entry.layerId,
        "",
        blueprint,
        index,
        snapshot,
      );
      for (const p of promoted) {
        if (p.kind === "layer" && seen.has(p.layerId)) continue;
        if (p.kind === "layer") {
          seen.add(p.layerId);
          const childEntry = index.byId[p.layerId];
          if (childEntry) boundsByKey[`layer:${p.layerId}`] = childEntry.visualBounds;
          unorganizedChildren.push(p);
        } else if (p.kind === "semantic") {
          unorganizedChildren.push(p);
        }
      }
      seen.add(entry.layerId);
      continue;
    }
    // Solo raíces libres (sin ancestro libre ya listado)
    if (entry.parentLayerId && !ownership.ownerByLayerId[entry.parentLayerId]) {
      const parent = index.byId[entry.parentLayerId];
      if (parent && !isTechnicalWrapper(parent.object, parent.name)) continue;
    }
    if (seen.has(entry.layerId)) continue;
    seen.add(entry.layerId);
    unorganizedChildren.push({
      kind: "layer",
      id: `layer:${entry.layerId}`,
      layerId: entry.layerId,
      label: presentationLayerLabel(entry.layerId, index, snapshot),
      childCount: 0,
      children: [],
      unit: { kind: "layer", layerId: entry.layerId },
      isContainer: entry.type === "groupContainer" && isUsefulDesignerGroup(entry.object, entry.name),
    });
    boundsByKey[`layer:${entry.layerId}`] = entry.visualBounds;
  }

  if (unorganizedChildren.length > 0) {
    const n = unorganizedChildren.length;
    roots.push({
      kind: "unorganized",
      id: "unorganized",
      label: `Contenido sin organizar · ${n}`,
      childCount: n,
      children: unorganizedChildren,
      unit: null,
      isContainer: true,
    });
  }

  return { roots, boundsByKey };
}

export function presentationBoundsForUnit(
  unit: SiteCreatorSelectionUnit,
  tree: SiteCreatorPresentationTree,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const key = unit.kind === "layer" ? `layer:${unit.layerId}` : `node:${unit.nodeId}`;
  if (tree.boundsByKey[key]) return tree.boundsByKey[key]!;
  if (unit.kind === "layer") return index.byId[unit.layerId]?.visualBounds ?? null;
  return null;
}

export function presentationDirectChildren(
  unit: SiteCreatorSelectionUnit,
  tree: SiteCreatorPresentationTree,
): SiteCreatorPresentationNode[] {
  const walk = (nodes: SiteCreatorPresentationNode[]): SiteCreatorPresentationNode[] | null => {
    for (const n of nodes) {
      if (n.kind === "semantic" && unit.kind === "blueprintNode" && n.nodeId === unit.nodeId) {
        return n.children;
      }
      if (n.kind === "layer" && unit.kind === "layer" && n.layerId === unit.layerId) {
        return n.children;
      }
      const inner = walk(n.children);
      if (inner) return inner;
    }
    return null;
  };
  return walk(tree.roots) ?? [];
}

export function findPresentationNode(
  tree: SiteCreatorPresentationTree,
  unit: SiteCreatorSelectionUnit,
): SiteCreatorPresentationNode | null {
  const walk = (nodes: SiteCreatorPresentationNode[]): SiteCreatorPresentationNode | null => {
    for (const n of nodes) {
      if (n.kind === "semantic" && unit.kind === "blueprintNode" && n.nodeId === unit.nodeId) return n;
      if (n.kind === "layer" && unit.kind === "layer" && n.layerId === unit.layerId) return n;
      const inner = walk(n.children);
      if (inner) return inner;
    }
    return null;
  };
  return walk(tree.roots);
}
