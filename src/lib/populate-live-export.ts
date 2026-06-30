import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createProjectExportFile,
  getProjectFilesFromMetadata,
  setProjectFilesInMetadata,
  upsertProjectExportByS3Key,
  type ProjectFile,
} from "@/app/spaces/project-files";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { readJsonStore, updateJsonStore } from "@/lib/json-persistence";
import type { PopulateShareRecord } from "@/lib/populate-share-types";
import { normalizePopulateShareRecord } from "@/lib/populate-share-types";
import { runSpacesDbExclusive } from "@/lib/spaces-db-queue";
import {
  buildProjectMediaObjectKey,
  projectBelongsToOwnerEmail,
} from "@/lib/spaces-access-control";
import {
  readDdbProjectById,
  upsertDdbProject,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import {
  readSpacesV2ProjectById,
  upsertSpacesV2Project,
} from "@/lib/spaces-v2-store";
import { getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";
import type { PopulateExportProvenance, PopulateGalleryItem } from "@/lib/populate-live-export-types";
import { exportMatchesShare, projectFileToGalleryItem } from "@/lib/populate-gallery-utils";

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

const DATA_URL_RE = /^data:(image\/[^;,]+)(?:;[^,]*)?;base64,(.+)$/i;

function isSpacesV2Enabled(): boolean {
  return isDynamoEnabled(SPACES_V2_DDB_TABLE_ENV);
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

function spacesV2TableName(): string {
  return process.env[SPACES_V2_DDB_TABLE_ENV]?.trim() || "";
}

function parseImageDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } | null {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return null;
  const contentType = match[1]!.toLowerCase();
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "png";
  return { buffer: Buffer.from(match[2]!, "base64"), contentType, ext };
}

function stableUrlForS3Key(key: string): string {
  return `/api/spaces/s3-file?key=${encodeURIComponent(key)}`;
}

async function readProjectById(projectId: string): Promise<ProjectRecord | null> {
  if (isSpacesV2Enabled()) {
    return readSpacesV2ProjectById(spacesV2TableName(), projectId);
  }
  if (isSpacesDdbEnabled()) {
    return readDdbProjectById(spacesTableName(), projectId);
  }
  const rows = await readJsonStore(spacesStore);
  return rows.find((row) => row.id === projectId) ?? null;
}

async function writeProjectRecord(project: ProjectRecord): Promise<void> {
  const now = new Date().toISOString();
  const next: ProjectRecord = { ...project, updatedAt: now };
  if (isSpacesV2Enabled()) {
    await upsertSpacesV2Project(spacesV2TableName(), next);
    return;
  }
  if (isSpacesDdbEnabled()) {
    await upsertDdbProject(spacesTableName(), next);
    return;
  }
  await updateJsonStore(spacesStore, async (rows) => {
    const i = rows.findIndex((r) => r.id === next.id);
    if (i >= 0) {
      const copy = [...rows];
      copy[i] = next;
      return copy;
    }
    return [next, ...rows];
  });
}

async function presignIfNeeded(url: string | undefined, s3Key: string | undefined): Promise<string | undefined> {
  if (!s3Key) return url;
  try {
    return await getPresignedUrl(s3Key);
  } catch {
    return url;
  }
}

export async function listPopulateGalleryItems(share: PopulateShareRecord): Promise<PopulateGalleryItem[]> {
  const normalized = normalizePopulateShareRecord(share);
  if (!normalized.projectId) return [];

  const project = await readProjectById(normalized.projectId);
  if (!project) return [];

  const files = getProjectFilesFromMetadata(project.metadata ?? {})
    .items.filter((f) => exportMatchesShare(f, normalized))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  const items: PopulateGalleryItem[] = [];
  for (const file of files) {
    const s3Key = typeof file.metadata?.s3Key === "string" ? file.metadata.s3Key : undefined;
    const viewUrl = await presignIfNeeded(file.fileUrl, s3Key);
    const item = projectFileToGalleryItem(file, normalized, viewUrl);
    if (item) items.push(item);
  }
  return items;
}

export async function emitPopulateLiveExport(args: {
  share: PopulateShareRecord;
  dataUrl: string;
  provenance: PopulateExportProvenance;
}): Promise<PopulateGalleryItem> {
  const share = normalizePopulateShareRecord(args.share);
  const projectId = share.projectId?.trim();
  if (!projectId) {
    throw new Error("Este enlace no está ligado a un proyecto guardado.");
  }

  const parsed = parseImageDataUrl(args.dataUrl);
  if (!parsed) {
    throw new Error("Formato de imagen no válido.");
  }

  const pageKey =
    args.provenance.pageId?.trim() ||
    (typeof args.provenance.slideIndex === "number"
      ? `slide_${args.provenance.slideIndex}`
      : randomUUID().slice(0, 8));
  const mediaId = `pop_${share.matchId}_${args.provenance.templateNodeId}_${pageKey}`;
  const s3Key = buildProjectMediaObjectKey({
    userEmail: share.ownerEmail,
    projectId,
    mediaId,
    contentExt: parsed.ext,
  });
  const stableUrl = stableUrlForS3Key(s3Key);
  const extension = `.${parsed.ext}`;
  const slideSuffix =
    typeof args.provenance.slideIndex === "number" ? ` · slide ${args.provenance.slideIndex + 1}` : "";
  const templateLabel = args.provenance.templateLabel?.trim() || "Plantilla";
  const exportName = `${share.matchLabel} · ${templateLabel}${slideSuffix}${extension}`;

  let exportFile!: ProjectFile;
  await runSpacesDbExclusive(async () => {
    const project = await readProjectById(projectId);
    if (!project) {
      throw new Error("Proyecto no encontrado.");
    }
    if (!projectBelongsToOwnerEmail(project, share.ownerEmail)) {
      throw new Error("El proyecto no pertenece al propietario del enlace.");
    }

    const existingFiles = getProjectFilesFromMetadata(project.metadata ?? {});
    const existing = existingFiles.items.find(
      (file) => file.kind === "export" && file.metadata?.s3Key === s3Key,
    );
    const now = new Date().toISOString();
    const metadata = {
      s3Key,
      matchId: share.matchId,
      matchLabel: share.matchLabel,
      populateShareToken: share.token,
      projectId,
      source: args.provenance,
      createdVia: "populate-share-export",
    };

    exportFile = existing
      ? {
          ...existing,
          name: exportName,
          extension,
          fileUrl: stableUrl,
          thumbnailUrl: stableUrl,
          mimeType: parsed.contentType,
          updatedAt: now,
          metadata: { ...existing.metadata, ...metadata },
        }
      : createProjectExportFile({
          name: exportName,
          extension,
          sourceNodeId: share.populateNodeId,
          fileUrl: stableUrl,
          thumbnailUrl: stableUrl,
          mimeType: parsed.contentType,
          exportedFrom: "populate-live",
          exportFormat: parsed.ext,
          metadata,
        });

    const nextFiles = upsertProjectExportByS3Key(project.metadata ?? {}, exportFile, s3Key);
    const nextMetadata = setProjectFilesInMetadata(project.metadata ?? {}, nextFiles);
    await writeProjectRecord({ ...project, metadata: nextMetadata });
  });

  await uploadBufferToS3Key(s3Key, parsed.buffer, parsed.contentType);

  const viewUrl = await presignIfNeeded(stableUrl, s3Key);
  const item = projectFileToGalleryItem(exportFile, share, viewUrl);
  if (!item) {
    throw new Error("No se pudo registrar la exportación.");
  }
  return item;
}
