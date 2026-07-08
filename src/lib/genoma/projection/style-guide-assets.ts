/**
 * Embebe imágenes como data URLs para PDF/HTML offline (Chromium sin sesión).
 */

import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import { getFromS3 } from "@/lib/s3-utils";

function mimeFromKeyOrUrl(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".svg")) return "image/svg+xml";
  return "image/png";
}

function resolveS3ObjectKey(raw: string): string | null {
  const fromKnowledge = resolveKnowledgeFilesS3Key(raw);
  if (fromKnowledge) return fromKnowledge;
  try {
    const u = new URL(raw.trim(), "http://foldder.local");
    if (u.pathname === "/api/spaces/s3-file" || u.pathname === "/api/spaces/s3-download") {
      const key = u.searchParams.get("key")?.trim();
      if (key && !key.includes("..") && !key.includes("\0")) return key;
    }
  } catch {
    // ignore malformed refs
  }
  return null;
}

export async function embedImageUrlForStyleGuide(url: string): Promise<string | null> {
  const raw = url.trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;

  const s3Key = resolveS3ObjectKey(raw);
  if (s3Key) {
    try {
      const buf = await getFromS3(s3Key);
      const mime = mimeFromKeyOrUrl(s3Key);
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const res = await fetch(raw, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || mimeFromKeyOrUrl(raw);
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  return null;
}

export async function embedImageUrlsForStyleGuide(
  urls: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set([...urls].filter((u): u is string => Boolean(u?.trim())))];
  await Promise.all(
    unique.map(async (url) => {
      const embedded = await embedImageUrlForStyleGuide(url);
      if (embedded) map.set(url, embedded);
    }),
  );
  return map;
}

export function resolveEmbeddedUrl(
  raw: string | null | undefined,
  embedded: Map<string, string>,
): string | null {
  const url = raw?.trim();
  if (!url) return null;
  return embedded.get(url) ?? (url.startsWith("data:") ? url : null);
}
