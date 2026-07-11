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

export async function loadBrandKitSourceForLogoAdjust(
  userEmail: string,
  contentSha256: string,
): Promise<{ buffer: Buffer; kind: "pdf" | "raster" } | null> {
  const pdf = await loadBrandKitSourcePdf(userEmail, contentSha256);
  if (pdf) return { buffer: pdf, kind: "pdf" };
  const raster = await loadBrandKitSourceRaster(userEmail, contentSha256);
  if (raster) return { buffer: raster, kind: "raster" };
  return null;
}
