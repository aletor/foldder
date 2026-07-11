import { stableKnowledgeFileUrlFromMaybeUrl } from "@/lib/s3-media-hydrate";

const BRAND_KIT_MEDIA_PROXY_PATH = "/api/spaces/brandKit/media-proxy";

/** URLs externas http(s) que el navegador suele bloquear por hotlinking. */
export function needsBrandKitMediaProxy(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return false;
  if (trimmed.includes("/api/spaces/s3-file") || trimmed.includes(BRAND_KIT_MEDIA_PROXY_PATH)) return false;
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//");
}

/** Resuelve la URL de previsualización para el board (proxy server-side para externas). */
export function resolveBrandKitPreviewUrl(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return "";
  const stable = stableKnowledgeFileUrlFromMaybeUrl(trimmed);
  if (stable?.includes("/api/spaces/s3-file")) return stable;
  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (needsBrandKitMediaProxy(normalized)) {
    return `${BRAND_KIT_MEDIA_PROXY_PATH}?url=${encodeURIComponent(normalized)}`;
  }
  return stable ?? normalized;
}
