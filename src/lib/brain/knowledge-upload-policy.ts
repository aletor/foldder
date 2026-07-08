export const KNOWLEDGE_ALLOWED_EXT = new Set([
  "pdf",
  "docx",
  "txt",
  "md",
  "rtf",
  "html",
  "htm",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
]);

export const KNOWLEDGE_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/rtf",
  "text/html",
  "application/xhtml+xml",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const GENERIC_BINARY_MIMES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-download",
  "application/force-download",
  "application/download",
]);

export function getKnowledgeFileExt(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  return ext === "jpeg" ? "jpg" : ext;
}

export function sanitizeKnowledgeFilename(filename: string): string {
  const clean = filename
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  if (!clean) return `knowledge-${Date.now()}.bin`;
  const ext = getKnowledgeFileExt(clean);
  if (!ext || !KNOWLEDGE_ALLOWED_EXT.has(ext)) {
    const base = clean.replace(/\.[^.]+$/, "") || `knowledge-${Date.now()}`;
    return `${base}.${ext || "bin"}`;
  }
  return clean;
}

export function normalizeKnowledgeMime(rawContentType: string | undefined | null): string {
  const trimmed = String(rawContentType || "")
    .trim()
    .toLowerCase();
  if (!trimmed) return "application/octet-stream";
  return trimmed.split(";")[0]?.trim() || "application/octet-stream";
}

export function knowledgeContentTypeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  if (ext === "rtf") return "application/rtf";
  if (ext === "html" || ext === "htm") return "text/html";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

export function isAllowedKnowledgeUpload(filename: string, rawContentType?: string | null): boolean {
  const trimmedName = filename.trim();
  if (!trimmedName) return false;

  const ext = getKnowledgeFileExt(trimmedName);
  if (!KNOWLEDGE_ALLOWED_EXT.has(ext)) return false;

  const mime = normalizeKnowledgeMime(rawContentType);
  const isImage = mime.startsWith("image/") || ["jpg", "png", "webp", "avif"].includes(ext);
  const isHtml = ext === "html" || ext === "htm";
  const isGenericBinary = GENERIC_BINARY_MIMES.has(mime);

  return (
    KNOWLEDGE_ALLOWED_MIME.has(mime) ||
    mime.startsWith("text/") ||
    isImage ||
    isHtml ||
    isGenericBinary
  );
}

export function resolveKnowledgeContentType(filename: string, rawContentType?: string | null): string {
  const ext = getKnowledgeFileExt(filename);
  const mime = normalizeKnowledgeMime(rawContentType);
  if (KNOWLEDGE_ALLOWED_MIME.has(mime)) return mime;
  if (mime.startsWith("text/") || mime.startsWith("image/")) return mime;
  if (GENERIC_BINARY_MIMES.has(mime) && KNOWLEDGE_ALLOWED_EXT.has(ext)) {
    return knowledgeContentTypeForExt(ext);
  }
  return mime;
}

export function knowledgeUploadRejectReason(filename: string, rawContentType?: string | null): string | null {
  return isAllowedKnowledgeUpload(filename, rawContentType) ? null : "unsupported_type";
}

export function describeKnowledgeUploadError(error: string, filename?: string): string {
  if (error === "unsupported_type") {
    return filename
      ? `Formato no compatible (${filename}). Usa PDF, DOCX, TXT, MD, RTF, HTML o imágenes JPG/PNG/WebP/AVIF.`
      : "Formato no compatible. Usa PDF, DOCX, TXT, MD, RTF, HTML o imágenes JPG/PNG/WebP/AVIF.";
  }
  if (error === "file_too_large") {
    return filename ? `${filename} supera el tamaño máximo permitido.` : "El archivo supera el tamaño máximo permitido.";
  }
  if (error === "invalid_size") return "No se pudo leer el tamaño del archivo.";
  return error;
}
