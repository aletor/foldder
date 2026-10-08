/** Límite de app para un archivo BrandKit (alineado con proxyClientMaxBodySize de Next). */
export const BRAND_KIT_INGEST_MAX_FILE_BYTES = 32 * 1024 * 1024;

/**
 * Por encima de esto, el body no cabe en Vercel Functions (~4.5 MB).
 * Subimos a S3 con URL firmada y la API solo recibe la clave.
 */
export const BRAND_KIT_INGEST_DIRECT_UPLOAD_MIN_BYTES = 3 * 1024 * 1024;

export function brandKitIngestNeedsDirectUpload(file: Pick<File, "size">): boolean {
  return file.size >= BRAND_KIT_INGEST_DIRECT_UPLOAD_MIN_BYTES;
}
