import type { DesignerSourceSnapshotV1, SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteMultiCardNode, isSiteSectionNode } from "./site-creator-types";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { PersistentStructureGate } from "./site-blueprint-history";
import { findLayerSemanticOwner } from "./site-blueprint-ownership";
import type { ResponsiveBandLike } from "./site-creator-responsive-overrides";
import {
  deriveBlueprintNodeDisplayLabel,
  deriveLayerDisplayLabel,
  type SiteCreatorSelectionUnit,
} from "./site-creator-display-labels";
import { extractAccessibleLabelFromLayers, isWrapEligibleSemanticNode, resolveButtonParent } from "./site-blueprint-ops";
import {
  containerDisplayLabel,
  containersFullyContainingUnit,
  inferSingleContainerForFreeLayers,
  isSemanticContainerNode,
} from "./site-creator-hierarchy";

export type SiteCreatorPrimaryAction = {
  id:
    | "createButton"
    | "createSection"
    | "keepTogether"
    | "createMultiCard"
    | "undoMultiCard"
    | "undoButton"
    | "undoSection"
    | "separateGroup"
    | "exitInspect"
    | "editContent"
    | "addToContainer"
    | "removeFromContainer"
    | "chooseAddTarget"
    | "useAsBackground"
    | "restoreBackground";
  label: string;
  primary?: boolean;
  /** Destino implícito para addToContainer. */
  targetContainerId?: string;
};

/** @deprecated Overflow eliminado en 5B; se mantiene el tipo vacío por compat. */
export type SiteCreatorOverflowAction = never;

export interface SiteCreatorContextualModel {
  summary: string | null;
  primaryActions: SiteCreatorPrimaryAction[];
  overflowActions: SiteCreatorOverflowAction[];
  canvasLabel: string | null;
  breadcrumb: string | null;
  statusMessage?: string | null;
  /** Destinos cuando hace falta elegir contenedor. */
  addTargetCandidates?: { id: string; label: string }[];
}

export interface ResolveContextualArgs {
  units: SiteCreatorSelectionUnit[];
  inspectNodeId: string | null;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  snapshot: DesignerSourceSnapshotV1 | null;
  persistGate: PersistentStructureGate;
  /** Vista activa: Original no muestra Ancho completo ni layout de dispositivo. */
  band?: ResponsiveBandLike;
}

function isTextLayer(layerId: string, index: SiteCreatorSelectionIndex): boolean {
  const t = index.byId[layerId]?.type;
  return t === "text" || t === "textOnPath";
}

function isVisualCompanion(layerId: string, index: SiteCreatorSelectionIndex): boolean {
  const t = index.byId[layerId]?.type;
  return t === "rect" || t === "ellipse" || t === "path" || t === "image" || t === "groupContainer";
}

function groupContainerHasButtonParts(
  layerId: string,
  index: SiteCreatorSelectionIndex,
): boolean {
  const entry = index.byId[layerId];
  if (!entry || entry.type !== "groupContainer") return false;
  let hasText = false;
  let hasVisual = false;
  for (const child of index.entries) {
    if (!child.ancestorIds.includes(layerId) && child.layerId !== layerId) continue;
    if (child.layerId === layerId) continue;
    if (isTextLayer(child.layerId, index)) hasText = true;
    else if (isVisualCompanion(child.layerId, index)) hasVisual = true;
  }
  return hasText && hasVisual;
}

export function looksLikeButtonCandidate(
  units: SiteCreatorSelectionUnit[],
  index: SiteCreatorSelectionIndex,
): boolean {
  if (units.length === 0) return false;
  if (units.some((u) => u.kind !== "layer")) return false;
  const layerIds = units.map((u) => (u as { layerId: string }).layerId);

  if (layerIds.length === 1) {
    return groupContainerHasButtonParts(layerIds[0]!, index);
  }

  const texts = layerIds.filter((id) => isTextLayer(id, index));
  const visuals = layerIds.filter((id) => isVisualCompanion(id, index));
  return texts.length >= 1 && visuals.length >= 1;
}

/** Padre semántico efectivo: null = raíz de página. */
export function unitStructureParentId(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): string | null {
  if (unit.kind === "blueprintNode") {
    return blueprint.nodes[unit.nodeId]?.parentId ?? null;
  }
  const owner = findLayerSemanticOwner(blueprint, unit.layerId, index);
  return owner?.id ?? null;
}

export function unitsShareCompatibleParent(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): boolean {
  if (units.length <= 1) return true;
  const parents = new Set(units.map((u) => unitStructureParentId(u, blueprint, index) ?? "__root__"));
  if (parents.size !== 1) return false;

  const nodeIds = units
    .filter((u): u is { kind: "blueprintNode"; nodeId: string } => u.kind === "blueprintNode")
    .map((u) => u.nodeId);
  for (const id of nodeIds) {
    for (const other of nodeIds) {
      if (id === other) continue;
      if (isAncestor(blueprint, id, other)) return false;
    }
    for (const u of units) {
      if (u.kind !== "layer") continue;
      const owner = findLayerSemanticOwner(blueprint, u.layerId, index);
      if (owner && (owner.id === id || isAncestor(blueprint, id, owner.id))) return false;
    }
  }
  return true;
}

function isAncestor(blueprint: SiteBlueprintV1, ancestorId: string, nodeId: string): boolean {
  let current: string | null = nodeId;
  while (current) {
    const node: SiteBlueprintNode | undefined = blueprint.nodes[current];
    if (!node) return false;
    if (node.parentId === ancestorId) return true;
    current = node.parentId;
  }
  return false;
}

export function resolveContextualModel(args: ResolveContextualArgs): SiteCreatorContextualModel {
  const { units, inspectNodeId, blueprint, index, snapshot, persistGate } = args;

  if (inspectNodeId) {
    return resolveInspectModel(args);
  }

  if (units.length === 0) {
    return emptyCtx();
  }

  if (units.length === 1 && units[0]!.kind === "blueprintNode") {
    const node = blueprint.nodes[units[0]!.nodeId];
    if (!node) return emptyCtx();
    const label = containerDisplayLabel(node, snapshot, index);
    if (isSiteButtonNode(node)) {
      return {
        summary: label,
        primaryActions: [{ id: "undoButton", label: "Deshacer botón" }],
        overflowActions: [],
        canvasLabel: label,
        breadcrumb: node.parentId
          ? `${containerDisplayLabel(blueprint.nodes[node.parentId]!, snapshot, index)} / ${label}`
          : label,
      };
    }
    if (isSiteSectionNode(node)) {
      return {
        summary: label,
        primaryActions: [
          {
            id: "undoSection",
            label: node.sectionType === "hero" ? "Deshacer Hero" : "Deshacer sección",
          },
        ],
        overflowActions: [],
        canvasLabel: label,
        breadcrumb: null,
      };
    }
    if (node.kind === "layoutGroup") {
      const actions: SiteCreatorPrimaryAction[] = [];
      actions.push({ id: "separateGroup", label: "Desagrupar" });
      if (persistGate.allowed) {
        actions.push({ id: "createMultiCard", label: "Multiplicar" });
      }
      return {
        summary: label,
        primaryActions: actions,
        overflowActions: [],
        canvasLabel: label,
        breadcrumb: null,
      };
    }
    if (isSiteMultiCardNode(node)) {
      return {
        summary: label,
        primaryActions: [{ id: "undoMultiCard", label: "Deshacer MultiCard" }],
        overflowActions: [],
        canvasLabel: label,
        breadcrumb: node.parentId
          ? `${containerDisplayLabel(blueprint.nodes[node.parentId]!, snapshot, index)} / ${label}`
          : label,
      };
    }
  }

  // Contenedor + elementos libres → Añadir / Mover
  const addModel = resolveAddToContainerActions(units, blueprint, index, snapshot);
  if (addModel) {
    if (!persistGate.allowed) {
      return {
        ...addModel,
        primaryActions: [],
        statusMessage: persistGate.message,
      };
    }
    return addModel;
  }

  if (!persistGate.allowed) {
    return {
      summary: summarizeUnits(units, blueprint, index, snapshot),
      primaryActions: [],
      overflowActions: [],
      canvasLabel: canvasLabelForUnits(units, blueprint, index, snapshot),
      breadcrumb: null,
      statusMessage: persistGate.message,
    };
  }

  if (!unitsShareCompatibleParent(units, blueprint, index)) {
    // Puede ser capa libre contenida visualmente en un único Hero
    const freeLayers = units.filter((u) => u.kind === "layer").map((u) => u.layerId);
    if (freeLayers.length === units.length) {
      const inferred = inferSingleContainerForFreeLayers(freeLayers, blueprint, index);
      if (inferred && persistGate.allowed) {
        const target = blueprint.nodes[inferred]!;
        const destLabel = shortContainerName(target);
        return {
          summary: summarizeUnits(units, blueprint, index, snapshot),
          primaryActions: [
            {
              id: "addToContainer",
              label: freeLayers.length > 1 ? `Añadir ${freeLayers.length} elementos a ${destLabel}` : `Añadir a ${destLabel}`,
              primary: true,
              targetContainerId: inferred,
            },
            ...(looksLikeButtonCandidate(units, index)
              ? [
                  {
                    id: "createButton" as const,
                    label: `Crear botón en ${destLabel}`,
                    primary: false,
                    targetContainerId: inferred,
                  },
                ]
              : []),
          ],
          overflowActions: [],
          canvasLabel: canvasLabelForUnits(units, blueprint, index, snapshot),
          breadcrumb: null,
        };
      }
      const ambiguous = freeLayers.length
        ? containersFullyContainingUnit(units[0]!, blueprint, index)
        : [];
      if (ambiguous.length > 1 && persistGate.allowed) {
        return {
          summary: summarizeUnits(units, blueprint, index, snapshot),
          primaryActions: [{ id: "chooseAddTarget", label: "Añadir a…", primary: true }],
          overflowActions: [],
          canvasLabel: canvasLabelForUnits(units, blueprint, index, snapshot),
          breadcrumb: null,
          addTargetCandidates: ambiguous.map((id) => ({
            id,
            label: shortContainerName(blueprint.nodes[id]!),
          })),
        };
      }
    }
    return {
      summary: summarizeUnits(units, blueprint, index, snapshot),
      primaryActions: [],
      overflowActions: [],
      canvasLabel: canvasLabelForUnits(units, blueprint, index, snapshot),
      breadcrumb: null,
      statusMessage: "Los elementos deben estar en el mismo nivel. Entra al contenedor o arrastra en el outline.",
    };
  }

  const layerOnly = units.every((u) => u.kind === "layer");
  const n = units.length;
  const summary = summarizeUnits(units, blueprint, index, snapshot);
  const insideSection = selectionContainsUnitInsideSection(
    units,
    blueprint,
    index,
  );

  const actions: SiteCreatorPrimaryAction[] = [];
  const canButton = looksLikeButtonCandidate(units, index);

  if (canButton) {
    const parentHint = buttonParentHint(units, blueprint, index);
    const inferred =
      !parentHint && layerOnly
        ? inferSingleContainerForFreeLayers(
            units.map((u) => (u as { layerId: string }).layerId),
            blueprint,
            index,
          )
        : null;
    const dest = parentHint ?? (inferred ? shortContainerName(blueprint.nodes[inferred]!) : null);
    actions.push({
      id: "createButton",
      label: dest ? `Crear botón en ${dest}` : "Crear botón",
      primary: true,
      targetContainerId: inferred ?? undefined,
    });
  }

  if (!insideSection) {
    actions.push({ id: "createSection", label: "Crear sección" });
  }

  if (n >= 2) {
    actions.push({ id: "keepTogether", label: groupActionLabel(units, blueprint) });
  }

  if (n >= 2 && persistGate.allowed) {
    actions.push({ id: "createMultiCard", label: "Multiplicar" });
  }

  return {
    summary,
    primaryActions: actions,
    overflowActions: [],
    canvasLabel: canvasLabelForUnits(units, blueprint, index, snapshot),
    breadcrumb: breadcrumbForUnits(units, blueprint, index, snapshot),
    statusMessage:
      n === 1 && layerOnly && !canButton
        ? "Ctrl/Cmd + clic para añadir elementos"
        : null,
  };
}

function shortContainerName(node: SiteBlueprintNode): string {
  if (isSiteSectionNode(node)) return node.sectionType === "hero" ? "Hero" : "Sección";
  if (node.kind === "layoutGroup") return "Grupo";
  if (isSiteMultiCardNode(node)) return "MultiCard";
  if (isSiteButtonNode(node)) return "Botón";
  return "contenedor";
}

export function canWrapSemanticUnits(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
): boolean {
  if (units.length < 2) return false;
  if (!units.every((u) => u.kind === "blueprintNode")) return false;
  return units.every((u) => isWrapEligibleSemanticNode(blueprint, u.nodeId));
}

export function groupActionLabel(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
): string {
  return canWrapSemanticUnits(units, blueprint) ? "Envolver en grupo" : "Agrupar";
}

function resolveAddToContainerActions(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): SiteCreatorContextualModel | null {
  const containers = units.filter(
    (u): u is { kind: "blueprintNode"; nodeId: string } =>
      u.kind === "blueprintNode" && isSemanticContainerNode(blueprint.nodes[u.nodeId]) && !isSiteButtonNode(blueprint.nodes[u.nodeId]!),
  );
  const others = units.filter((u) => !containers.some((c) => c.nodeId === (u.kind === "blueprintNode" ? u.nodeId : "")));
  if (containers.length !== 1 || others.length === 0) return null;
  const targetId = containers[0]!.nodeId;
  const target = blueprint.nodes[targetId]!;
  const destLabel = shortContainerName(target);

  // ¿Ya pertenecían?
  let moving = false;
  for (const u of others) {
    if (u.kind === "layer") {
      const owner = findLayerSemanticOwner(blueprint, u.layerId, index);
      if (owner && owner.id !== targetId) moving = true;
    } else {
      const node = blueprint.nodes[u.nodeId];
      if (node?.parentId && node.parentId !== targetId) moving = true;
    }
  }

  const n = others.length;
  const verb = moving ? "Mover" : "Añadir";
  const label =
    n === 1 ? `${verb} a ${destLabel}` : `${verb} ${n} elementos a ${destLabel}`;

  return {
    summary: summarizeUnits(units, blueprint, index, snapshot),
    primaryActions: [
      { id: "addToContainer", label, primary: true, targetContainerId: targetId },
    ],
    overflowActions: [],
    canvasLabel: canvasLabelForUnits(units, blueprint, index, snapshot),
    breadcrumb: null,
  };
}

function resolveInspectModel(args: ResolveContextualArgs): SiteCreatorContextualModel {
  const { units, inspectNodeId, blueprint, index, snapshot, persistGate } = args;
  const node = inspectNodeId ? blueprint.nodes[inspectNodeId] : null;
  const inner = units[0];
  const innerLabel =
    inner?.kind === "layer"
      ? deriveLayerDisplayLabel(inner.layerId, index, snapshot)
      : inner?.kind === "blueprintNode" && blueprint.nodes[inner.nodeId]
        ? deriveBlueprintNodeDisplayLabel(blueprint.nodes[inner.nodeId]!, snapshot, index)
        : null;

  if (node && isSiteButtonNode(node)) {
    return {
      summary: null,
      primaryActions: [],
      overflowActions: [],
      canvasLabel: innerLabel,
      breadcrumb: null,
    };
  }

  const actions: SiteCreatorPrimaryAction[] = [];

  if (units.length > 0 && unitsShareCompatibleParent(units, blueprint, index) && persistGate.allowed) {
    if (looksLikeButtonCandidate(units, index)) {
      actions.push({ id: "createButton", label: "Crear botón", primary: true });
    }
    if (units.length >= 2) {
      actions.push({ id: "keepTogether", label: groupActionLabel(units, blueprint) });
    }
    if (units.length >= 2) {
      actions.push({ id: "createMultiCard", label: "Multiplicar" });
    }
  }

  return {
    summary: units.length > 1 ? summarizeUnits(units, blueprint, index, snapshot) : null,
    primaryActions: actions.slice(0, 3),
    overflowActions: [],
    canvasLabel: innerLabel,
    breadcrumb: null,
    statusMessage:
      units.length > 0 && !unitsShareCompatibleParent(units, blueprint, index)
        ? "Los elementos deben estar en el mismo nivel. Muévelos primero al mismo contenedor."
        : null,
  };
}

function emptyCtx(): SiteCreatorContextualModel {
  return {
    summary: null,
    primaryActions: [],
    overflowActions: [],
    canvasLabel: null,
    breadcrumb: null,
  };
}

function summarizeUnits(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): string {
  if (units.length === 1) {
    const u = units[0]!;
    if (u.kind === "layer") return deriveLayerDisplayLabel(u.layerId, index, snapshot);
    const node = blueprint.nodes[u.nodeId];
    return node ? deriveBlueprintNodeDisplayLabel(node, snapshot, index) : "Elemento";
  }
  return `${units.length} elementos seleccionados`;
}

function canvasLabelForUnits(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): string | null {
  if (units.length === 1) return summarizeUnits(units, blueprint, index, snapshot);
  return `${units.length} elementos`;
}

function breadcrumbForUnits(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  snapshot: DesignerSourceSnapshotV1 | null,
): string | null {
  if (units.length !== 1 || units[0]!.kind !== "blueprintNode") return null;
  const node = blueprint.nodes[units[0]!.nodeId];
  if (!node?.parentId) return null;
  const parent = blueprint.nodes[node.parentId];
  if (!parent) return null;
  return `${deriveBlueprintNodeDisplayLabel(parent, snapshot, index)} / ${deriveBlueprintNodeDisplayLabel(node, snapshot, index)}`;
}

export function selectionContainsUnitInsideSection(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): boolean {
  for (const u of units) {
    let nodeId =
      u.kind === "blueprintNode"
        ? u.nodeId
        : unitStructureParentId(u, blueprint, index);
    while (nodeId) {
      const node = blueprint.nodes[nodeId];
      if (!node) break;
      if (isSiteSectionNode(node)) return true;
      nodeId = node.parentId;
    }
  }
  return false;
}

function buttonParentHint(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): string | null {
  const layerIds = units.filter((u) => u.kind === "layer").map((u) => u.layerId);
  const res = resolveButtonParent({ blueprint, selectedLayerIds: layerIds, index });
  if (res.status !== "resolved" || res.parentId == null) return null;
  const parent = blueprint.nodes[res.parentId];
  if (!parent) return null;
  if (isSiteSectionNode(parent) && parent.sectionType === "hero") return "Hero";
  if (isSiteSectionNode(parent)) return "Sección";
  if (parent.kind === "layoutGroup") return "Grupo";
  return null;
}

/** Helper exportado para tests de “forma + texto”. */
export function selectionHasTextAndShape(
  units: SiteCreatorSelectionUnit[],
  index: SiteCreatorSelectionIndex,
): boolean {
  return looksLikeButtonCandidate(units, index);
}

export function extractTextMeta(units: SiteCreatorSelectionUnit[], index: SiteCreatorSelectionIndex) {
  const layerIds = units.filter((u) => u.kind === "layer").map((u) => u.layerId);
  return extractAccessibleLabelFromLayers(layerIds, index);
}
