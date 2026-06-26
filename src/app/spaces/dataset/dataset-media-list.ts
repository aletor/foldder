/**
 * Dataset → MediaListOutput para Export Multimedia.
 * Recorre filas en orden y, dentro de cada fila, columnas multimedia en orden de schema.
 */

import { isValueEmpty } from "./dataset-logic";
import { normalizeDataset } from "./dataset-migrate";
import type { Dataset, DatasetList, FieldDef, FieldValue } from "./dataset-types";
import { inferMediaListImageMimeType } from "../media-list-download";
import type { MediaListGroup, MediaListItem, MediaListOutput } from "../media-list-output";

const MEDIA_FIELD_TYPES = new Set<FieldDef["type"]>(["image", "video"]);

function listsToExport(dataset: Dataset, listId?: string | null): DatasetList[] {
  const normalized = normalizeDataset(dataset);
  if (listId) {
    const one = normalized.lists.find((l) => l.id === listId);
    return one ? [one] : [];
  }
  return normalized.lists;
}

function mediaItemFromCell(args: {
  list: DatasetList;
  listCount: number;
  rowIndex: number;
  cardId: string;
  field: FieldDef;
  value: FieldValue;
  sourceNodeId: string;
  order: number;
}): MediaListItem | null {
  const { list, listCount, rowIndex, cardId, field, value, sourceNodeId, order } = args;
  if (value.type !== "image" && value.type !== "video") return null;
  if (isValueEmpty(value)) return null;
  const url = value.url?.trim() ?? "";
  const s3Key = value.type === "image" && value.s3Key?.trim() ? value.s3Key.trim() : undefined;
  if (!url && !s3Key) return null;

  const id = `ds_${sourceNodeId}_${list.id}_${cardId}_${field.id}`;
  const title =
    listCount > 1
      ? `${list.name} · Fila ${rowIndex + 1} · ${field.label}`
      : `Fila ${rowIndex + 1} · ${field.label}`;

  const item: MediaListItem = {
    id,
    order,
    title,
    mediaType: value.type === "video" ? "video" : "image",
    url: url || s3Key || value.assetId || "",
    assetId: value.assetId || undefined,
    status: "generated",
    width: value.w,
    height: value.h,
    metadata: {
      datasetListId: list.id,
      datasetListKey: list.key,
      datasetCardId: cardId,
      datasetFieldId: field.id,
      datasetFieldKey: field.key,
      rowIndex,
    },
  };

  if (value.type === "image") {
    if (s3Key) item.s3Key = s3Key;
    item.mimeType =
      value.hasAlpha === true
        ? "image/png"
        : inferMediaListImageMimeType({
            ...item,
            order,
            title,
            mediaType: "image",
            status: "generated",
          });
  }

  if (value.type === "video" && value.durationMs != null) {
    item.durationSeconds = value.durationMs / 1000;
  }

  return item;
}

/** Construye una media_list ordenada (fila × columna multimedia) desde un Dataset conectado. */
export function buildDatasetMediaListOutput(args: {
  dataset: Dataset;
  sourceNodeId: string;
  /** Si se omite o es null, incluye todos los listados del Dataset. */
  listId?: string | null;
  title?: string;
}): MediaListOutput | null {
  const lists = listsToExport(args.dataset, args.listId);
  const items: MediaListItem[] = [];
  const groups: MediaListGroup[] = [];
  let order = 0;

  for (const list of lists) {
    const mediaFields = list.schema.filter((f) => MEDIA_FIELD_TYPES.has(f.type));
    if (mediaFields.length === 0) continue;

    const listItemIds: string[] = [];

    for (let rowIndex = 0; rowIndex < list.cards.length; rowIndex++) {
      const card = list.cards[rowIndex]!;
      for (const field of mediaFields) {
        const value = card.values[field.id];
        if (!value) continue;
        const item = mediaItemFromCell({
          list,
          listCount: lists.length,
          rowIndex,
          cardId: card.id,
          field,
          value,
          sourceNodeId: args.sourceNodeId,
          order,
        });
        if (!item) continue;
        items.push(item);
        listItemIds.push(item.id);
        order += 1;
      }
    }

    if (listItemIds.length > 0) {
      groups.push({
        id: list.id,
        title: list.name,
        role: "dataset_list",
        itemIds: listItemIds,
      });
    }
  }

  if (items.length === 0) return null;

  const normalized = normalizeDataset(args.dataset);

  return {
    kind: "media_list",
    sourceNodeId: args.sourceNodeId,
    sourceNodeType: "dataset",
    title: args.title?.trim() || normalized.name || "Dataset",
    status: "frames_ready",
    items,
    groups,
    metadata: {
      cineNodeId: args.sourceNodeId,
      generatedAt: new Date().toISOString(),
      datasetId: normalized.id,
      ...(args.listId ? { datasetListId: args.listId } : {}),
      totalFrames: items.length,
    },
  };
}
