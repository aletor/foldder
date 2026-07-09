const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87 = Buffer.from("GIF87a");
const GIF89 = Buffer.from("GIF89a");
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_MAGIC = Buffer.from("WEBP");

export type RemoteImageFetchResult = {
  buffer: Buffer;
  contentType: string;
};

function originFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function buffersMatch(buffer: Buffer, signature: Buffer, offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return buffer.subarray(offset, offset + signature.length).equals(signature);
}

/** Detecta MIME de imagen aunque el servidor devuelva application/octet-stream o text/html erróneo. */
export function sniffImageContentType(buffer: Buffer): string | null {
  if (buffer.length < 3) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length < 8) return null;
  if (buffersMatch(buffer, PNG)) return "image/png";
  if (buffersMatch(buffer, GIF87) || buffersMatch(buffer, GIF89)) return "image/gif";
  if (buffer.length < 12) return null;
  if (buffersMatch(buffer, WEBP_RIFF) && buffersMatch(buffer, WEBP_MAGIC, 8)) return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii").toLowerCase().includes("<svg")) return "image/svg+xml";
  return null;
}

export function normalizeImageContentType(headerValue: string | null, buffer: Buffer): string | null {
  const header = (headerValue ?? "").split(";")[0]?.trim().toLowerCase() || "";
  if (header.startsWith("image/")) return header;
  return sniffImageContentType(buffer);
}

export async function fetchRemoteImageBuffer(sourceUrl: string): Promise<RemoteImageFetchResult | null> {
  const referer = originFromUrl(sourceUrl);
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(referer ? { Referer: `${referer}/` } : {}),
      },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = normalizeImageContentType(res.headers.get("content-type"), buffer);
    if (!contentType || !buffer.length) return null;

    return { buffer, contentType };
  } catch {
    return null;
  }
}
