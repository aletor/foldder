/**
 * Dataset node — operaciones puras (sin React, sin I/O).
 */

import { createDatasetList, normalizeDataset } from "./dataset-migrate";
import type {
  Card,
  Constants,
  Dataset,
  DatasetBinding,
  DatasetList,
  DatasetScope,
  FieldDef,
  FieldType,
  FieldValue,
  Gap,
  ValidationResult,
} from "./dataset-types";

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyValueForType(type: FieldType, options?: string[]): FieldValue {
  switch (type) {
    case "text":
      return { type: "text", value: "" };
    case "number":
      return { type: "number", value: 0 };
    case "color":
      return { type: "color", value: "#000000" };
    case "boolean":
      return { type: "boolean", value: false };
    case "select":
      return { type: "select", value: options?.[0] ?? "" };
    case "url":
      return { type: "url", value: "" };
    case "image":
      return { type: "image", assetId: "", url: "" };
    case "video":
      return { type: "video", assetId: "", url: "" };
    default:
      return { type: "text", value: "" };
  }
}

export function isValueEmpty(value: FieldValue | undefined): boolean {
  if (!value) return true;
  switch (value.type) {
    case "text":
    case "select":
    case "url":
    case "color":
      return value.value.trim().length === 0;
    case "number":
      return Number.isNaN(value.value);
    case "boolean":
      return false;
    case "image":
    case "video":
      return !value.assetId && !value.url;
    default:
      return true;
  }
}

function bump(dataset: Dataset, patch: Partial<Dataset>): Dataset {
  return normalizeDataset({
    ...dataset,
    ...patch,
    updatedAt: nowIso(),
    version: dataset.version + 1,
  });
}

function uniqueKey(base: string, taken: Set<string>): string {
  const slug = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "campo";
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}_${i}`)) i += 1;
  return `${slug}_${i}`;
}

function mapList(dataset: Dataset, listId: string, fn: (list: DatasetList) => DatasetList): Dataset {
  const normalized = normalizeDataset(dataset);
  return bump(normalized, {
    lists: normalized.lists.map((list) => (list.id === listId ? fn(list) : list)),
  });
}

export function createDataset(name: string, scope: DatasetScope, projectId?: string): Dataset {
  const ts = nowIso();
  const taken = new Set<string>();
  const nombreField = makeFieldDef({ label: "Nombre", type: "text" }, taken);
  const starterList = createDatasetList("Principal", {
    schema: [nombreField],
    cards: [
      {
        id: genId("c"),
        values: { [nombreField.id]: emptyValueForType("text") },
      },
    ],
  });
  return {
    id: genId("ds"),
    name: name.trim() || "Dataset",
    scope,
    projectId: scope === "local" ? projectId : undefined,
    lists: [starterList],
    constants: { fields: [], values: {} },
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };
}

export function makeFieldDef(
  partial: Pick<FieldDef, "label" | "type"> & Partial<FieldDef>,
  takenKeys: Set<string>,
): FieldDef {
  const id = partial.id ?? genId("f");
  const key =
    partial.key && !takenKeys.has(partial.key)
      ? partial.key
      : uniqueKey(partial.key || partial.label, takenKeys);
  return {
    id,
    key,
    label: partial.label.trim() || key,
    type: partial.type,
    required: partial.required ?? false,
    defaultValue: partial.defaultValue,
    options: partial.type === "select" ? partial.options ?? [] : undefined,
  };
}

// ── Listados ────────────────────────────────────────────────────────────────

export function addList(dataset: Dataset, name: string): Dataset {
  const normalized = normalizeDataset(dataset);
  const taken = new Set(normalized.lists.map((list) => list.key));
  const list = createDatasetList(name);
  let key = list.key;
  if (taken.has(key)) key = uniqueKey(key, taken);
  return bump(normalized, { lists: [...normalized.lists, { ...list, key }] });
}

export function removeList(dataset: Dataset, listId: string): Dataset {
  const normalized = normalizeDataset(dataset);
  if (normalized.lists.length <= 1) return normalized;
  return bump(normalized, { lists: normalized.lists.filter((list) => list.id !== listId) });
}

export function renameList(dataset: Dataset, listId: string, name: string): Dataset {
  return mapList(dataset, listId, (list) => ({ ...list, name: name.trim() || list.name }));
}

// ── Campos del listado ──────────────────────────────────────────────────────

export function addField(
  dataset: Dataset,
  listId: string,
  partial: Pick<FieldDef, "label" | "type"> & Partial<FieldDef>,
): Dataset {
  return mapList(dataset, listId, (list) => {
    const taken = new Set(list.schema.map((f) => f.key));
    const field = makeFieldDef(partial, taken);
    const cards = list.cards.map((card) => ({
      ...card,
      values: { ...card.values, [field.id]: emptyValueForType(field.type, field.options) },
    }));
    return { ...list, schema: [...list.schema, field], cards };
  });
}

export function updateField(dataset: Dataset, listId: string, fieldId: string, patch: Partial<FieldDef>): Dataset {
  return mapList(dataset, listId, (list) => ({
    ...list,
    schema: list.schema.map((f) => (f.id === fieldId ? { ...f, ...patch, id: f.id } : f)),
  }));
}

export function removeField(dataset: Dataset, listId: string, fieldId: string): Dataset {
  return mapList(dataset, listId, (list) => ({
    ...list,
    schema: list.schema.filter((f) => f.id !== fieldId),
    cards: list.cards.map((card) => {
      const { [fieldId]: _removed, ...rest } = card.values;
      return { ...card, values: rest };
    }),
  }));
}

function blankCardValues(schema: FieldDef[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of schema) values[field.id] = emptyValueForType(field.type, field.options);
  return values;
}

export function addCard(dataset: Dataset, listId: string, values?: Record<string, FieldValue>): Dataset {
  return mapList(dataset, listId, (list) => {
    const card: Card = {
      id: genId("c"),
      values: { ...blankCardValues(list.schema), ...(values ?? {}) },
    };
    return { ...list, cards: [...list.cards, card] };
  });
}

export function updateCard(
  dataset: Dataset,
  listId: string,
  cardId: string,
  partialValues: Record<string, FieldValue>,
): Dataset {
  return mapList(dataset, listId, (list) => ({
    ...list,
    cards: list.cards.map((card) =>
      card.id === cardId ? { ...card, values: { ...card.values, ...partialValues } } : card,
    ),
  }));
}

export function removeCard(dataset: Dataset, listId: string, cardId: string): Dataset {
  return mapList(dataset, listId, (list) => ({
    ...list,
    cards: list.cards.filter((card) => card.id !== cardId),
  }));
}

export function duplicateCard(dataset: Dataset, listId: string, cardId: string): Dataset {
  return mapList(dataset, listId, (list) => {
    const idx = list.cards.findIndex((card) => card.id === cardId);
    if (idx === -1) return list;
    const copy: Card = { id: genId("c"), values: { ...list.cards[idx].values } };
    return {
      ...list,
      cards: [...list.cards.slice(0, idx + 1), copy, ...list.cards.slice(idx + 1)],
    };
  });
}

// ── Constantes ──────────────────────────────────────────────────────────────

export function addConstantField(
  dataset: Dataset,
  partial: Pick<FieldDef, "label" | "type"> & Partial<FieldDef>,
): Dataset {
  const normalized = normalizeDataset(dataset);
  const taken = new Set(normalized.constants.fields.map((f) => f.key));
  const field = makeFieldDef(partial, taken);
  const constants: Constants = {
    fields: [...normalized.constants.fields, field],
    values: { ...normalized.constants.values, [field.id]: emptyValueForType(field.type, field.options) },
  };
  return bump(normalized, { constants });
}

export function updateConstantField(dataset: Dataset, fieldId: string, patch: Partial<FieldDef>): Dataset {
  const normalized = normalizeDataset(dataset);
  const fields = normalized.constants.fields.map((f) => (f.id === fieldId ? { ...f, ...patch, id: f.id } : f));
  return bump(normalized, { constants: { ...normalized.constants, fields } });
}

export function removeConstantField(dataset: Dataset, fieldId: string): Dataset {
  const normalized = normalizeDataset(dataset);
  const fields = normalized.constants.fields.filter((f) => f.id !== fieldId);
  const { [fieldId]: _removed, ...values } = normalized.constants.values;
  return bump(normalized, { constants: { fields, values } });
}

export function setConstant(dataset: Dataset, fieldId: string, value: FieldValue): Dataset {
  const normalized = normalizeDataset(dataset);
  return bump(normalized, {
    constants: {
      ...normalized.constants,
      values: { ...normalized.constants.values, [fieldId]: value },
    },
  });
}

// ── Scope ───────────────────────────────────────────────────────────────────

export interface SetScopeContext {
  consumerCount?: number;
  projectId?: string;
}

export interface SetScopeResult {
  ok: boolean;
  dataset: Dataset;
  reason?: string;
}

export function setScope(dataset: Dataset, scope: DatasetScope, ctx: SetScopeContext = {}): SetScopeResult {
  const normalized = normalizeDataset(dataset);
  if (normalized.scope === scope) return { ok: true, dataset: normalized };
  if (scope === "global") {
    return { ok: true, dataset: bump(normalized, { scope: "global", projectId: undefined }) };
  }
  if ((ctx.consumerCount ?? 0) > 1) {
    return {
      ok: false,
      dataset: normalized,
      reason: "No se puede hacer local: otros proyectos consumen este Dataset.",
    };
  }
  return { ok: true, dataset: bump(normalized, { scope: "local", projectId: ctx.projectId }) };
}

// ── Contrato de consumo ─────────────────────────────────────────────────────

export function fieldValueAsText(value: FieldValue | undefined): string {
  if (!value) return "";
  switch (value.type) {
    case "text":
    case "select":
    case "url":
    case "color":
      return value.value;
    case "number":
      return String(value.value);
    default:
      return "";
  }
}

/** Primera fila de un listado para un campo de tipo texto (vacío si no hay filas). */
export function getFirstListFieldText(dataset: Dataset, listId: string, fieldId: string): string | null {
  return getListFieldTextAtRow(dataset, listId, fieldId, 0);
}

export function getListFieldValueAtRow(
  dataset: Dataset,
  listId: string,
  fieldId: string,
  rowIndex: number,
): FieldValue | null {
  const normalized = normalizeDataset(dataset);
  const list = normalized.lists.find((row) => row.id === listId);
  if (!list) return null;
  const card = list.cards[rowIndex];
  if (!card) return null;
  return card.values[fieldId] ?? null;
}

export function getConstantFieldValue(dataset: Dataset, fieldId: string): FieldValue | null {
  const normalized = normalizeDataset(dataset);
  return normalized.constants.values[fieldId] ?? null;
}

export function getListFieldTextAtRow(
  dataset: Dataset,
  listId: string,
  fieldId: string,
  rowIndex: number,
): string | null {
  const normalized = normalizeDataset(dataset);
  const list = normalized.lists.find((row) => row.id === listId);
  if (!list) return null;
  const field = list.schema.find((f) => f.id === fieldId);
  if (!field || field.type !== "text") return null;
  const value = getListFieldValueAtRow(dataset, listId, fieldId, rowIndex);
  if (!value) return "";
  return fieldValueAsText(value);
}

export type DatasetImageFieldValue = {
  url: string;
  assetId?: string;
  w?: number;
  h?: number;
};

/** Primera fila de un listado para un campo de tipo imagen (vacío si no hay filas o imagen). */
export function getFirstListFieldImage(
  dataset: Dataset,
  listId: string,
  fieldId: string,
): DatasetImageFieldValue | null {
  return getListFieldImageAtRow(dataset, listId, fieldId, 0);
}

export function getListFieldImageAtRow(
  dataset: Dataset,
  listId: string,
  fieldId: string,
  rowIndex: number,
): DatasetImageFieldValue | null {
  const normalized = normalizeDataset(dataset);
  const list = normalized.lists.find((row) => row.id === listId);
  if (!list) return null;
  const field = list.schema.find((f) => f.id === fieldId);
  if (!field || field.type !== "image") return null;
  const card = list.cards[rowIndex];
  if (!card) return { url: "" };
  const value = card.values[fieldId];
  if (!value || value.type !== "image" || isValueEmpty(value)) return { url: "" };
  return {
    url: value.url,
    assetId: value.assetId || undefined,
    w: value.w,
    h: value.h,
  };
}

export function getBinding(dataset: Dataset, listId: string): DatasetBinding | null {
  const normalized = normalizeDataset(dataset);
  const list = normalized.lists.find((row) => row.id === listId);
  if (!list) return null;

  const keyById = new Map(list.schema.map((f) => [f.id, f.key]));
  const rows = list.cards.map((card) => {
    const row: Record<string, FieldValue> = {};
    for (const [fieldId, value] of Object.entries(card.values)) {
      const key = keyById.get(fieldId);
      if (key) row[key] = value;
    }
    return row;
  });

  const constants: Record<string, FieldValue> = {};
  for (const field of normalized.constants.fields) {
    const value = normalized.constants.values[field.id];
    if (value) constants[field.key] = value;
  }

  return {
    listId: list.id,
    listKey: list.key,
    listName: list.name,
    rows,
    constants,
    schema: list.schema,
    rowCount: rows.length,
  };
}

function validateField(field: FieldDef, value: FieldValue | undefined, listId: string | null, cardId: string | null, gaps: Gap[]): void {
  if (field.required && isValueEmpty(value)) {
    gaps.push({
      kind: "required-missing",
      listId,
      cardId,
      fieldId: field.id,
      fieldKey: field.key,
      fieldLabel: field.label,
      message: `Falta "${field.label}"`,
    });
    return;
  }
  if (!value) return;
  if (field.type === "select" && value.type === "select" && value.value) {
    const options = field.options ?? [];
    if (!options.includes(value.value)) {
      gaps.push({
        kind: "invalid-select",
        listId,
        cardId,
        fieldId: field.id,
        fieldKey: field.key,
        fieldLabel: field.label,
        message: `"${value.value}" no está entre las opciones de ${field.label}`,
      });
    }
  }
  if ((value.type === "image" || value.type === "video") && !isValueEmpty(value)) {
    if (!value.url && !value.assetId) {
      gaps.push({
        kind: "broken-asset",
        listId,
        cardId,
        fieldId: field.id,
        fieldKey: field.key,
        fieldLabel: field.label,
        message: `Asset roto en ${field.label}`,
      });
    }
  }
}

export function validateList(dataset: Dataset, listId: string): ValidationResult {
  const normalized = normalizeDataset(dataset);
  const list = normalized.lists.find((row) => row.id === listId);
  if (!list) return { complete: true, gaps: [] };
  const gaps: Gap[] = [];
  for (const card of list.cards) {
    for (const field of list.schema) {
      validateField(field, card.values[field.id], list.id, card.id, gaps);
    }
  }
  return { complete: gaps.length === 0, gaps };
}

export function validate(dataset: Dataset): ValidationResult {
  const normalized = normalizeDataset(dataset);
  const gaps: Gap[] = [];
  for (const list of normalized.lists) {
    const listResult = validateList(normalized, list.id);
    gaps.push(...listResult.gaps);
  }
  for (const field of normalized.constants.fields) {
    validateField(field, normalized.constants.values[field.id], null, null, gaps);
  }
  return { complete: gaps.length === 0, gaps };
}

export function cellHasGap(
  gaps: Gap[],
  listId: string | null,
  cardId: string | null,
  fieldId: string,
): boolean {
  return gaps.some((g) => g.listId === listId && g.cardId === cardId && g.fieldId === fieldId);
}

export { normalizeDataset };
