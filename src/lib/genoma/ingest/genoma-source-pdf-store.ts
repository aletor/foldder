/**
 * Almacén S3 de PDFs fuente de Genoma — clave determinista por contentSha256.
 * Permite re-rasterizar el logo a alta resolución en vectorize sin depender del crop detector.
 */

import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";

export type GenomaSourceDocKind = "pdf" | "raster";

export function buildGenomaSourcePdfObjectKey(userEmail: string, contentSha256: string): string {
  const sha = contentSha256.trim().toLowerCase();
  return buildUserAssetObjectKey({
    userEmail,
    folder: `genoma/sources/${sha.slice(0, 16)}`,
    filename: `${sha}.pdf`,
    unique: false,
  });
}

export async function persistGenomaSourcePdf(
  userEmail: string,
  contentSha256: string,
  buffer: Buffer,
): Promise<string> {
  const key = buildGenomaSourcePdfObjectKey(userEmail, contentSha256);
  try {
    await getFromS3(key);
    return key;
  } catch {
    await uploadBufferToS3Key(key, buffer, "application/pdf");
    return key;
  }
}

export async function loadGenomaSourcePdf(
  userEmail: string,
  contentSha256: string,
): Promise<Buffer | null> {
  const key = buildGenomaSourcePdfObjectKey(userEmail, contentSha256);
  try {
    return await getFromS3(key);
  } catch {
    return null;
  }
}

export function buildGenomaSourceRasterObjectKey(userEmail: string, contentSha256: string): string {
  const sha = contentSha256.trim().toLowerCase();
  return buildUserAssetObjectKey({
    userEmail,
    folder: `genoma/sources/${sha.slice(0, 16)}`,
    filename: `${sha}.raster`,
    unique: false,
  });
}

/** Imagen fuente (brand board, JPG/PNG) para re-rasterizar recortes en logo-adjust. */
export async function persistGenomaSourceRaster(
  userEmail: string,
  contentSha256: string,
  buffer: Buffer,
): Promise<string> {
  const key = buildGenomaSourceRasterObjectKey(userEmail, contentSha256);
  try {
    await getFromS3(key);
    return key;
  } catch {
    await uploadBufferToS3Key(key, buffer, "application/octet-stream");
    return key;
  }
}

export async function loadGenomaSourceRaster(
  userEmail: string,
  contentSha256: string,
): Promise<Buffer | null> {
  const key = buildGenomaSourceRasterObjectKey(userEmail, contentSha256);
  try {
    return await getFromS3(key);
  } catch {
    return null;
  }
}

export async function loadGenomaSourceForLogoAdjust(
  userEmail: string,
  contentSha256: string,
): Promise<{ buffer: Buffer; kind: "pdf" | "raster" } | null> {
  const pdf = await loadGenomaSourcePdf(userEmail, contentSha256);
  if (pdf) return { buffer: pdf, kind: "pdf" };
  const raster = await loadGenomaSourceRaster(userEmail, contentSha256);
  if (raster) return { buffer: raster, kind: "raster" };
  return null;
}
