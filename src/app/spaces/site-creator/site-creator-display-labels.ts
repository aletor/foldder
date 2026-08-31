import type { FreehandObject } from "../FreehandStudio";
import type { DesignerSourceSnapshotV1, SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteMultiCardNode, isSiteSectionNode } from "./site-creator-types";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import {
  collectSemanticCoverageLayerIds,
  findLayerSemanticOwner,
  outermostSemanticAncestor,
} from "./site-blueprint-ownership";
import { expandLayerIdsWithDesignerGroups } from "./site-creator-designer-group-id";
import { resolveSnapshotLayerById } from "./designer-source-layers";
import { parseMultiCardInstanceId } from "./site-creator-multicard-ids";
import { isMultiCardMoldWrapId, multiCardNodeIdFromWrapLayer } from "./site-creator-multicard-layout";

/** Unidad de selección orientada al usuario (no se persiste). */
export type SiteCreatorSelectionUnit =
  | { kind: "layer"; layerId: string }
  | { kind: "blueprintNode"; nodeId: string };

export function selectionUnitKey(unit: SiteCreatorSelectionUnit): string {
  return unit.kind === "layer" ? `layer:${unit.layerId}` : `node:${unit.nodeId}`;
}

export function sameSelectionUnit(a: SiteCreatorSelectionUnit, b: SiteCreatorSelectionUnit): boolean {
  return selectionUnitKey(a) === selectionUnitKey(b);
}

/** Label legible de una capa Designer (sin tipos técnicos). */
export function deriveLayerDisplayLabel(
  layerId: string,
  index: SiteCreatorSelectionIndex,
  snapshot?: DesignerSourceSnapshotV1 | null,
): string {
  const entry = index.byId[layerId];
  const obj = entry?.object ?? (snapshot ? resolveSnapshotLayerById(snapshot.page, layerId) : null);
  if (obj) {
    const text = readObjectText(obj);
    if (text) {
      if (obj.type === "text" || obj.type === "textOnPath") {
        return `Texto “${truncateLabel(text, 24)}”`;
      }
      return truncateLabel(text, 28);
    }
    if (isDesignerImageFrame(obj)) {
      return labelImageFrame(obj);
    }
    if (typeof obj.name === "string" && obj.name.trim()) {
      const localized = localizeEnglishTypeName(obj.name.trim());
      if (localized) return localized;
      if (!looksTechnicalName(obj.name, obj.type)) {
        return obj.name.trim();
      }
    }
    if (obj.type === "clippingContainer") {
      return labelClippingContainer(obj, index, snapshot);
    }
    return humanLayerFallback(obj.type);
  }
  return "Capa";
}

/** Nombres genéricos en inglés del Designer → español. */
function localizeEnglishTypeName(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (n === "text" || n === "texto") return "Texto";
  if (n === "shape" || n === "forma") return "Forma";
  if (n === "rect" || n === "rectangle" || n === "rectángulo" || n === "rectangulo") {
    return "Rectángulo";
  }
  if (n === "image" || n === "imagen" || n === "picture") return "Imagen";
  if (n === "photo" || n === "foto") return "Foto";
  if (n === "element" || n === "elemento" || n === "layer" || n === "capa") return null;
  return null;
}

function clippingContentHint(
  obj: FreehandObject,
  index: SiteCreatorSelectionIndex,
  snapshot?: DesignerSourceSnapshotV1 | null,
): string | null {
  const content = (obj as { content?: FreehandObject[] }).content ?? [];
  const first =
    content.find((c) => c.type === "image" || Boolean((c as { isImageFrame?: boolean }).isImageFrame)) ??
    content[0];
  if (!first) return null;
  const name = typeof first.name === "string" ? first.name.trim() : "";
  const usefulName = Boolean(name) && name !== first.id && !looksTechnicalName(name, first.type);
  if (first.type === "image" || Boolean((first as { isImageFrame?: boolean }).isImageFrame)) {
    const localized = name ? localizeEnglishTypeName(name) : null;
    if (localized) return localized;
    if (usefulName) return name;
    return "Imagen";
  }
  const text = readObjectText(first);
  if (text) {
    if (first.type === "text" || first.type === "textOnPath") {
      return `Texto “${truncateLabel(text, 24)}”`;
    }
    return truncateLabel(text, 28);
  }
  if (usefulName) return name;
  void index;
  void snapshot;
  return humanLayerFallback(first.type);
}

export function isDesignerImageFrame(obj: FreehandObject | null | undefined): boolean {
  return Boolean(obj && obj.type === "rect" && (obj as { isImageFrame?: boolean }).isImageFrame);
}

export function imageFrameHasPhoto(obj: FreehandObject): boolean {
  const src = (obj as { imageFrameContent?: { src?: string } | null }).imageFrameContent?.src;
  if (typeof src !== "string") return false;
  const trimmed = src.trim();
  return Boolean(trimmed) && trimmed !== "data:," && trimmed !== "data:";
}

function labelImageFrame(obj: FreehandObject): string {
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const usefulName = Boolean(name) && name !== obj.id && !looksTechnicalName(name, obj.type);
  if (usefulName && !localizeEnglishTypeName(name)) {
    return `Máscara · ${name}`;
  }
  return imageFrameHasPhoto(obj) ? "Máscara · Imagen" : "Máscara";
}

function labelClippingContainer(
  obj: FreehandObject,
  index: SiteCreatorSelectionIndex,
  snapshot?: DesignerSourceSnapshotV1 | null,
): string {
  const hint = clippingContentHint(obj, index, snapshot);
  return hint ? `Máscara · ${hint}` : "Máscara";
}

function readObjectText(obj: FreehandObject): string | null {
  if (obj.type === "text" || obj.type === "textOnPath") {
    const text = (obj as { text?: string }).text;
    if (typeof text === "string") {
      const flat = text.replace(/\s+/g, " ").trim();
      if (flat) return flat;
    }
  }
  return null;
}

function looksTechnicalName(name: string, type: string): boolean {
  const n = name.trim().toLowerCase();
  if (n === type.toLowerCase()) return true;
  if (/^(rect|ellipse|path|image|text|group|clip|shape|photo|picture|element)\s*\d*$/i.test(name.trim())) {
    return true;
  }
  if (/^clip(ping)?(\s*container)?\s*\d*$/i.test(name.trim())) return true;
  if (/^image\s*frame\s*\d*$/i.test(name.trim())) return true;
  if (/^marco(\s*de)?\s*imagen\s*\d*$/i.test(name.trim())) return true;
  if (/^campo(\s*de)?\s*imagen\s*\d*$/i.test(name.trim())) return true;
  if (/^[A-Z]{2,}_[A-Z0-9_]+$/.test(name.trim())) return true;
  // ids internos estilo btn_shape / layer_12
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/i.test(name.trim())) return true;
  return false;
}

export { looksTechnicalName };

function humanLayerFallback(type: string): string {
  switch (type) {
    case "rect":
      return "Rectángulo";
    case "ellipse":
      return "Elipse";
    case "path":
      return "Trazado";
    case "image":
      return "Imagen";
    case "text":
    case "textOnPath":
      return "Texto";
    case "groupContainer":
      return "Grupo de capas";
    case "booleanGroup":
      return "Composición";
    case "clippingContainer":
      return "Máscara";
    default:
      return "Elemento";
  }
}

function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Label visible de un nodo Blueprint (Outline, cabecera, canvas). */
export function deriveBlueprintNodeDisplayLabel(
  node: SiteBlueprintNode,
  snapshot?: DesignerSourceSnapshotV1 | null,
  index?: SiteCreatorSelectionIndex | null,
): string {
  if (isSiteSectionNode(node)) {
    return node.sectionType === "hero" ? "Hero" : node.label?.trim() || "Sección";
  }
  if (node.kind === "layoutGroup") {
    const n = node.childIds.length + node.layerIds.length;
    const base = node.label?.trim() || "Grupo";
    if (n <= 0) return base;
    return `${base} · ${n} ${n === 1 ? "elemento" : "elementos"}`;
  }
  if (isSiteMultiCardNode(node)) {
    const base = node.label?.trim() || "MultiCard";
    return `${base} · ×${node.count}`;
  }
  if (isSiteButtonNode(node)) {
    const fromLabelLayer = node.config.labelLayerId
      ? readLabelFromLayer(node.config.labelLayerId, snapshot, index)
      : null;
    if (fromLabelLayer) return `Botón “${truncateLabel(fromLabelLayer, 24)}”`;
    const accessible = node.config.accessibleLabel?.trim();
    if (accessible) return `Botón “${truncateLabel(accessible, 24)}”`;
    const fromNodeLabel = node.label?.trim();
    if (fromNodeLabel && fromNodeLabel.toLowerCase() !== "botón" && fromNodeLabel.toLowerCase() !== "button") {
      return `Botón “${truncateLabel(fromNodeLabel, 24)}”`;
    }
    return "Botón sin texto";
  }
  return "Elemento";
}

function readLabelFromLayer(
  layerId: string,
  snapshot?: DesignerSourceSnapshotV1 | null,
  index?: SiteCreatorSelectionIndex | null,
): string | null {
  if (index?.byId[layerId]) {
    return readObjectText(index.byId[layerId]!.object);
  }
  if (snapshot) {
    const obj = resolveSnapshotLayerById(snapshot.page, layerId);
    return obj ? readObjectText(obj) : null;
  }
  return null;
}

function semanticOwnerFromDisplayLayer(
  layerId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): { owner: SiteBlueprintNode | null; resolvedLayerId: string } {
  const instance = parseMultiCardInstanceId(layerId);
  const resolvedLayerId = instance?.moldLayerId ?? layerId;
  if (instance && blueprint.nodes[instance.nodeId] && isSiteMultiCardNode(blueprint.nodes[instance.nodeId]!)) {
    return { owner: blueprint.nodes[instance.nodeId]!, resolvedLayerId };
  }
  const wrapNodeId = multiCardNodeIdFromWrapLayer(layerId);
  if (wrapNodeId && isSiteMultiCardNode(blueprint.nodes[wrapNodeId])) {
    return { owner: blueprint.nodes[wrapNodeId]!, resolvedLayerId };
  }
  return {
    owner: findLayerSemanticOwner(blueprint, resolvedLayerId, index),
    resolvedLayerId,
  };
}

/**
 * En el nivel raíz (sin inspección), el clic resuelve al ancestro semántico
 * más externo (sección si existe; si no, grupo / MultiCard).
 * Excepción: los botones van primero — se seleccionan saltando sección y grupos.
 * Los siguientes clics descienden con `resolveInspectClickUnit`.
 */
export function resolveRootClickUnit(
  layerId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionUnit {
  const { owner, resolvedLayerId } = semanticOwnerFromDisplayLayer(layerId, blueprint, index);
  const button = nearestButtonAncestor(blueprint, owner);
  if (button) {
    return { kind: "blueprintNode", nodeId: button.id };
  }
  if (
    owner &&
    (owner.kind === "layoutGroup" || isSiteMultiCardNode(owner) || isSiteSectionNode(owner))
  ) {
    const outermost = outermostSemanticAncestor(blueprint, owner);
    return { kind: "blueprintNode", nodeId: outermost.id };
  }
  return { kind: "layer", layerId: resolvedLayerId };
}

/**
 * Rollover: el botón va primero (por encima de sección y grupo).
 * Si no hay botón: sección; si no, grupo más externo.
 */
export function resolveHoverScopeUnit(
  layerId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionUnit | null {
  const { owner } = semanticOwnerFromDisplayLayer(layerId, blueprint, index);
  if (!owner) return null;
  const button = nearestButtonAncestor(blueprint, owner);
  if (button) return { kind: "blueprintNode", nodeId: button.id };
  let current: SiteBlueprintNode | null = owner;
  let sectionId: string | null = null;
  let groupId: string | null = null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (isSiteSectionNode(current)) sectionId = current.id;
    if (current.kind === "layoutGroup") groupId = current.id;
    current = current.parentId ? blueprint.nodes[current.parentId] ?? null : null;
  }
  if (sectionId) return { kind: "blueprintNode", nodeId: sectionId };
  if (groupId) return { kind: "blueprintNode", nodeId: groupId };
  return null;
}

/** Botón más cercano hacia la raíz (sección/grupos se saltan). */
function nearestButtonAncestor(
  blueprint: SiteBlueprintV1,
  start: SiteBlueprintNode | null,
): SiteBlueprintNode | null {
  let current = start;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (isSiteButtonNode(current)) return current;
    current = current.parentId ? blueprint.nodes[current.parentId] ?? null : null;
  }
  return null;
}

/** Dentro de un contenedor semántico (Button/Grupo/Sección). */
export function resolveInspectClickUnit(
  layerId: string,
  inspectNodeId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionUnit {
  const { owner, resolvedLayerId } = semanticOwnerFromDisplayLayer(layerId, blueprint, index);
  if (!owner || owner.id === inspectNodeId) {
    return { kind: "layer", layerId: resolvedLayerId };
  }
  let current: string | null = owner.id;
  while (current) {
    const node: SiteBlueprintNode | undefined = blueprint.nodes[current];
    if (!node) break;
    if (node.parentId === inspectNodeId) {
      return { kind: "blueprintNode", nodeId: current };
    }
    current = node.parentId;
  }
  return { kind: "layer", layerId: resolvedLayerId };
}

/** Capas que “pertenecen” a una unidad para hit/outline. */
export function unitCoverageLayerIds(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index?: SiteCreatorSelectionIndex | null,
): string[] {
  if (unit.kind === "layer") return [unit.layerId];
  const mold = collectSemanticCoverageLayerIds(blueprint, unit.nodeId);
  const node = blueprint.nodes[unit.nodeId];
  if (!node || !isSiteMultiCardNode(node) || !index) return mold;
  const extra: string[] = [];
  for (const entry of index.entries) {
    const parsed = parseMultiCardInstanceId(entry.layerId);
    if (parsed?.nodeId === unit.nodeId) extra.push(entry.layerId);
  }
  return [...mold, ...extra];
}

export const MARQUEE_GROUP_BLOCK_MESSAGE = "Desagrupa primero los elementos agrupados";

function isNonSectionGroupingNode(node: SiteBlueprintNode): boolean {
  return node.kind === "layoutGroup" || isSiteButtonNode(node) || isSiteMultiCardNode(node);
}

/** Grupo / botón / MultiCard más externo; las secciones no cuentan. */
function outermostNonSectionGrouping(
  blueprint: SiteBlueprintV1,
  start: SiteBlueprintNode,
): SiteBlueprintNode | null {
  let current: SiteBlueprintNode | null = start;
  let found: SiteBlueprintNode | null = null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (isNonSectionGroupingNode(current)) found = current;
    current = current.parentId ? blueprint.nodes[current.parentId] ?? null : null;
  }
  return found;
}

/**
 * Marquee: si una capa está dentro de un grupo/botón/MultiCard, se selecciona
 * esa agrupación (no las capas internas). Las secciones no absorben la selección.
 */
export function layersToMarqueeSelectionUnits(
  layerIds: string[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionUnit[] {
  const units: SiteCreatorSelectionUnit[] = [];
  const seen = new Set<string>();
  for (const layerId of layerIds) {
    const { owner, resolvedLayerId } = semanticOwnerFromDisplayLayer(layerId, blueprint, index);
    if (isMultiCardMoldWrapId(resolvedLayerId)) continue;
    const grouping = owner ? outermostNonSectionGrouping(blueprint, owner) : null;
    const unit: SiteCreatorSelectionUnit = grouping
      ? { kind: "blueprintNode", nodeId: grouping.id }
      : { kind: "layer", layerId: resolvedLayerId };
    const key = selectionUnitKey(unit);
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(unit);
  }
  return units;
}

export function layerBelongsToNonSectionGrouping(
  layerId: string,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): boolean {
  const { owner } = semanticOwnerFromDisplayLayer(layerId, blueprint, index);
  let current = owner;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (isNonSectionGroupingNode(current)) return true;
    current = current.parentId ? blueprint.nodes[current.parentId] ?? null : null;
  }
  return false;
}

/** Tras un marquee, Agrupar se bloquea si algún objeto suelto ya está en grupo/botón/MultiCard. */
export function marqueeUnitsBlockGrouping(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): boolean {
  return units.some((unit) => {
    if (unit.kind !== "layer") return false;
    return layerBelongsToNonSectionGrouping(unit.layerId, blueprint, index);
  });
}

/**
 * Colapsa capas de clic a unidades de usuario.
 * No mezcla un Component con sus capas.
 */
export function collapseLayersToSelectionUnits(
  layerIds: string[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionUnit[] {
  const expanded = expandLayerIdsWithDesignerGroups(layerIds, index, blueprint);
  const units: SiteCreatorSelectionUnit[] = [];
  const seen = new Set<string>();
  for (const layerId of expanded) {
    const unit = resolveRootClickUnit(layerId, blueprint, index);
    const key = selectionUnitKey(unit);
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(unit);
  }
  return collapseNestedUnits(units, blueprint);
}

/** Evita Component + sus descendientes / LayoutGroup + hijos a la vez. */
export function collapseNestedUnits(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
): SiteCreatorSelectionUnit[] {
  const nodeIds = new Set(
    units.filter((u): u is { kind: "blueprintNode"; nodeId: string } => u.kind === "blueprintNode").map((u) => u.nodeId),
  );
  const coverageByNode = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    coverageByNode.set(id, new Set(collectSemanticCoverageLayerIds(blueprint, id)));
  }

  return units.filter((unit) => {
    if (unit.kind === "layer") {
      for (const [, coverage] of coverageByNode) {
        if (coverage.has(unit.layerId)) return false;
      }
      return true;
    }
    const node = blueprint.nodes[unit.nodeId];
    if (!node?.parentId) return true;
    // Si el padre semántico también está seleccionado, quedarse con el padre
    let parentId: string | null = node.parentId;
    while (parentId) {
      if (nodeIds.has(parentId)) return false;
      parentId = blueprint.nodes[parentId]?.parentId ?? null;
    }
    return true;
  });
}

export function toggleSelectionUnit(
  units: SiteCreatorSelectionUnit[],
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
): SiteCreatorSelectionUnit[] {
  const key = selectionUnitKey(unit);
  const exists = units.some((u) => selectionUnitKey(u) === key);
  const next = exists
    ? units.filter((u) => selectionUnitKey(u) !== key)
    : collapseNestedUnits([...units, unit], blueprint);
  return next;
}

/** Layer IDs a pasar a las ops de Blueprint (cobertura completa de Components). */
export function unitsToStructureLayerIds(
  units: SiteCreatorSelectionUnit[],
  blueprint: SiteBlueprintV1,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    for (const id of unitCoverageLayerIds(unit, blueprint)) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function countSelectionElements(units: SiteCreatorSelectionUnit[]): number {
  return units.length;
}
