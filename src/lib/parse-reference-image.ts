/**
 * Convierte referencias de imagen (data URL o http(s)) al formato inline_data de Gemini.
 * Soporta `data:image/png;charset=UTF-8;base64,...` (el split naive `;base64,` rompía el mime).
 */

import { getFromS3 } from "@/lib/s3-utils";

type ParseReferenceImageOptions = {
  baseUrl?: string | URL;
};

const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inferMimeTypeFromPath(value: string): string {
  const lower = value.toLowerCase().split("?")[0] || "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

function resolveAbsoluteUrl(value: string, baseUrl?: string | URL): string | null {
  try {
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return null;
  }
}

function tryExtractKnowledgeFilesKey(value: string, baseUrl?: string | URL): string | null {
  const raw = value.trim();
  if (raw.startsWith(KNOWLEDGE_FILES_PREFIX)) return raw;
  const absolute = resolveAbsoluteUrl(raw, baseUrl);
  if (!absolute) return null;
  try {
    const u = new URL(absolute);
    const routeKey = u.pathname === "/api/spaces/s3-file" ? u.searchParams.get("key")?.trim() : "";
    if (routeKey?.startsWith(KNOWLEDGE_FILES_PREFIX)) return routeKey;
    const decodedPath = safeDecodeUriComponent(u.pathname.replace(/^\/+/, ""));
    const idx = decodedPath.indexOf(KNOWLEDGE_FILES_PREFIX);
    return idx >= 0 ? decodedPath.slice(idx) : null;
  } catch {
    return null;
  }
}

export async function parseReferenceImageForGemini(
  image: string,
  options?: ParseReferenceImageOptions,
): Promise<{ data: string; mimeType: string } | null> {
  if (!image || typeof image !== "string") return null;

  if (image.startsWith("data:")) {
    const marker = ";base64,";
    const idx = image.indexOf(marker);
    if (idx === -1) return null;
    const meta = image.slice(5, idx);
    const mimeType = (meta.split(";")[0] || "image/png").trim();
    const data = image.slice(idx + marker.length);
    if (!data) return null;
    return { data, mimeType };
  }

  const s3Key = tryExtractKnowledgeFilesKey(image, options?.baseUrl);
  if (s3Key) {
    try {
      const buffer = await getFromS3(s3Key);
      return {
        data: buffer.toString("base64"),
        mimeType: inferMimeTypeFromPath(s3Key),
      };
    } catch {
      return null;
    }
  }

  const absoluteImageUrl = resolveAbsoluteUrl(image, options?.baseUrl);
  if (absoluteImageUrl?.startsWith("http://") || absoluteImageUrl?.startsWith("https://")) {
    try {
      const res = await fetch(absoluteImageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
      const mimeType =
        headerMime ||
        inferMimeTypeFromPath(absoluteImageUrl);
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType,
      };
    } catch {
      return null;
    }
  }

  return null;
}
