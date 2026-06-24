import { getFromS3 } from "@/lib/s3-utils";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

/** Convierte la URL de salida de Gemini (data URL, ruta s3-file o http) en Buffer en el servidor. */
export async function resolveGeneratedImageOutputToBuffer(output: string): Promise<Buffer> {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error("Generated image output is empty.");
  }

  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",");
    if (comma === -1) throw new Error("Invalid data URL from image generator.");
    const b64 = trimmed.slice(comma + 1);
    return Buffer.from(b64, "base64");
  }

  const s3Key = tryExtractKnowledgeFilesKeyFromUrl(trimmed);
  if (s3Key) {
    return getFromS3(s3Key);
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to fetch generated image (${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error(`Cannot resolve generated image URL: ${trimmed.slice(0, 120)}`);
}
