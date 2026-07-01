/**
 * Tras importar un `.folddata`, los medios vienen como `blob:` (o `data:`) locales.
 * Esta capa los sube a S3 del proyecto y actualiza las celdas con URLs persistibles.
 */
import type { Dataset, FieldValue } from "./dataset-types";
import { uploadProjectMediaFile } from "../project-media-s3-save";

type UploadedMeta = { url: string; s3Key: string };

function isEphemeralMediaUrl(url: string): boolean {
  const t = url.trim();
  return t.startsWith("blob:") || t.startsWith("data:");
}

function visitMediaUrls(val: FieldValue, visit: (url: string) => void): void {
  if (val.type === "image" || val.type === "video") {
    const url = val.url?.trim();
    if (url && isEphemeralMediaUrl(url)) visit(url);
    if (val.type === "image" && val.generationHistory?.length) {
      for (const entry of val.generationHistory) {
        const historyUrl = entry.url?.trim();
        if (historyUrl && isEphemeralMediaUrl(historyUrl)) visit(historyUrl);
      }
    }
  }
}

export function collectEphemeralMediaUrlsFromDataset(dataset: Dataset): string[] {
  const set = new Set<string>();
  for (const list of dataset.lists) {
    for (const card of list.cards) {
      for (const val of Object.values(card.values)) visitMediaUrls(val, (u) => set.add(u));
    }
  }
  for (const val of Object.values(dataset.constants.values)) {
    visitMediaUrls(val, (u) => set.add(u));
  }
  return [...set];
}

function patchFieldValueMedia(val: FieldValue, map: Map<string, UploadedMeta>): FieldValue {
  if (val.type !== "image" && val.type !== "video") return val;
  let next: FieldValue = val;
  const url = val.url?.trim();
  if (url) {
    const uploaded = map.get(url) ?? map.get(val.url);
    if (uploaded) {
      next =
        val.type === "image"
          ? { ...val, url: uploaded.url, s3Key: uploaded.s3Key }
          : { ...val, url: uploaded.url };
    }
  }
  if (next.type === "image" && next.generationHistory?.length) {
    let historyChanged = false;
    const generationHistory = next.generationHistory.map((entry) => {
      const historyUrl = entry.url?.trim();
      if (!historyUrl) return entry;
      const uploaded = map.get(historyUrl) ?? map.get(entry.url);
      if (!uploaded) return entry;
      historyChanged = true;
      return { ...entry, url: uploaded.url, s3Key: uploaded.s3Key };
    });
    if (historyChanged) next = { ...next, generationHistory };
  }
  return next;
}

export function applyDatasetMediaUploadMap(dataset: Dataset, map: Map<string, UploadedMeta>): Dataset {
  const clone = JSON.parse(JSON.stringify(dataset)) as Dataset;
  for (const list of clone.lists) {
    for (const card of list.cards) {
      for (const [fieldId, val] of Object.entries(card.values)) {
        card.values[fieldId] = patchFieldValueMedia(val, map);
      }
    }
  }
  for (const [fieldId, val] of Object.entries(clone.constants.values)) {
    clone.constants.values[fieldId] = patchFieldValueMedia(val, map);
  }
  return clone;
}

function extensionForBlob(blob: Blob): string {
  const type = blob.type || "";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  return "bin";
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

export async function uploadImportedDatasetMediaToS3(
  dataset: Dataset,
  options: { projectId: string | null },
): Promise<Dataset> {
  const ephemeralUrls = collectEphemeralMediaUrlsFromDataset(dataset);
  if (ephemeralUrls.length === 0) {
    return JSON.parse(JSON.stringify(dataset)) as Dataset;
  }
  if (!options.projectId) {
    throw new Error(
      "No hay proyecto activo: las imágenes del .folddata no se pueden guardar en la nube.",
    );
  }

  const map = new Map<string, UploadedMeta>();
  for (const mediaUrl of ephemeralUrls) {
    let blob: Blob;
    try {
      const res = await fetch(mediaUrl);
      blob = await res.blob();
    } catch (e) {
      throw new Error(
        `No se pudo leer un medio importado (${mediaUrl.slice(0, 48)}…): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    const ext = extensionForBlob(blob);
    const file = new File([blob], `folddata-import.${ext}`, {
      type: blob.type || "application/octet-stream",
    });
    const uploaded = await uploadProjectMediaFile(file, {
      projectId: options.projectId,
      policy: { preserveImageQuality: true },
    });
    const meta: UploadedMeta = { url: uploaded.url, s3Key: uploaded.s3Key };
    map.set(mediaUrl, meta);
    const trimmed = mediaUrl.trim();
    if (trimmed !== mediaUrl) map.set(trimmed, meta);
  }

  const next = applyDatasetMediaUploadMap(dataset, map);
  revokeBlobUrls(ephemeralUrls);
  return next;
}
