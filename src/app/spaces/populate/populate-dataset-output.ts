/**
 * Populate — escribir resultados de generación de vuelta al Dataset conectado.
 */

import { addField, updateCard } from "@/app/spaces/dataset/dataset-logic";
import { isImageCellEmpty, writeImageCellValue } from "@/app/spaces/dataset/dataset-image-history";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import type { MaterializedRow } from "./populate-materialize";
import type { PopulateDatasetOutputSettings } from "./populate-types";

export function slugDatasetColumnKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "resultado";
}

export function suggestPopulateOutputColumnLabel(templateLabel: string): string {
  const base = templateLabel.trim() || "Resultado";
  if (/generad/i.test(base)) return base;
  return `${base} generado`;
}

export function findImageFieldForOutput(
  schema: FieldDef[],
  columnLabel: string,
): FieldDef | undefined {
  const key = slugDatasetColumnKey(columnLabel);
  return schema.find(
    (f) => f.type === "image" && (f.key === key || f.label.trim().toLowerCase() === columnLabel.trim().toLowerCase()),
  );
}

function versionedColumnLabel(label: string, takenLabels: Set<string>): string {
  const base = label.trim() || "Resultado generado";
  if (!takenLabels.has(base)) return base;
  let n = 2;
  while (takenLabels.has(`${base} v${n}`)) n += 1;
  return `${base} v${n}`;
}

export interface ApplyPopulateDatasetOutputResult {
  dataset: Dataset;
  fieldId: string;
  fieldKey: string;
  fieldLabel: string;
  writtenCount: number;
  skippedCount: number;
  createdColumn: boolean;
}

export function applyPopulateResultsToDataset(args: {
  dataset: Dataset;
  listId: string;
  rows: MaterializedRow[];
  settings: PopulateDatasetOutputSettings;
}): ApplyPopulateDatasetOutputResult {
  const { dataset, listId, rows, settings } = args;
  const list = dataset.lists.find((l) => l.id === listId);
  if (!list) {
    throw new Error("Listado del Dataset no encontrado.");
  }

  let next = dataset;
  let field =
    settings.existingFieldId != null
      ? list.schema.find((f) => f.id === settings.existingFieldId)
      : findImageFieldForOutput(list.schema, settings.columnLabel);

  let createdColumn = false;

  if (field && settings.conflictStrategy === "versioned") {
    const takenLabels = new Set(list.schema.map((f) => f.label));
    const label = versionedColumnLabel(settings.columnLabel, takenLabels);
    next = addField(next, listId, { label, type: "image", key: slugDatasetColumnKey(label) });
    const refreshed = next.lists.find((l) => l.id === listId)!;
    field = refreshed.schema[refreshed.schema.length - 1];
    createdColumn = true;
  } else if (!field) {
    next = addField(next, listId, {
      label: settings.columnLabel.trim() || "Resultado generado",
      type: "image",
      key: slugDatasetColumnKey(settings.columnLabel),
    });
    const refreshed = next.lists.find((l) => l.id === listId)!;
    field = refreshed.schema[refreshed.schema.length - 1];
    createdColumn = true;
  }

  if (!field) throw new Error("No se pudo resolver la columna de salida.");

  const fieldId = field.id;
  let writtenCount = 0;
  let skippedCount = 0;

  const refreshedList = () => next.lists.find((l) => l.id === listId)!;

  for (const row of rows) {
    if (!row.output?.trim()) continue;
    const card = refreshedList().cards[row.rowIndex];
    if (!card) continue;

    const current = card.values[fieldId];
    if (settings.fillMode === "empty_only" && !isImageCellEmpty(current)) {
      skippedCount += 1;
      continue;
    }

    const imageValue = writeImageCellValue({
      current,
      url: row.output,
      assetId: row.s3Key ?? undefined,
      s3Key: row.s3Key,
      source: "populate",
    });

    next = updateCard(next, listId, card.id, { [fieldId]: imageValue });
    writtenCount += 1;
  }

  const finalField = next.lists.find((l) => l.id === listId)?.schema.find((f) => f.id === fieldId);

  return {
    dataset: next,
    fieldId,
    fieldKey: finalField?.key ?? field.key,
    fieldLabel: finalField?.label ?? field.label,
    writtenCount,
    skippedCount,
    createdColumn,
  };
}
