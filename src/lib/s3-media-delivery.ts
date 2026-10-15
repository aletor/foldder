import {
  FOLDDER_CANVAS_THUMB_MAX_SIDE,
  FOLDDER_MEDIA_DERIVATIVE_SIDES,
  isRasterImagePathOrMime,
} from "@/lib/canvas-media-thumbnail";
import { mediaDerivativeObjectKey } from "@/lib/media-derivative-key";
import { buildS3ImageThumbnailBuffer } from "@/lib/s3-image-thumbnail";
import {
  ensureBrowserUploadCorsForS3,
  getFromS3,
  getPresignedUrl,
  s3ObjectExists,
  uploadBufferToS3Key,
} from "@/lib/s3-utils";

const DERIVATIVE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type PreparedMediaDerivative = {
  key: string;
  body?: Buffer;
  contentType?: string;
};

const inflight = new Map<string, Promise<PreparedMediaDerivative | null>>();

function qualityForSide(maxSide: number): number {
  return maxSide <= FOLDDER_CANVAS_THUMB_MAX_SIDE ? 74 : 82;
}

async function prepareMediaDerivative(
  sourceKey: string,
  maxSide: number,
): Promise<PreparedMediaDerivative | null> {
  if (!isRasterImagePathOrMime(sourceKey)) return null;
  const key = mediaDerivativeObjectKey(sourceKey, maxSide);
  try {
    if (await s3ObjectExists(key)) return { key };
  } catch (error) {
    console.warn("[media-derivative] head failed", key, error);
    return null;
  }

  try {
    const raw = await getFromS3(sourceKey);
    const thumb = await buildS3ImageThumbnailBuffer(raw, maxSide, "", sourceKey, qualityForSide(maxSide));
    if (!thumb) return null;
    await uploadBufferToS3Key(key, thumb.buffer, thumb.contentType, {
      cacheControl: DERIVATIVE_CACHE_CONTROL,
    });
    return { key, body: thumb.buffer, contentType: thumb.contentType };
  } catch (error) {
    console.warn("[media-derivative] build failed", sourceKey, error);
    return null;
  }
}

/** Crea el WebP una vez y lo reutiliza. Varias peticiones simultáneas comparten el mismo trabajo. */
export function ensureMediaDerivative(
  sourceKey: string,
  maxSide: number,
): Promise<PreparedMediaDerivative | null> {
  if (!isRasterImagePathOrMime(sourceKey)) return Promise.resolve(null);
  const key = mediaDerivativeObjectKey(sourceKey, maxSide);
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = prepareMediaDerivative(sourceKey, maxSide).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export async function ensureCanvasAndStudioDerivatives(sourceKey: string): Promise<void> {
  await Promise.all(
    FOLDDER_MEDIA_DERIVATIVE_SIDES.map((side) => ensureMediaDerivative(sourceKey, side)),
  );
}

export async function mediaReadRedirectUrl(key: string): Promise<string> {
  // No bloquear el redirect en PutBucketCors; <img> suele seguir el 302 igual.
  void ensureBrowserUploadCorsForS3().catch((error) => {
    console.warn("[media-delivery] CORS ensure failed; image tags can still follow the redirect.", error);
  });
  return getPresignedUrl(key, 3600);
}
