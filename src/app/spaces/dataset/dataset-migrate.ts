import type { Card, Dataset, DatasetList, FieldDef } from "./dataset-types";

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}${rand}`;
}

function slugKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "listado";
}

export function createDatasetList(name: string, partial?: Partial<DatasetList>): DatasetList {
  const label = name.trim() || "Listado";
  return {
    id: partial?.id ?? genId("dl"),
    name: label,
    key: partial?.key ?? slugKey(label),
    schema: partial?.schema ?? [],
    cards: partial?.cards ?? [],
  };
}

/** Formato legado (schema/cards en raíz) → lists[]. */
export function normalizeDataset(raw: Dataset): Dataset {
  const legacy = raw as Dataset & { schema?: FieldDef[]; cards?: Card[] };
  if (Array.isArray(raw.lists) && raw.lists.length > 0) {
    return {
      ...raw,
      lists: raw.lists.map((list) => ({
        ...list,
        schema: list.schema ?? [],
        cards: list.cards ?? [],
      })),
    };
  }
  if (legacy.schema?.length || legacy.cards?.length) {
    return {
      ...raw,
      lists: [
        createDatasetList("Principal", {
          schema: legacy.schema ?? [],
          cards: legacy.cards ?? [],
          key: "principal",
        }),
      ],
    };
  }
  return {
    ...raw,
    lists: [createDatasetList("Principal")],
  };
}

export function getDatasetList(dataset: Dataset, listId: string): DatasetList | undefined {
  return normalizeDataset(dataset).lists.find((list) => list.id === listId);
}

export function totalCardCount(dataset: Dataset): number {
  return normalizeDataset(dataset).lists.reduce((sum, list) => sum + list.cards.length, 0);
}
