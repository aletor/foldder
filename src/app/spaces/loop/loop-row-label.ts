import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import { fieldValueAsText, getListFieldValueAtRow } from "@/app/spaces/dataset/dataset-logic";

const TEXTUAL_TYPES = new Set(["text", "number", "select", "url", "color", "boolean"]);

/** Etiqueta legible de una fila del listado (p. ej. nombre del jugador). */
export function datasetListRowLabel(
  dataset: Dataset,
  listId: string,
  schema: FieldDef[],
  rowIndex: number,
): string {
  const primary = schema.find((f) => f.type === "text") ?? schema.find((f) => TEXTUAL_TYPES.has(f.type));
  if (primary) {
    const value = getListFieldValueAtRow(dataset, listId, primary.id, rowIndex);
    const text = fieldValueAsText(value ?? undefined).trim();
    if (text) return text;
  }
  return `Fila ${rowIndex + 1}`;
}
