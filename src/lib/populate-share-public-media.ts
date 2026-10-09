import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";

const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";

const URL_FIELDS = [
  "url",
  "src",
  "href",
  "previewThumbUrl",
  "previewHeroUrl",
  "viewUrl",
  "thumbUrl",
  "fileUrl",
  "thumbnailUrl",
] as const;

export function isPopulateShareMediaKey(key: string): boolean {
  return Boolean(
    key &&
      key.startsWith(KNOWLEDGE_FILES_PREFIX) &&
      !key.includes("..") &&
      !key.includes("\0"),
  );
}

export function populateShareMediaPath(token: string, key: string): string {
  return `/api/populate-share/${encodeURIComponent(token)}/media?key=${encodeURIComponent(key)}`;
}

/** URL de display (s3-file o prefirma) → ruta pública del enlace. Las claves sueltas no se tocan. */
export function rewritePopulateMediaUrl(raw: string, token: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;
  if (trimmed.includes("/api/populate-share/") && trimmed.includes("/media?")) return trimmed;
  if (/\s/.test(trimmed)) return null;
  const isUrl =
    trimmed.startsWith("/api/spaces/s3-file") ||
    trimmed.startsWith("/api/spaces/s3-download") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://");
  if (!isUrl) return null;
  const key = resolveKnowledgeFilesS3Key(trimmed);
  if (!key || !isPopulateShareMediaKey(key)) return null;
  return populateShareMediaPath(token, key);
}

function mediaKeyFromObject(obj: Record<string, unknown>): string {
  for (const field of ["s3KeyOpt", "s3Key", "s3KeyHr"] as const) {
    const value = obj[field];
    if (typeof value === "string" && isPopulateShareMediaKey(value.trim())) return value.trim();
  }
  return "";
}

/** Reescribe src/url de imágenes del payload para que el formulario público no pase por sesión. */
export function rewritePopulateSharePayloadForPublic<T>(payload: T, token: string): T {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (!value || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      next[key] = visit(child);
    }
    for (const field of URL_FIELDS) {
      const current = next[field];
      if (typeof current !== "string") continue;
      const rewritten = rewritePopulateMediaUrl(current, token);
      if (rewritten) next[field] = rewritten;
    }
    const mediaKey = mediaKeyFromObject(obj);
    if (mediaKey) {
      const publicUrl = populateShareMediaPath(token, mediaKey);
      if ("src" in obj) next.src = publicUrl;
      if (obj.type === "image" || "url" in obj) next.url = publicUrl;
    }
    return next;
  };
  return visit(payload) as T;
}

export function collectPopulateShareMediaKeys(payload: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (isPopulateShareMediaKey(trimmed)) keys.add(trimmed);
      const fromUrl = resolveKnowledgeFilesS3Key(trimmed);
      if (fromUrl && isPopulateShareMediaKey(fromUrl)) keys.add(fromUrl);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(payload);
  return keys;
}
