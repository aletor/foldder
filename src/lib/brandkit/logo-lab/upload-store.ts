import type { PageVisionPassRunAudit } from "@/lib/brandkit/ingest/page-vision-pass-runner";
import type { LogoLabDocumentHarvest } from "@/lib/brandkit/logo-lab/harvest-types";

type UploadEntry = {
  buffer: Buffer;
  fileName: string;
  audit: PageVisionPassRunAudit;
  harvest: LogoLabDocumentHarvest | null;
  createdAt: number;
};

const TTL_MS = 60 * 60 * 1000;

type UploadStoreGlobal = typeof globalThis & {
  __logoLabUploadStore?: Map<string, UploadEntry>;
};

function uploadStore(): Map<string, UploadEntry> {
  const g = globalThis as UploadStoreGlobal;
  g.__logoLabUploadStore ??= new Map();
  return g.__logoLabUploadStore;
}

function pruneExpired() {
  const now = Date.now();
  const store = uploadStore();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
}

export function storeLogoLabUpload(input: {
  uploadId: string;
  buffer: Buffer;
  fileName: string;
  audit: PageVisionPassRunAudit;
  harvest?: LogoLabDocumentHarvest | null;
}): void {
  pruneExpired();
  uploadStore().set(input.uploadId, {
    buffer: input.buffer,
    fileName: input.fileName,
    audit: input.audit,
    harvest: input.harvest ?? null,
    createdAt: Date.now(),
  });
}

export function getLogoLabUpload(uploadId: string): UploadEntry | null {
  pruneExpired();
  const entry = uploadStore().get(uploadId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    uploadStore().delete(uploadId);
    return null;
  }
  return entry;
}

export function auditPageNumbers(audit: PageVisionPassRunAudit): number[] {
  if (audit.selectedPages.length > 0) return audit.selectedPages;
  const fromPages = audit.pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  if (fromPages.length > 0) return fromPages;
  if (audit.totalPages > 0) {
    const cap = Math.min(5, audit.totalPages);
    return Array.from({ length: cap }, (_, i) => i + 1);
  }
  return [1];
}
