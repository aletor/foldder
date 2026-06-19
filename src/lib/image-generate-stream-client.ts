/**
 * Compartido entre clientes Gemini/OpenAI: sube data URLs pesadas a S3 antes del stream.
 */

import { sanitizeUserFacingErrorMessage } from "@/lib/read-response-json";

const REF_INITIAL_MAX_DIMENSION = 3072;
const REF_MIN_MAX_DIMENSION = 1024;
const REF_INITIAL_QUALITY = 0.92;
const REF_MIN_QUALITY = 0.78;
const REF_UPLOAD_MAX_BYTES = 3_350_000;

function isDataImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i.test(value);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo preparar una referencia visual."));
    img.src = src;
  });
}

async function compressDataImageForUpload(
  dataUrl: string,
  options?: { maxDimension?: number; quality?: number },
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  const img = await loadImage(dataUrl);
  const maxDimension = Math.max(
    REF_MIN_MAX_DIMENSION,
    Math.floor(options?.maxDimension ?? REF_INITIAL_MAX_DIMENSION),
  );
  const quality = Math.max(0.72, Math.min(0.96, options?.quality ?? REF_INITIAL_QUALITY));
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function extensionForMimeType(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("svg")) return "svg";
  return "jpg";
}

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1] || "image/jpeg";
  const binary = atob(match[2] || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
}

async function uploadReferenceFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/gemini/reference-upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      sanitizeUserFacingErrorMessage(text || `No se pudo subir la referencia visual (${res.status}).`, {
        status: res.status,
      }),
    );
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("La subida de referencia visual no devolvió URL.");
  return json.url;
}

function referenceFilename(index: number, mimeType: string): string {
  return `image-reference-${Date.now()}-${index}.${extensionForMimeType(mimeType)}`;
}

async function uploadReference(dataUrl: string, index: number): Promise<string> {
  const original = dataUrlToFile(dataUrl, referenceFilename(index, "image/png"));
  if (!original) {
    throw new Error("No se pudo preparar una referencia visual.");
  }
  const originalFile = dataUrlToFile(dataUrl, referenceFilename(index, original.type || "image/png"));
  if (originalFile && originalFile.size <= REF_UPLOAD_MAX_BYTES) {
    return uploadReferenceFile(originalFile);
  }

  let maxDimension = REF_INITIAL_MAX_DIMENSION;
  let quality = REF_INITIAL_QUALITY;
  let compacted = await compressDataImageForUpload(dataUrl, { maxDimension, quality });
  let file = dataUrlToFile(compacted, `image-reference-${Date.now()}-${index}.jpg`);

  while (file && file.size > REF_UPLOAD_MAX_BYTES && maxDimension > REF_MIN_MAX_DIMENSION) {
    maxDimension = Math.max(REF_MIN_MAX_DIMENSION, Math.floor(maxDimension * 0.82));
    quality = Math.max(REF_MIN_QUALITY, quality - 0.04);
    compacted = await compressDataImageForUpload(dataUrl, { maxDimension, quality });
    file = dataUrlToFile(compacted, `image-reference-${Date.now()}-${index}.jpg`);
  }

  while (file && file.size > REF_UPLOAD_MAX_BYTES && quality > 0.72) {
    quality = Math.max(0.72, quality - 0.04);
    compacted = await compressDataImageForUpload(dataUrl, { maxDimension: REF_MIN_MAX_DIMENSION, quality });
    file = dataUrlToFile(compacted, `image-reference-${Date.now()}-${index}.jpg`);
  }

  if (!file || file.size > REF_UPLOAD_MAX_BYTES) {
    throw new Error("Una referencia visual sigue siendo demasiado pesada para prepararla.");
  }

  return uploadReferenceFile(file);
}

export async function compactImageStreamReferences(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...body };
  const imageValues = Array.isArray(next.images)
    ? next.images
    : isDataImage(next.image)
      ? [next.image]
      : [];

  if (!imageValues.some(isDataImage)) return next;

  const compactedImages = await Promise.all(
    imageValues.map((value, index) =>
      isDataImage(value) ? uploadReference(value, index) : value,
    ),
  );
  next.images = compactedImages;
  delete next.image;

  return next;
}
