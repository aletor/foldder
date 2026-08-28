import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import {
  createSiteComponentId,
  createSiteLayoutGroupId,
  createSiteMultiCardCardId,
  createSiteMultiCardId,
  createSiteSectionId,
} from "./site-blueprint-ids";
import {
  buildBlueprintOwnershipIndex,
  buildBlueprintOwnershipIndexWithTree,
  collectSemanticCoverageLayerIds,
  moveLayersToBlueprintNode,
  unique,
} from "./site-blueprint-ownership";
import { assertValidBlueprint, cloneBlueprint } from "./site-blueprint-validate";
import { patchContainerTune } from "./site-creator-responsive-tunes";
import type { SiteCreatorSelectionIndex, SiteCreatorSelectionIndexEntry } from "./site-creator-selection-types";
import type {
  LayoutGroupFitOrigin,
  LayoutGroupWidthMode,
  ResponsiveEditableBand,
  SiteBlueprintComponentNode,
  SiteBlueprintLayoutGroupNode,
  SiteBlueprintMultiCardNode,
  SiteBlueprintNode,
  SiteBlueprintSectionNode,
  SiteBlueprintV1,
  SiteMultiCardLayoutMode,
  SiteMultiCardSlotOverrideV1,
  SiteSectionHeightMode,
  SiteSectionType,
  SiteMultiCardSlotBindingV1,
} from "./site-creator-types";
import type { Dataset } from "../dataset/dataset-types";
import {
  claimMultiCardDatasetList as claimMultiCardDatasetListPure,
  isMultiCardDatasetBound,
  setMultiCardSlotBinding as setMultiCardSlotBindingPure,
} from "./site-creator-multicard-dataset";
import {
  MULTICARD_COUNT_MAX,
  MULTICARD_COUNT_MIN,
  MULTICARD_DEFAULT_GAP,
  isResponsiveEditableBand,
  isSiteButtonNode,
  isSiteMultiCardNode,
  isSiteSectionNode,
  isSiteStructuralContainerNode,
} from "./site-creator-types";
import {
  applyNewMultiCardResponsiveDefaults,
  collectOwningSectionIds,
  createDefaultMultiCardCards,
  layerIsInsideMultiCard,
  nodeIsInsideMultiCard,
} from "./site-creator-multicard";
import { getPageDimensions } from "../indesign/page-formats";
import type { DesignerPageState } from "../designer/DesignerNode";
import { unitsToStructureLayerIds, type SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { commonContainersForFreeLayers } from "./site-creator-hierarchy";
import { sourceWorldBoundsOfIds } from "./site-creator-layer-world-bounds";
import { collectMultiCardInstanceLayerIds } from "./site-creator-multicard-layout";
import { clampSectionSourceRangeBottom } from "./site-creator-section-height";

export type BlueprintOpError = {
  ok: false;
  code: string;
  message: string;
  partialNodeIds?: string[];
  candidateParentIds?: string[];
};

export type BlueprintOpSuccess = { ok: true; blueprint: SiteBlueprintV1; createdNodeId?: string };

export type BlueprintOpResult = BlueprintOpSuccess | BlueprintOpError;

const ATOMIC_MSG =
  "Este elemento depende de una máscara o composición booleana. Selecciona el contenedor completo o edítalo en Designer.";

function fail(code: string, message: string, extra?: Partial<BlueprintOpError>): BlueprintOpError {
  return { ok: false, code, message, ...extra };
}

function entryBounds(entries: SiteCreatorSelectionIndexEntry[]): PageRect | null {
  return unionPageRects(entries.map((e) => e.visualBounds));
}

function nodeVisualBounds(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const ids = [...collectSemanticCoverageLayerIds(blueprint, nodeId)];
  const node = blueprint.nodes[nodeId];
  if (node && isSiteMultiCardNode(node)) {
    ids.push(...collectMultiCardInstanceLayerIds(index, nodeId));
  }
  return sourceWorldBoundsOfIds(ids, index);
}

/** ¿La cobertura completa del nodo está incluida en selectedLayerIds? */
export function isSemanticNodeFullyCovered(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  selectedLayerIds: Set<string>,
  index: SiteCreatorSelectionIndex,
): boolean {
  const coverage = collectSemanticCoverageLayerIds(blueprint, nodeId);
  if (coverage.length === 0) {
    // nodo sin capas propias: considerar cubierto si su unión visual está dentro... fallback: children must be covered
    const node = blueprint.nodes[nodeId];
    if (!node) return false;
    if (node.childIds.length === 0) return false;
    return node.childIds.every((childId) => isSemanticNodeFullyCovered(blueprint, childId, selectedLayerIds, index));
  }
  // Expand: selected may include a container that covers descendants
  const effective = expandSelectionWithOwnedContainers(selectedLayerIds, index);
  return coverage.every((layerId) => effective.has(layerId) || isCoveredBySelectedContainer(layerId, effective, index));
}

function expandSelectionWithOwnedContainers(
  selected: Set<string>,
  index: SiteCreatorSelectionIndex,
): Set<string> {
  const out = new Set(selected);
  for (const id of selected) {
    const entry = index.byId[id];
    if (!entry?.containerKind) continue;
    for (const descendant of index.entries) {
      if (descendant.ancestorIds.includes(id)) out.add(descendant.layerId);
    }
  }
  return out;
}

function isCoveredBySelectedContainer(
  layerId: string,
  selected: Set<string>,
  index: SiteCreatorSelectionIndex,
): boolean {
  const entry = index.byId[layerId];
  if (!entry) return selected.has(layerId);
  return entry.ancestorIds.some((id) => selected.has(id)) || selected.has(layerId);
}

export function findPartiallyCoveredSemanticNodes(
  blueprint: SiteBlueprintV1,
  selectedLayerIds: string[],
  index: SiteCreatorSelectionIndex,
): string[] {
  const selected = new Set(selectedLayerIds);
  const effective = expandSelectionWithOwnedContainers(selected, index);
  const partial: string[] = [];
  for (const node of Object.values(blueprint.nodes)) {
    const coverage = collectSemanticCoverageLayerIds(blueprint, node.id);
    if (coverage.length === 0) continue;
    const hit = coverage.filter(
      (id) => effective.has(id) || isCoveredBySelectedContainer(id, effective, index),
    );
    if (hit.length === 0) continue;
    if (hit.length < coverage.length || !isSemanticNodeFullyCovered(blueprint, node.id, selected, index)) {
      partial.push(node.id);
    }
  }
  return partial;
}

export function findFullyCoveredSemanticNodes(
  blueprint: SiteBlueprintV1,
  selectedLayerIds: string[],
  index: SiteCreatorSelectionIndex,
): string[] {
  const selected = new Set(selectedLayerIds);
  return Object.values(blueprint.nodes)
    .filter((node) => isSemanticNodeFullyCovered(blueprint, node.id, selected, index))
    .map((node) => node.id)
    // solo raíces de esa cobertura (no hijos si el padre también está fully covered)
    .filter((id) => {
      const node = blueprint.nodes[id]!;
      if (!node.parentId) return true;
      return !isSemanticNodeFullyCovered(blueprint, node.parentId, selected, index);
    });
}

/** Bloquea extracción de descendientes de clipping/boolean. */
export function findAtomicContainerViolations(
  selectedLayerIds: string[],
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionIndexEntry[] {
  const selected = new Set(selectedLayerIds);
  const violations: SiteCreatorSelectionIndexEntry[] = [];
  for (const id of selectedLayerIds) {
    const entry = index.byId[id];
    if (!entry) continue;
    for (const ancestorId of entry.ancestorIds) {
      const ancestor = index.byId[ancestorId];
      if (!ancestor) continue;
      if (ancestor.containerKind === "clippingContainer" || ancestor.containerKind === "booleanGroup") {
        if (!selected.has(ancestorId)) {
          violations.push(entry);
          break;
        }
      }
    }
  }
  return violations;
}

/**
 * Expande groupContainers poseídos: si se seleccionan hijos, retira el contenedor
 * del propietario y deja los hermanos no seleccionados en el propietario.
 */
export function expandGroupContainersForSelection(
  blueprint: SiteBlueprintV1,
  selectedLayerIds: string[],
  index: SiteCreatorSelectionIndex,
): { blueprint: SiteBlueprintV1; resolvedLayerIds: string[] } {
  let next = cloneBlueprint(blueprint);
  const ownership = buildBlueprintOwnershipIndex(next);
  const selected = new Set(selectedLayerIds);
  const resolved = new Set(selectedLayerIds);

  // Contenedores groupContainer poseídos cuyos hijos (algunos) están seleccionados
  const containersToExpand = new Set<string>();
  for (const id of selectedLayerIds) {
    const entry = index.byId[id];
    if (!entry) continue;
    for (const ancestorId of entry.ancestorIds) {
      const ancestor = index.byId[ancestorId];
      if (ancestor?.containerKind !== "groupContainer") continue;
      if (ownership.ownerByLayerId[ancestorId] && !selected.has(ancestorId)) {
        containersToExpand.add(ancestorId);
      }
    }
  }

  for (const containerId of containersToExpand) {
    const ownerId = ownership.ownerByLayerId[containerId];
    if (!ownerId) continue;
    const owner = next.nodes[ownerId];
    if (!owner) continue;
    const children = index.entries.filter((e) => e.parentLayerId === containerId);
    const keepOnOwner = children.filter((c) => !selected.has(c.layerId)).map((c) => c.layerId);
    const nodes = { ...next.nodes };
    nodes[ownerId] = {
      ...owner,
      layerIds: unique([...owner.layerIds.filter((id) => id !== containerId), ...keepOnOwner]),
    } as SiteBlueprintNode;
    next = { ...next, nodes };
    resolved.delete(containerId);
  }

  return { blueprint: next, resolvedLayerIds: [...resolved] };
}

function computeSourceRange(
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
  page: DesignerPageState,
): { top: number; bottom: number } {
  const dims = getPageDimensions(page);
  const union = sourceWorldBoundsOfIds(layerIds, index);
  if (!union) return { top: 0, bottom: dims.height };
  return {
    top: Math.max(0, Math.min(dims.height, union.y)),
    bottom: Math.max(0, Math.min(dims.height, union.y + union.height)),
  };
}

function insertSectionByVerticalOrder(
  rootChildIds: string[],
  nodes: Record<string, SiteBlueprintNode>,
  sectionId: string,
): string[] {
  const section = nodes[sectionId] as SiteBlueprintSectionNode;
  const others = rootChildIds.filter((id) => id !== sectionId);
  const withMeta = others.map((id) => {
    const node = nodes[id];
    const top = node && isSiteSectionNode(node) ? node.sourceRange.top : Number.POSITIVE_INFINITY;
    return { id, top };
  });
  withMeta.push({ id: sectionId, top: section.sourceRange.top });
  withMeta.sort((a, b) => a.top - b.top || a.id.localeCompare(b.id));
  return withMeta.map((m) => m.id);
}

function detachNode(blueprint: SiteBlueprintV1, nodeId: string): SiteBlueprintV1 {
  const node = blueprint.nodes[nodeId];
  if (!node) return blueprint;
  const rootChildIds = blueprint.rootChildIds.filter((id) => id !== nodeId);
  const nodes = { ...blueprint.nodes };
  if (node.parentId && nodes[node.parentId]) {
    const parent = nodes[node.parentId]!;
    nodes[node.parentId] = {
      ...parent,
      childIds: parent.childIds.filter((id) => id !== nodeId),
    } as SiteBlueprintNode;
  }
  nodes[nodeId] = { ...node, parentId: null } as SiteBlueprintNode;
  return { ...blueprint, rootChildIds, nodes };
}

function attachChild(
  blueprint: SiteBlueprintV1,
  parentId: string | null,
  childId: string,
  atEnd = true,
): SiteBlueprintV1 {
  const next = detachNode(blueprint, childId);
  const child = next.nodes[childId];
  if (!child) return next;
  if (parentId == null) {
    const nodes = {
      ...next.nodes,
      [childId]: { ...child, parentId: null } as SiteBlueprintNode,
    };
    const rootChildIds = atEnd
      ? unique([...next.rootChildIds, childId])
      : unique([childId, ...next.rootChildIds]);
    return { ...next, nodes, rootChildIds };
  }
  const parent = next.nodes[parentId];
  if (!parent) return next;
  const nodes = {
    ...next.nodes,
    [childId]: { ...child, parentId } as SiteBlueprintNode,
    [parentId]: {
      ...parent,
      childIds: atEnd ? unique([...parent.childIds, childId]) : unique([childId, ...parent.childIds]),
    } as SiteBlueprintNode,
  };
  return { ...next, nodes, rootChildIds: next.rootChildIds.filter((id) => id !== childId) };
}

/** No reparentar al padre/ancestro del nodo nuevo: eso cierra un ciclo y congela el studio. */
function reparentableFullyCoveredNodes(
  blueprint: SiteBlueprintV1,
  parentId: string | null,
  fullyCovered: string[],
): string[] {
  const blocked = new Set<string>();
  let walk = parentId;
  while (walk) {
    blocked.add(walk);
    walk = blueprint.nodes[walk]?.parentId ?? null;
  }
  return fullyCovered.filter((id) => {
    if (blocked.has(id)) return false;
    const node = blueprint.nodes[id];
    if (!node || isSiteSectionNode(node)) return false;
    return true;
  });
}

export function createSectionFromSelection(args: {
  blueprint: SiteBlueprintV1;
  selectedLayerIds: string[];
  index: SiteCreatorSelectionIndex;
  committedPage: DesignerPageState;
  sectionType: SiteSectionType;
  label?: string;
}): BlueprintOpResult {
  const { selectedLayerIds, index, committedPage, sectionType } = args;
  if (selectedLayerIds.length === 0) {
    return fail("empty_selection", "Selecciona al menos una capa.");
  }

  const atomic = findAtomicContainerViolations(selectedLayerIds, index);
  if (atomic.length > 0) return fail("atomic_container", ATOMIC_MSG);

  const partial = findPartiallyCoveredSemanticNodes(args.blueprint, selectedLayerIds, index);
  if (partial.length > 0) {
    const node = args.blueprint.nodes[partial[0]!];
    const kindLabel = node && isSiteButtonNode(node) ? "Botón" : node?.label ?? "componente";
    return fail(
      "partial_semantic",
      `La selección contiene solo una parte de ${kindLabel}. Inclúyelo completo o retíralo de la selección.`,
      { partialNodeIds: partial },
    );
  }

  const expand = expandGroupContainersForSelection(
    args.blueprint,
    selectedLayerIds,
    index,
  );
  let blueprint = expand.blueprint;
  const resolvedLayerIds = expand.resolvedLayerIds;

  const fullyCovered = findFullyCoveredSemanticNodes(blueprint, selectedLayerIds, index);
  for (const id of fullyCovered) {
    if (isSiteSectionNode(blueprint.nodes[id]!)) {
      return fail("nested_section", "No se puede crear una Section dentro de otra Section.");
    }
  }

  const reparentCoverage = new Set(
    fullyCovered.flatMap((id) => collectSemanticCoverageLayerIds(blueprint, id)),
  );
  const resolvedSet = new Set(resolvedLayerIds);
  const sectionLayerIds: string[] = [];
  for (const layerId of resolvedLayerIds) {
    if (reparentCoverage.has(layerId)) continue;
    const entry = index.byId[layerId];
    if (entry?.ancestorIds.some((ancestorId) => resolvedSet.has(ancestorId))) continue;
    sectionLayerIds.push(layerId);
  }

  const sectionId = createSiteSectionId();
  const label = args.label ?? (sectionType === "hero" ? "Hero" : "Sección");
  const coverageForRange = [
    ...sectionLayerIds,
    ...fullyCovered.flatMap((id) => collectSemanticCoverageLayerIds(blueprint, id)),
  ];
  const sourceRange = computeSourceRange(
    coverageForRange.length ? coverageForRange : selectedLayerIds,
    index,
    committedPage,
  );

  const section: SiteBlueprintSectionNode = {
    id: sectionId,
    kind: "section",
    sectionType,
    label,
    parentId: null,
    childIds: [],
    layerIds: [],
    sourceRange,
  };

  blueprint = {
    ...blueprint,
    nodes: { ...blueprint.nodes, [sectionId]: section },
    rootChildIds: insertSectionByVerticalOrder(
      [...blueprint.rootChildIds, sectionId],
      { ...blueprint.nodes, [sectionId]: section },
      sectionId,
    ),
  };

  blueprint = moveLayersToBlueprintNode(blueprint, sectionId, unique(sectionLayerIds));
  for (const childId of fullyCovered) {
    blueprint = attachChild(blueprint, sectionId, childId);
  }

  try {
    return { ok: true, blueprint: assertValidBlueprint(blueprint, index), createdNodeId: sectionId };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

export type ButtonParentResolution =
  | { status: "resolved"; parentId: string | null; reason: string }
  | { status: "ambiguous"; candidateParentIds: string[]; message: string }
  | { status: "blocked"; message: string };

export function resolveButtonParent(args: {
  blueprint: SiteBlueprintV1;
  selectedLayerIds: string[];
  index: SiteCreatorSelectionIndex;
  preferredParentId?: string | null;
}): ButtonParentResolution {
  const { blueprint, selectedLayerIds, index, preferredParentId } = args;
  if (preferredParentId !== undefined) {
    if (preferredParentId === null) {
      return { status: "resolved", parentId: null, reason: "Landing Root" };
    }
    const node = blueprint.nodes[preferredParentId];
    if (!node) return { status: "blocked", message: "El padre elegido no existe." };
    if (isSiteButtonNode(node)) {
      return { status: "blocked", message: "Un Button no puede contener otro Button." };
    }
    return { status: "resolved", parentId: preferredParentId, reason: node.label };
  }

  const ownership = buildBlueprintOwnershipIndexWithTree(blueprint, index);
  const owners = new Set<string>();
  let anyOwned = false;
  let anyFree = false;
  for (const layerId of selectedLayerIds) {
    const ownerId = ownership.ownerByLayerId[layerId] ?? ownership.coveredByContainerOwner[layerId];
    if (ownerId) {
      anyOwned = true;
      owners.add(ownerId);
    } else {
      anyFree = true;
    }
  }

  if (anyOwned && anyFree) {
    return {
      status: "blocked",
      message: "Selecciona elementos del mismo nivel para agruparlos.",
    };
  }
  if (owners.size > 1) {
    return {
      status: "blocked",
      message: "Selecciona elementos del mismo nivel para agruparlos.",
    };
  }
  if (owners.size === 1) {
    const parentId = [...owners][0]!;
    const parent = blueprint.nodes[parentId]!;
    if (isSiteButtonNode(parent)) {
      return { status: "blocked", message: "Un Button no puede contener otro Button." };
    }
    return { status: "resolved", parentId, reason: parent.label };
  }

  // Capas libres: contenedores geométricos (sección + layoutGroup), luego fallback vertical por sección.
  const geometricParents = commonContainersForFreeLayers(selectedLayerIds, blueprint, index);
  if (geometricParents.length === 1) {
    const node = blueprint.nodes[geometricParents[0]!]!;
    return { status: "resolved", parentId: geometricParents[0]!, reason: node.label };
  }
  if (geometricParents.length > 1) {
    return {
      status: "ambiguous",
      candidateParentIds: geometricParents,
      message: "Hay varios contenedores candidatos. Elige dónde crear el grupo.",
    };
  }

  const bounds = entryBounds(
    selectedLayerIds
      .map((id) => index.byId[id])
      .filter((e): e is SiteCreatorSelectionIndexEntry => {
        if (!e) return false;
        const { x, y, width, height } = e.visualBounds;
        return [x, y, width, height].every((n) => Number.isFinite(n));
      }),
  );
  if (!bounds) return { status: "resolved", parentId: null, reason: "Landing Root" };

  const candidates = Object.values(blueprint.nodes).filter((node): node is SiteBlueprintSectionNode => {
    if (!isSiteSectionNode(node)) return false;
    // Solo contención vertical vía sourceRange
    return (
      bounds.y >= node.sourceRange.top &&
      bounds.y + bounds.height <= node.sourceRange.bottom
    );
  });

  if (candidates.length === 1) {
    return {
      status: "resolved",
      parentId: candidates[0]!.id,
      reason: candidates[0]!.label,
    };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      candidateParentIds: candidates.map((c) => c.id),
      message: "Hay varias secciones candidatas. Elige dónde crear el grupo.",
    };
  }
  return { status: "resolved", parentId: null, reason: "Landing Root" };
}

export function extractAccessibleLabelFromLayers(
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): { textLayerIds: string[]; autoLabel: string | null } {
  const textLayerIds = layerIds.filter((id) => {
    const t = index.byId[id]?.type;
    return t === "text" || t === "textOnPath";
  });
  if (textLayerIds.length !== 1) {
    return { textLayerIds, autoLabel: null };
  }
  const obj = index.byId[textLayerIds[0]!]!.object as { text?: string };
  const text = typeof obj.text === "string" ? obj.text.replace(/\s+/g, " ").trim() : "";
  return { textLayerIds, autoLabel: text || null };
}

export function createButtonFromSelection(args: {
  blueprint: SiteBlueprintV1;
  selectedLayerIds: string[];
  index: SiteCreatorSelectionIndex;
  preferredParentId?: string | null;
  accessibleLabel?: string;
  labelLayerId?: string;
}): BlueprintOpResult {
  const { selectedLayerIds, index } = args;
  if (selectedLayerIds.length === 0) {
    return fail("empty_selection", "Selecciona al menos una capa.");
  }

  const atomic = findAtomicContainerViolations(selectedLayerIds, index);
  if (atomic.length > 0) return fail("atomic_container", ATOMIC_MSG);

  // Extraer capas de una Section/LayoutGroup (cobertura parcial) es válido al crear un hijo.
  // Solo se bloquea cobertura parcial de componentes atómicos (p. ej. Button).
  const partial = findPartiallyCoveredSemanticNodes(args.blueprint, selectedLayerIds, index).filter(
    (id) => isSiteButtonNode(args.blueprint.nodes[id]!),
  );
  if (partial.length > 0) {
    return fail(
      "partial_semantic",
      "La selección contiene solo una parte de Button. Inclúyelo completo o retíralo de la selección.",
      { partialNodeIds: partial },
    );
  }

  const parentRes = resolveButtonParent({
    blueprint: args.blueprint,
    selectedLayerIds,
    index,
    preferredParentId: args.preferredParentId,
  });
  if (parentRes.status === "blocked") return fail("parent", parentRes.message);
  if (parentRes.status === "ambiguous") {
    return fail("ambiguous_parent", parentRes.message, {
      candidateParentIds: parentRes.candidateParentIds,
    });
  }

  const expand = expandGroupContainersForSelection(
    args.blueprint,
    selectedLayerIds,
    index,
  );
  let blueprint = expand.blueprint;
  const resolvedLayerIds = expand.resolvedLayerIds;

  const ownership = buildBlueprintOwnershipIndex(blueprint);
  // Layers to transfer: selected free or owned by the destined parent
  const transfer: string[] = [];
  for (const layerId of resolvedLayerIds) {
    const ownerId = ownership.ownerByLayerId[layerId];
    if (!ownerId || ownerId === parentRes.parentId) {
      transfer.push(layerId);
      continue;
    }
    return fail("parent", "Selecciona elementos del mismo nivel para agruparlos.");
  }

  const { textLayerIds, autoLabel } = extractAccessibleLabelFromLayers(transfer, index);
  let labelLayerId = args.labelLayerId;
  let accessibleLabel = args.accessibleLabel?.trim() ?? "";

  if (textLayerIds.length > 1 && !labelLayerId) {
    return fail("label_required", "Hay varias capas de texto. Elige cuál es el Label.");
  }
  if (textLayerIds.length === 1) {
    labelLayerId = labelLayerId ?? textLayerIds[0];
    if (!accessibleLabel) accessibleLabel = autoLabel ?? "Botón";
  }
  if (textLayerIds.length === 0 && !accessibleLabel) {
    return fail("accessible_label_required", "Indica un nombre accesible para el Button.");
  }
  if (!accessibleLabel) accessibleLabel = "Botón";

  const buttonId = createSiteComponentId();
  const button: SiteBlueprintComponentNode = {
    id: buttonId,
    kind: "component",
    componentType: "button",
    label: accessibleLabel,
    parentId: null,
    childIds: [],
    layerIds: [],
    config: {
      labelLayerId,
      accessibleLabel,
      action: null,
    },
  };

  blueprint = {
    ...blueprint,
    nodes: { ...blueprint.nodes, [buttonId]: button },
    rootChildIds: [...blueprint.rootChildIds, buttonId],
  };
  blueprint = attachChild(blueprint, parentRes.parentId, buttonId);
  blueprint = moveLayersToBlueprintNode(blueprint, buttonId, unique(transfer));

  try {
    return { ok: true, blueprint: assertValidBlueprint(blueprint, index), createdNodeId: buttonId };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

export function createLayoutGroupFromSelection(args: {
  blueprint: SiteBlueprintV1;
  selectedLayerIds: string[];
  index: SiteCreatorSelectionIndex;
  preferredParentId?: string | null;
  label?: string;
}): BlueprintOpResult {
  const { selectedLayerIds, index } = args;
  if (selectedLayerIds.length === 0) {
    return fail("empty_selection", "Selecciona al menos una capa.");
  }

  const atomic = findAtomicContainerViolations(selectedLayerIds, index);
  if (atomic.length > 0) return fail("atomic_container", ATOMIC_MSG);

  // Igual que Button: cobertura parcial de Section/LayoutGroup es extracción válida;
  // solo se bloquea un Button (u otro componente) a medias.
  const partial = findPartiallyCoveredSemanticNodes(args.blueprint, selectedLayerIds, index).filter(
    (id) => isSiteButtonNode(args.blueprint.nodes[id]!),
  );
  if (partial.length > 0) {
    return fail(
      "partial_semantic",
      "La selección contiene solo una parte de un componente. Inclúyelo completo o retíralo de la selección.",
      { partialNodeIds: partial },
    );
  }

  const parentRes = resolveButtonParent({
    blueprint: args.blueprint,
    selectedLayerIds,
    index,
    preferredParentId: args.preferredParentId,
  });
  if (parentRes.status === "blocked") return fail("parent", parentRes.message);
  if (parentRes.status === "ambiguous") {
    return fail("ambiguous_parent", parentRes.message, {
      candidateParentIds: parentRes.candidateParentIds,
    });
  }

  const expand = expandGroupContainersForSelection(
    args.blueprint,
    selectedLayerIds,
    index,
  );
  let blueprint = expand.blueprint;
  const resolvedLayerIds = expand.resolvedLayerIds;

  const fullyCovered = findFullyCoveredSemanticNodes(blueprint, selectedLayerIds, index);
  const reparentIds = reparentableFullyCoveredNodes(blueprint, parentRes.parentId, fullyCovered);
  const ownership = buildBlueprintOwnershipIndexWithTree(blueprint, index);
  const groupLayers: string[] = [];
  for (const layerId of resolvedLayerIds) {
    const ownerId = ownership.ownerByLayerId[layerId];
    if (ownerId && reparentIds.includes(ownerId)) continue;
    if (ownerId && ownerId !== parentRes.parentId) continue;
    const coveredBy = ownership.coveredByContainerOwner[layerId];
    if (coveredBy && coveredBy !== parentRes.parentId) continue;
    groupLayers.push(layerId);
  }

  const groupId = createSiteLayoutGroupId();
  const group: SiteBlueprintLayoutGroupNode = {
    id: groupId,
    kind: "layoutGroup",
    label: args.label ?? "Grupo",
    parentId: null,
    childIds: [],
    layerIds: [],
  };

  blueprint = {
    ...blueprint,
    nodes: { ...blueprint.nodes, [groupId]: group },
    rootChildIds: [...blueprint.rootChildIds, groupId],
  };
  blueprint = attachChild(blueprint, parentRes.parentId, groupId);
  blueprint = moveLayersToBlueprintNode(blueprint, groupId, unique(groupLayers));
  for (const childId of reparentIds) {
    blueprint = attachChild(blueprint, groupId, childId);
  }

  try {
    return { ok: true, blueprint: assertValidBlueprint(blueprint, index), createdNodeId: groupId };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

export function createMultiCardFromSelection(args: {
  blueprint: SiteBlueprintV1;
  selectedLayerIds: string[];
  index: SiteCreatorSelectionIndex;
  preferredParentId?: string | null;
  label?: string;
}): BlueprintOpResult {
  const { selectedLayerIds, index } = args;
  if (selectedLayerIds.length === 0) {
    return fail("empty_selection", "Selecciona al menos una capa.");
  }

  const atomic = findAtomicContainerViolations(selectedLayerIds, index);
  if (atomic.length > 0) return fail("atomic_container", ATOMIC_MSG);

  const partial = findPartiallyCoveredSemanticNodes(args.blueprint, selectedLayerIds, index).filter(
    (id) => isSiteButtonNode(args.blueprint.nodes[id]!),
  );
  if (partial.length > 0) {
    return fail(
      "partial_semantic",
      "La selección contiene solo una parte de un componente. Inclúyelo completo o retíralo de la selección.",
      { partialNodeIds: partial },
    );
  }

  if (collectOwningSectionIds(args.blueprint, selectedLayerIds, index).length > 1) {
    return fail("multicard_cross_section", "La selección abarca más de una sección.");
  }

  for (const layerId of selectedLayerIds) {
    if (layerIsInsideMultiCard(args.blueprint, layerId, index)) {
      return fail("multicard_nested", "No se puede crear un MultiCard dentro de otro.");
    }
  }

  const parentRes = resolveButtonParent({
    blueprint: args.blueprint,
    selectedLayerIds,
    index,
    preferredParentId: args.preferredParentId,
  });
  if (parentRes.status === "blocked") return fail("parent", parentRes.message);
  if (parentRes.status === "ambiguous") {
    return fail("ambiguous_parent", parentRes.message, {
      candidateParentIds: parentRes.candidateParentIds,
    });
  }
  if (parentRes.parentId == null) {
    return fail("multicard_needs_parent", "El MultiCard tiene que vivir en una sección o un grupo.");
  }
  const parent = args.blueprint.nodes[parentRes.parentId];
  if (!parent || isSiteButtonNode(parent)) {
    return fail("parent", "Un botón no puede contener un MultiCard.");
  }
  if (isSiteMultiCardNode(parent) || nodeIsInsideMultiCard(args.blueprint, parent.id)) {
    return fail("multicard_nested", "No se puede crear un MultiCard dentro de otro.");
  }
  if (!isSiteSectionNode(parent) && parent.kind !== "layoutGroup") {
    return fail("multicard_needs_parent", "El MultiCard tiene que vivir en una sección o un grupo.");
  }

  const expand = expandGroupContainersForSelection(args.blueprint, selectedLayerIds, index);
  let blueprint = expand.blueprint;
  const resolvedLayerIds = expand.resolvedLayerIds;

  const fullyCovered = findFullyCoveredSemanticNodes(blueprint, selectedLayerIds, index);
  if (fullyCovered.some((id) => isSiteMultiCardNode(blueprint.nodes[id]!))) {
    return fail("multicard_nested", "No se puede crear un MultiCard dentro de otro.");
  }
  const reparentIds = reparentableFullyCoveredNodes(blueprint, parentRes.parentId, fullyCovered);

  const ownership = buildBlueprintOwnershipIndexWithTree(blueprint, index);
  const moldLayers: string[] = [];
  for (const layerId of resolvedLayerIds) {
    const ownerId = ownership.ownerByLayerId[layerId];
    if (ownerId && reparentIds.includes(ownerId)) continue;
    if (ownerId && ownerId !== parentRes.parentId) continue;
    const coveredBy = ownership.coveredByContainerOwner[layerId];
    if (coveredBy && coveredBy !== parentRes.parentId) continue;
    moldLayers.push(layerId);
  }

  const cards = createDefaultMultiCardCards();
  const nodeId = createSiteMultiCardId();
  const multi: SiteBlueprintMultiCardNode = {
    id: nodeId,
    kind: "multicard",
    label: args.label ?? "MultiCard",
    parentId: null,
    childIds: [],
    layerIds: [],
    count: cards.length,
    layoutMode: "grid",
    gap: MULTICARD_DEFAULT_GAP,
    nav: { visibility: "auto", style: "arrows" },
    cards,
  };

  blueprint = {
    ...blueprint,
    nodes: { ...blueprint.nodes, [nodeId]: multi },
    rootChildIds: [...blueprint.rootChildIds, nodeId],
  };
  blueprint = attachChild(blueprint, parentRes.parentId, nodeId);
  blueprint = moveLayersToBlueprintNode(blueprint, nodeId, unique(moldLayers));
  for (const childId of reparentIds) {
    blueprint = attachChild(blueprint, nodeId, childId);
  }
  blueprint = applyNewMultiCardResponsiveDefaults(blueprint, nodeId);

  try {
    return { ok: true, blueprint: assertValidBlueprint(blueprint, index), createdNodeId: nodeId };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

export function isWrapEligibleSemanticNode(blueprint: SiteBlueprintV1, nodeId: string): boolean {
  const node = blueprint.nodes[nodeId];
  if (!node || isSiteSectionNode(node)) return false;
  return node.kind === "layoutGroup" || isSiteButtonNode(node) || isSiteMultiCardNode(node);
}

/** Envuelve nodos semánticos hermanos (grupos/botones) en un layoutGroup padre. */
export function wrapSemanticNodesInGroup(args: {
  blueprint: SiteBlueprintV1;
  selectedNodeIds: string[];
  index: SiteCreatorSelectionIndex;
  label?: string;
}): BlueprintOpResult {
  const { selectedNodeIds, index, label } = args;
  if (selectedNodeIds.length < 2) {
    return fail("empty_selection", "Selecciona al menos dos elementos.");
  }
  if (!selectedNodeIds.every((id) => isWrapEligibleSemanticNode(args.blueprint, id))) {
    return fail("invalid_wrap", "Solo se pueden envolver grupos o botones del mismo nivel.");
  }

  const parentIds = new Set(
    selectedNodeIds.map((id) => args.blueprint.nodes[id]?.parentId ?? null),
  );
  if (parentIds.size !== 1) {
    return fail("different_level", "Selecciona elementos del mismo nivel para agruparlos.");
  }
  const sharedParentId = [...parentIds][0]!;

  let blueprint = cloneBlueprint(args.blueprint);
  const sortedNodeIds = [...selectedNodeIds].sort((a, b) => {
    const za = collectSemanticCoverageLayerIds(blueprint, a)
      .map((id) => index.byId[id]?.zOrderPath ?? [])
      .flat();
    const zb = collectSemanticCoverageLayerIds(blueprint, b)
      .map((id) => index.byId[id]?.zOrderPath ?? [])
      .flat();
    return (za[0] ?? 0) - (zb[0] ?? 0);
  });

  const groupId = createSiteLayoutGroupId();
  const group: SiteBlueprintLayoutGroupNode = {
    id: groupId,
    kind: "layoutGroup",
    label: label ?? "Grupo",
    parentId: null,
    childIds: [],
    layerIds: [],
  };

  blueprint = {
    ...blueprint,
    nodes: { ...blueprint.nodes, [groupId]: group },
  };
  blueprint = attachChild(blueprint, sharedParentId, groupId);

  for (const childId of sortedNodeIds) {
    blueprint = attachChild(blueprint, groupId, childId);
  }

  try {
    return { ok: true, blueprint: assertValidBlueprint(blueprint, index), createdNodeId: groupId };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

/** Agrupa capas sueltas o envuelve nodos semánticos hermanos. */
export function createGroupFromSelection(args: {
  blueprint: SiteBlueprintV1;
  units: SiteCreatorSelectionUnit[];
  index: SiteCreatorSelectionIndex;
  preferredParentId?: string | null;
  label?: string;
}): BlueprintOpResult {
  const nodeUnits = args.units.filter(
    (u): u is { kind: "blueprintNode"; nodeId: string } => u.kind === "blueprintNode",
  );
  const layerUnits = args.units.filter((u): u is { kind: "layer"; layerId: string } => u.kind === "layer");

  if (nodeUnits.length >= 2 && layerUnits.length === 0) {
    const nodeIds = nodeUnits.map((u) => u.nodeId);
    if (nodeIds.every((id) => isWrapEligibleSemanticNode(args.blueprint, id))) {
      return wrapSemanticNodesInGroup({
        blueprint: args.blueprint,
        selectedNodeIds: nodeIds,
        index: args.index,
        label: args.label,
      });
    }
  }

  return createLayoutGroupFromSelection({
    blueprint: args.blueprint,
    selectedLayerIds: unitsToStructureLayerIds(args.units, args.blueprint),
    index: args.index,
    preferredParentId: args.preferredParentId,
    label: args.label,
  });
}

/**
 * Quita un nodo semántico: sus layerIds vuelven al padre (o Landing Root implícito),
 * los hijos se reparentan al padre conservando orden. No toca Designer.
 */
export function removeBlueprintNodePreservingContent(
  blueprint: SiteBlueprintV1,
  nodeId: string,
): BlueprintOpResult {
  const node = blueprint.nodes[nodeId];
  if (!node) return fail("missing", "El nodo no existe.");

  const parentId = node.parentId;
  let next = cloneBlueprint(blueprint);
  const layers = [...node.layerIds];
  const children = [...node.childIds];

  // Remove from parent / root
  if (parentId && next.nodes[parentId]) {
    const parent = next.nodes[parentId]!;
    const insertAt = parent.childIds.indexOf(nodeId);
    const childIds = parent.childIds.filter((id) => id !== nodeId);
    const withKids = [...childIds];
    withKids.splice(insertAt >= 0 ? insertAt : withKids.length, 0, ...children);
    next = {
      ...next,
      nodes: {
        ...next.nodes,
        [parentId]: {
          ...parent,
          childIds: unique(withKids),
          layerIds: unique([...parent.layerIds, ...layers]),
        } as SiteBlueprintNode,
      },
    };
    for (const childId of children) {
      const child = next.nodes[childId];
      if (!child) continue;
      next = {
        ...next,
        nodes: {
          ...next.nodes,
          [childId]: { ...child, parentId } as SiteBlueprintNode,
        },
      };
    }
  } else {
    // Landing root
    const rootWithout = next.rootChildIds.filter((id) => id !== nodeId);
    const insertAt = next.rootChildIds.indexOf(nodeId);
    const rootChildIds = [...rootWithout];
    rootChildIds.splice(insertAt >= 0 ? insertAt : rootChildIds.length, 0, ...children);
    next = { ...next, rootChildIds: unique(rootChildIds) };
    for (const childId of children) {
      const child = next.nodes[childId];
      if (!child) continue;
      next = {
        ...next,
        nodes: {
          ...next.nodes,
          [childId]: { ...child, parentId: null } as SiteBlueprintNode,
        },
      };
    }
    // layers return to Landing Root implícito — no node owns them
  }

  const rest = { ...next.nodes };
  delete rest[nodeId];
  next = { ...next, nodes: rest };

  try {
    return { ok: true, blueprint: assertValidBlueprint(next) };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

export function renameBlueprintNode(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  label: string,
): BlueprintOpResult {
  const node = blueprint.nodes[nodeId];
  if (!node) return fail("missing", "El nodo no existe.");
  const trimmed = label.trim();
  if (!trimmed) return fail("empty_label", "El nombre no puede estar vacío.");
  const next = cloneBlueprint(blueprint);
  const updated = { ...node, label: trimmed } as SiteBlueprintNode;
  if (isSiteButtonNode(updated)) {
    updated.config = { ...updated.config, accessibleLabel: trimmed };
  }
  next.nodes[nodeId] = updated;
  return { ok: true, blueprint: next };
}

export function setLayoutGroupWidthMode(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  widthMode: LayoutGroupWidthMode,
  fitOrigin?: LayoutGroupFitOrigin,
): BlueprintOpResult {
  const node = blueprint.nodes[nodeId];
  if (!node || node.kind !== "layoutGroup") {
    return fail("invalid_target", "Selecciona un grupo.");
  }
  const nextMode: LayoutGroupWidthMode | undefined =
    widthMode === "full" || widthMode === "scale" ? widthMode : undefined;
  const nextOrigin: LayoutGroupFitOrigin | undefined =
    nextMode === "scale" ? (fitOrigin === "end" ? "end" : "start") : undefined;
  if (
    (node.widthMode ?? "content") === (nextMode ?? "content") &&
    (node.fitOrigin ?? undefined) === nextOrigin
  ) {
    return { ok: true, blueprint };
  }
  const next = cloneBlueprint(blueprint);
  const updated: SiteBlueprintLayoutGroupNode = { ...node, widthMode: nextMode, fitOrigin: nextOrigin };
  if (!nextMode) delete updated.widthMode;
  if (!nextOrigin) delete updated.fitOrigin;
  next.nodes[nodeId] = updated;
  return { ok: true, blueprint: next };
}

function requireMultiCard(
  blueprint: SiteBlueprintV1,
  nodeId: string,
): SiteBlueprintMultiCardNode | BlueprintOpError {
  const node = blueprint.nodes[nodeId];
  if (!node || !isSiteMultiCardNode(node)) {
    return fail("invalid_target", "Selecciona un MultiCard.");
  }
  return node;
}

export function setMultiCardCount(blueprint: SiteBlueprintV1, nodeId: string, count: number): BlueprintOpResult {
  const node = requireMultiCard(blueprint, nodeId);
  if ("ok" in node) return node;
  if (isMultiCardDatasetBound(node)) {
    return fail("multicard_dataset", "El número de cards lo marca la lista del Dataset.");
  }
  const n = Math.min(MULTICARD_COUNT_MAX, Math.max(MULTICARD_COUNT_MIN, Math.round(count)));
  if (n === node.cards.length) return { ok: true, blueprint };
  const next = cloneBlueprint(blueprint);
  const current = next.nodes[nodeId];
  if (!current || !isSiteMultiCardNode(current)) return fail("invalid_target", "Selecciona un MultiCard.");
  const cards = [...current.cards];
  while (cards.length < n) {
    cards.push({ id: createSiteMultiCardCardId(), overrides: {} });
  }
  while (cards.length > n) {
    if (cards.length <= 1) break;
    cards.pop();
  }
  next.nodes[nodeId] = { ...current, cards, count: cards.length };
  return { ok: true, blueprint: next };
}

export function setMultiCardLayoutMode(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  layoutMode: SiteMultiCardLayoutMode,
  band: "wide" | ResponsiveEditableBand = "wide",
): BlueprintOpResult {
  const node = requireMultiCard(blueprint, nodeId);
  if ("ok" in node) return node;
  if (isResponsiveEditableBand(band)) {
    return {
      ok: true,
      blueprint: patchContainerTune({
        blueprint,
        target: { kind: "blueprintNode", nodeId },
        band,
        patch: { repeatMode: layoutMode },
      }).blueprint,
    };
  }
  if (node.layoutMode === layoutMode) return { ok: true, blueprint };
  const next = cloneBlueprint(blueprint);
  const current = next.nodes[nodeId];
  if (!current || !isSiteMultiCardNode(current)) return fail("invalid_target", "Selecciona un MultiCard.");
  next.nodes[nodeId] = { ...current, layoutMode };
  return { ok: true, blueprint: next };
}

export function duplicateMultiCardCard(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  cardId: string,
): BlueprintOpResult {
  const node = requireMultiCard(blueprint, nodeId);
  if ("ok" in node) return node;
  if (isMultiCardDatasetBound(node)) {
    return fail("multicard_dataset", "Con una lista conectada no se duplican cards a mano.");
  }
  if (node.cards.length >= MULTICARD_COUNT_MAX) {
    return fail("multicard_count", "No se pueden añadir más cards.");
  }
  const index = node.cards.findIndex((card) => card.id === cardId);
  if (index < 0) return fail("invalid_target", "Esa card no existe.");
  const next = cloneBlueprint(blueprint);
  const current = next.nodes[nodeId];
  if (!current || !isSiteMultiCardNode(current)) return fail("invalid_target", "Selecciona un MultiCard.");
  const source = current.cards[index]!;
  const copy = {
    id: createSiteMultiCardCardId(),
    overrides: Object.fromEntries(
      Object.entries(source.overrides).map(([layerId, slot]) => [layerId, { ...slot }]),
    ),
  };
  const cards = [...current.cards];
  cards.splice(index + 1, 0, copy);
  next.nodes[nodeId] = { ...current, cards, count: cards.length };
  return { ok: true, blueprint: next };
}

export function removeMultiCardCard(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  cardId: string,
): BlueprintOpResult {
  const node = requireMultiCard(blueprint, nodeId);
  if ("ok" in node) return node;
  if (isMultiCardDatasetBound(node)) {
    return fail("multicard_dataset", "Con una lista conectada las filas viven en el Dataset.");
  }
  if (node.cards[0]?.id === cardId) {
    return fail("multicard_card1", "La primera card es el molde y no se puede eliminar.");
  }
  if (node.cards.length <= 1) {
    return fail("multicard_count", "El MultiCard tiene que tener al menos una card.");
  }
  const next = cloneBlueprint(blueprint);
  const current = next.nodes[nodeId];
  if (!current || !isSiteMultiCardNode(current)) return fail("invalid_target", "Selecciona un MultiCard.");
  const cards = current.cards.filter((card) => card.id !== cardId);
  if (cards.length === current.cards.length) return fail("invalid_target", "Esa card no existe.");
  next.nodes[nodeId] = { ...current, cards, count: cards.length };
  return { ok: true, blueprint: next };
}

export function moveMultiCardCard(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  cardId: string,
  direction: -1 | 1,
): BlueprintOpResult {
  const node = requireMultiCard(blueprint, nodeId);
  if ("ok" in node) return node;
  if (isMultiCardDatasetBound(node)) {
    return fail("multicard_dataset", "El orden de las cards lo marca la lista del Dataset.");
  }
  const from = node.cards.findIndex((card) => card.id === cardId);
  if (from < 0) return fail("invalid_target", "Esa card no existe.");
  const to = from + direction;
  if (to < 0 || to >= node.cards.length) return { ok: true, blueprint };
  if (from === 0 || to === 0) {
    return fail("multicard_card1", "La primera card es el molde y tiene que quedar la primera.");
  }
  const next = cloneBlueprint(blueprint);
  const current = next.nodes[nodeId];
  if (!current || !isSiteMultiCardNode(current)) return fail("invalid_target", "Selecciona un MultiCard.");
  const cards = [...current.cards];
  const [moved] = cards.splice(from, 1);
  if (!moved) return { ok: true, blueprint };
  cards.splice(to, 0, moved);
  next.nodes[nodeId] = { ...current, cards, count: cards.length };
  return { ok: true, blueprint: next };
}

export function setMultiCardSlotOverride(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  cardId: string;
  moldLayerId: string;
  patch: SiteMultiCardSlotOverrideV1 | null;
}): BlueprintOpResult {
  const node = requireMultiCard(args.blueprint, args.nodeId);
  if ("ok" in node) return node;
  if (!node.cards.some((item) => item.id === args.cardId)) {
    return fail("invalid_target", "Esa card no existe.");
  }
  const next = cloneBlueprint(args.blueprint);
  const current = next.nodes[args.nodeId];
  if (!current || !isSiteMultiCardNode(current)) return fail("invalid_target", "Selecciona un MultiCard.");
  const cards = current.cards.map((item) => {
    if (item.id !== args.cardId) return item;
    const overrides = { ...item.overrides };
    if (args.patch == null) {
      delete overrides[args.moldLayerId];
      return { ...item, overrides };
    }
    const prev = overrides[args.moldLayerId] ?? {};
    const merged: SiteMultiCardSlotOverrideV1 = { ...prev };
    if (typeof args.patch.text === "string") merged.text = args.patch.text;
    if (args.patch.mediaRef) merged.mediaRef = { ...args.patch.mediaRef };
    if (!merged.text && !merged.mediaRef) delete overrides[args.moldLayerId];
    else overrides[args.moldLayerId] = merged;
    return { ...item, overrides };
  });
  next.nodes[args.nodeId] = { ...current, cards };
  return { ok: true, blueprint: next };
}

export function claimMultiCardDatasetList(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  dataset: Dataset;
  listId: string;
  index: SiteCreatorSelectionIndex;
}): BlueprintOpResult {
  const node = requireMultiCard(args.blueprint, args.nodeId);
  if ("ok" in node) return node;
  const next = claimMultiCardDatasetListPure(args);
  if (!next) return fail("invalid_target", "No se pudo enlazar esa lista.");
  try {
    return { ok: true, blueprint: assertValidBlueprint(next, args.index) };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

export function setMultiCardSlotBinding(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  moldLayerId: string;
  binding: SiteMultiCardSlotBindingV1 | null;
}): BlueprintOpResult {
  const node = requireMultiCard(args.blueprint, args.nodeId);
  if ("ok" in node) return node;
  const next = setMultiCardSlotBindingPure(args);
  if (!next) return fail("invalid_target", "No se pudo enlazar esa capa.");
  return { ok: true, blueprint: next };
}

export function setSectionHeightMode(
  blueprint: SiteBlueprintV1,
  sectionId: string,
  heightMode: SiteSectionHeightMode,
  band: "wide" | "monitor" | "tablet" | "mobile" = "wide",
  customHeight?: number,
): BlueprintOpResult {
  const node = blueprint.nodes[sectionId];
  if (!node || !isSiteSectionNode(node)) {
    return fail("invalid_target", "Selecciona una sección.");
  }
  const designed = Math.max(1, node.sourceRange.bottom - node.sourceRange.top);
  const requestedPx =
    typeof customHeight === "number" && Number.isFinite(customHeight)
      ? Math.max(1, Math.round(customHeight))
      : band === "wide"
        ? designed
        : 1;
  const px = band === "wide" ? Math.max(designed, requestedPx) : requestedPx;

  if (isResponsiveEditableBand(band)) {
    const patch =
      heightMode === "viewport"
        ? { heightMode: "viewport" as const, customHeight: undefined }
        : heightMode === "custom"
          ? { heightMode: "custom" as const, customHeight: px }
          : { heightMode: undefined, customHeight: undefined };
    const next = patchContainerTune({
      blueprint,
      target: { kind: "blueprintNode", nodeId: sectionId },
      band,
      patch,
    }).blueprint;
    return { ok: true, blueprint: next };
  }

  const next = cloneBlueprint(blueprint);
  const updated: SiteBlueprintSectionNode = { ...node };
  if (heightMode === "viewport") {
    updated.heightMode = "viewport";
    delete updated.customHeight;
  } else if (heightMode === "custom") {
    updated.heightMode = "custom";
    updated.customHeight = px;
  } else {
    delete updated.heightMode;
    delete updated.customHeight;
  }
  next.nodes[sectionId] = updated;
  return { ok: true, blueprint: next };
}

/**
 * Estira el marco de la sección en Original (`sourceRange.bottom`).
 * No mueve capas: el extra es padding inferior, sin solapar la siguiente sección.
 */
export function stretchSectionSourceRangeBottom(args: {
  blueprint: SiteBlueprintV1;
  sectionId: string;
  bottom: number;
  index: SiteCreatorSelectionIndex;
  pageHeight: number;
}): BlueprintOpResult {
  const node = args.blueprint.nodes[args.sectionId];
  if (!node || !isSiteSectionNode(node)) {
    return fail("invalid_target", "Selecciona una sección.");
  }
  const content = nodeVisualBounds(args.blueprint, node.id, args.index);
  const contentBottom = content
    ? content.y + content.height
    : node.sourceRange.top + 1;
  const sections = args.blueprint.rootChildIds
    .map((id) => args.blueprint.nodes[id])
    .filter((n): n is SiteBlueprintSectionNode => Boolean(n) && isSiteSectionNode(n))
    .sort((a, b) => a.sourceRange.top - b.sourceRange.top || a.id.localeCompare(b.id));
  const sectionIndex = sections.findIndex((item) => item.id === node.id);
  const nextSection = sectionIndex >= 0 ? sections[sectionIndex + 1] ?? null : null;
  const bottom = clampSectionSourceRangeBottom({
    contentBottom,
    nextSectionTop: nextSection ? nextSection.sourceRange.top : null,
    pageHeight: Math.max(1, args.pageHeight),
    requestedBottom: args.bottom,
  });
  if (Math.abs(bottom - node.sourceRange.bottom) < 0.5) {
    return { ok: true, blueprint: args.blueprint };
  }
  const next = cloneBlueprint(args.blueprint);
  next.nodes[node.id] = {
    ...node,
    sourceRange: { ...node.sourceRange, bottom },
  };
  return { ok: true, blueprint: next };
}

export function semanticNodeBounds(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  return nodeVisualBounds(blueprint, nodeId, index);
}

/** ¿sourceRange de una section contiene un rect? (test helper / UI). */
export function sectionContainsBounds(section: SiteBlueprintSectionNode, bounds: PageRect): boolean {
  return (
    bounds.y >= section.sourceRange.top &&
    bounds.y + bounds.height <= section.sourceRange.bottom
  );
}

export function pageRectContainedInRange(
  bounds: PageRect,
  range: { top: number; bottom: number },
): boolean {
  return bounds.y >= range.top && bounds.y + bounds.height <= range.bottom;
}

/**
 * Reparenta unidades (capas libres o nodos semánticos completos) a un contenedor.
 * No modifica geometría ni Designer.
 */
export function reparentUnitsToContainer(args: {
  blueprint: SiteBlueprintV1;
  units: Array<{ kind: "layer"; layerId: string } | { kind: "blueprintNode"; nodeId: string }>;
  targetContainerId: string;
  index: SiteCreatorSelectionIndex;
}): BlueprintOpResult {
  const { blueprint, units, targetContainerId, index } = args;
  const target = blueprint.nodes[targetContainerId];
  if (!target) return fail("missing", "El contenedor de destino no existe.");
  if (isSiteButtonNode(target)) {
    return fail("invalid_target", "No se puede añadir contenido estructural dentro de un botón.");
  }
  if (!isSiteStructuralContainerNode(target)) {
    return fail("invalid_target", "El destino no admite contenido.");
  }
  if (units.length === 0) return fail("empty_selection", "Selecciona al menos un elemento.");

  let next = cloneBlueprint(blueprint);
  const freeLayers: string[] = [];
  const nodeIds: string[] = [];

  for (const unit of units) {
    if (unit.kind === "layer") {
      if (!index.byId[unit.layerId]) {
        return fail("missing_layer", "Hay capas que ya no existen en el diseño.");
      }
      freeLayers.push(unit.layerId);
    } else {
      const node = next.nodes[unit.nodeId];
      if (!node) return fail("missing", "Hay elementos que ya no existen.");
      if (unit.nodeId === targetContainerId) {
        return fail("cycle", "No puedes añadir un contenedor dentro de sí mismo.");
      }
      // Impedir ciclos
      let walk: string | null = targetContainerId;
      while (walk) {
        if (walk === unit.nodeId) {
          return fail("cycle", "Esa operación crearía un ciclo en la estructura.");
        }
        walk = next.nodes[walk]?.parentId ?? null;
      }
      if (isSiteSectionNode(node) && isSiteSectionNode(target)) {
        return fail("nested_section", "No se puede anidar una sección dentro de otra.");
      }
      nodeIds.push(unit.nodeId);
    }
  }

  // Capas: quitar de owners previos y añadir al destino
  if (freeLayers.length) {
    next = moveLayersToBlueprintNode(next, targetContainerId, unique(freeLayers));
  }

  // Orden visual aproximado por zOrderPath
  const sortedNodes = [...nodeIds].sort((a, b) => {
    const za = collectSemanticCoverageLayerIds(next, a)
      .map((id) => index.byId[id]?.zOrderPath ?? [])
      .flat();
    const zb = collectSemanticCoverageLayerIds(next, b)
      .map((id) => index.byId[id]?.zOrderPath ?? [])
      .flat();
    return (za[0] ?? 0) - (zb[0] ?? 0);
  });

  for (const id of sortedNodes) {
    next = attachChild(next, targetContainerId, id, true);
  }

  try {
    return { ok: true, blueprint: assertValidBlueprint(next, index) };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

/**
 * Saca unidades del contenedor actual hacia el padre del contenedor (o raíz).
 */
export function removeUnitsFromContainer(args: {
  blueprint: SiteBlueprintV1;
  units: Array<{ kind: "layer"; layerId: string } | { kind: "blueprintNode"; nodeId: string }>;
  containerId: string;
  index: SiteCreatorSelectionIndex;
}): BlueprintOpResult {
  const { blueprint, units, containerId, index } = args;
  const container = blueprint.nodes[containerId];
  if (!container) return fail("missing", "El contenedor no existe.");
  const destinationParentId = container.parentId;

  let next = cloneBlueprint(blueprint);
  const layers: string[] = [];
  const nodeIds: string[] = [];

  for (const unit of units) {
    if (unit.kind === "layer") {
      if (!container.layerIds.includes(unit.layerId)) {
        return fail("not_child", "Ese elemento no pertenece a este contenedor.");
      }
      layers.push(unit.layerId);
    } else {
      const node = next.nodes[unit.nodeId];
      if (!node || node.parentId !== containerId) {
        return fail("not_child", "Ese elemento no pertenece a este contenedor.");
      }
      nodeIds.push(unit.nodeId);
    }
  }

  // Quitar capas del contenedor
  if (layers.length) {
    const moving = new Set(layers);
    const nodes = { ...next.nodes };
    const c = nodes[containerId]!;
    nodes[containerId] = {
      ...c,
      layerIds: c.layerIds.filter((id) => !moving.has(id)),
    } as SiteBlueprintNode;
    if (destinationParentId && nodes[destinationParentId]) {
      const parent = nodes[destinationParentId]!;
      nodes[destinationParentId] = {
        ...parent,
        layerIds: unique([...parent.layerIds, ...layers]),
      } as SiteBlueprintNode;
    }
    // Si destino es raíz, las capas quedan sin owner
    next = { ...next, nodes };
  }

  for (const id of nodeIds) {
    next = attachChild(next, destinationParentId, id, true);
  }

  try {
    return { ok: true, blueprint: assertValidBlueprint(next, index) };
  } catch (e) {
    return fail("validation", e instanceof Error ? e.message : "Blueprint inválido.");
  }
}

