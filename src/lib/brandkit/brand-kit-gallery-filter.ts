import type { GalleryValue, Provenance } from "./brand-kit-types";

export type HarvestedGalleryItem = GalleryValue["harvested"][number];

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.split("?")[0]?.toLowerCase() ?? url;
  }
}

function looksLikeLogoAsset(url: string, alt = ""): boolean {
  const haystack = `${url} ${alt}`.toLowerCase();
  return /logo|icon|mark|favicon|sprite|badge|avatar|brand-mark/.test(haystack);
}

function looksBroken(url: string): boolean {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return true;
  if (trimmed.startsWith("/api/spaces/s3-file") || trimmed.startsWith("/")) return false;
  if (!trimmed.startsWith("http")) return true;
  return (
    /data:image\/gif;base64,r0lgod/.test(lower) ||
    /placeholder|spacer|1x1|blank\.(gif|png)/.test(lower)
  );
}

/** Separa fotografía de estilo de assets de marca; deduplica y marca inclusiones. */
export function filterHarvestedGallery(
  items: HarvestedGalleryItem[],
  options?: { logoUrls?: string[]; maxItems?: number },
): HarvestedGalleryItem[] {
  const maxItems = options?.maxItems ?? 24;
  const logoKeys = new Set((options?.logoUrls ?? []).map(normalizeUrl));
  const seen = new Set<string>();
  const scored: { item: HarvestedGalleryItem; score: number }[] = [];

  for (const item of items) {
    const url = item.previewUrl ?? item.assetId;
    if (!url || looksBroken(url)) continue;
    const key = normalizeUrl(url);
    if (seen.has(key) || logoKeys.has(key)) continue;
    const alt = item.provenance?.detail ?? "";
    if (looksLikeLogoAsset(url, alt)) continue;

    seen.add(key);
    let score = 1;
    if (/hero|banner|cover|portfolio|proyecto|project|photo|foto|film|video|production/i.test(`${alt} ${url}`)) {
      score += 1.5;
    }
    if (/og:image|header_img/i.test(item.provenance?.type ?? "")) score += 0.5;

    scored.push({
      item: { ...item, included: false },
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxItems).map((entry) => ({
    ...entry.item,
    included: true,
  }));
}

/** Cuenta imágenes útiles en galería (tras filtro, todas las cosechadas son útiles). */
export function galleryUsefulCount(gallery?: GalleryValue): number {
  return gallery?.harvested?.length ?? 0;
}

export function galleryIncludedCount(gallery?: GalleryValue): number {
  return gallery?.harvested?.filter((item) => item.included !== false).length ?? 0;
}

/** Tras el filtro, todas las imágenes cosechadas son útiles y deben contar para mundo visual. */
export function normalizeGalleryInclusions(gallery: GalleryValue): GalleryValue {
  return {
    ...gallery,
    harvested: gallery.harvested.map((item) => ({
      ...item,
      included: true,
    })),
  };
}

export function buildGalleryContextForLlm(gallery: GalleryValue): string {
  const included = gallery.harvested.filter((item) => item.included).slice(0, 12);
  if (!included.length) return "";
  return included
    .map((item, index) => {
      const alt = item.provenance?.detail ?? "sin alt";
      return `${index + 1}. ${item.previewUrl ?? item.assetId} — ${alt}`;
    })
    .join("\n");
}

export function galleryRefIds(gallery: GalleryValue): string[] {
  return gallery.harvested.filter((item) => item.included).map((item) => item.assetId);
}
