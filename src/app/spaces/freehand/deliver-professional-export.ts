"use client";

import { uploadProjectMediaFile } from "../project-media-s3-save";
import type { FoldderExportCreatedDetail } from "../foldder-export-events";
import type { ExportDestination } from "./freehand-export-modal-logic";

export type DeliverableExportEntry = {
  blob: Blob;
  name: string;
  ext: string;
  width?: number;
  height?: number;
};

const DOWNLOAD_STAGGER_MS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase().replace(/^\./, "")) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function isPreviewableImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export async function deliverProfessionalExportEntries(args: {
  entries: DeliverableExportEntry[];
  destination: ExportDestination;
  projectId: string | null;
  exportedFrom: string;
  extraMetadata?: Record<string, unknown>;
  onFinalExport?: (detail: Omit<FoldderExportCreatedDetail, "sourceNodeId">) => void;
  downloadBlob: (blob: Blob, filename: string) => void;
  upload?: typeof uploadProjectMediaFile;
}): Promise<void> {
  const { entries, destination } = args;
  if (entries.length === 0) return;
  const upload = args.upload ?? uploadProjectMediaFile;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const ext = entry.ext.replace(/^\./, "");
    const mime = entry.blob.type || mimeFromExt(ext);
    const metadata = {
      ...(args.extraMetadata ?? {}),
      ...(typeof entry.width === "number" ? { width: entry.width } : {}),
      ...(typeof entry.height === "number" ? { height: entry.height } : {}),
      destination,
    };

    if (destination === "download") {
      args.downloadBlob(entry.blob, entry.name);
      args.onFinalExport?.({
        name: entry.name,
        extension: `.${ext}`,
        mimeType: mime,
        exportedFrom: args.exportedFrom,
        exportFormat: ext,
        metadata,
      });
      if (i < entries.length - 1) await sleep(DOWNLOAD_STAGGER_MS);
      continue;
    }

    const file = new File([entry.blob], entry.name, { type: mime });
    const uploaded = await upload(file, {
      projectId: args.projectId,
      policy: { preserveImageQuality: true },
    });
    args.onFinalExport?.({
      name: entry.name,
      extension: `.${ext}`,
      mimeType: mime,
      fileUrl: uploaded.url,
      thumbnailUrl: isPreviewableImage(mime) ? uploaded.url : undefined,
      exportedFrom: args.exportedFrom,
      exportFormat: ext,
      metadata: {
        ...metadata,
        s3Key: uploaded.s3Key,
      },
    });
  }
}
