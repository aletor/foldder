import type { KnowledgeDocumentEntry, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
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
      try {
        const res = await fetch(`/api/spaces/brain/knowledge/view?key=${encodeURIComponent(key)}`);
        if (!res.ok) return d;
        const json = (await readResponseJson<{ url?: string }>(res, "GET brain/knowledge/view")) ?? {};
        const url = typeof json.url === "string" ? json.url.trim() : "";
        if (!url.startsWith("http")) return d;
        return { ...d, originalSourceUrl: url };
      } catch {
        return d;
      }
    }),
  );
  return { ...assets, knowledge: { ...assets.knowledge, documents } };
}
