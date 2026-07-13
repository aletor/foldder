import sharp from "sharp";
import { getFromS3 } from "@/lib/s3-utils";
import { fetchRemoteImageBuffer } from "./brand-kit-remote-image";
import { galleryItemSourceUrl } from "./brand-kit-gallery-media";
import type { GalleryValue } from "./brand-kit-types";

const FRAME_MAX_EDGE = 384;
const FRAME_JPEG_QUALITY = 68;

export type GalleryBriefVisionFrame = {
  assetId: string;
  label: string;
  jpegBase64: string;
};

function parseS3KeyFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("knowledge-files/")) return trimmed;
  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.pathname.endsWith("/api/spaces/s3-file") || parsed.pathname === "/api/spaces/s3-file") {
      const key = parsed.searchParams.get("key");
      return key ? decodeURIComponent(key) : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function loadImageBuffer(sourceUrl: string): Promise<Buffer | null> {
  const s3Key = parseS3KeyFromUrl(sourceUrl);
  if (s3Key) {
    try {
      return await getFromS3(s3Key);
    } catch {
      return null;
    }
  }
  if (!sourceUrl.startsWith("http")) return null;
  const fetched = await fetchRemoteImageBuffer(sourceUrl);
  return fetched?.buffer ?? null;
}

async function toVisionJpegBase64(buffer: Buffer): Promise<string | null> {
  try {
    const jpeg = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: FRAME_MAX_EDGE,
        height: FRAME_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: FRAME_JPEG_QUALITY })
      .toBuffer();
    return jpeg.length > 0 ? jpeg.toString("base64") : null;
  } catch {
    return null;
  }
}

export async function buildGalleryBriefVisionFrames(
  items: GalleryValue["harvested"],
  labelForIndex: (item: GalleryValue["harvested"][number], index: number) => string,
): Promise<GalleryBriefVisionFrame[]> {
  const frames: GalleryBriefVisionFrame[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const sourceUrl = galleryItemSourceUrl(item);
    if (!sourceUrl) continue;
    const buffer = await loadImageBuffer(sourceUrl);
    if (!buffer) continue;
    const jpegBase64 = await toVisionJpegBase64(buffer);
    if (!jpegBase64) continue;
    frames.push({
      assetId: item.assetId,
      label: labelForIndex(item, index),
      jpegBase64,
    });
  }

  return frames;
}
