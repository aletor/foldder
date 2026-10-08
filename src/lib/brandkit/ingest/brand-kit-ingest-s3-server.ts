import { getFromS3 } from "@/lib/s3-utils";
import { canUserAccessKnowledgeFileKey, isSafeKnowledgeFilesKey } from "@/lib/spaces-access-control";
import type { BrandKitIngestFile } from "./run-ingest";
import {
  parseBrandKitIngestS3FileRefs,
  type BrandKitIngestS3FileRef,
  BRAND_KIT_INGEST_S3_FILES_FIELD,
} from "./brand-kit-ingest-s3-refs";
import { BRAND_KIT_INGEST_MAX_FILE_BYTES } from "./brand-kit-ingest-upload-limits";

const BRAND_KIT_INGEST_KEY_MARKERS = ["/brandKit/ingest/", "/brandKit/"];

function isBrandKitIngestObjectKey(key: string): boolean {
  if (!isSafeKnowledgeFilesKey(key)) return false;
  return BRAND_KIT_INGEST_KEY_MARKERS.some((marker) => key.includes(marker));
}

export function collectBrandKitIngestS3Refs(formData: FormData): BrandKitIngestS3FileRef[] {
  return parseBrandKitIngestS3FileRefs(formData.get(BRAND_KIT_INGEST_S3_FILES_FIELD));
}

export async function loadBrandKitIngestFilesFromS3Refs(args: {
  refs: BrandKitIngestS3FileRef[];
  userEmail: string;
}): Promise<BrandKitIngestFile[]> {
  const out: BrandKitIngestFile[] = [];
  for (const ref of args.refs) {
    if (!isBrandKitIngestObjectKey(ref.key)) {
      throw new Error(`Clave S3 no válida para BrandKit: ${ref.name}`);
    }
    const allowed = await canUserAccessKnowledgeFileKey(args.userEmail, ref.key);
    if (!allowed) {
      throw new Error(`Sin acceso al archivo subido: ${ref.name}`);
    }
    const buffer = await getFromS3(ref.key);
    if (buffer.length > BRAND_KIT_INGEST_MAX_FILE_BYTES) {
      throw new Error(`Archivo demasiado grande (máx. 32 MB): ${ref.name}`);
    }
    if (buffer.length <= 0) {
      throw new Error(`Archivo vacío: ${ref.name}`);
    }
    out.push({
      name: ref.name,
      mime: ref.mime || "application/octet-stream",
      buffer,
    });
  }
  return out;
}
