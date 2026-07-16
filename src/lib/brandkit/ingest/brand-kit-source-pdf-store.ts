/**
 * Almacén S3 de PDFs fuente de BrandKit — clave determinista por contentSha256.
 * Permite re-rasterizar el logo a alta resolución en vectorize sin depender del crop detector.
 */

import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";

export type BrandKitSourceDocKind = "pdf" | "raster";

export function buildBrandKitSourcePdfObjectKey(userEmail: string, contentSha256: string): string {
  const sha = contentSha256.trim().toLowerCase();
  return buildUserAssetObjectKey({
    userEmail,
    folder: `brandKit/sources/${sha.slice(0, 16)}`,
    filename: `${sha}.pdf`,
    unique: false,
  });
}

export async function persistBrandKitSourcePdf(
  userEmail: string,
  contentSha256: string,
  buffer: Buffer,
): Promise<string> {
  const key = buildBrandKitSourcePdfObjectKey(userEmail, contentSha256);
  try {
    await getFromS3(key);
    return key;
  } catch {
    await uploadBufferToS3Key(key, buffer, "application/pdf");
    return key;
  }
}

export async function loadBrandKitSourcePdf(
  userEmail: string,
  contentSha256: string,
): Promise<Buffer | null> {
  const key = buildBrandKitSourcePdfObjectKey(userEmail, contentSha256);
  try {
    return await getFromS3(key);
  } catch {
    return null;
  }
}

export function buildBrandKitSourceRasterObjectKey(userEmail: string, contentSha256: string): string {
  const sha = contentSha256.trim().toLowerCase();
  return buildUserAssetObjectKey({
    userEmail,
    folder: `brandKit/sources/${sha.slice(0, 16)}`,
    filename: `${sha}.raster`,
    unique: false,
  });
}

/** Imagen fuente (brand board, JPG/PNG) para re-rasterizar recortes en logo-adjust. */
export async function persistBrandKitSourceRaster(
  userEmail: string,
  contentSha256: string,
  buffer: Buffer,
): Promise<string> {
  const key = buildBrandKitSourceRasterObjectKey(userEmail, contentSha256);
  try {
    await getFromS3(key);
    return key;
  } catch {
    await uploadBufferToS3Key(key, buffer, "application/octet-stream");
    return key;
  }
}

export async function loadBrandKitSourceRaster(
  userEmail: string,
  contentSha256: string,
): Promise<Buffer | null> {
  const key = buildBrandKitSourceRasterObjectKey(userEmail, contentSha256);
  try {
    return await getFromS3(key);
  } catch {
    return null;
  }
}

const SOURCE_MEMORY_CACHE_MAX = 4;
const sourceMemoryCache = new Map<
  string,
  { buffer: Buffer; kind: BrandKitSourceDocKind }
>();

function sourceMemoryKey(userEmail: string, contentSha256: string): string {
  return `${userEmail.trim().toLowerCase()}|${contentSha256.trim().toLowerCase()}`;
}

function rememberSource(
  key: string,
  value: { buffer: Buffer; kind: BrandKitSourceDocKind },
): void {
  if (sourceMemoryCache.has(key)) sourceMemoryCache.delete(key);
  sourceMemoryCache.set(key, value);
  while (sourceMemoryCache.size > SOURCE_MEMORY_CACHE_MAX) {
    const oldest = sourceMemoryCache.keys().next().value;
    if (oldest == null) break;
    sourceMemoryCache.delete(oldest);
  }
}

export async function loadBrandKitSourceForLogoAdjust(
  userEmail: string,
  contentSha256: string,
): Promise<{ buffer: Buffer; kind: BrandKitSourceDocKind } | null> {
  const memKey = sourceMemoryKey(userEmail, contentSha256);
  const hit = sourceMemoryCache.get(memKey);
  if (hit) {
    rememberSource(memKey, hit);
    return hit;
  }

  const pdf = await loadBrandKitSourcePdf(userEmail, contentSha256);
  if (pdf) {
    const value = { buffer: pdf, kind: "pdf" as const };
    rememberSource(memKey, value);
    return value;
  }
  const raster = await loadBrandKitSourceRaster(userEmail, contentSha256);
  if (raster) {
    const value = { buffer: raster, kind: "raster" as const };
    rememberSource(memKey, value);
    return value;
  }
  return null;
}

export type LogoAdjustPageCacheFormat = "jpg" | "png";

export function logoAdjustPageCacheFormatForDpi(dpi: number): LogoAdjustPageCacheFormat {
  return dpi >= 180 ? "png" : "jpg";
}

export function buildBrandKitLogoAdjustPageCacheKey(
  userEmail: string,
  contentSha256: string,
  pageNumber: number,
  dpi: number,
  format: LogoAdjustPageCacheFormat = logoAdjustPageCacheFormatForDpi(dpi),
): string {
  const sha = contentSha256.trim().toLowerCase();
  return buildUserAssetObjectKey({
    userEmail,
    folder: `brandKit/logo-adjust-pages/${sha.slice(0, 16)}`,
    filename: `p${pageNumber}-d${dpi}.${format}`,
    unique: false,
  });
}

export async function loadBrandKitLogoAdjustPageCache(
  userEmail: string,
  contentSha256: string,
  pageNumber: number,
  dpi: number,
): Promise<Buffer | null> {
  const format = logoAdjustPageCacheFormatForDpi(dpi);
  const key = buildBrandKitLogoAdjustPageCacheKey(userEmail, contentSha256, pageNumber, dpi, format);
  try {
    return await getFromS3(key);
  } catch {
    return null;
  }
}

export async function persistBrandKitLogoAdjustPageCache(
  userEmail: string,
  contentSha256: string,
  pageNumber: number,
  dpi: number,
  imageBuffer: Buffer,
): Promise<void> {
  const format = logoAdjustPageCacheFormatForDpi(dpi);
  const key = buildBrandKitLogoAdjustPageCacheKey(userEmail, contentSha256, pageNumber, dpi, format);
  const contentType = format === "png" ? "image/png" : "image/jpeg";
  try {
    await getFromS3(key);
  } catch {
    await uploadBufferToS3Key(key, imageBuffer, contentType);
  }
}
