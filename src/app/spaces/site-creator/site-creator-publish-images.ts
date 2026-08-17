import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE,
  normalizeUploadedImageForFoldder,
} from "@/lib/foldder-server-image-optimization";
import { getFromS3 } from "@/lib/s3-utils";
import {
  contentTypeForPublishedPath,
  decodeDataUrl,
  extensionForContentType,
  type PublishedSiteFile,
} from "@/lib/site-creator-publish-store";
import type { PublishImageRef } from "./site-creator-publish-placeholders";

export function shouldSkipSiteCreatorPublishOptimize(ref: PublishImageRef): boolean {
  const key = (ref.s3Key || "").trim();
  if (/_OPT\./i.test(key)) return true;
  return ref.alreadyOptimized === true && key.length > 0;
}

export async function optimizeSiteCreatorPublishImage(args: {
  body: Buffer;
  contentType: string;
  skipOptimize: boolean;
  layerId: string;
}): Promise<{ body: Buffer; contentType: string }> {
  if (args.skipOptimize) {
    return { body: args.body, contentType: args.contentType };
  }
  try {
    const normalized = await normalizeUploadedImageForFoldder(args.body, args.contentType);
    await assertPublishedRasterWithinLimit(normalized.buffer, normalized.contentType);
    return { body: normalized.buffer, contentType: normalized.contentType };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "error desconocido";
    throw new Error(`No se pudo optimizar la imagen de la capa ${args.layerId}: ${detail}`);
  }
}

export async function materializeSiteCreatorPublishImages(
  refs: PublishImageRef[],
): Promise<{ files: PublishedSiteFile[]; hrefByLayerId: Record<string, string> }> {
  const hrefByLayerId: Record<string, string> = {};
  const files: PublishedSiteFile[] = [];
  const seenHash = new Map<string, string>();

  for (const ref of refs) {
    const resolved = await resolvePublishImageBytes(ref);
    if (!resolved) {
      throw new Error(`No se pudo copiar la imagen de la capa ${ref.layerId}`);
    }
    const optimized = await optimizeSiteCreatorPublishImage({
      body: resolved.body,
      contentType: resolved.contentType,
      skipOptimize: shouldSkipSiteCreatorPublishOptimize(ref),
      layerId: ref.layerId,
    });
    const hash = createHash("sha256").update(optimized.body).digest("hex").slice(0, 16);
    const existing = seenHash.get(hash);
    if (existing) {
      hrefByLayerId[ref.layerId] = existing;
      continue;
    }
    const ext = extensionForContentType(optimized.contentType, ref.s3Key || ref.src || "");
    const relativePath = `assets/img-${hash}${ext}`;
    seenHash.set(hash, relativePath);
    hrefByLayerId[ref.layerId] = relativePath;
    files.push({
      relativePath,
      body: optimized.body,
      contentType: contentTypeForPublishedPath(relativePath),
    });
  }

  return { files, hrefByLayerId };
}

async function assertPublishedRasterWithinLimit(buffer: Buffer, contentType: string): Promise<void> {
  const mime = (contentType || "").toLowerCase();
  if (!mime.startsWith("image/")) return;
  if (mime.includes("svg") || mime.includes("gif")) return;
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: "none" }).metadata();
  } catch {
    throw new Error("imagen ilegible");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error("imagen ilegible");
  }
  if (Math.max(width, height) > FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE) {
    throw new Error(`el lado largo supera ${FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE}px`);
  }
}

async function resolvePublishImageBytes(
  ref: PublishImageRef,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (ref.s3Key) {
    const body = await getFromS3(ref.s3Key);
    return { body, contentType: contentTypeForPublishedPath(ref.s3Key) };
  }
  if (ref.src?.startsWith("data:")) return decodeDataUrl(ref.src);
  if (ref.src?.startsWith("http://") || ref.src?.startsWith("https://")) {
    const response = await fetch(ref.src);
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") || "application/octet-stream";
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) return null;
    return { body, contentType: mime };
  }
  return null;
}
