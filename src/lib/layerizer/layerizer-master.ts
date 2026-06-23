/**
 * Layerizer — carga del master a Buffer respetando control de acceso a medios.
 * Mismo patrón que /api/spaces/matte: s3Key autorizado → getFromS3; http → fetch con
 * User-Agent (evita 403); data URL → decode. El master NUNCA se reescribe.
 */

import { createHash } from "node:crypto";
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

/**
 * Cache en memoria del master resuelto (buffer). Evita la doble descarga entre
 * /detect y /extract para la misma imagen. TTL corto + tope de entradas para acotar RAM.
 * El control de acceso se sigue verificando SIEMPRE antes de servir desde cache.
 */
const MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
const MASTER_CACHE_MAX = 8;
const masterCache = new Map<string, { at: number; master: ResolvedMaster }>();

function cacheKey(userEmail: string, image: string): string {
  return `${userEmail}:${createHash("sha1").update(image).digest("hex")}`;
}

function readCache(key: string): ResolvedMaster | null {
  const hit = masterCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MASTER_CACHE_TTL_MS) {
    masterCache.delete(key);
    return null;
  }
  return hit.master;
}

function writeCache(key: string, master: ResolvedMaster): void {
  masterCache.set(key, { at: Date.now(), master });
  if (masterCache.size > MASTER_CACHE_MAX) {
    const oldest = masterCache.keys().next().value;
    if (oldest) masterCache.delete(oldest);
  }
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
  // El control de acceso se ejecuta SIEMPRE (también en hits de cache).
  const s3Key = await assertUserCanAccessMediaReference(userEmail, image, "image");
  const key = cacheKey(userEmail, image);
  const cached = readCache(key);
  if (cached) return cached;

  let resolved: ResolvedMaster;
  if (s3Key) {
    const buffer = await getFromS3(s3Key);
    resolved = { buffer, mime: inferMimeTypeFromPath(s3Key, "image/png"), s3Key };
  } else if (image.startsWith("http")) {
    const res = await fetch(image, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    resolved = { buffer, mime: res.headers.get("content-type") || "image/png" };
  } else {
    const { buffer, mime } = parseDataUrl(image);
    resolved = { buffer, mime };
  }

  writeCache(key, resolved);
  return resolved;
}
