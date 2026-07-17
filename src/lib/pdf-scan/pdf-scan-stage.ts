import { randomUUID } from "node:crypto";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildUserAssetObjectKey, stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";
import { sha256Hex } from "./pdf-scan-images";
import { PDF_SCAN_MAX_FILE_BYTES, type PdfScanSourceMeta } from "./pdf-scan-types";

function objectKey(userEmail: string, folder: string, filename: string): string {
  return buildUserAssetObjectKey({
    userEmail,
    folder,
    filename,
    unique: false,
  });
}

export function assertPdfBuffer(buffer: Buffer): void {
  if (buffer.byteLength > PDF_SCAN_MAX_FILE_BYTES) {
    throw new Error(`El PDF supera el límite de ${Math.round(PDF_SCAN_MAX_FILE_BYTES / (1024 * 1024))} MB.`);
  }
  if (buffer.byteLength < 5 || buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error("El archivo no parece un PDF válido.");
  }
}

export function sanitizePdfFileName(fileName: string): string {
  return fileName.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/gi, "_").slice(0, 120) || "document.pdf";
}

/** Sube el PDF a S3 sin analizarlo (estado staged). */
export async function stagePdfScanSource(input: {
  buffer: Buffer;
  fileName: string;
  userEmail: string;
}): Promise<{ source: PdfScanSourceMeta; stageId: string }> {
  assertPdfBuffer(input.buffer);
  const contentSha256 = sha256Hex(input.buffer);
  const fileName = sanitizePdfFileName(input.fileName);
  const pdfKey = objectKey(input.userEmail, "pdf-scan/source", `${contentSha256.slice(0, 16)}-${fileName}`);
  await uploadBufferToS3Key(pdfKey, input.buffer, "application/pdf");
  const stageId = `pdfstage_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  return {
    stageId,
    source: {
      s3Key: pdfKey,
      contentSha256,
      fileName,
      byteSize: input.buffer.byteLength,
      url: stableKnowledgeFileUrlFromKey(pdfKey),
    },
  };
}

export function pdfScanObjectKey(userEmail: string, folder: string, filename: string): string {
  return objectKey(userEmail, folder, filename);
}
