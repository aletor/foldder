/**
 * Layerizer — carga del master a Buffer respetando control de acceso a medios.
 * Mismo patrón que /api/spaces/matte: s3Key autorizado → getFromS3; http → fetch con
 * User-Agent (evita 403); data URL → decode. El master NUNCA se reescribe.
 */

import {
  assertUserCanAccessMediaReference,
  inferMimeTypeFromPath,
} from "@/lib/api-media-access";
import { getFromS3 } from "@/lib/s3-utils";

export interface ResolvedMaster {
  buffer: Buffer;
  mime: string;
  s3Key?: string;
}

function parseDataUrl(value: string): { buffer: Buffer; mime: string } {
  const marker = ";base64,";
  const idx = value.indexOf(marker);
  if (!value.startsWith("data:") || idx === -1) {
    throw new Error("Invalid image data URL");
  }
  const mime = value.slice(5, idx).split(";")[0] || "image/png";
  return { buffer: Buffer.from(value.slice(idx + marker.length), "base64"), mime };
}

/** Resuelve la imagen de entrada a Buffer. Lanza ForbiddenMediaReferenceError si no autorizado. */
export async function resolveLayerizerMaster(
  userEmail: string,
  image: string,
): Promise<ResolvedMaster> {
  const s3Key = await assertUserCanAccessMediaReference(userEmail, image, "image");
  if (s3Key) {
    const buffer = await getFromS3(s3Key);
    return { buffer, mime: inferMimeTypeFromPath(s3Key, "image/png"), s3Key };
  }
  if (image.startsWith("http")) {
    const res = await fetch(image, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/png";
    return { buffer, mime };
  }
  return parseDataUrl(image);
}
