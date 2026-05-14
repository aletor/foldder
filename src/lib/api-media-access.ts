import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { canUserAccessKnowledgeFileKey } from "@/lib/spaces-access-control";

export class ForbiddenMediaReferenceError extends Error {
  constructor(label = "media") {
    super(`Forbidden ${label} reference`);
    this.name = "ForbiddenMediaReferenceError";
  }
}

export async function assertUserCanAccessMediaReference(
  userEmail: string,
  value: unknown,
  label = "media",
): Promise<string | null> {
  if (typeof value !== "string") return null;
  const key = tryExtractKnowledgeFilesKeyFromUrl(value);
  if (!key) return null;
  const allowed = await canUserAccessKnowledgeFileKey(userEmail, key);
  if (!allowed) throw new ForbiddenMediaReferenceError(label);
  return key;
}

export function inferMimeTypeFromPath(value: string, fallback = "application/octet-stream"): string {
  const clean = value.toLowerCase().split("?")[0] || "";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".avif")) return "image/avif";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".mp4")) return "video/mp4";
  if (clean.endsWith(".webm")) return "video/webm";
  if (clean.endsWith(".mov")) return "video/quicktime";
  return fallback;
}
