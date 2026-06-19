import {
  assertUserCanAccessMediaReference,
  ForbiddenMediaReferenceError,
  inferMimeTypeFromPath,
} from "@/lib/api-media-access";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import { getFromS3 } from "@/lib/s3-utils";

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
      "Local preview images cannot be analyzed. Re-upload the image or use a saved project export.",
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

function bufferToDataUrl(buffer: Buffer, mime: string): string {
  const contentType = mime.startsWith("image/") ? mime : "image/jpeg";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

/** Normaliza la imagen (fondo blanco, tamaño razonable) y devuelve data URL inline para visión. */
export async function prepareOpenAiVisionImageUrl(
  rawUrl: string,
  baseUrl: string,
  userEmail: string,
): Promise<string> {
  const { buffer, mime } = await loadImageBufferFromMediaReference(rawUrl, baseUrl, userEmail);

  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
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

    return bufferToDataUrl(png, "image/png");
  } catch (error) {
    if (error instanceof VisionMediaPrepareError) throw error;
    console.warn(
      "[vision-media-prepare] sharp unavailable; sending source image inline for OpenAI vision",
      error instanceof Error ? error.message : error,
    );
    if (buffer.length < 64) {
      throw new VisionMediaPrepareError(
        "Image is too small or invalid to describe",
        "image_too_small",
      );
    }
    return bufferToDataUrl(buffer, mime);
  }
}

export function isStructuredDescriberOutput(text: string): boolean {
  return /SUBJECT & POSE:|VISUAL HIERARCHY:|Visual protagonist:|WARDROBE & TEXT:|Lens & camera:|Camera angle label:|COMPOSITION & FRAMING:|FINAL OUTPUT FRAMING:|MUST-PRESERVE FOR REGENERATION:|Pose verified:|Highlight tone:|Perspective imperfection:/i.test(
    text,
  );
}

const VISION_REFUSAL_PATTERNS = [
  /can'?t help with that image/i,
  /cannot help with (that|this) image/i,
  /unable to (analyze|view|process|assist)(?:\s+this|\s+the|\s+with|$)/i,
  /i'?m (?:sorry|unable).{0,120}(can'?t|cannot|unable|won'?t)/i,
  /no puedo ayudar/i,
  /no puedo analizar/i,
  /no puedo ver (la|esta|esa) imagen/i,
  /lo siento.{0,80}no puedo/i,
] as const;

export function isVisionRefusalText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isStructuredDescriberOutput(t)) return false;

  const head = t.slice(0, 500);
  if (VISION_REFUSAL_PATTERNS.some((p) => p.test(head))) return true;

  // Model skipped section headers but produced a substantive description.
  if (
    t.length >= 180 &&
    /(?:subject|pose|standing|seated|hair|wearing|wardrobe|lighting|camera|lens|background|environment)/i.test(
      t,
    )
  ) {
    return false;
  }

  return VISION_REFUSAL_PATTERNS.some((p) => p.test(t));
}

export function describeVisionResponseFailure(args: {
  content: string;
  refusal?: string | null;
  finishReason?: string | null;
}): string {
  const trimmed = args.content.trim();
  if (args.refusal?.trim()) {
    return `OpenAI declined to describe this image: ${args.refusal.trim().slice(0, 240)}`;
  }
  if (args.finishReason === "content_filter") {
    return "OpenAI blocked this image (content filter). Try another crop or a different photo.";
  }
  if (!trimmed) {
    return "OpenAI returned an empty description. Try again in a few seconds, or re-upload the image.";
  }
  if (isVisionRefusalText(trimmed)) {
    return `OpenAI could not analyze this image: ${trimmed.slice(0, 240)}`;
  }
  if (args.finishReason === "length") {
    return "The description was cut off before completion. Try again — if it keeps happening, use a simpler image.";
  }
  return "OpenAI could not produce a valid description. Try again or use a different image.";
}

export { ForbiddenMediaReferenceError };
