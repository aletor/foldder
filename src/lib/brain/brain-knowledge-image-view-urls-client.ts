import type { KnowledgeDocumentEntry, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/normalize";
import { readResponseJson } from "@/lib/read-response-json";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

function isKnowledgeImageDoc(d: KnowledgeDocumentEntry): boolean {
  const mime = (d.mime ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (d.type === "image") return true;
  if (d.format === "image") return true;
  return false;
}

function hasVisionReadyUrl(d: KnowledgeDocumentEntry): boolean {
  if (typeof d.dataUrl === "string" && d.dataUrl.startsWith("data:image")) return true;
  if (typeof d.originalSourceUrl === "string" && /^https:\/\//i.test(d.originalSourceUrl.trim())) return true;
  return false;
}

const VIEW_URL_TTL_MS = 5 * 60 * 1000;
const signedViewUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedViewUrlInFlight = new Map<string, Promise<string | null>>();

async function fetchSignedViewUrl(key: string): Promise<string | null> {
  const cached = signedViewUrlCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;

  const inFlight = signedViewUrlInFlight.get(key);
  if (inFlight) return inFlight;

  const run = (async () => {
  try {
    const res = await fetch(`/api/spaces/brain/knowledge/view?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const json = (await readResponseJson<{ url?: string }>(res, "GET brain/knowledge/view")) ?? {};
    const url = typeof json.url === "string" ? json.url.trim() : "";
      if (!url.startsWith("http")) return null;
      signedViewUrlCache.set(key, { url, expiresAt: Date.now() + VIEW_URL_TTL_MS });
      return url;
  } catch {
    return null;
  }
  })().finally(() => {
    signedViewUrlInFlight.delete(key);
  });

  signedViewUrlInFlight.set(key, run);
  return run;
}

/**
 * En el navegador: para imágenes del pozo que solo tienen `s3Path`, pide a `/api/spaces/brain/knowledge/view`
 * una URL https firmada y la escribe en `originalSourceUrl` (solo en la copia devuelta; el caller decide si persiste).
 * Así `collectVisualImageAssetRefs` puede exponer `imageUrlForVision` igual que en el servidor con `hydrateProjectAssetsForBrainVision`.
 */
export async function hydrateKnowledgeImageDocumentsWithViewUrlsClient(
  assets: ProjectAssetsMetadata,
): Promise<ProjectAssetsMetadata> {
  const documents = await Promise.all(
    assets.knowledge.documents.map(async (d) => {
      if (!isKnowledgeImageDoc(d)) return d;
      const key = d.s3Path?.trim();
      if (key) {
        const url = await fetchSignedViewUrl(key);
        if (url) return { ...d, originalSourceUrl: url };
      }
      if (hasVisionReadyUrl(d)) return d;
      return d;
    }),
  );

  const visualDnaSlots = await Promise.all(
    normalizeVisualDnaSlots(assets.strategy.visualDnaSlots).map(async (slot) => {
      let next = slot;

      const sourceKey =
        slot.sourceS3Path?.trim() || tryExtractKnowledgeFilesKeyFromUrl(slot.sourceImageUrl ?? "") || undefined;
      if (sourceKey) {
        const sourceUrl = await fetchSignedViewUrl(sourceKey);
        if (sourceUrl) next = { ...next, sourceImageUrl: sourceUrl, sourceS3Path: sourceKey };
      }

      const mosaicKey =
        slot.mosaic?.s3Path?.trim() || tryExtractKnowledgeFilesKeyFromUrl(slot.mosaic?.imageUrl ?? "") || undefined;
      if (mosaicKey) {
        const mosaicUrl = await fetchSignedViewUrl(mosaicKey);
        if (mosaicUrl) {
          next = {
            ...next,
            mosaic: {
              ...next.mosaic,
              imageUrl: mosaicUrl,
              s3Path: mosaicKey,
            },
          };
        }
      }

      return next;
    }),
  );
  const slotByDocId = new Map(visualDnaSlots.map((slot) => [slot.sourceDocumentId, slot] as const));
  const slotById = new Map(visualDnaSlots.map((slot) => [slot.id, slot] as const));
  const visualCapsules = (assets.strategy.visualCapsules ?? []).map((capsule) => {
    const slot =
      (capsule.sourceVisualDnaSlotId ? slotById.get(capsule.sourceVisualDnaSlotId) : undefined) ??
      slotByDocId.get(capsule.sourceImageId);
    if (!slot) return capsule;
    const sourceImageUrl = slot.sourceImageUrl || capsule.sourceImageUrl;
    const mosaicImageUrl = slot.mosaic.imageUrl || capsule.mosaicImageUrl;
    if (sourceImageUrl === capsule.sourceImageUrl && mosaicImageUrl === capsule.mosaicImageUrl) return capsule;
    return {
      ...capsule,
      ...(sourceImageUrl ? { sourceImageUrl } : {}),
      ...(mosaicImageUrl ? { mosaicImageUrl } : {}),
    };
  });

  return {
    ...assets,
    knowledge: { ...assets.knowledge, documents },
    strategy: { ...assets.strategy, visualDnaSlots, ...(visualCapsules.length ? { visualCapsules } : {}) },
  };
}
