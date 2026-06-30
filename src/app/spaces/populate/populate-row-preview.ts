import type { Dataset, FieldDef, FieldValue } from "@/app/spaces/dataset/dataset-types";
import {
  fieldValueAsText,
  getListFieldImageAtRow,
  getListFieldTextAtRow,
} from "@/app/spaces/dataset/dataset-logic";

export type PopulateRowsSnapshot = Array<{
  cardId: string;
  label: string;
  values: Record<string, FieldValue>;
}>;

export function fieldImageUrl(value: FieldValue | undefined): string | undefined {
  if (!value) return undefined;
  if (value.type === "image" && value.url?.trim()) return value.url.trim();
  return undefined;
}

export function fieldDisplayText(value: FieldValue | undefined): string {
  if (!value) return "";
  return fieldValueAsText(value).trim();
}

export function cardRowIndex(cards: Array<{ id: string }>, cardId: string): number {
  return cards.findIndex((c) => c.id === cardId);
}

export function firstImageFieldId(schema: FieldDef[]): string | undefined {
  return schema.find((f) => f.type === "image")?.id;
}

/** Miniatura para un registro (primera columna imagen con URL). */
export function recordThumbFromValues(
  values: Record<string, FieldValue> | undefined,
  schema: FieldDef[],
  preferFieldId?: string,
): string | undefined {
  if (!values) return undefined;
  if (preferFieldId) {
    const u = fieldImageUrl(values[preferFieldId]);
    if (u) return u;
  }
  for (const f of schema) {
    if (f.type !== "image") continue;
    const u = fieldImageUrl(values[f.id]);
    if (u) return u;
  }
  for (const v of Object.values(values)) {
    const u = fieldImageUrl(v);
    if (u) return u;
  }
  return undefined;
}

export function textAtCard(args: {
  dataset: Dataset;
  listId: string;
  cardId: string;
  fieldId: string;
}): string {
  const list = args.dataset.lists.find((l) => l.id === args.listId);
  const rowIndex = cardRowIndex(list?.cards ?? [], args.cardId);
  if (rowIndex < 0) return "";
  return getListFieldTextAtRow(args.dataset, args.listId, args.fieldId, rowIndex)?.trim() ?? "";
}

export function imageAtCard(args: {
  dataset: Dataset;
  listId: string;
  cardId: string;
  fieldId: string;
}): string | undefined {
  const list = args.dataset.lists.find((l) => l.id === args.listId);
  const rowIndex = cardRowIndex(list?.cards ?? [], args.cardId);
  if (rowIndex < 0) return undefined;
  return getListFieldImageAtRow(args.dataset, args.listId, args.fieldId, rowIndex)?.url?.trim();
}

export function textAtSnapshotRow(
  rowsSnapshot: PopulateRowsSnapshot,
  cardId: string,
  fieldId: string,
): string {
  const row = rowsSnapshot.find((r) => r.cardId === cardId);
  return fieldDisplayText(row?.values[fieldId]);
}

export function imageAtSnapshotRow(
  rowsSnapshot: PopulateRowsSnapshot,
  cardId: string,
  fieldId: string,
): string | undefined {
  const row = rowsSnapshot.find((r) => r.cardId === cardId);
  return fieldImageUrl(row?.values[fieldId]);
}

export interface PopulatePoseOptionVisual {
  fieldId: string;
  label: string;
  url?: string;
}

export function poseOptionsVisual(args: {
  schema: FieldDef[];
  imageFieldIds: string[];
  cardId: string;
  dataset?: Dataset | null;
  listId?: string;
  rowsSnapshot?: PopulateRowsSnapshot;
  /** Etiquetas cuando no hay schema (formulario público). */
  fieldLabels?: Record<string, string>;
}): PopulatePoseOptionVisual[] {
  const { schema, imageFieldIds, cardId, fieldLabels } = args;
  return imageFieldIds.map((fieldId) => {
    const label = schema.find((f) => f.id === fieldId)?.label ?? fieldLabels?.[fieldId] ?? fieldId;
    let url: string | undefined;
    if (args.rowsSnapshot) {
      url = imageAtSnapshotRow(args.rowsSnapshot, cardId, fieldId);
    } else if (args.dataset && args.listId) {
      url = imageAtCard({ dataset: args.dataset, listId: args.listId, cardId, fieldId });
    }
    return { fieldId, label, url };
  });
}
