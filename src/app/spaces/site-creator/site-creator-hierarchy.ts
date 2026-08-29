import type { SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteMultiCardNode, isSiteSectionNode } from "./site-creator-types";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { PageRect } from "./site-creator-coordinate-space";
import { pageRectFullyContains, unionPageRects } from "./site-creator-coordinate-space";
import {
  collectSemanticCoverageLayerIds,
  findLayerSemanticOwner,
} from "./site-blueprint-ownership";
import { semanticNodeBounds } from "./site-blueprint-ops";
import {
  deriveBlueprintNodeDisplayLabel,
  deriveLayerDisplayLabel,
  selectionUnitKey,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import type { DesignerSourceSnapshotV1 } from "./site-creator-types";

const CONTAIN_TOLERANCE_PAGE = 2; // ~2 CSS px at 100%; caller may scale

export function isSemanticContainerNode(node: SiteBlueprintNode | null | undefined): boolean {
  if (!node) return false;
  return isSiteSectionNode(node) || node.kind === "layoutGroup" || isSiteMultiCardNode(node) || isSiteButtonNode(node);
}

export function countContainerElements(node: SiteBlueprintNode): number {
  return node.childIds.length + node.layerIds.length;
}

export function containerDisplayLabel(
  node: SiteBlueprintNode,
  snapshot: DesignerSourceSnapshotV1 | null | undefined,
  index: SiteCreatorSelectionIndex | null | undefined,
): string {
  if (isSiteButtonNode(node)) {
    return deriveBlueprintNodeDisplayLabel(node, snapshot, index);
  }
  if (isSiteSectionNode(node)) {
    const base = node.sectionType === "hero" ? "Hero" : node.label?.trim() || "Sección";
    const n = countContainerElements(node);
    if (n <= 0) return base;
    return `${base} · ${n} ${n === 1 ? "elemento" : "elementos"}`;
  }
  if (node.kind === "layoutGroup") {
    const n = countContainerElements(node);
    const base = node.label?.trim() || "Grupo";
    if (n <= 0) return base;
    return `${base} · ${n} ${n === 1 ? "elemento" : "elementos"}`;
  }
  if (isSiteMultiCardNode(node)) {
    const n = node.count;
    const base = node.label?.trim() || "MultiCard";
    return `${base} · ×${n}`;
  }
  return deriveBlueprintNodeDisplayLabel(node, snapshot, index);
}

/** Hijos directos seleccionables dentro de un contenedor semántico. */
export function directChildUnits(
  blueprint: SiteBlueprintV1,
  containerId: string,
): SiteCreatorSelectionUnit[] {
  const node = blueprint.nodes[containerId];
  if (!node) return [];
  const units: SiteCreatorSelectionUnit[] = [];
  for (const childId of node.childIds) {
    if (blueprint.nodes[childId]) {
      units.push({ kind: "blueprintNode", nodeId: childId });
    }
  }
  for (const layerId of node.layerIds) {
    units.push({ kind: "layer", layerId });
  }
  return units;
}

export function unitBounds(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  if (unit.kind === "blueprintNode") {
    return semanticNodeBounds(blueprint, unit.nodeId, index);
  }
  return index.byId[unit.layerId]?.visualBounds ?? null;
}

/**
 * Bajo el puntero, dentro del scope de un contenedor: hijo directo hit.
 * Fuera de inspect/selección de contenedor: null (el caller usa resolveRootClickUnit).
 */
export function hitDirectChildUnderPoint(
  blueprint: SiteBlueprintV1,
  containerId: string,
  index: SiteCreatorSelectionIndex,
  point: { x: number; y: number },
): SiteCreatorSelectionUnit | null {
  const children = directChildUnits(blueprint, containerId);
  // Front-most by z: prefer later entries in index order for layers; for nodes use max z among coverage
  let best: { unit: SiteCreatorSelectionUnit; z: number } | null = null;
  for (const unit of children) {
    const bounds = unitBounds(unit, blueprint, index);
    if (!bounds) continue;
    if (
      point.x < bounds.x ||
      point.y < bounds.y ||
      point.x > bounds.x + bounds.width ||
      point.y > bounds.y + bounds.height
    ) {
      continue;
    }
    const z = unitMaxZ(unit, blueprint, index);
    if (!best || z >= best.z) best = { unit, z };
  }
  return best?.unit ?? null;
}

function unitMaxZ(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): number {
  // Represent z as last segment of zOrderPath (higher = later = front for typical paint order)
  const score = (entry: { zOrderPath: number[] } | undefined) => {
    if (!entry?.zOrderPath.length) return 0;
    return entry.zOrderPath.reduce((acc, n, i) => acc + n * 1000 ** (entry.zOrderPath.length - i), 0);
  };
  if (unit.kind === "layer") return score(index.byId[unit.layerId]);
  let max = 0;
  for (const id of collectSemanticCoverageLayerIds(blueprint, unit.nodeId)) {
    max = Math.max(max, score(index.byId[id]));
  }
  return max;
}

/** Ruta de ancestros semánticos (raíz → hoja), sin incluir la unidad actual. */
export function semanticAncestorPath(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionUnit[] {
  const path: SiteCreatorSelectionUnit[] = [];
  let parentId: string | null = null;
  if (unit.kind === "blueprintNode") {
    parentId = blueprint.nodes[unit.nodeId]?.parentId ?? null;
  } else {
    const owner = findLayerSemanticOwner(blueprint, unit.layerId, index);
    parentId = owner?.id ?? null;
  }
  const stack: string[] = [];
  while (parentId) {
    stack.push(parentId);
    parentId = blueprint.nodes[parentId]?.parentId ?? null;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    path.push({ kind: "blueprintNode", nodeId: stack[i]! });
  }
  return path;
}

export type BreadcrumbSegment = {
  unit: SiteCreatorSelectionUnit;
  label: string;
  current: boolean;
};

export function buildBreadcrumbSegments(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): BreadcrumbSegment[] {
  const ancestors = semanticAncestorPath(unit, blueprint, index);
  const segments: BreadcrumbSegment[] = [];
  for (const a of ancestors) {
    const node = a.kind === "blueprintNode" ? blueprint.nodes[a.nodeId] : null;
    segments.push({
      unit: a,
      label: node
        ? containerDisplayLabel(node, snapshot, index)
        : "Elemento",
      current: false,
    });
  }
  const label =
    unit.kind === "layer"
      ? deriveLayerDisplayLabel(unit.layerId, index, snapshot)
      : blueprint.nodes[unit.nodeId]
        ? containerDisplayLabel(blueprint.nodes[unit.nodeId]!, snapshot, index)
        : "Elemento";
  segments.push({ unit, label, current: true });
  return segments;
}

export function inflateRect(rect: PageRect, pad: number): PageRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/** Contenedores (sección/grupo) cuyo AABB contiene completamente el de la unidad. */
export function containersFullyContainingUnit(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  tolerance = CONTAIN_TOLERANCE_PAGE,
): string[] {
  const inner = unitBounds(unit, blueprint, index);
  if (!inner) return [];
  const padded = inflateRect(inner, -Math.abs(tolerance)); // shrink inner slightly? Spec: free layer fully inside container with 2px tolerance
  // Better: inflate container by tolerance
  const hits: string[] = [];
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteSectionNode(node) && node.kind !== "layoutGroup" && !isSiteMultiCardNode(node)) continue;
    // Skip if unit already inside this node
    if (unit.kind === "blueprintNode") {
      if (unit.nodeId === node.id) continue;
      if (isDescendantOf(blueprint, unit.nodeId, node.id)) continue;
    } else {
      const owner = findLayerSemanticOwner(blueprint, unit.layerId, index);
      if (owner?.id === node.id) continue;
    }
    const outer = semanticNodeBounds(blueprint, node.id, index);
    if (!outer) continue;
    const loose = inflateRect(outer, tolerance);
    if (pageRectFullyContains(loose, inner)) hits.push(node.id);
  }
  return hits;
}

function isDescendantOf(blueprint: SiteBlueprintV1, nodeId: string, ancestorId: string): boolean {
  let current: string | null = nodeId;
  while (current) {
    const node: SiteBlueprintNode | undefined = blueprint.nodes[current];
    if (!node) return false;
    if (node.parentId === ancestorId) return true;
    current = node.parentId;
  }
  return false;
}

export function unionSelectedBounds(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const rects: PageRect[] = [];
  for (const u of units) {
    const b = unitBounds(u, blueprint, index);
    if (b) rects.push(b);
  }
  return unionPageRects(rects);
}

export function sameUnitKey(a: SiteCreatorSelectionUnit, b: SiteCreatorSelectionUnit): boolean {
  return selectionUnitKey(a) === selectionUnitKey(b);
}

/** Capas libres (sin owner) contenidas en exactamente un contenedor. */
export function inferSingleContainerForFreeLayers(
  layerIds: string[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): string | null {
  const sets: string[][] = [];
  for (const layerId of layerIds) {
    const owner = findLayerSemanticOwner(blueprint, layerId, index);
    if (owner) return null;
    const hits = containersFullyContainingUnit(
      { kind: "layer", layerId },
      blueprint,
      index,
    );
    if (hits.length === 0) return null;
    sets.push(hits);
  }
  if (sets.length === 0) return null;
  let common = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    common = new Set(sets[i]!.filter((id) => common.has(id)));
  }
  if (common.size === 1) return [...common][0]!;
  return null;
}

/** Contenedores comunes (sección/grupo) que envuelven geométricamente todas las capas libres. */
export function commonContainersForFreeLayers(
  layerIds: string[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): string[] {
  if (layerIds.length === 0) return [];
  let common: Set<string> | null = null;
  for (const layerId of layerIds) {
    const owner = findLayerSemanticOwner(blueprint, layerId, index);
    if (owner) return [];
    const hits = containersFullyContainingUnit({ kind: "layer", layerId }, blueprint, index);
    const hitSet = new Set(hits);
    if (common === null) {
      common = hitSet;
    } else {
      const next = new Set<string>();
      for (const id of common) {
        if (hitSet.has(id)) next.add(id);
      }
      common = next;
    }
  }
  if (!common || common.size === 0) return [];
  return deepestContainerCandidates([...common], blueprint);
}

/** De varios contenedores anidados, conserva solo los más profundos (sin ancestros redundantes). */
export function deepestContainerCandidates(
  candidates: string[],
  blueprint: SiteBlueprintV1,
): string[] {
  return candidates.filter(
    (id) => !candidates.some((other) => other !== id && isDescendantOf(blueprint, other, id)),
  );
}
