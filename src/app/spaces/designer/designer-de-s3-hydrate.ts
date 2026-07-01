/**
 * Tras importar un `.de`, las imágenes vienen como `blob:` locales.
 * Esta capa las sube a S3 (variante OPT) y actualiza `src` + metadatos como un marco nuevo.
 */
import type { DesignerPageState } from "./DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { newDesignerAssetId, optimizeImageBlobToOptFormat } from "./designer-image-pipeline";
import { readResponseJson } from "@/lib/read-response-json";
import {
  stableKnowledgeFileUrlFromKey,
  tryExtractKnowledgeFilesKeyFromUrl,
} from "@/lib/s3-media-hydrate";

type UploadedMeta = {
  url: string;
  s3Key: string;
  assetId: string;
};

function isBlobUrl(s: string): boolean {
  return s.trim().startsWith("blob:");
}

function persistableS3Meta(src: string): UploadedMeta | null {
  const key = tryExtractKnowledgeFilesKeyFromUrl(src);
  if (!key) return null;
  const url = stableKnowledgeFileUrlFromKey(key);
  if (!url) return null;
  return { url, s3Key: key, assetId: newDesignerAssetId() };
}

function patchPersistableS3Src(
  src: string | undefined,
  patchFrameMeta: (meta: UploadedMeta) => Record<string, unknown> | null,
): { src?: string; extra?: Record<string, unknown> } {
  const raw = src?.trim();
  if (!raw || isBlobUrl(raw)) return { src };
  const meta = persistableS3Meta(raw);
  if (!meta) return { src };
  return { src: meta.url, extra: patchFrameMeta(meta) ?? undefined };
}

function patchObjectPersistableS3(o: FreehandObject): FreehandObject {
  if (o.type === "image") {
    const im = o as { src?: string };
    const patched = patchPersistableS3Src(im.src, () => null);
    if (patched.src && patched.src !== im.src) {
      return { ...o, src: patched.src } as FreehandObject;
    }
    return o;
  }
  if (o.type === "rect" && o.isImageFrame && o.imageFrameContent) {
    const c = o.imageFrameContent;
    const patched = patchPersistableS3Src(c.src, (meta) => ({
      ...c,
      src: meta.url,
      s3Key: meta.s3Key,
      s3KeyOpt: meta.s3Key,
      designerAssetId: meta.assetId,
      s3KeyHr: undefined,
      designerHrSourceMissing: false,
    }));
    if (patched.extra) {
      return { ...o, imageFrameContent: patched.extra as typeof c } as FreehandObject;
    }
    return o;
  }
  if (o.type === "booleanGroup") {
    let cachedResult = o.cachedResult;
    if (cachedResult?.trim() && !isBlobUrl(cachedResult)) {
      const meta = persistableS3Meta(cachedResult);
      if (meta) cachedResult = meta.url;
    }
    return {
      ...o,
      cachedResult,
      children: o.children.map((child) => patchObjectPersistableS3(child)),
    } as FreehandObject;
  }
  if (o.type === "clippingContainer") {
    return {
      ...o,
      mask: patchObjectPersistableS3(o.mask as FreehandObject),
      content: o.content.map((child) => patchObjectPersistableS3(child)),
    } as FreehandObject;
  }
  if (o.type === "groupContainer") {
    return {
      ...o,
      children: o.children.map((child) => patchObjectPersistableS3(child)),
    } as FreehandObject;
  }
  const lm = (o as { layerMask?: { src?: string } }).layerMask;
  if (lm?.src?.trim() && !isBlobUrl(lm.src)) {
    const meta = persistableS3Meta(lm.src);
    if (meta) {
      return { ...o, layerMask: { ...lm, src: meta.url } } as FreehandObject;
    }
  }
  return o;
}

/** Restaura metadatos S3 en URLs estables ya persistidas (sin re-subir). */
export function restorePersistableS3RefsInPages(pages: DesignerPageState[]): DesignerPageState[] {
  return pages.map((page) => ({
    ...page,
    objects: (page.objects ?? []).map((obj) => patchObjectPersistableS3(obj)),
    imageFrames: (page.imageFrames ?? []).map((frame) => {
      const src = frame.imageContent?.src;
      const patched = patchPersistableS3Src(src, (meta) => ({
        ...(frame.imageContent ?? { src: meta.url }),
        src: meta.url,
      }));
      if (!patched.src || patched.src === src || !frame.imageContent) return frame;
      return {
        ...frame,
        imageContent: {
          ...frame.imageContent,
          src: patched.src,
        },
      };
    }),
  }));
}

function collectBlobUrlsFromObject(o: FreehandObject, out: Set<string>): void {
  const lm = (o as { layerMask?: { src?: string } }).layerMask;
  const maskSrc = lm?.src?.trim();
  if (maskSrc && isBlobUrl(maskSrc)) out.add(maskSrc);

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
  if (o.type === "groupContainer") {
    for (const c of o.children) collectBlobUrlsFromObject(c, out);
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

function patchLayerMaskBlob(o: FreehandObject, map: Map<string, UploadedMeta>): FreehandObject {
  const lm = (o as { layerMask?: { src?: string } & Record<string, unknown> }).layerMask;
  if (!lm?.src) return o;
  const src = lm.src.trim();
  const m = map.get(src) ?? map.get(lm.src);
  if (!m) return o;
  return { ...o, layerMask: { ...lm, src: m.url } } as FreehandObject;
}

function patchObjectBlobs(o: FreehandObject, map: Map<string, UploadedMeta>): FreehandObject {
  if (o.type === "image") {
    const im = o as { src: string };
    const src = im.src?.trim();
    const m = src ? map.get(src) ?? map.get(im.src) : undefined;
    if (m) return patchLayerMaskBlob({ ...o, src: m.url } as FreehandObject, map);
    return patchLayerMaskBlob(o, map);
  }
  if (o.type === "rect" && o.isImageFrame && o.imageFrameContent) {
    const c = o.imageFrameContent;
    const src = c.src?.trim();
    const m = src ? map.get(src) ?? map.get(c.src) : undefined;
    if (m) {
      return patchLayerMaskBlob(
        {
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
        } as FreehandObject,
        map,
      );
    }
    return patchLayerMaskBlob(o, map);
  }
  if (o.type === "booleanGroup") {
    let cachedResult = o.cachedResult;
    if (cachedResult?.trim()) {
      const m = map.get(cachedResult.trim()) ?? map.get(cachedResult);
      if (m) cachedResult = m.url;
    }
    return patchLayerMaskBlob(
      {
        ...o,
        cachedResult,
        children: o.children.map((c) => patchObjectBlobs(c, map)),
      } as FreehandObject,
      map,
    );
  }
  if (o.type === "clippingContainer") {
    return patchLayerMaskBlob(
      {
        ...o,
        mask: patchObjectBlobs(o.mask as FreehandObject, map),
        content: o.content.map((c) => patchObjectBlobs(c, map)),
      } as FreehandObject,
      map,
    );
  }
  if (o.type === "groupContainer") {
    return patchLayerMaskBlob(
      {
        ...o,
        children: o.children.map((c) => patchObjectBlobs(c, map)),
      } as FreehandObject,
      map,
    );
  }
  return patchLayerMaskBlob(o, map);
}

export function applyDesignerBlobUploadMap(
  pages: DesignerPageState[],
  map: Map<string, UploadedMeta>,
): DesignerPageState[] {
  return patchPagesWithUploadedBlobs(pages, map);
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

  const next = applyDesignerBlobUploadMap(JSON.parse(JSON.stringify(pages)) as DesignerPageState[], map);
  revokeBlobUrls(blobUrls);
  return next;
}

/**
 * Tras importar `.de`: conserva refs S3 ya persistibles y sube solo los `blob:` embebidos.
 */
export async function hydrateImportedDesignerPagesMedia(
  pages: DesignerPageState[],
  options: { designerSpaceId: string | null },
): Promise<DesignerPageState[]> {
  const restored = restorePersistableS3RefsInPages(pages);
  return uploadImportedDesignerBlobUrlsToS3(restored, options);
}
