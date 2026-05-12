import sharp from "sharp";

export const FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE = 2000;
export const FOLDDER_IMAGE_UPLOAD_JPEG_QUALITY = 70;
export const FOLDDER_IMAGE_UPLOAD_WEBP_QUALITY = 82;

export type NormalizedImageUpload = {
  buffer: Buffer;
  contentType: string;
  ext: string;
  optimized: boolean;
  originalBytes: number;
};

function extForContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  return "bin";
}

function passthrough(buffer: Buffer, contentType: string): NormalizedImageUpload {
  return {
    buffer,
    contentType,
    ext: extForContentType(contentType),
    optimized: false,
    originalBytes: buffer.length,
  };
}

export async function normalizeUploadedImageForFoldder(
  buffer: Buffer,
  contentTypeRaw: string,
): Promise<NormalizedImageUpload> {
  const contentType = (contentTypeRaw || "application/octet-stream").toLowerCase();
  if (!contentType.startsWith("image/")) return passthrough(buffer, contentType);

  // SVG y GIF pueden ser vector/animados; no los rasterizamos aquí para no perder información.
  if (contentType.includes("svg") || contentType.includes("gif")) {
    return passthrough(buffer, contentType);
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: "none" }).metadata();
  } catch {
    return passthrough(buffer, contentType);
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) return passthrough(buffer, contentType);

  const withinSize = Math.max(width, height) <= FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE;
  const hasAlpha = Boolean(metadata.hasAlpha) || metadata.channels === 2 || metadata.channels === 4;
  const alreadyGoodOpaque = withinSize && (contentType.includes("jpeg") || contentType.includes("jpg"));
  const alreadyGoodAlpha = withinSize && contentType.includes("webp");
  if ((hasAlpha && alreadyGoodAlpha) || (!hasAlpha && alreadyGoodOpaque)) {
    return passthrough(buffer, contentType);
  }

  let image = sharp(buffer, { failOn: "none" }).rotate();
  if (!withinSize) {
    image = image.resize({
      width: FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE,
      height: FOLDDER_IMAGE_UPLOAD_MAX_LONG_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const nextBuffer = hasAlpha
    ? await image.webp({ quality: FOLDDER_IMAGE_UPLOAD_WEBP_QUALITY }).toBuffer()
    : await image.jpeg({ quality: FOLDDER_IMAGE_UPLOAD_JPEG_QUALITY, mozjpeg: true }).toBuffer();

  if (nextBuffer.length >= buffer.length && withinSize) {
    return passthrough(buffer, contentType);
  }

  return {
    buffer: nextBuffer,
    contentType: hasAlpha ? "image/webp" : "image/jpeg",
    ext: hasAlpha ? "webp" : "jpg",
    optimized: true,
    originalBytes: buffer.length,
  };
}
