import type { ProjectFile } from "@/app/spaces/project-files";
import type { PopulateShareRecord } from "@/lib/populate-share-types";
import type { PopulateExportProvenance, PopulateGalleryItem } from "@/lib/populate-live-export-types";

export function exportMatchesShare(file: ProjectFile, share: PopulateShareRecord): boolean {
  const meta = file.metadata ?? {};
  if (meta.matchId !== share.matchId) return false;
  if (typeof meta.populateShareToken === "string" && meta.populateShareToken !== share.token) {
    return false;
  }
  return file.kind === "export";
}

export function projectFileToGalleryItem(
  file: ProjectFile,
  share: PopulateShareRecord,
  viewUrl?: string,
): PopulateGalleryItem | null {
  if (!exportMatchesShare(file, share)) return null;
  const meta = file.metadata ?? {};
  const url = viewUrl ?? file.fileUrl ?? file.thumbnailUrl;
  if (!url) return null;
  const storedThumb = file.thumbnailUrl ?? url;
  const thumbIsPrivate =
    storedThumb.includes("/api/spaces/s3-file") || storedThumb.includes(".amazonaws.com");
  const sourceRaw = meta.source;
  const source =
    sourceRaw && typeof sourceRaw === "object" && !Array.isArray(sourceRaw)
      ? (sourceRaw as PopulateExportProvenance)
      : undefined;
  return {
    exportId: file.id,
    name: file.name,
    matchId: String(meta.matchId ?? share.matchId),
    matchLabel: String(meta.matchLabel ?? share.matchLabel),
    createdAt: file.createdAt,
    viewUrl: url,
    thumbUrl: thumbIsPrivate ? url : storedThumb,
    source,
  };
}
