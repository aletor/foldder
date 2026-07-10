import { createHash } from "node:crypto";
import { uploadGenomaIngestFile } from "../ingest/upload-genoma-file";
import { fetchRemoteImageBuffer } from "../genoma-remote-image";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 200;
const MIRROR_CONCURRENCY = 4;

function isAlreadyMirrored(url: string): boolean {
  return url.includes("/api/spaces/s3-file");
}

function extFromMime(mime: string): string {
  if (mime.includes("svg")) return "svg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  return "img";
}

function filenameForUrl(url: string, mime: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 14);
  return `crawl-${hash}.${extFromMime(mime)}`;
}

export async function mirrorRemoteImageUrl(
  userEmail: string,
  sourceUrl: string,
): Promise<string | null> {
  if (!userEmail.trim() || !sourceUrl.startsWith("http") || isAlreadyMirrored(sourceUrl)) {
    return sourceUrl.startsWith("http") ? sourceUrl : null;
  }

  const fetched = await fetchRemoteImageBuffer(sourceUrl);
  if (!fetched) return null;

  const { buffer, contentType } = fetched;
  if (buffer.length < MIN_IMAGE_BYTES || buffer.length > MAX_IMAGE_BYTES) return null;

  try {
    const uploaded = await uploadGenomaIngestFile({
      userEmail,
      filename: filenameForUrl(sourceUrl, contentType),
      mime: contentType,
      buffer,
    });
    return uploaded.url;
  } catch {
    return null;
  }
}

/** Descarga imágenes externas del crawl y las persiste en S3 para previsualización fiable en el board. */
export async function mirrorExternalImagesForCrawl(
  userEmail: string | undefined,
  urls: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const email = userEmail?.trim() ?? "";
  if (!email) return result;

  const unique = [...new Set(urls.filter((url) => url.startsWith("http") && !isAlreadyMirrored(url)))];
  if (!unique.length) return result;

  let index = 0;
  async function worker(): Promise<void> {
    while (index < unique.length) {
      const current = unique[index];
      index += 1;
      const mirrored = await mirrorRemoteImageUrl(email, current);
      if (mirrored && mirrored !== current) result.set(current, mirrored);
    }
  }

  const workers = Array.from({ length: Math.min(MIRROR_CONCURRENCY, unique.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

export function applyMirroredPreviewUrl(url: string, mirrored: Map<string, string>): string {
  return mirrored.get(url) ?? url;
}
