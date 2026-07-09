const GENOMA_MEDIA_PROXY_PATH = "/api/spaces/genoma/media-proxy";

/** URLs externas http(s) que el navegador suele bloquear por hotlinking. */
export function needsGenomaMediaProxy(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return false;
  if (trimmed.includes("/api/spaces/s3-file") || trimmed.includes(GENOMA_MEDIA_PROXY_PATH)) return false;
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//");
}

/** Resuelve la URL de previsualización para el board (proxy server-side para externas). */
export function resolveGenomaPreviewUrl(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return "";
  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (needsGenomaMediaProxy(normalized)) {
    return `${GENOMA_MEDIA_PROXY_PATH}?url=${encodeURIComponent(normalized)}`;
  }
  return trimmed;
}
