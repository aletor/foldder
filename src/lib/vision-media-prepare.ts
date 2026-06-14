import sharp from "sharp";
import {
  assertUserCanAccessMediaReference,
  ForbiddenMediaReferenceError,
  inferMimeTypeFromPath,
} from "@/lib/api-media-access";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";
import { getFromS3, getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";

export class VisionMediaPrepareError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
    this.name = "VisionMediaPrepareError";
  }
}

function parseImageDataUrl(value: string): { buffer: Buffer; mime: string } {
  const marker = ";base64,";
  const idx = value.indexOf(marker);
  if (!value.startsWith("data:") || idx === -1) {
    throw new VisionMediaPrepareError("Invalid image data URL", "invalid_data_url");
  }
  const mime = value.slice(5, idx).split(";")[0] || "image/png";
  return {
    buffer: Buffer.from(value.slice(idx + marker.length), "base64"),
    mime,
  };
}

/** Carga bytes de imagen desde data URL, clave S3 o URL http(s). */
export async function loadImageBufferFromMediaReference(
  value: string,
  baseUrl: string,
  userEmail: string,
): Promise<{ buffer: Buffer; mime: string }> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new VisionMediaPrepareError("No media URL provided", "missing_url");
  }

  const s3Key =
    resolveKnowledgeFilesS3Key(trimmed) ??
    (await assertUserCanAccessMediaReference(userEmail, trimmed, "image"));
  if (s3Key) {
    const buffer = await getFromS3(s3Key);
    return { buffer, mime: inferMimeTypeFromPath(s3Key, "image/png") };
  }

  if (trimmed.startsWith("data:")) {
    return parseImageDataUrl(trimmed);
  }

  if (trimmed.startsWith("blob:")) {
    throw new VisionMediaPrepareError(
      "Local preview images cannot be analyzed. Close PhotoRoom to export the image first.",
      "blob_url",
    );
  }

  let fetchUrl = trimmed;
  try {
    fetchUrl = new URL(trimmed, baseUrl).toString();
  } catch {
    /* keep trimmed */
  }

  if (fetchUrl.includes("/api/spaces/s3-file") || fetchUrl.includes("/api/spaces/s3-download")) {
    throw new VisionMediaPrepareError(
      "Could not resolve image storage key. Re-export from PhotoRoom and try again.",
      "unresolved_s3_route",
    );
  }

  const res = await fetch(fetchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) {
    throw new VisionMediaPrepareError(
      `Could not download image (HTTP ${res.status})`,
      "image_fetch_failed",
    );
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
  if (contentType && !contentType.startsWith("image/")) {
    throw new VisionMediaPrepareError("Media URL did not return an image", "not_an_image");
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    throw new VisionMediaPrepareError("Downloaded image is empty", "empty_image");
  }
  return { buffer, mime: contentType || inferMimeTypeFromPath(fetchUrl, "image/png") };
}

/** Normaliza la imagen (fondo blanco, tamaño razonable) y devuelve URL https prefirmada para visión. */
export async function prepareOpenAiVisionImageUrl(
  rawUrl: string,
  baseUrl: string,
  userEmail: string,
): Promise<string> {
  const { buffer } = await loadImageBufferFromMediaReference(rawUrl, baseUrl, userEmail);

  const png = await sharp(buffer, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height || meta.width < 4 || meta.height < 4) {
    throw new VisionMediaPrepareError(
      "Image is too small or invalid to describe",
      "image_too_small",
    );
  }

  const key = buildUserAssetObjectKey({
    userEmail,
    folder: "describe/temp",
    filename: `vision-${Date.now()}.png`,
  });
  await uploadBufferToS3Key(key, png, "image/png");
  return getPresignedUrl(key);
}

export function isVisionRefusalText(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  const patterns = [
    /can'?t help with that image/,
    /cannot help with (that|this) image/,
    /unable to (analyze|view|see|process|assist)/,
    /i'?m sorry.*(can'?t|cannot|unable)/,
    /no puedo ayudar/,
    /no puedo analizar/,
    /no puedo ver (la|esta|esa) imagen/,
    /lo siento.*no puedo/,
  ];
  return patterns.some((p) => p.test(t));
}

export { ForbiddenMediaReferenceError };
