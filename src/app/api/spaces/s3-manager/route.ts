import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { readJsonStore } from "@/lib/json-persistence";
import { collectS3KeysFromProjectSpaces } from "@/lib/s3-media-hydrate";
import {
  readAllDdbProjects as readAllDdbProjectsStore,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const KNOWLEDGE_PREFIX = "knowledge-files/";
const LIST_MAX_KEYS = 1000;

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

type S3FileItem = {
  key: string;
  name: string;
  folder: string;
  type: string;
  size: number;
  lastModified: string | null;
  spaceId: string | null;
  projectIds: string[];
  projectNames: string[];
  orphan: boolean;
};

function getTypeFromKey(key: string): string {
  const filename = key.split("/").pop() || key;
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "unknown";
  return filename.slice(idx + 1).toLowerCase();
}

function getSpaceIdFromKey(key: string): string | null {
  const m = key.match(/^knowledge-files\/spaces\/([^/]+)\//);
  return m?.[1] ?? null;
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isAdminUser(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((s) => normalizeOwnerEmail(s))
    .filter(Boolean);
  if (configured.length === 0) return process.env.NODE_ENV !== "production";
  return configured.includes(email);
}

function devBypassAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return req.headers.get("x-foldder-dev-passcode") === "6666";
}

async function requireAdminUser(req: NextRequest): Promise<
  { ok: true; email: string } | { ok: false; response: NextResponse }
> {
  if (devBypassAllowed(req)) return { ok: true, email: "dev-bypass@local.foldder" };
  const session = await auth();
  const email = normalizeOwnerEmail(session?.user?.email);
  if (!email) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminUser(email)) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, email };
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

async function readProjects(): Promise<ProjectRecord[]> {
  if (isSpacesDdbEnabled()) {
    return readAllDdbProjectsStore(spacesTableName());
  }
  return readJsonStore(spacesStore);
}

async function listAllKnowledgeObjects(): Promise<
  Array<{ key: string; size: number; lastModified: string | null }>
> {
  const out: Array<{ key: string; size: number; lastModified: string | null }> =
    [];
  let token: string | undefined;

  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: KNOWLEDGE_PREFIX,
        ContinuationToken: token,
        MaxKeys: LIST_MAX_KEYS,
      }),
    );

    for (const row of res.Contents ?? []) {
      if (!row.Key) continue;
      out.push({
        key: row.Key,
        size: Number(row.Size ?? 0),
        lastModified: row.LastModified ? row.LastModified.toISOString() : null,
      });
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

export async function GET(req: NextRequest) {
  try {
    const adminState = await requireAdminUser(req);
    if (!adminState.ok) return adminState.response;

    const [projects, s3Objects] = await Promise.all([
      readProjects(),
      listAllKnowledgeObjects(),
    ]);
    const ownedProjects = projects;

    const projectNameById = new Map<string, string>();
    const projectIdsBySpaceId = new Map<string, Set<string>>();
    const projectIdsByReferencedKey = new Map<string, Set<string>>();

    for (const project of ownedProjects) {
      projectNameById.set(project.id, project.name);

      for (const spaceId of Object.keys(project.spaces || {})) {
        if (!spaceId || spaceId === "root") continue;
        const bucket = projectIdsBySpaceId.get(spaceId) ?? new Set<string>();
        bucket.add(project.id);
        projectIdsBySpaceId.set(spaceId, bucket);
      }

      for (const key of collectS3KeysFromProjectSpaces(project.spaces || {})) {
        const bucket = projectIdsByReferencedKey.get(key) ?? new Set<string>();
        bucket.add(project.id);
        projectIdsByReferencedKey.set(key, bucket);
      }
    }

    const filesRaw: S3FileItem[] = s3Objects.map((row) => {
      const ids = new Set<string>(projectIdsByReferencedKey.get(row.key) ?? []);
      const spaceId = getSpaceIdFromKey(row.key);
      if (spaceId && spaceId !== "orphan") {
        for (const pid of projectIdsBySpaceId.get(spaceId) ?? []) {
          ids.add(pid);
        }
      }

      const projectIds = [...ids];
      const projectNames = projectIds.map(
        (pid) => projectNameById.get(pid) || pid,
      );

      return {
        key: row.key,
        name: row.key.split("/").pop() || row.key,
        folder: row.key.includes("/")
          ? row.key.slice(0, row.key.lastIndexOf("/"))
          : "(raíz)",
        type: getTypeFromKey(row.key),
        size: row.size,
        lastModified: row.lastModified,
        spaceId,
        projectIds,
        projectNames,
        orphan: projectIds.length === 0,
      };
    });
    const files = filesRaw;

    const projectItems = ownedProjects.map((project) => {
      let fileCount = 0;
      let totalBytes = 0;
      for (const file of files) {
        if (file.projectIds.includes(project.id)) {
          fileCount += 1;
          totalBytes += file.size;
        }
      }
      return {
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        fileCount,
        totalBytes,
      };
    });

    const orphanFiles = files.filter((f) => f.orphan);
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const orphanBytes = orphanFiles.reduce((acc, f) => acc + f.size, 0);

    return NextResponse.json({
      files,
      projects: projectItems,
      summary: {
        totalFiles: files.length,
        totalBytes,
        orphanFiles: orphanFiles.length,
        orphanBytes,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[s3-manager][GET] failed:", error);
    return NextResponse.json(
      { error: "Failed to build S3 inventory" },
      { status: 500 },
    );
  }
}
