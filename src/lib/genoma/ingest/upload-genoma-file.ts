import { randomUUID } from "node:crypto";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { spacesOwnerHash, stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";

const USER_ASSETS_PREFIX = "knowledge-files/";

function safeExt(filename: string, mime: string): string {
  const dot = filename.lastIndexOf(".");
  const fromName = dot >= 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (fromName) return fromName;
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("pdf")) return "pdf";
  return "bin";
}

export function buildGenomaIngestObjectKey(userEmail: string, filename: string, mime: string): string {
  const owner = spacesOwnerHash(userEmail);
  const ext = safeExt(filename, mime);
  const id = randomUUID();
  const stem = filename.replace(/\.[^.]+$/, "").slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, "_") || "file";
  return `${USER_ASSETS_PREFIX}${owner}/genoma/ingest/${stem}-${id}.${ext}`;
}

export async function uploadGenomaIngestFile(args: {
  userEmail: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}): Promise<{ key: string; url: string; fileId: string }> {
  const key = buildGenomaIngestObjectKey(args.userEmail, args.filename, args.mime);
  await uploadBufferToS3Key(key, args.buffer, args.mime || "application/octet-stream");
  return {
    key,
    url: stableKnowledgeFileUrlFromKey(key),
    fileId: key,
  };
}
