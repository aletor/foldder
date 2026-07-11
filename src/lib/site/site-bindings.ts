import type { MediaListOutput } from "@/app/spaces/media-list-output";
import type { Dataset, FieldValue } from "@/app/spaces/dataset/dataset-types";
import type { Block, CollectionContent, CollectionItem, MediaContent, SiteProject } from "./site-types";
import { getActiveSitePage, updateActiveSitePage } from "./site-project";

export type SiteGraphBindingSources = {
  dataset: Dataset | null;
  contentMediaList: MediaListOutput | null;
  mediaUrl: string | null;
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

function fieldValueUrl(value: FieldValue | undefined): string | undefined {
  if (!value) return undefined;
  if (value.type === "image" && value.url?.trim()) return value.url.trim();
  if (value.type === "url" && value.value?.trim()) return value.value.trim();
  return undefined;
}

/** Filas del dataset → ítems de colección (primera columna imagen del listado). */
export function datasetToCollectionItems(
  dataset: Dataset,
  options?: { listId?: string; imageFieldId?: string },
): CollectionItem[] {
  const list = options?.listId
    ? dataset.lists.find((entry) => entry.id === options.listId)
    : dataset.lists[0];
  if (!list?.cards.length) return [];

  const imageField =
    (options?.imageFieldId
      ? list.schema.find((field) => field.id === options.imageFieldId)
      : undefined) ?? list.schema.find((field) => field.type === "image");
  if (!imageField) return [];

  return list.cards
    .map((card) => {
      const url = fieldValueUrl(card.values[imageField.id]);
      if (!url) return null;
      const item: CollectionItem = { src: url };
      return item;
    })
    .filter((item): item is CollectionItem => item !== null);
}

export function mediaListToCollectionItems(mediaList: MediaListOutput): CollectionItem[] {
  return mediaList.items
    .map((item) => {
      const url = item.url?.trim();
      if (!url) return null;
      const row: CollectionItem = { src: url };
      const caption = item.title?.trim();
      if (caption) row.caption = caption;
      return row;
    })
    .filter((item): item is CollectionItem => item !== null);
}

function resolveDatasetOptionsForSection(
  section: Block,
  dataset: Dataset,
): { listId?: string; imageFieldId?: string } {
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

  return { listId: list.id, imageFieldId };
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
  const { dataset, contentMediaList, mediaUrl } = sources;
  if (!dataset && !contentMediaList?.items.length && !mediaUrl?.trim()) {
    return project;
  }

  const populateItems = contentMediaList ? mediaListToCollectionItems(contentMediaList) : [];
  const active = getActiveSitePage(project);

  const sections = active.sections.map((section) => {
    let next = section;

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

  return updateActiveSitePage(project, { sections });
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

export function canApplyGraphBindings(status: SiteGraphConnectionStatus): boolean {
  return (
    (status.dataset.connected && status.dataset.rowCount > 0) ||
    (status.content.connected && status.content.itemCount > 0) ||
    (status.media.connected && status.media.hasUrl)
  );
}

export function graphBindingsPending(
  draft: SiteProject,
  preview: SiteProject,
  status: SiteGraphConnectionStatus,
): boolean {
  if (!canApplyGraphBindings(status)) return false;
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
