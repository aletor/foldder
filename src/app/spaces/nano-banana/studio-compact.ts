import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

const ANALYZE_AREAS_SOFT_IMAGE_BYTES = 850_000;

export function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i.test(value);
}

export function loadImageElement(src: string, options?: { crossOrigin?: boolean }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (options?.crossOrigin && !src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo preparar la imagen."));
    img.src = src;
  });
}

export async function loadCanvasSafeImageElement(src: string): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  const s3Key = tryExtractKnowledgeFilesKeyFromUrl(src);
  if (s3Key) {
    const res = await fetch(`/api/spaces/s3-download?key=${encodeURIComponent(s3Key)}`, { cache: "no-store" });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await loadImageElement(objectUrl);
        return { img, cleanup: () => URL.revokeObjectURL(objectUrl) };
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    }
  }
  return {
    img: await loadImageElement(src, { crossOrigin: true }),
    cleanup: () => {},
  };
}

export async function compactImageForAnalyzeAreas(
  src: string | null | undefined,
  options?: { maxSide?: number; quality?: number; maxBytes?: number },
): Promise<string | null> {
  if (!src) return null;
  if (!isDataImageUrl(src) || typeof document === "undefined") return src;
  const maxBytes = options?.maxBytes ?? ANALYZE_AREAS_SOFT_IMAGE_BYTES;
  if (src.length <= maxBytes) return src;

  const img = await loadImageElement(src);
  let maxSide = options?.maxSide ?? 1280;
  let quality = options?.quality ?? 0.72;
  let best = src;

  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1),
    );
    const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return best;
    ctx.drawImage(img, 0, 0, width, height);
    best = canvas.toDataURL("image/jpeg", quality);
    if (best.length <= maxBytes) return best;
    maxSide = Math.max(480, Math.floor(maxSide * 0.72));
    quality = Math.max(0.52, quality - 0.08);
  }
  return best;
}

export async function compactMaskForAnalyzeAreas(
  src: string | null | undefined,
  options?: { maxSide?: number; maxBytes?: number },
): Promise<string | null> {
  if (!src) return null;
  if (!isDataImageUrl(src) || typeof document === "undefined") return src;
  const maxBytes = options?.maxBytes ?? ANALYZE_AREAS_SOFT_IMAGE_BYTES;
  if (src.length <= maxBytes) return src;

  const img = await loadImageElement(src);
  let maxSide = options?.maxSide ?? 960;
  let best = src;

  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1),
    );
    const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return best;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    best = canvas.toDataURL("image/png");
    if (best.length <= maxBytes) return best;
    maxSide = Math.max(360, Math.floor(maxSide * 0.7));
  }
  return best;
}
