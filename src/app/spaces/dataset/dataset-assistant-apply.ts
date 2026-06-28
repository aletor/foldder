/**
 * Dataset Copilot — evaluación de filtros, previsualización (diff) y aplicación.
 *
 * Todo es puro (sin React, sin I/O) y se apoya en las funciones de `dataset-logic.ts`,
 * de modo que cada operación es determinista y testeable. Los recuentos del preview
 * se calculan SIEMPRE en cliente sobre los datos reales (no se confía en el LLM).
 */

import {
  addCard,
  addField,
  addList,
  fieldValueAsText,
  isValueEmpty,
  normalizeDataset,
  removeCard,
  removeField,
  updateCard,
  updateField,
} from "./dataset-logic";
import type { Card, Dataset, DatasetList, FieldDef, FieldType, FieldValue } from "./dataset-types";
import {
  ASSISTANT_CAPS,
  type AssistantCellDraft,
  type AssistantColumnSpec,
  type AssistantFilter,
  type AssistantFilterCondition,
  type AssistantFilterOp,
  type AssistantImageDraft,
  type AssistantIntent,
  type AssistantOp,
  type AssistantPlan,
  type AssistantRowDraft,
  type AssistantTargetChoice,
  type AssistantWebPlan,
} from "./dataset-assistant-types";

const FIELD_TYPES: FieldType[] = ["text", "number", "image", "video", "color", "boolean", "select", "url"];
const FILTER_OPS: AssistantFilterOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "empty",
  "not_empty",
];

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Resuelve una referencia de columna (label o key) contra el esquema real. */
export function resolveColumn(schema: FieldDef[], ref: string): FieldDef | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  const lower = trimmed.toLowerCase();
  const bySlug = slug(trimmed);
  return (
    schema.find((f) => f.key === trimmed) ??
    schema.find((f) => f.label.toLowerCase() === lower) ??
    schema.find((f) => f.key.toLowerCase() === lower) ??
    schema.find((f) => slug(f.label) === bySlug) ??
    null
  );
}

function isImageDraft(draft: AssistantCellDraft): draft is AssistantImageDraft {
  return Boolean(draft) && typeof draft === "object" && (draft as AssistantImageDraft).kind === "image";
}

function draftToFieldValue(type: FieldType, draft: AssistantCellDraft, options?: string[]): FieldValue {
  if (type === "image") {
    if (isImageDraft(draft)) {
      return {
        type: "image",
        assetId: draft.assetId || "",
        url: draft.url || "",
        s3Key: draft.s3Key,
        w: draft.w,
        h: draft.h,
      };
    }
    return { type: "image", assetId: "", url: "" };
  }
  // Para columnas no-imagen, ignorar objetos inesperados.
  const prim: string | number | boolean | null = typeof draft === "object" ? null : draft;
  switch (type) {
    case "number": {
      const n = typeof prim === "number" ? prim : Number(String(prim ?? "").replace(/[^0-9.+-]/g, ""));
      return { type: "number", value: Number.isFinite(n) ? n : 0 };
    }
    case "boolean":
      return { type: "boolean", value: prim === true || prim === "true" || prim === 1 || prim === "1" };
    case "color":
      return { type: "color", value: String(prim ?? "") };
    case "url":
      return { type: "url", value: String(prim ?? "") };
    case "select": {
      const v = String(prim ?? "");
      return { type: "select", value: options && options.length && !options.includes(v) ? options[0] : v };
    }
    case "video":
      return { type: "video", assetId: "", url: "" };
    case "text":
    default:
      return { type: "text", value: String(prim ?? "") };
  }
}

function cardNumber(value: FieldValue | undefined): number | null {
  if (!value) return null;
  if (value.type === "number") return Number.isFinite(value.value) ? value.value : null;
  const text = fieldValueAsText(value).replace(/[^0-9.,+-]/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function evaluateCondition(card: Card, schema: FieldDef[], cond: AssistantFilterCondition): boolean {
  const field = resolveColumn(schema, cond.column);
  if (!field) return false;
  const value = card.values[field.id];
  const text = fieldValueAsText(value).toLowerCase();
  const num = cardNumber(value);
  const target = cond.value;
  const targetText = String(target ?? "").toLowerCase();
  const targetNum = typeof target === "number" ? target : Number(String(target ?? "").replace(",", "."));

  switch (cond.op) {
    case "empty":
      return isValueEmpty(value);
    case "not_empty":
      return !isValueEmpty(value);
    case "eq":
      if (num != null && Number.isFinite(targetNum)) return num === targetNum;
      return text === targetText;
    case "neq":
      if (num != null && Number.isFinite(targetNum)) return num !== targetNum;
      return text !== targetText;
    case "gt":
      return num != null && Number.isFinite(targetNum) && num > targetNum;
    case "gte":
      return num != null && Number.isFinite(targetNum) && num >= targetNum;
    case "lt":
      return num != null && Number.isFinite(targetNum) && num < targetNum;
    case "lte":
      return num != null && Number.isFinite(targetNum) && num <= targetNum;
    case "contains":
      return targetText.length > 0 && text.includes(targetText);
    case "not_contains":
      return targetText.length === 0 || !text.includes(targetText);
    case "starts_with":
      return text.startsWith(targetText);
    case "ends_with":
      return text.endsWith(targetText);
    default:
      return false;
  }
}

/** Un filtro vacío NO coincide con nada (evita borrados accidentales masivos). */
function evaluateFilter(card: Card, schema: FieldDef[], filter: AssistantFilter | undefined): boolean {
  if (!filter) return false;
  const all = Array.isArray(filter.all) ? filter.all : [];
  const any = Array.isArray(filter.any) ? filter.any : [];
  if (all.length === 0 && any.length === 0) return false;
  const allOk = all.length === 0 || all.every((c) => evaluateCondition(card, schema, c));
  const anyOk = any.length === 0 || any.some((c) => evaluateCondition(card, schema, c));
  return allOk && anyOk;
}

function rowLabel(card: Card, schema: FieldDef[]): string {
  const firstText = schema.find((f) => f.type === "text") ?? schema[0];
  if (firstText) {
    const t = fieldValueAsText(card.values[firstText.id]);
    if (t.trim()) return t.trim();
  }
  for (const f of schema) {
    const t = fieldValueAsText(card.values[f.id]);
    if (t.trim()) return t.trim();
  }
  return "(fila sin texto)";
}

function draftLabel(row: AssistantRowDraft, columns: AssistantColumnSpec[]): string {
  const cells = row.cells ?? {};
  const textCol = columns.find((c) => c.type === "text") ?? columns.find((c) => c.type !== "image") ?? columns[0];
  if (textCol) {
    const direct = cells[textCol.label];
    if (direct != null && typeof direct !== "object" && String(direct).trim()) return String(direct).trim();
  }
  for (const v of Object.values(cells)) {
    if (v != null && typeof v !== "object" && String(v).trim()) return String(v).trim();
  }
  return "(fila nueva)";
}

// ── Preview (diff) ───────────────────────────────────────────────────────────

export interface AssistantPreviewRowRef {
  id: string;
  label: string;
}

export interface AssistantPreview {
  targetChoice: AssistantTargetChoice;
  targetName: string;
  columnsAdded: AssistantColumnSpec[];
  columnsRemoved: string[];
  columnsRenamed: Array<{ from: string; to: string }>;
  deleteMatches: AssistantPreviewRowRef[];
  addDrafts: Array<{ index: number; label: string }>;
  updatedRows: number;
  cellsChanged: number;
  dedupeRemovals: number;
  overwriteClears: number;
  warnings: string[];
}

function planSuggestedName(plan: AssistantPlan): string {
  const created = plan.ops.find((o) => o.kind === "create_table");
  if (created && created.kind === "create_table" && created.name.trim()) return created.name.trim();
  return plan.target.suggestedName?.trim() || "Tabla nueva";
}

/** Calcula el diff que verá el usuario, según el destino elegido. */
export function computeAssistantPreview(
  dataset: Dataset,
  activeListId: string | null,
  plan: AssistantPlan,
  choice: AssistantTargetChoice,
): AssistantPreview {
  const ds = normalizeDataset(dataset);
  const activeList = activeListId ? ds.lists.find((l) => l.id === activeListId) ?? null : null;
  const targetIsNew = choice === "new";
  const targetList = targetIsNew ? null : activeList;
  const schema = targetList?.schema ?? [];
  const warnings: string[] = [...(plan.warnings ?? [])];

  const columnsAdded: AssistantColumnSpec[] = [];
  const columnsRemoved: string[] = [];
  const columnsRenamed: Array<{ from: string; to: string }> = [];
  const deleteMatches: AssistantPreviewRowRef[] = [];
  const addDrafts: Array<{ index: number; label: string }> = [];
  let updatedRows = 0;
  let cellsChanged = 0;
  let dedupeRemovals = 0;
  const overwriteClears = choice === "overwrite_active" ? targetList?.cards.length ?? 0 : 0;

  // Esquema "proyectado" para resolver columnas que se añaden en el mismo plan.
  const projectedColumns: AssistantColumnSpec[] = targetIsNew ? [] : schema.map((f) => ({ label: f.label, type: f.type }));
  const hasProjected = (ref: string) =>
    projectedColumns.some((c) => slug(c.label) === slug(ref) || c.label.toLowerCase() === ref.toLowerCase());

  let addIndex = 0;

  for (const op of plan.ops) {
    if (op.kind === "create_table") {
      for (const col of op.columns ?? []) {
        if (!hasProjected(col.label)) {
          columnsAdded.push(col);
          projectedColumns.push(col);
        }
      }
      for (const row of op.rows ?? []) {
        addDrafts.push({ index: addIndex++, label: draftLabel(row, op.columns ?? []) });
      }
    } else if (op.kind === "add_columns") {
      for (const col of op.columns ?? []) {
        if (!hasProjected(col.label)) {
          columnsAdded.push(col);
          projectedColumns.push(col);
        } else {
          warnings.push(`La columna "${col.label}" ya existe; se omite.`);
        }
      }
    } else if (op.kind === "remove_columns") {
      for (const ref of op.columns ?? []) {
        const f = resolveColumn(schema, ref);
        if (f) columnsRemoved.push(f.label);
        else warnings.push(`No encuentro la columna "${ref}" para eliminar.`);
      }
    } else if (op.kind === "rename_column") {
      const f = resolveColumn(schema, op.column);
      if (f) columnsRenamed.push({ from: f.label, to: op.newLabel });
      else warnings.push(`No encuentro la columna "${op.column}" para renombrar.`);
    } else if (op.kind === "add_rows") {
      for (const row of op.rows ?? []) {
        addDrafts.push({ index: addIndex++, label: draftLabel(row, projectedColumns) });
      }
    } else if (op.kind === "delete_rows") {
      if (targetList) {
        for (const card of targetList.cards) {
          if (evaluateFilter(card, targetList.schema, op.filter)) {
            deleteMatches.push({ id: card.id, label: rowLabel(card, targetList.schema) });
          }
        }
      }
    } else if (op.kind === "update_cells") {
      if (targetList) {
        const matched = targetList.cards.filter((card) =>
          op.filter ? evaluateFilter(card, targetList.schema, op.filter) : true,
        );
        updatedRows += matched.length;
        const validSets = (op.set ?? []).filter((s) => resolveColumn(targetList.schema, s.column));
        cellsChanged += matched.length * validSets.length;
      }
    } else if (op.kind === "dedupe_rows") {
      if (targetList) {
        const f = resolveColumn(targetList.schema, op.column);
        if (f) {
          const seen = new Set<string>();
          for (const card of targetList.cards) {
            const key = fieldValueAsText(card.values[f.id]).trim().toLowerCase();
            if (seen.has(key)) dedupeRemovals += 1;
            else seen.add(key);
          }
        } else {
          warnings.push(`No encuentro la columna "${op.column}" para quitar duplicados.`);
        }
      }
    }
  }

  const targetName = targetIsNew ? planSuggestedName(plan) : activeList?.name ?? "tabla activa";

  return {
    targetChoice: choice,
    targetName,
    columnsAdded,
    columnsRemoved,
    columnsRenamed,
    deleteMatches,
    addDrafts,
    updatedRows,
    cellsChanged,
    dedupeRemovals,
    overwriteClears,
    warnings,
  };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface ApplyAssistantOptions {
  targetChoice: AssistantTargetChoice;
  /** Ids de filas a NO borrar (deselección del usuario). */
  excludedDeleteIds?: string[];
  /** Índices (globales sobre add_rows/create_table) de filas a NO añadir. */
  excludedAddIndices?: number[];
}

export interface ApplyAssistantResult {
  dataset: Dataset;
  targetListId: string;
  summary: string;
  rowsAdded: number;
  rowsDeleted: number;
  rowsUpdated: number;
  columnsAdded: number;
  columnsRemoved: number;
}

function listById(ds: Dataset, id: string): DatasetList | undefined {
  return ds.lists.find((l) => l.id === id);
}

function addRowsToList(
  ds: Dataset,
  listId: string,
  rows: AssistantRowDraft[],
  startIndex: number,
  excluded: Set<number>,
): { ds: Dataset; added: number; nextIndex: number } {
  let next = ds;
  let added = 0;
  let idx = startIndex;
  const capped = rows.slice(0, ASSISTANT_CAPS.maxRowsPerOp);
  for (const row of capped) {
    const myIndex = idx;
    idx += 1;
    if (excluded.has(myIndex)) continue;
    const list = listById(next, listId);
    if (!list) break;
    const values: Record<string, FieldValue> = {};
    for (const [ref, draft] of Object.entries(row.cells ?? {})) {
      const field = resolveColumn(list.schema, ref);
      if (!field) continue;
      values[field.id] = draftToFieldValue(field.type, draft, field.options);
    }
    next = addCard(next, listId, values);
    added += 1;
  }
  return { ds: next, added, nextIndex: idx };
}

function addColumnsToList(ds: Dataset, listId: string, columns: AssistantColumnSpec[]): { ds: Dataset; added: number } {
  let next = ds;
  let added = 0;
  const capped = columns.slice(0, ASSISTANT_CAPS.maxColumnsPerOp);
  for (const col of capped) {
    const list = listById(next, listId);
    if (!list) break;
    if (resolveColumn(list.schema, col.label)) continue;
    next = addField(next, listId, { label: col.label, type: col.type });
    added += 1;
  }
  return { ds: next, added };
}

export function applyAssistantPlan(
  dataset: Dataset,
  activeListId: string | null,
  plan: AssistantPlan,
  options: ApplyAssistantOptions,
): ApplyAssistantResult {
  let ds = normalizeDataset(dataset);
  const excludedDelete = new Set(options.excludedDeleteIds ?? []);
  const excludedAdd = new Set(options.excludedAddIndices ?? []);

  let rowsAdded = 0;
  let rowsDeleted = 0;
  let rowsUpdated = 0;
  let columnsAdded = 0;
  let columnsRemoved = 0;

  // Resolver lista destino.
  let targetListId: string;
  if (options.targetChoice === "new") {
    ds = addList(ds, planSuggestedName(plan));
    targetListId = ds.lists[ds.lists.length - 1]?.id ?? "";
  } else {
    targetListId = activeListId ?? ds.lists[0]?.id ?? "";
    if (options.targetChoice === "overwrite_active") {
      const list = listById(ds, targetListId);
      if (list) {
        for (const card of [...list.cards]) {
          ds = removeCard(ds, targetListId, card.id);
          rowsDeleted += 1;
        }
      }
    }
  }
  if (!targetListId) {
    return {
      dataset: normalizeDataset(dataset),
      targetListId: "",
      summary: "No se pudo determinar la tabla destino.",
      rowsAdded: 0,
      rowsDeleted: 0,
      rowsUpdated: 0,
      columnsAdded: 0,
      columnsRemoved: 0,
    };
  }

  let addIndex = 0;
  const ops = plan.ops.slice(0, ASSISTANT_CAPS.maxOps);

  for (const op of ops) {
    if (op.kind === "create_table") {
      const cols = addColumnsToList(ds, targetListId, op.columns ?? []);
      ds = cols.ds;
      columnsAdded += cols.added;
      const res = addRowsToList(ds, targetListId, op.rows ?? [], addIndex, excludedAdd);
      ds = res.ds;
      rowsAdded += res.added;
      addIndex = res.nextIndex;
    } else if (op.kind === "add_columns") {
      const cols = addColumnsToList(ds, targetListId, op.columns ?? []);
      ds = cols.ds;
      columnsAdded += cols.added;
    } else if (op.kind === "add_rows") {
      const res = addRowsToList(ds, targetListId, op.rows ?? [], addIndex, excludedAdd);
      ds = res.ds;
      rowsAdded += res.added;
      addIndex = res.nextIndex;
    } else if (op.kind === "remove_columns") {
      for (const ref of op.columns ?? []) {
        const list = listById(ds, targetListId);
        const field = list ? resolveColumn(list.schema, ref) : null;
        if (field) {
          ds = removeField(ds, targetListId, field.id);
          columnsRemoved += 1;
        }
      }
    } else if (op.kind === "rename_column") {
      const list = listById(ds, targetListId);
      const field = list ? resolveColumn(list.schema, op.column) : null;
      if (field && op.newLabel.trim()) ds = updateField(ds, targetListId, field.id, { label: op.newLabel.trim() });
    } else if (op.kind === "delete_rows") {
      const list = listById(ds, targetListId);
      if (list) {
        const toDelete = list.cards.filter(
          (card) => evaluateFilter(card, list.schema, op.filter) && !excludedDelete.has(card.id),
        );
        for (const card of toDelete) {
          ds = removeCard(ds, targetListId, card.id);
          rowsDeleted += 1;
        }
      }
    } else if (op.kind === "update_cells") {
      const list = listById(ds, targetListId);
      if (list) {
        const matched = list.cards.filter((card) =>
          op.filter ? evaluateFilter(card, list.schema, op.filter) : true,
        );
        for (const card of matched) {
          const partial: Record<string, FieldValue> = {};
          for (const setItem of op.set ?? []) {
            const field = resolveColumn(list.schema, setItem.column);
            if (!field) continue;
            partial[field.id] = draftToFieldValue(field.type, setItem.value, field.options);
          }
          if (Object.keys(partial).length > 0) {
            ds = updateCard(ds, targetListId, card.id, partial);
            rowsUpdated += 1;
          }
        }
      }
    } else if (op.kind === "dedupe_rows") {
      const list = listById(ds, targetListId);
      const field = list ? resolveColumn(list.schema, op.column) : null;
      if (list && field) {
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const card of list.cards) {
          const key = fieldValueAsText(card.values[field.id]).trim().toLowerCase();
          if (seen.has(key)) dupes.push(card.id);
          else seen.add(key);
        }
        for (const id of dupes) {
          ds = removeCard(ds, targetListId, id);
          rowsDeleted += 1;
        }
      }
    }
  }

  const parts: string[] = [];
  if (columnsAdded) parts.push(`+${columnsAdded} columna${columnsAdded === 1 ? "" : "s"}`);
  if (columnsRemoved) parts.push(`−${columnsRemoved} columna${columnsRemoved === 1 ? "" : "s"}`);
  if (rowsAdded) parts.push(`+${rowsAdded} fila${rowsAdded === 1 ? "" : "s"}`);
  if (rowsDeleted) parts.push(`−${rowsDeleted} fila${rowsDeleted === 1 ? "" : "s"}`);
  if (rowsUpdated) parts.push(`${rowsUpdated} fila${rowsUpdated === 1 ? "" : "s"} editada${rowsUpdated === 1 ? "" : "s"}`);
  const summary = parts.length ? `Aplicado: ${parts.join(" · ")}` : "Sin cambios";

  return { dataset: ds, targetListId, summary, rowsAdded, rowsDeleted, rowsUpdated, columnsAdded, columnsRemoved };
}

// ── Saneado del JSON del modelo ──────────────────────────────────────────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asCellDraft(v: unknown): AssistantCellDraft {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v == null) return null;
  return String(v);
}

function coerceColumns(raw: unknown): AssistantColumnSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantColumnSpec[] = [];
  for (const item of raw.slice(0, ASSISTANT_CAPS.maxColumnsPerOp)) {
    if (!item || typeof item !== "object") continue;
    const label = asString((item as { label?: unknown }).label).trim();
    if (!label) continue;
    const rawType = asString((item as { type?: unknown }).type) as FieldType;
    const type: FieldType = FIELD_TYPES.includes(rawType) ? rawType : "text";
    out.push({ label, type });
  }
  return out;
}

function coerceRows(raw: unknown): AssistantRowDraft[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantRowDraft[] = [];
  for (const item of raw.slice(0, ASSISTANT_CAPS.maxRowsPerOp)) {
    if (!item || typeof item !== "object") continue;
    const rawCells = (item as { cells?: unknown }).cells;
    const cellsSource =
      rawCells && typeof rawCells === "object" ? (rawCells as Record<string, unknown>) : (item as Record<string, unknown>);
    const cells: Record<string, AssistantCellDraft> = {};
    for (const [k, v] of Object.entries(cellsSource)) {
      if (k === "cells") continue;
      cells[k] = asCellDraft(v);
    }
    out.push({ cells });
  }
  return out;
}

function coerceCondition(raw: unknown): AssistantFilterCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const column = asString((raw as { column?: unknown }).column).trim();
  const op = asString((raw as { op?: unknown }).op) as AssistantFilterOp;
  if (!column || !FILTER_OPS.includes(op)) return null;
  const rawValue = (raw as { value?: unknown }).value;
  const value =
    typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean"
      ? rawValue
      : rawValue == null
        ? undefined
        : String(rawValue);
  return { column, op, value };
}

function coerceFilter(raw: unknown): AssistantFilter | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const all = Array.isArray((raw as { all?: unknown }).all)
    ? ((raw as { all: unknown[] }).all.map(coerceCondition).filter(Boolean) as AssistantFilterCondition[])
    : [];
  const any = Array.isArray((raw as { any?: unknown }).any)
    ? ((raw as { any: unknown[] }).any.map(coerceCondition).filter(Boolean) as AssistantFilterCondition[])
    : [];
  if (all.length === 0 && any.length === 0) return undefined;
  return { all: all.length ? all : undefined, any: any.length ? any : undefined };
}

function coerceOp(raw: unknown): AssistantOp | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = asString((raw as { kind?: unknown }).kind);
  switch (kind) {
    case "create_table":
      return {
        kind,
        name: asString((raw as { name?: unknown }).name).trim() || "Tabla",
        columns: coerceColumns((raw as { columns?: unknown }).columns),
        rows: coerceRows((raw as { rows?: unknown }).rows),
      };
    case "add_columns":
      return { kind, columns: coerceColumns((raw as { columns?: unknown }).columns) };
    case "remove_columns": {
      const cols = (raw as { columns?: unknown }).columns;
      const list = Array.isArray(cols) ? cols.map((c) => asString(c).trim()).filter(Boolean) : [];
      return { kind, columns: list };
    }
    case "rename_column":
      return {
        kind,
        column: asString((raw as { column?: unknown }).column).trim(),
        newLabel: asString((raw as { newLabel?: unknown }).newLabel).trim(),
      };
    case "add_rows":
      return { kind, rows: coerceRows((raw as { rows?: unknown }).rows) };
    case "delete_rows": {
      const filter = coerceFilter((raw as { filter?: unknown }).filter);
      if (!filter) return null;
      return { kind, filter };
    }
    case "update_cells": {
      const setRaw = (raw as { set?: unknown }).set;
      const set = Array.isArray(setRaw)
        ? setRaw
            .map((s) => {
              if (!s || typeof s !== "object") return null;
              const column = asString((s as { column?: unknown }).column).trim();
              if (!column) return null;
              return { column, value: asCellDraft((s as { value?: unknown }).value) };
            })
            .filter(Boolean as unknown as (v: unknown) => v is { column: string; value: AssistantCellDraft })
        : [];
      if (set.length === 0) return null;
      return { kind, filter: coerceFilter((raw as { filter?: unknown }).filter), set };
    }
    case "dedupe_rows":
      return { kind, column: asString((raw as { column?: unknown }).column).trim() };
    default:
      return null;
  }
}

function coerceWebPlan(raw: unknown): AssistantWebPlan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const query = asString(obj.query).trim();
  const columns = coerceColumns(obj.columns);
  if (!query || columns.length === 0) return undefined;
  const imageColumn = asString(obj.imageColumn).trim() || undefined;
  const maxRowsRaw = typeof obj.maxRows === "number" ? obj.maxRows : Number(asString(obj.maxRows));
  const maxRows = Math.max(1, Math.min(ASSISTANT_CAPS.maxWebRows, Number.isFinite(maxRowsRaw) ? maxRowsRaw : 25));
  const targetName = asString(obj.targetName).trim() || "Tabla";
  return { query, columns, imageColumn, maxRows, targetName };
}

/** Convierte el JSON crudo del modelo en un AssistantPlan seguro y acotado. */
export function coerceAssistantPlan(raw: unknown): AssistantPlan {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const intentRaw = asString(obj.intent) as AssistantIntent;
  const intent: AssistantIntent = (["edit", "transform", "create", "qa", "retrieve"] as AssistantIntent[]).includes(
    intentRaw,
  )
    ? intentRaw
    : "edit";

  const opsRaw = Array.isArray(obj.ops) ? obj.ops.slice(0, ASSISTANT_CAPS.maxOps) : [];
  const ops = opsRaw.map(coerceOp).filter(Boolean) as AssistantOp[];

  const targetRaw = (obj.target && typeof obj.target === "object" ? obj.target : {}) as Record<string, unknown>;
  const mode = asString(targetRaw.mode) === "new" ? "new" : "active";
  const suggestedName = asString(targetRaw.suggestedName).trim() || undefined;

  const web = coerceWebPlan(obj.web);

  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.map((w) => asString(w)).filter(Boolean).slice(0, 8)
    : undefined;

  return {
    intent,
    summary: asString(obj.summary).trim(),
    question: asString(obj.question).trim(),
    answer: asString(obj.answer).trim() || undefined,
    target: { mode, suggestedName },
    ops,
    web,
    warnings,
    needsConfirmation: ops.length > 0,
  };
}
