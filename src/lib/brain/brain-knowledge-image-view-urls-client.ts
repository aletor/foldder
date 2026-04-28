import type { KnowledgeDocumentEntry, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/normalize";
import { readResponseJson } from "@/lib/read-response-json";

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

function hasHttpsUrl(url: unknown): boolean {
  return typeof url === "string" && /^https:\/\//i.test(url.trim());
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
      if (hasVisionReadyUrl(d)) return d;
      const key = d.s3Path?.trim();
      if (!key) return d;
      const url = await fetchSignedViewUrl(key);
      if (!url) return d;
      return { ...d, originalSourceUrl: url };
    }),
  );

  const visualDnaSlots = await Promise.all(
    normalizeVisualDnaSlots(assets.strategy.visualDnaSlots).map(async (slot) => {
      let next = slot;

      const sourceKey = slot.sourceS3Path?.trim();
      if (sourceKey && !hasHttpsUrl(slot.sourceImageUrl)) {
        const sourceUrl = await fetchSignedViewUrl(sourceKey);
        if (sourceUrl) next = { ...next, sourceImageUrl: sourceUrl };
      }

      const mosaicKey = slot.mosaic?.s3Path?.trim();
      if (mosaicKey && !hasHttpsUrl(slot.mosaic?.imageUrl)) {
        const mosaicUrl = await fetchSignedViewUrl(mosaicKey);
        if (mosaicUrl) {
          next = {
            ...next,
            mosaic: {
              ...next.mosaic,
              imageUrl: mosaicUrl,
            },
          };
        }
      }

      return next;
    }),
  );

  return {
    ...assets,
    knowledge: { ...assets.knowledge, documents },
    strategy: { ...assets.strategy, visualDnaSlots },
  };
}
