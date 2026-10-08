export const BRAND_KIT_INGEST_S3_FILES_FIELD = "s3Files";

export type BrandKitIngestS3FileRef = {
  key: string;
  name: string;
  mime: string;
};

export function parseBrandKitIngestS3FileRefs(raw: unknown): BrandKitIngestS3FileRef[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const key = typeof row.key === "string" ? row.key.trim() : "";
        const name = typeof row.name === "string" ? row.name.trim() : "";
        const mime = typeof row.mime === "string" ? row.mime.trim() : "application/octet-stream";
        if (!key || !name) return null;
        return { key, name, mime: mime || "application/octet-stream" };
      })
      .filter((item): item is BrandKitIngestS3FileRef => Boolean(item));
  } catch {
    return [];
  }
}
