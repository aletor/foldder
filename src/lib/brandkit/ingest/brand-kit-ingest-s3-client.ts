"use client";

import {
  BRAND_KIT_INGEST_MAX_FILE_BYTES,
  brandKitIngestNeedsDirectUpload,
} from "./brand-kit-ingest-upload-limits";
import {
  BRAND_KIT_INGEST_S3_FILES_FIELD,
  type BrandKitIngestS3FileRef,
} from "./brand-kit-ingest-s3-refs";

type UploadTicket = {
  error?: string;
  method?: "PUT";
  s3Key?: string;
  uploadUrl?: string;
};

async function requestBrandKitIngestUploadTicket(file: File): Promise<{ key: string; uploadUrl: string }> {
  const res = await fetch("/api/spaces/brandKit/ingest-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      contentType: file.type || "application/octet-stream",
      filename: file.name,
      size: file.size,
    }),
  });
  const ticket = (await res.json().catch(() => null)) as UploadTicket | null;
  if (!res.ok || !ticket?.s3Key || !ticket.uploadUrl) {
    throw new Error(ticket?.error || `No se pudo preparar la subida (${res.status}).`);
  }
  return { key: ticket.s3Key, uploadUrl: ticket.uploadUrl };
}

async function putFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
    credentials: "omit",
  });
  if (!uploadRes.ok) {
    throw new Error(`Subida a almacenamiento falló (${uploadRes.status}).`);
  }
}

export type BrandKitIngestPreparedUploads = {
  /** Archivos pequeños: van en el body multipart. */
  inlineFiles: File[];
  /** Archivos grandes: ya en S3; solo se envían metadatos. */
  s3Refs: BrandKitIngestS3FileRef[];
};

/**
 * Para producción (Vercel ~4.5 MB): archivos grandes → PUT firmado a S3.
 * Los pequeños siguen en FormData.
 */
export async function prepareBrandKitIngestUploads(files: File[]): Promise<BrandKitIngestPreparedUploads> {
  const inlineFiles: File[] = [];
  const s3Refs: BrandKitIngestS3FileRef[] = [];

  for (const file of files) {
    if (file.size <= 0) continue;
    if (file.size > BRAND_KIT_INGEST_MAX_FILE_BYTES) {
      throw new Error(`«${file.name}» supera el máximo de 32 MB.`);
    }
    if (!brandKitIngestNeedsDirectUpload(file)) {
      inlineFiles.push(file);
      continue;
    }
    const ticket = await requestBrandKitIngestUploadTicket(file);
    await putFileToPresignedUrl(ticket.uploadUrl, file);
    s3Refs.push({
      key: ticket.key,
      name: file.name,
      mime: file.type || "application/octet-stream",
    });
  }

  if (!inlineFiles.length && !s3Refs.length) {
    throw new Error("No hay archivos para subir.");
  }

  return { inlineFiles, s3Refs };
}

export function appendBrandKitIngestUploadsToFormData(
  form: FormData,
  prepared: BrandKitIngestPreparedUploads,
  fieldName: "file" | "files" = "file",
): void {
  for (const file of prepared.inlineFiles) {
    form.append(fieldName, file);
  }
  if (prepared.s3Refs.length > 0) {
    form.append(BRAND_KIT_INGEST_S3_FILES_FIELD, JSON.stringify(prepared.s3Refs));
  }
}
