/**
 * MultiCard × Dataset: el catálogo es la lista, la card es la fila, la capa es la celda.
 * Puro: sin React, sin APIs de pago, sin reescribir Designer.
 */
import type { Dataset, DatasetList, FieldDef, FieldType, FieldValue } from "../dataset/dataset-types";
import {
  fieldValueAsText,
  getConstantFieldValue,
  getListFieldValueAtRow,
} from "../dataset/dataset-logic";
import { normalizeDataset } from "../dataset/dataset-migrate";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import { createSiteMultiCardCardId } from "./site-blueprint-ids";
import { isDesignerImageFrame } from "./site-creator-display-labels";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type {
  SiteBlueprintMultiCardNode,
  SiteBlueprintV1,
  SiteMultiCardInstanceV1,
  SiteMultiCardSlotBindingV1,
  SiteMultiCardSlotOverrideV1,
} from "./site-creator-types";
import {
  MULTICARD_COUNT_MAX,
  isSiteMultiCardNode,
} from "./site-creator-types";

export type MoldSlotKind = "text" | "image";

export type MoldSlot = {
  layerId: string;
  kind: MoldSlotKind;
  area: number;
  sampleText: string;
};

export function isMultiCardDatasetBound(node: SiteBlueprintMultiCardNode): boolean {
  return node.dataset?.kind === "dataset" && Boolean(node.dataset.listId);
}

export function datasetFieldBindKind(type: FieldType): MoldSlotKind | null {
  if (type === "image") return "image";
  if (
    type === "text" ||
    type === "number" ||
    type === "url" ||
    type === "select" ||
    type === "color" ||
    type === "boolean"
  ) {
    return "text";
  }
  return null;
}

export function datasetListHiddenRowCount(dataset: Dataset, listId: string, shown: number): number {
  const list = normalizeDataset(dataset).lists.find((item) => item.id === listId);
  if (!list) return 0;
  return Math.max(0, list.cards.length - shown);
}

export function usableDatasetLists(dataset: Dataset): DatasetList[] {
  return normalizeDataset(dataset).lists.filter(
    (list) => list.schema.length > 0 || list.cards.length > 0,
  );
}

export function collectMoldSlots(
  coverageLayerIds: string[],
  index: SiteCreatorSelectionIndex,
): MoldSlot[] {
  const slots: MoldSlot[] = [];
  for (const layerId of coverageLayerIds) {
    const entry = index.byId[layerId];
    if (!entry?.object) continue;
    const obj = entry.object;
    const area = Math.max(1, entry.visualBounds.width * entry.visualBounds.height);
    if (obj.type === "text" || obj.type === "textOnPath") {
      const text = typeof (obj as { text?: string }).text === "string" ? (obj as { text: string }).text : "";
      slots.push({ layerId, kind: "text", area, sampleText: text.replace(/\s+/g, " ").trim() });
      continue;
    }
    if (obj.type === "image" || isDesignerImageFrame(obj)) {
      slots.push({ layerId, kind: "image", area, sampleText: "" });
    }
  }
  return slots;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function fieldNameScore(field: FieldDef, slot: MoldSlot): number {
  const n = normalizeName(`${field.key} ${field.label}`);
  if (slot.kind === "image") {
    if (/foto|imagen|image|photo|pic|media/.test(n)) return 4;
    return 1;
  }
  if (/precio|price|coste|cost|importe|eur/.test(n) || n.includes("€")) {
    return /\d/.test(slot.sampleText) || slot.area < 8000 ? 4 : 2;
  }
  if (/titulo|title|nombre|name|producto|product|headline/.test(n)) {
    return slot.area >= 8000 || slot.sampleText.length > 8 ? 4 : 2;
  }
  if (/desc|bio|texto|copy|detalle/.test(n)) return 2;
  return 1;
}

export function autoBindMoldSlots(
  slots: MoldSlot[],
  fields: FieldDef[],
  source: "list" | "constant",
): Record<string, SiteMultiCardSlotBindingV1> {
  const bindings: Record<string, SiteMultiCardSlotBindingV1> = {};
  const usedSlots = new Set<string>();
  const candidates = fields
    .map((field) => ({ field, kind: datasetFieldBindKind(field.type) }))
    .filter(
      (row): row is { field: FieldDef; kind: MoldSlotKind } =>
        row.kind != null && row.field.type !== "boolean",
    );

  const assign = (kind: MoldSlotKind) => {
    const ofKind = candidates.filter((row) => row.kind === kind);
    const slotsOfKind = slots.filter((slot) => slot.kind === kind && !usedSlots.has(slot.layerId));
    if (ofKind.length === 1 && slotsOfKind.length === 1) {
      const field = ofKind[0]!.field;
      const slot = slotsOfKind[0]!;
      bindings[slot.layerId] = { source, fieldId: field.id, fieldKey: field.key };
      usedSlots.add(slot.layerId);
      return;
    }
    for (const { field } of ofKind) {
      let best: MoldSlot | null = null;
      let bestScore = 0;
      for (const slot of slotsOfKind) {
        if (usedSlots.has(slot.layerId)) continue;
        const score = fieldNameScore(field, slot);
        if (score > bestScore) {
          best = slot;
          bestScore = score;
        }
      }
      if (!best || bestScore < 2) continue;
      bindings[best.layerId] = { source, fieldId: field.id, fieldKey: field.key };
      usedSlots.add(best.layerId);
    }
  };

  assign("image");
  assign("text");
  return bindings;
}

export function unusedDatasetFields(args: {
  dataset: Dataset;
  listId: string;
  bindings: Record<string, SiteMultiCardSlotBindingV1>;
}): { list: FieldDef[]; constants: FieldDef[] } {
  const used = new Set(Object.values(args.bindings).map((b) => `${b.source}:${b.fieldId}`));
  const normalized = normalizeDataset(args.dataset);
  const list = normalized.lists.find((item) => item.id === args.listId);
  return {
    list: (list?.schema ?? []).filter(
      (field) => datasetFieldBindKind(field.type) && !used.has(`list:${field.id}`),
    ),
    constants: normalized.constants.fields.filter(
      (field) => datasetFieldBindKind(field.type) && !used.has(`constant:${field.id}`),
    ),
  };
}

export function fieldValueToSlotOverride(value: FieldValue | null | undefined): SiteMultiCardSlotOverrideV1 | null {
  if (!value) return null;
  if (value.type === "image") {
    const src = value.url?.trim() ?? "";
    const s3Key = value.s3Key?.trim() ?? "";
    if (!src && !s3Key) return null;
    const mediaRef: { src?: string; s3Key?: string } = {};
    if (src) mediaRef.src = src;
    if (s3Key) mediaRef.s3Key = s3Key;
    return { mediaRef };
  }
  if (value.type === "boolean") {
    return { text: value.value ? "true" : "false" };
  }
  const text = fieldValueAsText(value);
  if (!text) return null;
  return { text };
}

export function mergeSlotOverride(
  base: SiteMultiCardSlotOverrideV1 | null,
  override: SiteMultiCardSlotOverrideV1 | undefined,
): SiteMultiCardSlotOverrideV1 | null {
  if (!base && !override) return null;
  const merged: SiteMultiCardSlotOverrideV1 = { ...(base ?? {}) };
  if (override?.text != null) merged.text = override.text;
  if (override?.mediaRef) merged.mediaRef = { ...override.mediaRef };
  if (!merged.text && !merged.mediaRef) return null;
  return merged;
}

export function resolveCardRowIndex(
  listCards: Array<{ id: string }>,
  card: SiteMultiCardInstanceV1,
  fallbackIndex: number,
): number {
  if (card.datasetRowId) {
    const found = listCards.findIndex((row) => row.id === card.datasetRowId);
    if (found >= 0) return found;
  }
  return fallbackIndex;
}

export function datasetSlotOverrideForCard(args: {
  dataset: Dataset;
  listId: string;
  binding: SiteMultiCardSlotBindingV1;
  rowIndex: number;
}): SiteMultiCardSlotOverrideV1 | null {
  const value =
    args.binding.source === "constant"
      ? getConstantFieldValue(args.dataset, args.binding.fieldId)
      : getListFieldValueAtRow(args.dataset, args.listId, args.binding.fieldId, args.rowIndex);
  return fieldValueToSlotOverride(value);
}

export function mergedOverridesForCard(args: {
  dataset: Dataset | null | undefined;
  node: SiteBlueprintMultiCardNode;
  card: SiteMultiCardInstanceV1;
  cardIndex: number;
}): Record<string, SiteMultiCardSlotOverrideV1> {
  const merged: Record<string, SiteMultiCardSlotOverrideV1> = { ...args.card.overrides };
  if (!args.dataset || !isMultiCardDatasetBound(args.node) || !args.node.dataset) return merged;
  const list = normalizeDataset(args.dataset).lists.find((item) => item.id === args.node.dataset!.listId);
  if (!list) return merged;
  const rowIndex = resolveCardRowIndex(list.cards, args.card, args.cardIndex);
  for (const [layerId, binding] of Object.entries(args.node.slotBindings ?? {})) {
    const fromData = datasetSlotOverrideForCard({
      dataset: args.dataset,
      listId: args.node.dataset.listId,
      binding,
      rowIndex,
    });
    const next = mergeSlotOverride(fromData, args.card.overrides[layerId]);
    if (next) merged[layerId] = next;
    else delete merged[layerId];
  }
  return merged;
}

export function syncMultiCardCardsToList(
  node: SiteBlueprintMultiCardNode,
  dataset: Dataset,
): SiteMultiCardInstanceV1[] {
  if (!isMultiCardDatasetBound(node) || !node.dataset) return node.cards;
  const list = normalizeDataset(dataset).lists.find((item) => item.id === node.dataset!.listId);
  if (!list) return node.cards;
  const rows = list.cards.slice(0, MULTICARD_COUNT_MAX);
  if (rows.length === 0) return node.cards.length > 0 ? node.cards : [{ id: createSiteMultiCardCardId(), overrides: {} }];
  const byRowId = new Map<string, SiteMultiCardInstanceV1>();
  for (const card of node.cards) {
    if (card.datasetRowId) byRowId.set(card.datasetRowId, card);
  }
  const firstId = node.cards[0]?.id ?? createSiteMultiCardCardId();
  return rows.map((row, index) => {
    if (index === 0) {
      return {
        id: firstId,
        datasetRowId: row.id,
        overrides: node.cards[0]?.overrides ?? {},
      };
    }
    const existing = byRowId.get(row.id);
    if (existing && existing.id !== firstId) {
      return { ...existing, datasetRowId: row.id };
    }
    return { id: createSiteMultiCardCardId(), datasetRowId: row.id, overrides: {} };
  });
}

export function claimMultiCardDatasetList(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  dataset: Dataset;
  listId: string;
  index: SiteCreatorSelectionIndex;
}): SiteBlueprintV1 | null {
  const node = args.blueprint.nodes[args.nodeId];
  if (!node || !isSiteMultiCardNode(node)) return null;
  const list = normalizeDataset(args.dataset).lists.find((item) => item.id === args.listId);
  if (!list) return null;
  const coverage = collectSemanticCoverageLayerIds(args.blueprint, node.id);
  const slots = collectMoldSlots(coverage, args.index);
  const slotBindings = autoBindMoldSlots(slots, list.schema, "list");
  const nextNode: SiteBlueprintMultiCardNode = {
    ...node,
    dataset: { kind: "dataset", listId: list.id, listKey: list.key },
    slotBindings,
    cards: node.cards,
  };
  const cards = syncMultiCardCardsToList(nextNode, args.dataset);
  nextNode.cards = cards;
  nextNode.count = cards.length;
  return {
    ...args.blueprint,
    nodes: { ...args.blueprint.nodes, [args.nodeId]: nextNode },
  };
}

export function setMultiCardSlotBinding(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  moldLayerId: string;
  binding: SiteMultiCardSlotBindingV1 | null;
}): SiteBlueprintV1 | null {
  const node = args.blueprint.nodes[args.nodeId];
  if (!node || !isSiteMultiCardNode(node)) return null;
  const slotBindings = { ...(node.slotBindings ?? {}) };
  if (!args.binding) delete slotBindings[args.moldLayerId];
  else {
    for (const [layerId, current] of Object.entries(slotBindings)) {
      if (
        current.source === args.binding.source &&
        current.fieldId === args.binding.fieldId &&
        layerId !== args.moldLayerId
      ) {
        delete slotBindings[layerId];
      }
    }
    slotBindings[args.moldLayerId] = args.binding;
  }
  return {
    ...args.blueprint,
    nodes: {
      ...args.blueprint.nodes,
      [args.nodeId]: { ...node, slotBindings },
    },
  };
}

export function freezeMultiCardDatasetValues(
  node: SiteBlueprintMultiCardNode,
  dataset: Dataset | null | undefined,
): SiteBlueprintMultiCardNode {
  if (!isMultiCardDatasetBound(node) || !node.dataset) {
    return { ...node, dataset: undefined, slotBindings: undefined };
  }
  if (!dataset) {
    return { ...node, dataset: undefined, slotBindings: undefined };
  }
  const cards = node.cards.map((card, cardIndex) => ({
    ...card,
    overrides: mergedOverridesForCard({ dataset, node, card, cardIndex }),
    datasetRowId: undefined,
  }));
  return {
    ...node,
    dataset: undefined,
    slotBindings: undefined,
    cards,
    count: cards.length,
  };
}

export function freezeBlueprintDatasetMultiCards(
  blueprint: SiteBlueprintV1,
  dataset: Dataset | null | undefined,
): SiteBlueprintV1 {
  let changed = false;
  const nodes = { ...blueprint.nodes };
  for (const [id, node] of Object.entries(nodes)) {
    if (!isSiteMultiCardNode(node) || !isMultiCardDatasetBound(node)) continue;
    nodes[id] = freezeMultiCardDatasetValues(node, dataset);
    changed = true;
  }
  return changed ? { ...blueprint, nodes } : blueprint;
}

export function syncBlueprintDatasetMultiCards(
  blueprint: SiteBlueprintV1,
  dataset: Dataset,
): SiteBlueprintV1 {
  let changed = false;
  const nodes = { ...blueprint.nodes };
  for (const [id, node] of Object.entries(nodes)) {
    if (!isSiteMultiCardNode(node) || !isMultiCardDatasetBound(node)) continue;
    const list = normalizeDataset(dataset).lists.find((item) => item.id === node.dataset!.listId);
    if (!list) {
      nodes[id] = freezeMultiCardDatasetValues(node, dataset);
      changed = true;
      continue;
    }
    const cards = syncMultiCardCardsToList(node, dataset);
    if (
      cards.length === node.cards.length &&
      cards.every((card, i) => card.id === node.cards[i]?.id && card.datasetRowId === node.cards[i]?.datasetRowId)
    ) {
      continue;
    }
    nodes[id] = { ...node, cards, count: cards.length };
    changed = true;
  }
  return changed ? { ...blueprint, nodes } : blueprint;
}
