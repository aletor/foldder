/**
 * Cliente Studio · Exportar 6K (reescala local en servidor, sin IA ni coste de API).
 */

import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import type { Export6kFormat } from "@/lib/nano-banana/export-6k-plan";

export const EXPORT_6K_ENDPOINT = "/api/spaces/nano-banana/export-6k";
const SOURCE_DATA_URL_MAX_BYTES = 24_000_000;

export type Export6kImageSource = { key: string } | { dataUrl: string };

export type Export6kResult = {
  output: string;
  key: string;
  width: number;
  height: number;
  scale: number;
  format: Export6kFormat;
  timeMs: number;
};

async function resolveExportImageSource(src: string): Promise<Export6kImageSource> {
  const key = tryExtractKnowledgeFilesKeyFromUrl(src);
  if (key) return { key };
  if (src.startsWith("data:image/")) return { dataUrl: src };
  if (/^(blob:|https?:|\/)/i.test(src)) {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo leer la imagen a exportar.");
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") || blob.size > SOURCE_DATA_URL_MAX_BYTES) {
      throw new Error("La imagen es demasiado grande o no es válida para exportar.");
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith("data:image/")) throw new Error("Formato de imagen no soportado.");
    return { dataUrl };
  }
  throw new Error("Origen de imagen no soportado.");
}

export async function runExport6k(args: {
  imageSrc: string;
  format?: Export6kFormat;
}): Promise<Export6kResult> {
  const image = await resolveExportImageSource(args.imageSrc);
  const format: Export6kFormat = args.format === "jpeg" ? "jpeg" : "png";
  const res = await fetch(EXPORT_6K_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, format }),
  });
  const json = (await res.json().catch(() => null)) as
    | (Partial<Export6kResult> & { error?: string })
    | null;
  if (!res.ok || !json?.output || !json.key) {
    throw new Error(json?.error || `Export 6K falló (HTTP ${res.status}).`);
  }
  return {
    output: json.output,
    key: json.key,
    width: typeof json.width === "number" ? json.width : 0,
    height: typeof json.height === "number" ? json.height : 0,
    scale: typeof json.scale === "number" ? json.scale : 1,
    format: json.format === "jpeg" ? "jpeg" : "png",
    timeMs: typeof json.timeMs === "number" ? json.timeMs : 0,
  };
}

/** Descarga el archivo 6K en el navegador. */
export async function downloadExport6kFile(outputUrl: string, filename: string): Promise<void> {
  const res = await fetch(outputUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo descargar el archivo 6K.");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
}
