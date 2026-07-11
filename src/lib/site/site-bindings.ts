import type { MediaListOutput } from "@/app/spaces/media-list-output";
import type { PopulateTemplateBinding } from "@/app/spaces/populate/populate-types";
import { resolvePopulateSlotValues } from "@/app/spaces/populate/populate-designer-form";
import type { Dataset, FieldValue } from "@/app/spaces/dataset/dataset-types";
import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";
import type {
  Block,
  CollectionContent,
  CollectionItem,
  MediaContent,
  SiteProject,
  TextContent,
} from "./site-types";
import { getActiveSitePage, updateActiveSitePage } from "./site-project";

export type SiteGraphBindingSources = {
  dataset: Dataset | null;
  contentMediaList: MediaListOutput | null;
  populateBindings: PopulateTemplateBinding[] | null;
  populateNodeId: string | null;
  /** Dataset cableado al nodo Populate (picks de fila). */
  populateDataset: Dataset | null;
  populateListId: string | null;
  mediaUrl: string | null;
};

export type PopulateResolvedSlotMaps = {
  text: Record<string, string>;
  images: Record<string, string>;
};

export type SiteGraphConnectionStatus = {
  dataset: { connected: boolean; label: string | null; rowCount: number };
  content: { connected: boolean; label: string | null; itemCount: number };
  media: { connected: boolean; label: string | null; hasUrl: boolean };
};

export function emptySiteGraphConnectionStatus(): SiteGraphConnectionStatus {
  return {
    dataset: { connected: false, label: null, rowCount: 0 },
    content: { connected: false, label: null, itemCount: 0 },
    media: { connected: false, label: null, hasUrl: false },
  };
}

function fieldValueMediaUrl(value: FieldValue): string | undefined {
  if (value.type === "image") {
    return resolveFullQualityMediaUrl(value.url, value.s3Key);
  }
  if (value.type === "video") {
    return resolveFullQualityMediaUrl(value.url);
  }
  return undefined;
}

function fieldValueScalar(value: FieldValue | undefined): string | undefined {
  if (!value) return undefined;
  switch (value.type) {
    case "text":
    case "url":
    case "select":
    case "color":
      return value.value?.trim() || undefined;
    case "number":
      return Number.isFinite(value.value) ? String(value.value) : undefined;
    case "boolean":
      return value.value ? "true" : "false";
    case "image":
    case "video":
      return fieldValueMediaUrl(value);
    default:
      return undefined;
  }
}

function fieldValueUrl(value: FieldValue | undefined): string | undefined {
  if (!value) return undefined;
  if (value.type === "image" || value.type === "video") {
    return fieldValueMediaUrl(value);
  }
  if (value.type === "url" && value.value?.trim()) return value.value.trim();
  return undefined;
}

export type DatasetCollectionOptions = {
  listId?: string;
  imageFieldId?: string;
  map?: Record<string, string>;
  sort?: { field: string; dir: "asc" | "desc" };
  limit?: number;
};

/** Filas del dataset → ítems de colección con map/sort/limit. */
export function datasetToCollectionItems(dataset: Dataset, options?: DatasetCollectionOptions): CollectionItem[] {
  const list = options?.listId
    ? dataset.lists.find((entry) => entry.id === options.listId)
    : dataset.lists[0];
  if (!list?.cards.length) return [];

  const imageField =
    (options?.imageFieldId
      ? list.schema.find((field) => field.id === options.imageFieldId)
      : undefined) ?? list.schema.find((field) => field.type === "image");

  let cards = [...list.cards];
  const sortFieldKey = options?.sort?.field?.trim();
  if (sortFieldKey) {
    const sortField =
      list.schema.find((field) => field.key === sortFieldKey || field.id === sortFieldKey) ?? null;
    if (sortField) {
      const dir = options?.sort?.dir ?? "asc";
      cards.sort((left, right) => {
        const a = fieldValueScalar(left.values[sortField.id]) ?? "";
        const b = fieldValueScalar(right.values[sortField.id]) ?? "";
        return dir === "desc" ? b.localeCompare(a, "es") : a.localeCompare(b, "es");
      });
    }
  }

  if (typeof options?.limit === "number" && options.limit > 0) {
    cards = cards.slice(0, options.limit);
  }

  const map = options?.map ?? (imageField ? { src: imageField.key } : {});

  return cards
    .map((card) => {
      const item: CollectionItem = {};
      for (const [itemKey, fieldKey] of Object.entries(map)) {
        const field =
          list.schema.find((entry) => entry.key === fieldKey || entry.id === fieldKey) ?? null;
        if (!field) continue;
        const scalar = fieldValueScalar(card.values[field.id]);
        if (scalar) item[itemKey] = scalar;
      }
      if (!item.src && imageField) {
        const url = fieldValueUrl(card.values[imageField.id]);
        if (url) item.src = url;
      }
      return Object.keys(item).length > 0 ? item : null;
    })
    .filter((item): item is CollectionItem => item !== null);
}

export function mediaListToCollectionItems(mediaList: MediaListOutput): CollectionItem[] {
  return mediaList.items
    .map((item) => {
      const url = resolveFullQualityMediaUrl(item.url, item.s3Key);
      if (!url) return null;
      const row: CollectionItem = { src: url };
      const caption = item.title?.trim();
      if (caption) row.caption = caption;
      return row;
    })
    .filter((item): item is CollectionItem => item !== null);
}

function resolveDatasetOptionsForSection(section: Block, dataset: Dataset): DatasetCollectionOptions {
  if (section.type !== "collection") return {};
  const content = section.content as CollectionContent;
  const listId = content.binding?.listId ?? dataset.lists[0]?.id;
  const list = listId ? dataset.lists.find((entry) => entry.id === listId) : dataset.lists[0];
  if (!list) return {};

  const imageFieldId =
    content.binding?.imageFieldId ??
    (content.binding?.map?.src
      ? list.schema.find((field) => field.key === content.binding!.map.src)?.id
      : undefined) ??
    list.schema.find((field) => field.type === "image")?.id;

  return {
    listId: list.id,
    imageFieldId,
    map: content.binding?.map,
    sort: content.binding?.sort,
    limit: content.binding?.limit,
  };
}

function pickedRowsForSiteBinding(
  binding: PopulateTemplateBinding,
  dataset: Dataset,
  listId: string,
): Record<string, string> {
  const list = dataset.lists.find((entry) => entry.id === listId) ?? dataset.lists[0];
  const pickedRows: Record<string, string> = { ...(binding.defaultPickedRows ?? {}) };
  if (!list?.cards.length) return pickedRows;
  for (const pick of binding.picks) {
    if (pickedRows[pick.id]) continue;
    const cardId = list.cards[0]?.id;
    if (cardId) pickedRows[pick.id] = cardId;
  }
  return pickedRows;
}

/** Resuelve slots Populate desde manual + picks del Dataset conectado al nodo Populate. */
export function resolvePopulateBindingSlotMaps(
  bindings: PopulateTemplateBinding[] | null,
  dataset: Dataset | null,
  listId: string | null,
): PopulateResolvedSlotMaps {
  const text: Record<string, string> = {};
  const images: Record<string, string> = {};
  if (!bindings?.length) return { text, images };

  for (const binding of bindings) {
    for (const [slotKey, manualValue] of Object.entries(binding.manualSlotValues ?? {})) {
      if (manualValue?.trim()) text[slotKey] = manualValue.trim();
    }
  }

  if (!dataset || !listId?.trim()) return { text, images };

  for (const binding of bindings) {
    const slotValues = resolvePopulateSlotValues({
      binding,
      dataset,
      listId,
      pickedRows: pickedRowsForSiteBinding(binding, dataset, listId),
      manualValues: binding.manualSlotValues ?? {},
      pickedPoses: binding.entityPoseColumnFieldId,
    });
    for (const [slotKey, value] of Object.entries(slotValues)) {
      if (value.kind === "text" && value.text.trim()) {
        text[slotKey] = value.text.trim();
      } else if (value.kind === "image" && value.url?.trim()) {
        images[slotKey] = value.url.trim();
      }
    }
  }

  return { text, images };
}

export function populateBindingsToTextValues(
  bindings: PopulateTemplateBinding[] | null,
  dataset?: Dataset | null,
  listId?: string | null,
): Record<string, string> {
  return resolvePopulateBindingSlotMaps(bindings, dataset ?? null, listId ?? null).text;
}

function patchPopulateTextBlocks(section: Block, textValues: Record<string, string>, ref?: string): Block {
  if (!Object.keys(textValues).length) return section;

  const patchBlock = (block: Block): Block => {
    if (block.type === "text") {
      const slotKey = block.source.ref?.trim();
      const value = slotKey ? textValues[slotKey] : undefined;
      if (value) {
        return {
          ...block,
          source: { kind: "populate", ref: slotKey },
          content: { ...(block.content as TextContent), value },
        };
      }
    }
    if (block.children?.length) {
      const children = block.children.map(patchBlock);
      if (children.some((child, index) => child !== block.children![index])) {
        return { ...block, children };
      }
    }
    return block;
  };

  return patchBlock(section);
}

function patchCollectionSection(
  section: Block,
  items: CollectionItem[],
  sourceKind: "dataset" | "populate",
  ref?: string,
): Block {
  if (section.type !== "collection" || items.length === 0) return section;
  const content = section.content as CollectionContent;
  return {
    ...section,
    source: { kind: sourceKind, ref },
    content: { ...content, items },
  };
}

function patchPopulateImageBlocks(section: Block, imageValues: Record<string, string>, ref?: string): Block {
  if (!Object.keys(imageValues).length) return section;

  const patchBlock = (block: Block): Block => {
    if (block.type === "media") {
      const slotKey = block.source.ref?.trim();
      const url = slotKey ? imageValues[slotKey] : undefined;
      if (url) {
        const content = block.content as MediaContent;
        return {
          ...block,
          source: { kind: "populate", ref: slotKey },
          content: { ...content, src: url, mediaType: content.mediaType === "embed" ? "image" : content.mediaType },
        };
      }
    }
    if (block.children?.length) {
      const children = block.children.map(patchBlock);
      if (children.some((child, index) => child !== block.children![index])) {
        return { ...block, children };
      }
    }
    return block;
  };

  return patchBlock(section);
}

function patchFirstEmptyMedia(section: Block, url: string): Block {
  let changed = false;

  const patchBlock = (block: Block): Block => {
    if (changed) return block;
    if (block.type === "media") {
      const content = block.content as MediaContent;
      if (!content.src?.trim()) {
        changed = true;
        return {
          ...block,
          source: { kind: "designer", ref: undefined },
          content: { ...content, src: url },
        };
      }
    }
    if (block.children?.length) {
      const children = block.children.map(patchBlock);
      if (children.some((child, index) => child !== block.children![index])) {
        return { ...block, children };
      }
    }
    return block;
  };

  return patchBlock(section);
}

/** Enriquece el proyecto para preview/publish sin mutar el borrador manual. */
export function applySiteGraphBindings(
  project: SiteProject,
  sources: SiteGraphBindingSources,
): SiteProject {
  const {
    dataset,
    contentMediaList,
    populateBindings,
    populateNodeId,
    populateDataset,
    populateListId,
    mediaUrl,
  } = sources;
  const populateSlots = resolvePopulateBindingSlotMaps(
    populateBindings,
    populateDataset,
    populateListId,
  );
  const populateText = populateSlots.text;
  const populateImages = populateSlots.images;
  if (
    !dataset &&
    !contentMediaList?.items.length &&
    !mediaUrl?.trim() &&
    !Object.keys(populateText).length &&
    !Object.keys(populateImages).length
  ) {
    return project;
  }

  const populateItems = contentMediaList ? mediaListToCollectionItems(contentMediaList) : [];

  const pages = project.pages.map((page) => {
    const sections = page.sections.map((section) => {
      let next = section;

      if (Object.keys(populateText).length > 0) {
        next = patchPopulateTextBlocks(next, populateText, populateNodeId ?? undefined);
      }

      if (Object.keys(populateImages).length > 0) {
        next = patchPopulateImageBlocks(next, populateImages, populateNodeId ?? undefined);
      }

      if (populateItems.length > 0 && section.type === "collection") {
        next = patchCollectionSection(next, populateItems, "populate", contentMediaList?.sourceNodeId);
      } else if (dataset && section.type === "collection") {
        const options = resolveDatasetOptionsForSection(section, dataset);
        const items = datasetToCollectionItems(dataset, options);
        if (items.length > 0) {
          next = patchCollectionSection(next, items, "dataset", dataset.id);
        }
      }

      if (mediaUrl?.trim()) {
        next = patchFirstEmptyMedia(next, mediaUrl.trim());
      }

      return next;
    });
    return { ...page, sections };
  });

  return { ...project, pages };
}

export function buildSiteGraphConnectionStatus(args: {
  dataset: Dataset | null;
  datasetConnected: boolean;
  datasetLabel?: string | null;
  contentMediaList: MediaListOutput | null;
  contentConnected: boolean;
  contentLabel?: string | null;
  mediaUrl: string | null;
  mediaConnected: boolean;
  mediaLabel?: string | null;
}): SiteGraphConnectionStatus {
  const datasetRows = args.dataset ? datasetToCollectionItems(args.dataset).length : 0;
  const contentItems = args.contentMediaList ? mediaListToCollectionItems(args.contentMediaList).length : 0;

  return {
    dataset: {
      connected: args.datasetConnected,
      label: args.datasetLabel ?? args.dataset?.name ?? null,
      rowCount: datasetRows,
    },
    content: {
      connected: args.contentConnected,
      label: args.contentLabel ?? args.contentMediaList?.title ?? null,
      itemCount: contentItems,
    },
    media: {
      connected: args.mediaConnected,
      label: args.mediaLabel ?? null,
      hasUrl: Boolean(args.mediaUrl?.trim()),
    },
  };
}

export function reorderSiteSections(sections: Block[], dragId: string, dropId: string): Block[] {
  if (dragId === dropId) return sections;
  const from = sections.findIndex((section) => section.id === dragId);
  const to = sections.findIndex((section) => section.id === dropId);
  if (from < 0 || to < 0) return sections;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function moveSiteSection(
  sections: Block[],
  sectionId: string,
  direction: "up" | "down",
): Block[] {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return sections;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
  return next;
}

export function reorderSiteNavInclude(include: string[], sections: Block[]): string[] {
  const includeSet = new Set(include);
  return sections.map((section) => section.id).filter((id) => includeSet.has(id));
}

export function canApplyGraphBindings(
  status: SiteGraphConnectionStatus,
  sources?: SiteGraphBindingSources | null,
): boolean {
  const populateSlots = sources
    ? resolvePopulateBindingSlotMaps(
        sources.populateBindings,
        sources.populateDataset,
        sources.populateListId,
      )
    : { text: {}, images: {} };
  const populateSlotCount =
    Object.keys(populateSlots.text).length + Object.keys(populateSlots.images).length;

  return (
    (status.dataset.connected && status.dataset.rowCount > 0) ||
    (status.content.connected && status.content.itemCount > 0) ||
    (status.media.connected && status.media.hasUrl) ||
    populateSlotCount > 0
  );
}

export function graphBindingsPending(
  draft: SiteProject,
  preview: SiteProject,
  status: SiteGraphConnectionStatus,
  sources?: SiteGraphBindingSources | null,
): boolean {
  if (!canApplyGraphBindings(status, sources)) return false;
  const draftSections = getActiveSitePage(draft).sections;
  const previewSections = getActiveSitePage(preview).sections;
  return JSON.stringify(draftSections) !== JSON.stringify(previewSections);
}

/** Alias explícito: persiste en node.data lo que hoy solo se ve en preview. */
export function persistSiteGraphBindings(
  project: SiteProject,
  sources: SiteGraphBindingSources,
): SiteProject {
  return applySiteGraphBindings(project, sources);
}
