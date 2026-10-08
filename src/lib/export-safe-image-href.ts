/**
 * Helpers para incrustar imágenes en export (PNG/JPG/PDF) sin canvas tainted
 * ni stubs transparentes por falta de cookies en `/api/spaces/s3-file`.
 */

export function isSameOriginSpacesApiHref(href: string, baseUri?: string): boolean {
  const raw = href.trim();
  if (!raw) return false;
  /** Forma habitual en el SVG del editor: relative → cookies same-origin. */
  if (raw.startsWith("/api/spaces/")) return true;
  try {
    const base =
      baseUri ??
      (typeof document !== "undefined" ? document.baseURI : "https://localhost/");
    const u = new URL(raw, base);
    if (!u.pathname.startsWith("/api/spaces/")) return false;
    const pageOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : new URL(base).origin;
    return u.origin === pageOrigin;
  } catch {
    return false;
  }
}

export function resolveExportImageHref(href: string, baseUri?: string): string {
  const raw = href.trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) return raw;
  try {
    const base =
      baseUri ??
      (typeof document !== "undefined" ? document.baseURI : "https://localhost/");
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  const step = 8192;
  for (let i = 0; i < bytes.byteLength; i += step) {
    const end = Math.min(i + step, bytes.byteLength);
    let block = "";
    for (let j = i; j < end; j++) block += String.fromCharCode(bytes[j]!);
    parts.push(block);
  }
  return btoa(parts.join(""));
}

function guessMimeFromUrl(url: string): string {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function blobToDataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const buf = await blob.arrayBuffer();
  const mime =
    blob.type && blob.type !== "application/octet-stream" ? blob.type : fallbackMime;
  return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
}

/**
 * Fetch same-origin `/api/spaces/*` (auth cookie) or `blob:` / `data:`.
 * Returns null if the URL is remote http(s) that should go through the S3 proxy.
 */
export async function fetchSameOriginOrBlobHrefAsDataUrl(
  href: string,
  baseUri?: string,
): Promise<string | null> {
  const resolved = resolveExportImageHref(href, baseUri);
  if (!resolved) return null;
  if (resolved.startsWith("data:")) return resolved;
  if (resolved.startsWith("blob:")) {
    try {
      const res = await fetch(resolved);
      if (!res.ok) return null;
      return await blobToDataUrl(await res.blob(), "image/png");
    } catch {
      return null;
    }
  }
  if (!isSameOriginSpacesApiHref(resolved, baseUri)) return null;
  try {
    const res = await fetch(resolved, { mode: "cors", credentials: "include" });
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob(), guessMimeFromUrl(resolved));
  } catch {
    return null;
  }
}
