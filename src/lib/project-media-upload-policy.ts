/** Shared MIME/extension policy for project media uploads (mediaInput, canvas drops). */

const ALLOWED_PREFIXES = ["image/", "video/", "audio/"] as const;

const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.pdf",
]);

const GENERIC_BINARY_MIMES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-download",
  "application/force-download",
  "application/download",
]);

export function projectMediaContentTypeFromFilename(filename: string): string | null {
  const name = filename.toLowerCase();
  if (/\.(jpe?g)$/.test(name)) return "image/jpeg";
  if (/\.png$/.test(name)) return "image/png";
  if (/\.webp$/.test(name)) return "image/webp";
  if (/\.gif$/.test(name)) return "image/gif";
  if (/\.svg$/.test(name)) return "image/svg+xml";
  if (/\.avif$/.test(name)) return "image/avif";
  if (/\.mp4$/.test(name)) return "video/mp4";
  if (/\.webm$/.test(name)) return "video/webm";
  if (/\.mov$/.test(name)) return "video/quicktime";
  if (/\.mp3$/.test(name)) return "audio/mpeg";
  if (/\.wav$/.test(name)) return "audio/wav";
  if (/\.pdf$/.test(name)) return "application/pdf";
  return null;
}

export function normalizeProjectMediaContentType(
  rawContentType: string | undefined | null,
  filename = "",
): string {
  const trimmed = String(rawContentType || "")
    .trim()
    .toLowerCase();
  const mime = trimmed.split(";")[0]?.trim() || "";
  if (mime && !GENERIC_BINARY_MIMES.has(mime)) return mime;
  return projectMediaContentTypeFromFilename(filename) || mime || "application/octet-stream";
}

export function isAllowedProjectMediaContentType(
  rawContentType: string | undefined | null,
  filename = "",
): boolean {
  const contentType = normalizeProjectMediaContentType(rawContentType, filename);
  if (ALLOWED_EXACT.has(contentType)) return true;
  return ALLOWED_PREFIXES.some((prefix) => contentType.startsWith(prefix));
}

export function extensionForProjectMediaContentType(contentType: string, filename = ""): string {
  const dot = filename.lastIndexOf(".");
  const fromName = dot >= 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (fromName) return fromName === "jpeg" ? "jpg" : fromName;
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("avif")) return "avif";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("pdf")) return "pdf";
  return "bin";
}
