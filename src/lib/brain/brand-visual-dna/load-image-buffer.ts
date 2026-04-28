import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";

/** Carga píxeles como Buffer para Sharp (data URL o https). */
export async function loadImageBufferFromUrl(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl?.trim()) return null;
  const u = imageUrl.trim();
  if (u.startsWith("data:")) {
    const parsed = await parseReferenceImageForGemini(u);
    if (!parsed?.data) return null;
    try {
      return Buffer.from(parsed.data, "base64");
    } catch {
      return null;
    }
  }
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      const res = await fetch(u, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}
