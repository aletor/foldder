import type { GalleryValue } from "./genoma-types";
import { needsGenomaMediaProxy } from "./genoma-media-url";

export function galleryItemSourceUrl(item: GalleryValue["harvested"][number]): string {
  const preview = item.previewUrl?.trim() ?? "";
  if (preview) return preview;
  const assetId = item.assetId?.trim() ?? "";
  return assetId.startsWith("http") ? assetId : "";
}

export function isPersistedGenomaMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.includes("/api/spaces/s3-file") || trimmed.startsWith("/api/spaces/s3-file");
}

/** URLs externas de cosecha que aún no están en S3. */
export function externalGalleryMediaUrls(gallery: GalleryValue | undefined, limit = 24): string[] {
  if (!gallery?.harvested?.length) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of gallery.harvested) {
    const source = galleryItemSourceUrl(item);
    if (!source || !needsGenomaMediaProxy(source) || isPersistedGenomaMediaUrl(source)) continue;
    if (seen.has(source)) continue;
    seen.add(source);
    urls.push(source);
    if (urls.length >= limit) break;
  }
  return urls;
}

export function applyGalleryMediaMirrors(
  gallery: GalleryValue,
  mirrored: ReadonlyMap<string, string> | Record<string, string>,
): GalleryValue {
  if (!mirrored || (mirrored instanceof Map ? !mirrored.size : !Object.keys(mirrored).length)) {
    return gallery;
  }
  const lookup = (url: string): string | undefined =>
    mirrored instanceof Map ? mirrored.get(url) : mirrored[url];

  let changed = false;
  const harvested = gallery.harvested.map((item) => {
    const source = galleryItemSourceUrl(item);
    const mirroredUrl = source ? lookup(source) : undefined;
    if (!mirroredUrl || mirroredUrl === item.previewUrl) return item;
    changed = true;
    return { ...item, previewUrl: mirroredUrl };
  });

  return changed ? { ...gallery, harvested } : gallery;
}
