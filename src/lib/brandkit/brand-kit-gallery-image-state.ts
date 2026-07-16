import type { GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import type { GalleryGeneratedItem } from "./brand-kit-gallery-plan";
import type { GalleryValue } from "./brand-kit-types";

export type GalleryImageVisualState =
  | "empty"
  | "auto_accepted"
  | "approved"
  | "locked"
  | "error"
  | "discarded"
  | "loading";

export type GalleryLibraryFilter = "all" | GalleryGenerateCategory;

export type GalleryLibraryStats = {
  total: number;
  approved: number;
  proposals: number;
  errors: number;
};

export function gallerySlotKey(category: GalleryGenerateCategory, variantIndex: number): string {
  return `${category}:${variantIndex}`;
}

export function parseGallerySlotKey(key: string): { category: GalleryGenerateCategory; variantIndex: number } | null {
  const match = key.match(/^(people_mood|places|objects|textures|general):(\d+)$/);
  if (!match) return null;
  return {
    category: match[1] as GalleryGenerateCategory,
    variantIndex: Number(match[2]),
  };
}

export function resolveGalleryImageVisualState(
  item: GalleryGeneratedItem | undefined,
  slotKey: string,
  gallery: GalleryValue | undefined,
  gallerySlotLocked: boolean,
  isLoading = false,
): GalleryImageVisualState {
  if (isLoading) return "loading";
  const issue = gallery?.slotIssues?.[slotKey];
  if (issue?.error) return "error";
  if (!item?.previewUrl) return "empty";
  if (item.verdict === "down") return "discarded";
  if (gallerySlotLocked) return "locked";
  if (item.userApproved) return "approved";
  return "auto_accepted";
}

export function computeGalleryLibraryStats(
  gallery: GalleryValue | undefined,
  gallerySlotLocked: boolean,
): GalleryLibraryStats {
  let approved = 0;
  let proposals = 0;
  let errors = 0;

  for (const key of Object.keys(gallery?.slotIssues ?? {})) {
    if (gallery?.slotIssues?.[key]?.error) errors += 1;
  }

  for (const item of gallery?.generated ?? []) {
    if (!item.previewUrl) continue;
    const slotKey =
      item.category != null && typeof item.variantIndex === "number"
        ? gallerySlotKey(item.category, item.variantIndex)
        : null;
    if (slotKey && gallery?.slotIssues?.[slotKey]?.error) continue;

    if (item.verdict === "down") continue;
    if (item.userApproved || gallerySlotLocked) {
      approved += 1;
    } else {
      proposals += 1;
    }
  }

  return {
    total: (gallery?.generated ?? []).filter((item) => Boolean(item.previewUrl)).length,
    approved,
    proposals,
    errors,
  };
}

export function patchGalleryGeneratedItem(
  gallery: GalleryValue,
  category: GalleryGenerateCategory,
  variantIndex: number,
  patch: Partial<GalleryGeneratedItem>,
): GalleryValue {
  const key = gallerySlotKey(category, variantIndex);
  const nextIssues = { ...(gallery.slotIssues ?? {}) };
  const generated = (gallery.generated ?? []).map((item) => {
    const sameCategory = (item.category ?? "general") === category;
    const sameVariant = item.variantIndex === variantIndex;
    if (!sameCategory || !sameVariant) return item;
    return { ...item, ...patch, category, variantIndex };
  });

  const hasItem = generated.some(
    (item) => (item.category ?? "general") === category && item.variantIndex === variantIndex,
  );
  if (!hasItem && patch.previewUrl) {
    generated.push({
      assetId: patch.assetId ?? `slot-${key}`,
      previewUrl: patch.previewUrl,
      promptVersion: patch.promptVersion ?? gallery.stylePromptVersion,
      category,
      variantIndex,
      ...patch,
    });
  }

  return { ...gallery, generated, slotIssues: Object.keys(nextIssues).length ? nextIssues : undefined };
}

export function clearGallerySlotIssue(gallery: GalleryValue, slotKey: string): GalleryValue {
  if (!gallery.slotIssues?.[slotKey]) return gallery;
  const nextIssues = { ...gallery.slotIssues };
  delete nextIssues[slotKey];
  return {
    ...gallery,
    slotIssues: Object.keys(nextIssues).length ? nextIssues : undefined,
  };
}

export function setGallerySlotIssue(
  gallery: GalleryValue,
  category: GalleryGenerateCategory,
  variantIndex: number,
  error: string,
): GalleryValue {
  const key = gallerySlotKey(category, variantIndex);
  return {
    ...gallery,
    slotIssues: {
      ...(gallery.slotIssues ?? {}),
      [key]: { error, at: new Date().toISOString(), noCharge: true },
    },
  };
}

export function approveGalleryImage(
  gallery: GalleryValue,
  category: GalleryGenerateCategory,
  variantIndex: number,
): GalleryValue {
  return patchGalleryGeneratedItem(gallery, category, variantIndex, {
    userApproved: true,
    verdict: "up",
  });
}

export function discardGalleryImage(
  gallery: GalleryValue,
  category: GalleryGenerateCategory,
  variantIndex: number,
): GalleryValue {
  return patchGalleryGeneratedItem(gallery, category, variantIndex, {
    userApproved: false,
    verdict: "down",
  });
}

export function setGalleryPrimaryImage(gallery: GalleryValue, assetId: string): GalleryValue {
  return { ...gallery, primaryImageAssetId: assetId };
}

export function galleryImageUrl(item: GalleryGeneratedItem | undefined): string | undefined {
  if (!item) return undefined;
  const preview = item.previewUrl?.trim() ?? "";
  if (preview) return preview;
  const assetId = item.assetId?.trim() ?? "";
  return assetId.startsWith("http") ? assetId : undefined;
}

/** Prioridad: principal bloqueada → aprobada → auto en galería confirmada. */
export function resolveShowcaseGalleryImage(
  gallery: GalleryValue | undefined,
  gallerySlotLocked: boolean,
): string | undefined {
  if (!gallery?.generated?.length) return undefined;

  const usable = gallery.generated.filter((item) => item.verdict !== "down" && galleryImageUrl(item));

  if (gallery.primaryImageAssetId) {
    const primary = usable.find((item) => item.assetId === gallery.primaryImageAssetId);
    if (primary) return galleryImageUrl(primary);
  }

  const approved = usable.filter((item) => item.userApproved);
  if (approved.length) return galleryImageUrl(approved[0]);

  if (gallerySlotLocked && usable.length) return galleryImageUrl(usable[0]);

  return undefined;
}

export function countCategoryApproved(
  items: (GalleryGeneratedItem | undefined)[],
  gallerySlotLocked: boolean,
): number {
  return items.filter((item) => {
    if (!item?.previewUrl || item.verdict === "down") return false;
    return Boolean(item.userApproved || gallerySlotLocked);
  }).length;
}
