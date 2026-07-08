/**
 * Sync bidireccional BrandKit (project.metadata.assets) ↔ bloque Marca del Dataset.
 */

import { createDataset, emptyValueForType, normalizeDataset } from "@/app/spaces/dataset/dataset-logic";
import { createDatasetList } from "@/app/spaces/dataset/dataset-migrate";
import type { Card, Dataset, DatasetNodeData, FieldValue } from "@/app/spaces/dataset/dataset-types";
import type { ProjectAssetsMetadata, BrainVisualStyleSlotKey } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  BRANDKIT_DATASET_FIELD_IDS,
  BRANDKIT_DATASET_MAX_GALLERY,
  BRANDKIT_DATASET_MAX_MESSAGES,
  BRANDKIT_GALLERY_LIST_NAME,
  BRANDKIT_MESSAGES_LIST_NAME,
  brandKitDatasetConstantDefs,
  brandKitDatasetConstantId,
  brandKitGalleryListKey,
  brandKitGalleryListSchema,
  brandKitMessagesListKey,
  brandKitMessagesListSchema,
  type BrandKitDatasetFieldId,
  type BrandKitDatasetLink,
} from "./brandkit-dataset-schema";
import {
  toPlainBrandText,
} from "./brandkit-dataset-projections";
import {
  attachBrandKitDatasetProjectionSidecar,
  buildBrandKitDatasetProjection,
} from "@/lib/brandkit/dataset-projection";

const CONTEXT_MAX = 480;
const TONE_MAX_LINES = 12;

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function textValue(value: string): FieldValue {
  return { type: "text", value };
}

function colorValue(value: string): FieldValue {
  const v = value.trim();
  if (!/^#?[0-9A-Fa-f]{6}$/.test(v)) return { type: "color", value: "" };
  const hex = (v.startsWith("#") ? v : `#${v}`).toUpperCase();
  return { type: "color", value: hex };
}

function imageValue(url: string | null | undefined): FieldValue {
  const trimmed = (url ?? "").trim();
  return trimmed
    ? { type: "image", assetId: "", url: trimmed }
    : { type: "image", assetId: "", url: "" };
}

function constantValue(
  dataset: Dataset,
  brainNodeId: string,
  fieldId: BrandKitDatasetFieldId,
): FieldValue | undefined {
  const id = brandKitDatasetConstantId(brainNodeId, fieldId);
  return dataset.constants.values[id];
}

function readTextValue(value: FieldValue | undefined): string {
  return value?.type === "text" ? value.value : "";
}

function readColorValue(value: FieldValue | undefined): string {
  if (value?.type !== "color") return "";
  const v = value.value.trim();
  if (!/^#?[0-9A-Fa-f]{6}$/.test(v)) return "";
  const hex = v.startsWith("#") ? v : `#${v}`;
  return hex.toUpperCase();
}

function readImageUrl(value: FieldValue | undefined): string {
  if (value?.type !== "image") return "";
  return (value.url || "").trim();
}

export function isBrandKitManagedList(listId: string, link?: BrandKitDatasetLink | null): boolean {
  if (!link) return false;
  return listId === link.messagesListId || listId === link.galleryListId;
}

export function filterUserFacingLists(dataset: Dataset, link?: BrandKitDatasetLink | null) {
  return normalizeDataset(dataset).lists.filter((list) => !isBrandKitManagedList(list.id, link));
}

export function countBrandKitSharedConstants(dataset: Dataset, brainNodeId: string): number {
  const prefix = `bk:${brainNodeId}:`;
  return dataset.constants.fields.filter((field) => field.id.startsWith(prefix)).length;
}

function parseToneToAssets(toneText: string, assets: ProjectAssetsMetadata): ProjectAssetsMetadata {
  const lines = toPlainBrandText(toneText, 4000)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, TONE_MAX_LINES);
  return {
    ...assets,
    strategy: {
      ...assets.strategy,
      languageTraits: lines,
      preferredTerms: [],
      voiceExamples: assets.strategy.voiceExamples.filter((v) => v.kind !== "approved_voice"),
    },
  };
}

function slotFieldIdForKey(key: BrainVisualStyleSlotKey): BrandKitDatasetFieldId {
  const map: Record<BrainVisualStyleSlotKey, BrandKitDatasetFieldId> = {
    environment: BRANDKIT_DATASET_FIELD_IDS.imageEnvironment,
    textures: BRANDKIT_DATASET_FIELD_IDS.imageTextures,
    people: BRANDKIT_DATASET_FIELD_IDS.imagePeople,
    objects: BRANDKIT_DATASET_FIELD_IDS.imageObjects,
    protagonist: BRANDKIT_DATASET_FIELD_IDS.imageProtagonist,
  };
  return map[key];
}

/** Crea o repara listas + constantes del bloque Marca. */
export function ensureBrandKitDatasetStructure(dataset: Dataset, brainNodeId: string): {
  dataset: Dataset;
  link: BrandKitDatasetLink;
} {
  const normalized = normalizeDataset(dataset);
  const defs = brandKitDatasetConstantDefs(brainNodeId);
  const fieldIds = new Set(defs.map((f) => f.id));

  const nextFields = [
    ...normalized.constants.fields.filter((f) => !fieldIds.has(f.id)),
    ...defs,
  ];
  const nextValues = { ...normalized.constants.values };
  for (const field of defs) {
    if (!nextValues[field.id]) {
      nextValues[field.id] = emptyValueForType(field.type, field.options);
    }
  }

  let messagesList = normalized.lists.find((l) => l.key === brandKitMessagesListKey(brainNodeId));
  if (!messagesList) {
    messagesList = createDatasetList(BRANDKIT_MESSAGES_LIST_NAME, {
      key: brandKitMessagesListKey(brainNodeId),
      schema: brandKitMessagesListSchema(),
      cards: [],
    });
  } else {
    messagesList = {
      ...messagesList,
      name: BRANDKIT_MESSAGES_LIST_NAME,
      schema: brandKitMessagesListSchema(),
    };
  }

  let galleryList = normalized.lists.find((l) => l.key === brandKitGalleryListKey(brainNodeId));
  if (!galleryList) {
    galleryList = createDatasetList(BRANDKIT_GALLERY_LIST_NAME, {
      key: brandKitGalleryListKey(brainNodeId),
      schema: brandKitGalleryListSchema(),
      cards: [],
    });
  } else {
    galleryList = {
      ...galleryList,
      name: BRANDKIT_GALLERY_LIST_NAME,
      schema: brandKitGalleryListSchema(),
    };
  }

  const otherLists = normalized.lists.filter(
    (l) => l.id !== messagesList!.id && l.id !== galleryList!.id,
  );

  return {
    dataset: {
      ...normalized,
      constants: { fields: nextFields, values: nextValues },
      lists: [...otherLists, messagesList, galleryList],
    },
    link: {
      brainNodeId,
      messagesListId: messagesList.id,
      galleryListId: galleryList.id,
    },
  };
}

/** Proyecta assets → bloque Marca del Dataset (sin mutar assets). */
export function syncBrandKitAssetsToDataset(
  dataset: Dataset,
  brainNodeId: string,
  rawAssets: unknown,
): { dataset: Dataset; link: BrandKitDatasetLink; assets: ProjectAssetsMetadata } {
  const assets = normalizeProjectAssets(rawAssets);
  const { dataset: structured, link } = ensureBrandKitDatasetStructure(dataset, brainNodeId);
  const projection = buildBrandKitDatasetProjection(assets, assets.brainMeta?.boardMeta, brainNodeId);
  const assetsWithSidecar = attachBrandKitDatasetProjectionSidecar(assets, projection);

  const values = { ...structured.constants.values };
  for (const row of projection.constants) {
    if (row.text !== undefined) values[row.constantId] = textValue(row.text);
    else if (row.color !== undefined) values[row.constantId] = colorValue(row.color);
    else if (row.imageUrl !== undefined) values[row.constantId] = imageValue(row.imageUrl);
  }

  const messageField = brandKitMessagesListSchema()[0]!;
  const messageCards: Card[] = projection.lists.messages.map((row) => ({
    id: row.rowId.startsWith("bkmsg_") ? row.rowId : genId("bkmsg"),
    values: { [messageField.id]: textValue(row.message) },
  }));

  const gallerySchema = brandKitGalleryListSchema();
  const categoryField = gallerySchema[0]!;
  const imageField = gallerySchema[1]!;
  const galleryCards: Card[] = projection.lists.gallery.map((row) => ({
    id: row.rowId || genId("bkgal"),
    values: {
      [categoryField.id]: { type: "select", value: row.category },
      [imageField.id]: imageValue(row.imageUrl),
    },
  }));

  const lists = structured.lists.map((list) => {
    if (list.id === link.messagesListId) return { ...list, cards: messageCards };
    if (list.id === link.galleryListId) return { ...list, cards: galleryCards };
    return list;
  });

  return {
    link,
    assets: assetsWithSidecar,
    dataset: normalizeDataset({
      ...structured,
      constants: { fields: structured.constants.fields, values },
      lists,
    }),
  };
}

/** Fuerza reproyección BrandKit → Dataset («Actualizar desde BrandKit»). */
export function refreshBrandKitDatasetFromAssets(
  dataset: Dataset,
  link: BrandKitDatasetLink,
  rawAssets: unknown,
): { dataset: Dataset; assets: ProjectAssetsMetadata; link: BrandKitDatasetLink } {
  const synced = syncBrandKitAssetsToDataset(dataset, link.brainNodeId, rawAssets);
  return { dataset: synced.dataset, assets: synced.assets, link: synced.link };
}

/** Parche de node.data al conectar BrandKit → Dataset. */
export function patchDatasetNodeWithBrandKit(
  nodeData: DatasetNodeData,
  brainNodeId: string,
  rawAssets: unknown,
  projectScopeId: string,
): Partial<DatasetNodeData> {
  const base = nodeData.dataset
    ? normalizeDataset(nodeData.dataset)
    : createDataset(nodeData.label?.trim() || "Dataset", "local", projectScopeId);
  const { dataset, link } = syncBrandKitAssetsToDataset(base, brainNodeId, rawAssets);
  return {
    dataset: { ...dataset, scope: "local", projectId: projectScopeId },
    brandKitLink: link,
    datasetRef: undefined,
    datasetPreview: undefined,
    datasetRemoteVersion: undefined,
    label: dataset.name,
  };
}

/** Parche de node.data tras editar bloque Marca (dataset + assets ya alineados). */
export function patchDatasetNodeAfterBrandKitEdit(
  nodeData: DatasetNodeData,
  dataset: Dataset,
  link: BrandKitDatasetLink,
  projectScopeId: string,
): Partial<DatasetNodeData> {
  return {
    dataset: { ...dataset, scope: "local", projectId: projectScopeId },
    brandKitLink: link,
    label: dataset.name,
  };
}

/** Extrae cambios del bloque Marca del Dataset → assets (solo constants; listas read-only v1). */
export function syncBrandKitDatasetToAssets(
  dataset: Dataset,
  link: BrandKitDatasetLink,
  rawAssets: unknown,
): ProjectAssetsMetadata {
  const assets = normalizeProjectAssets(rawAssets);
  const brainNodeId = link.brainNodeId;
  const normalized = normalizeDataset(dataset);

  const context = toPlainBrandText(
    readTextValue(constantValue(normalized, brainNodeId, "context")),
    CONTEXT_MAX,
  );
  const toneText = toPlainBrandText(readTextValue(constantValue(normalized, brainNodeId, "tone")), 4000);

  let next: ProjectAssetsMetadata = {
    ...assets,
    knowledge: {
      ...assets.knowledge,
      corporateContext: context,
    },
    brand: {
      ...assets.brand,
      colorPrimary: readColorValue(constantValue(normalized, brainNodeId, "color_primary")) || null,
      colorSecondary:
        readColorValue(constantValue(normalized, brainNodeId, "color_secondary")) || null,
      colorAccent: readColorValue(constantValue(normalized, brainNodeId, "color_accent")) || null,
      logoPositive:
        readImageUrl(constantValue(normalized, brainNodeId, "logo_positive")) || null,
      logoNegative:
        readImageUrl(constantValue(normalized, brainNodeId, "logo_negative")) || null,
    },
  };

  next = parseToneToAssets(toneText, next);

  const visualStyle = { ...next.strategy.visualStyle };
  for (const slotKey of ["environment", "textures", "people", "objects", "protagonist"] as const) {
    const fieldId = slotFieldIdForKey(slotKey);
    const url = readImageUrl(constantValue(normalized, brainNodeId, fieldId));
    visualStyle[slotKey] = {
      ...visualStyle[slotKey],
      imageUrl: url || null,
    };
  }

  return normalizeProjectAssets({
    ...next,
    strategy: {
      ...next.strategy,
      visualStyle,
    },
  });
}

export function brandKitDatasetContentSignature(dataset: Dataset, link: BrandKitDatasetLink): string {
  const normalized = normalizeDataset(dataset);
  const parts: string[] = [link.brainNodeId];
  for (const field of brandKitDatasetConstantDefs(link.brainNodeId)) {
    const value = normalized.constants.values[field.id];
    if (!value) {
      parts.push("");
      continue;
    }
    if (value.type === "image") parts.push(value.url ?? "");
    else if ("value" in value) parts.push(String(value.value ?? ""));
    else parts.push("");
  }
  for (const listId of [link.messagesListId, link.galleryListId]) {
    const list = normalized.lists.find((l) => l.id === listId);
    if (!list) {
      parts.push("");
      continue;
    }
    parts.push(
      JSON.stringify(
        list.cards.map((card) =>
          Object.fromEntries(
            Object.entries(card.values).map(([k, v]) => [
              k,
              v.type === "image" ? v.url : "value" in v ? v.value : "",
            ]),
          ),
        ),
      ),
    );
  }
  return parts.join("|");
}

export function brandKitAssetsSignature(rawAssets: unknown, brainNodeId: string): string {
  const { dataset, link } = syncBrandKitAssetsToDataset(
    {
      id: "__sig__",
      name: "sig",
      scope: "local",
      lists: [],
      constants: { fields: [], values: {} },
      createdAt: "",
      updatedAt: "",
      version: 0,
    },
    brainNodeId,
    rawAssets,
  );
  return brandKitDatasetContentSignature(dataset, link);
}

/** Aplica edición del Dataset al par dataset+assets manteniendo sync. */
export function applyBrandKitDatasetEdit(
  dataset: Dataset,
  link: BrandKitDatasetLink,
  rawAssets: unknown,
): { dataset: Dataset; assets: ProjectAssetsMetadata; link: BrandKitDatasetLink } {
  const assets = syncBrandKitDatasetToAssets(dataset, link, rawAssets);
  const synced = syncBrandKitAssetsToDataset(dataset, link.brainNodeId, assets);
  return { dataset: synced.dataset, assets: synced.assets, link: synced.link };
}
