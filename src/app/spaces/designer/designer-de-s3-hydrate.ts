/**
 * Tras importar un `.de`, las imágenes vienen como `blob:` locales.
 * Esta capa las sube a S3 (variante OPT) y actualiza `src` + metadatos como un marco nuevo.
 */
import type { DesignerPageState } from "./DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { newDesignerAssetId, optimizeImageBlobToOptFormat } from "./designer-image-pipeline";
import { readResponseJson } from "@/lib/read-response-json";

type UploadedMeta = {
  url: string;
  s3Key: string;
  assetId: string;
};

function isBlobUrl(s: string): boolean {
  return s.trim().startsWith("blob:");
}

function collectBlobUrlsFromObject(o: FreehandObject, out: Set<string>): void {
  if (o.type === "image") {
    const src = (o as { src?: string }).src?.trim();
    if (src && isBlobUrl(src)) out.add(src);
  }
  if (o.type === "rect" && o.isImageFrame && o.imageFrameContent?.src) {
    const s = o.imageFrameContent.src.trim();
    if (isBlobUrl(s)) out.add(s);
  }
  if (o.type === "booleanGroup") {
    const cr = o.cachedResult?.trim();
    if (cr && isBlobUrl(cr)) out.add(cr);
    for (const c of o.children) collectBlobUrlsFromObject(c, out);
  }
  if (o.type === "clippingContainer") {
    collectBlobUrlsFromObject(o.mask as FreehandObject, out);
    for (const c of o.content) collectBlobUrlsFromObject(c, out);
  }
}

export function collectBlobImageUrlsFromPages(pages: DesignerPageState[]): string[] {
  const set = new Set<string>();
  for (const p of pages) {
    for (const o of p.objects ?? []) collectBlobUrlsFromObject(o, set);
    for (const fr of p.imageFrames ?? []) {
      const s = fr.imageContent?.src?.trim();
      if (s && isBlobUrl(s)) set.add(s);
    }
  }
  return [...set];
}

async function uploadOptToS3(
  blob: Blob,
  designerSpaceId: string | null,
): Promise<{ json: { url: string; s3Key: string }; assetId: string }> {
  const assetId = newDesignerAssetId();
  const optimized = await optimizeImageBlobToOptFormat(blob, blob.type || "image/jpeg");
  const formData = new FormData();
  formData.append(
    "file",
    new File([optimized.blob], `optimized.${optimized.ext}`, {
      type: optimized.blob.type || "application/octet-stream",
    }),
  );
  formData.append("assetId", assetId);
  formData.append("variant", "OPT");
  if (designerSpaceId) formData.append("spaceId", designerSpaceId);
  formData.append("ext", optimized.ext);

  const uploadRes = await fetch("/api/spaces/designer-asset-upload", { method: "POST", body: formData });
  const json = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
    uploadRes,
    "POST /api/spaces/designer-asset-upload",
  );
  if (!uploadRes.ok || !json?.url || !json?.s3Key) {
    const detail = json?.error || (!uploadRes.ok ? `HTTP ${uploadRes.status}` : null) || "Sin URL del servidor";
    throw new Error(detail);
  }
  return { json: { url: json.url, s3Key: json.s3Key }, assetId };
}

function revokeBlobUrls(urls: Iterable<string>): void {
  for (const u of urls) {
    try {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }
}

function patchObjectBlobs(o: FreehandObject, map: Map<string, UploadedMeta>): FreehandObject {
  if (o.type === "image") {
    const im = o as { src: string };
    const src = im.src?.trim();
    const m = src ? map.get(src) ?? map.get(im.src) : undefined;
    if (m) return { ...o, src: m.url } as FreehandObject;
    return o;
  }
  if (o.type === "rect" && o.isImageFrame && o.imageFrameContent) {
    const c = o.imageFrameContent;
    const src = c.src?.trim();
    const m = src ? map.get(src) ?? map.get(c.src) : undefined;
    if (m) {
      return {
        ...o,
        imageFrameContent: {
          ...c,
          src: m.url,
          s3Key: m.s3Key,
          s3KeyOpt: m.s3Key,
          designerAssetId: m.assetId,
          s3KeyHr: undefined,
          designerHrSourceMissing: false,
        },
      } as FreehandObject;
    }
    return o;
  }
  if (o.type === "booleanGroup") {
    let cachedResult = o.cachedResult;
    if (cachedResult?.trim()) {
      const m = map.get(cachedResult.trim()) ?? map.get(cachedResult);
      if (m) cachedResult = m.url;
    }
    return {
      ...o,
      cachedResult,
      children: o.children.map((c) => patchObjectBlobs(c, map)),
    } as FreehandObject;
  }
  if (o.type === "clippingContainer") {
    return {
      ...o,
      mask: patchObjectBlobs(o.mask as FreehandObject, map),
      content: o.content.map((c) => patchObjectBlobs(c, map)),
    } as FreehandObject;
  }
  return o;
}

function patchPagesWithUploadedBlobs(
  pages: DesignerPageState[],
  map: Map<string, UploadedMeta>,
): DesignerPageState[] {
  return pages.map((p) => ({
    ...p,
    objects: (p.objects ?? []).map((o) => patchObjectBlobs(o, map)),
    imageFrames: (p.imageFrames ?? []).map((fr) => {
      const src = fr.imageContent?.src?.trim();
      if (!src || !fr.imageContent) return fr;
      const m = map.get(src) ?? map.get(fr.imageContent.src);
      if (!m) return fr;
      return {
        ...fr,
        imageContent: {
          ...fr.imageContent,
          src: m.url,
        },
      };
    }),
  }));
}

/**
 * Sube cada `blob:` único a S3 y devuelve páginas con URLs persistibles + metadatos OPT.
 * Si no hay `blob:`, devuelve una copia superficial de `pages`.
 */
export async function uploadImportedDesignerBlobUrlsToS3(
  pages: DesignerPageState[],
  options: { designerSpaceId: string | null },
): Promise<DesignerPageState[]> {
  const blobUrls = collectBlobImageUrlsFromPages(pages);
  if (blobUrls.length === 0) {
    return JSON.parse(JSON.stringify(pages)) as DesignerPageState[];
  }

  const map = new Map<string, UploadedMeta>();
  for (const blobUrl of blobUrls) {
    let blob: Blob;
    try {
      const res = await fetch(blobUrl);
      blob = await res.blob();
    } catch (e) {
      throw new Error(
        `No se pudo leer una imagen local (${blobUrl.slice(0, 48)}…): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const { json, assetId } = await uploadOptToS3(blob, options.designerSpaceId);
    const meta: UploadedMeta = { url: json.url, s3Key: json.s3Key, assetId };
    map.set(blobUrl, meta);
    const t = blobUrl.trim();
    if (t !== blobUrl) map.set(t, meta);
  }

  const next = patchPagesWithUploadedBlobs(JSON.parse(JSON.stringify(pages)) as DesignerPageState[], map);
  revokeBlobUrls(blobUrls);
  return next;
}
