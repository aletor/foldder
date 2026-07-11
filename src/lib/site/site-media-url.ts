import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";

/** Resuelve URL de media para render Site (S3 estable + absolutizar en preview iframe). */
export function resolveSiteMediaSrc(
  src: string | undefined,
  opts?: { previewOrigin?: string; s3Key?: string },
): string {
  const resolved = resolveFullQualityMediaUrl(src, opts?.s3Key) ?? src?.trim() ?? "";
  if (!resolved) return "";
  if (opts?.previewOrigin && resolved.startsWith("/")) {
    return `${opts.previewOrigin.replace(/\/$/, "")}${resolved}`;
  }
  return resolved;
}

/** Convierte blob: en data: URLs para que carguen dentro de iframe srcDoc. */
export async function hydrateBlobUrlsInSiteHtml(html: string): Promise<string> {
  if (typeof window === "undefined" || !html.includes("blob:")) return html;

  const pattern = /\b(src|poster)=("blob:[^"]+")/g;
  const seen = new Map<string, string>();
  let next = html;
  const matches = [...html.matchAll(pattern)];

  for (const match of matches) {
    const blobUrl = match[2]!.slice(1, -1);
    if (seen.has(blobUrl)) continue;
    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          if (result) resolve(result);
          else reject(new Error("empty blob read"));
        };
        reader.onerror = () => reject(new Error("blob read failed"));
        reader.readAsDataURL(blob);
      });
      seen.set(blobUrl, dataUrl);
    } catch {
      // Mantener blob original si falla (p. ej. revocado).
    }
  }

  for (const [blobUrl, dataUrl] of seen) {
    next = next.split(blobUrl).join(dataUrl);
  }
  return next;
}
