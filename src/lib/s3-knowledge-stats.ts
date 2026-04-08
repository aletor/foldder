import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

/** Mismo prefijo que `uploadToS3` en s3-utils (Gemini, Runway, etc.). */
export const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";

export type KnowledgeFileTypeRow = {
  /** Etiqueta legible del tipo (p. ej. PNG, MP4). */
  typeLabel: string;
  count: number;
  bytes: number;
};

export type KnowledgeFilesStats = {
  prefix: string;
  bucket: string;
  totalObjects: number;
  totalBytes: number;
  byType: KnowledgeFileTypeRow[];
};

/** Extensión → etiqueta corta para el panel. */
function typeLabelFromKey(key: string): string {
  const base = key.split("/").pop() || "";
  const m = /\.([a-zA-Z0-9]+)$/.exec(base);
  const ext = (m?.[1] || "").toLowerCase();
  const map: Record<string, string> = {
    png: "PNG",
    jpg: "JPEG",
    jpeg: "JPEG",
    webp: "WebP",
    gif: "GIF",
    bmp: "BMP",
    mp4: "MP4",
    webm: "WebM",
    mov: "MOV",
    json: "JSON",
    txt: "TXT",
    pdf: "PDF",
    zip: "ZIP",
  };
  if (!ext) return "Sin extensión";
  return map[ext] || ext.toUpperCase();
}

/**
 * Lista objetos bajo `knowledge-files/` y agrega conteo y bytes por tipo (extensión).
 */
export async function listKnowledgeFilesStats(): Promise<KnowledgeFilesStats> {
  let continuationToken: string | undefined;
  const agg = new Map<string, { count: number; bytes: number }>();
  let totalObjects = 0;
  let totalBytes = 0;

  do {
    const resp = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: KNOWLEDGE_FILES_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key || obj.Size == null) continue;
      totalObjects++;
      totalBytes += obj.Size;
      const label = typeLabelFromKey(obj.Key);
      const cur = agg.get(label) ?? { count: 0, bytes: 0 };
      cur.count += 1;
      cur.bytes += obj.Size;
      agg.set(label, cur);
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  const byType: KnowledgeFileTypeRow[] = [...agg.entries()]
    .map(([typeLabel, v]) => ({ typeLabel, count: v.count, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    prefix: KNOWLEDGE_FILES_PREFIX,
    bucket: BUCKET_NAME,
    totalObjects,
    totalBytes,
    byType,
  };
}

let cache: { at: number; data: KnowledgeFilesStats } | null = null;
const CACHE_MS = 60_000;

/** Evita listar el bucket en cada poll del HUD (15 s). */
export async function listKnowledgeFilesStatsCached(): Promise<KnowledgeFilesStats> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }
  const data = await listKnowledgeFilesStats();
  cache = { at: now, data };
  return data;
}

export function invalidateKnowledgeFilesStatsCache(): void {
  cache = null;
}
