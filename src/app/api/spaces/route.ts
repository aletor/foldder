import path from "path";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { updateJsonStore, readJsonStore } from "@/lib/json-persistence";
import { listGlobalDatasets } from "@/lib/dataset-store";
import { planProjectS3Deletes } from "@/lib/project-s3-delete-plan";
import { deleteFromS3 } from "@/lib/s3-utils";
import {
  deleteDdbProject as deleteDdbProjectStore,
  readAllDdbProjects as readAllDdbProjectsStore,
  readAllDdbProjectsMeta as readAllDdbProjectsMetaStore,
  readDdbProjectById as readDdbProjectByIdStore,
  SpacesRevisionConflictError,
  upsertDdbProject as upsertDdbProjectStore,
  type ProjectListItem,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import {
  deleteSpacesV2Project,
  SpacesV2IntegrityError,
  readSpacesV2ProjectById,
  readSpacesV2ProjectMetaById,
  readSpacesV2ProjectsForOwner,
  readSpacesV2ProjectsMetaForOwner,
  SpacesV2RevisionConflictError,
  upsertSpacesV2Project,
} from "@/lib/spaces-v2-store";
import { runSpacesDbExclusive } from "@/lib/spaces-db-queue";
import { auth } from "@/lib/auth";
import {
  recordSpacesSaveTelemetry,
  spacesTelemetryOwnerHash,
  summarizeSpacesProjectPayload,
  type SpacesProjectPayloadStats,
  type SpacesSaveOperation,
  type SpacesSaveStatus,
  type SpacesWriteStoreStats,
} from "@/lib/spaces-save-telemetry";

export const runtime = "nodejs";

type SpaceNodeGraph = {
  createdAt?: string;
  edges?: unknown[];
  id: string;
  name: string;
  nodes?: unknown[];
  updatedAt?: string;
  [key: string]: unknown;
};

type ProjectBody = {
  createIfMissing?: boolean;
  expectedRevision?: number | null;
  id?: string;
  metadata?: Record<string, unknown>;
  name?: string;
  revision?: number | null;
  rootSpaceId?: string;
  spaces?: Record<string, SpaceNodeGraph>;
};

type AuthUser = {
  email: string;
  name: string | null;
  image: string | null;
};

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";
const SPACES_GET_CACHE_TTL_MS = 1500;
const AUTHENTICATED_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie, Authorization",
};
let spacesGetCache: { expiresAt: number; rows: ProjectRecord[] } | null = null;
let spacesMetaGetCache: {
  expiresAt: number;
  rows: Array<ReturnType<typeof projectToMeta>>;
} | null = null;

function jsonNoStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...AUTHENTICATED_NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isWriteLockBusyError(error: unknown): boolean {
  return errorMessage(error).includes("write lock busy");
}

function isPayloadShapeError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("invalid project") ||
    message.includes("serialization integrity") ||
    message.includes("serialization check")
  );
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function isSpacesV2Enabled(): boolean {
  return isDynamoEnabled(SPACES_V2_DDB_TABLE_ENV);
}

function isSpacesCloudStoreEnabled(): boolean {
  return isSpacesV2Enabled() || isSpacesDdbEnabled();
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

function spacesV2TableName(): string {
  return process.env[SPACES_V2_DDB_TABLE_ENV]?.trim() || "";
}

async function scanDdbProjects(ownerEmail?: string): Promise<ProjectRecord[]> {
  if (isSpacesV2Enabled()) {
    return ownerEmail ? readSpacesV2ProjectsForOwner(spacesV2TableName(), ownerEmail) : [];
  }
  return readAllDdbProjectsStore(spacesTableName(), ownerEmail);
}

async function scanDdbProjectsMeta(ownerEmail?: string) {
  if (isSpacesV2Enabled()) {
    return ownerEmail ? readSpacesV2ProjectsMetaForOwner(spacesV2TableName(), ownerEmail) : [];
  }
  return readAllDdbProjectsMetaStore(spacesTableName(), ownerEmail);
}

async function readDdbProjectById(id: string): Promise<ProjectRecord | null> {
  if (isSpacesV2Enabled()) {
    return readSpacesV2ProjectById(spacesV2TableName(), id);
  }
  return readDdbProjectByIdStore(spacesTableName(), id);
}

async function readProjectByIdResilient(id: string): Promise<ProjectRecord | null> {
  if (!isSpacesCloudStoreEnabled()) {
    return (await readProjects()).find((row) => row.id === id) ?? null;
  }

  try {
    const direct = await readDdbProjectById(id);
    if (direct) return direct;
  } catch (error) {
    if (error instanceof SpacesV2IntegrityError) throw error;
    console.error(`[spaces] direct Dynamo read failed for project ${id}:`, error);
  }

  if (isSpacesV2Enabled()) return null;

  try {
    return (await readProjects()).find((row) => row.id === id) ?? null;
  } catch (error) {
    console.error(`[spaces] fallback scan read failed for project ${id}:`, error);
    return null;
  }
}

async function writeDdbProject(
  project: ProjectRecord,
  options?: { allowProjectIdMetaScan?: boolean; expectedRevision?: number | null },
): Promise<{ revision: number; telemetry?: SpacesWriteStoreStats }> {
  if (isSpacesV2Enabled()) {
    return upsertSpacesV2Project(spacesV2TableName(), project, {
      expectedRevision: options?.expectedRevision,
    });
  }
  return upsertDdbProjectStore(spacesTableName(), project, options);
}

async function deleteDdbProject(id: string): Promise<void> {
  if (isSpacesV2Enabled()) {
    await deleteSpacesV2Project(spacesV2TableName(), id);
    return;
  }
  await deleteDdbProjectStore(spacesTableName(), id);
}

async function readProjects(ownerEmail?: string): Promise<ProjectRecord[]> {
  if (isSpacesCloudStoreEnabled()) {
    const now = Date.now();
    if (!ownerEmail && !isSpacesV2Enabled() && spacesGetCache && spacesGetCache.expiresAt > now) {
      return spacesGetCache.rows;
    }
    const rows = await scanDdbProjects(ownerEmail);
    if (!ownerEmail && !isSpacesV2Enabled()) {
      spacesGetCache = { rows, expiresAt: now + SPACES_GET_CACHE_TTL_MS };
    }
    return rows;
  }
  const rows = await readJsonStore(spacesStore);
  return ownerEmail ? rows.filter((row) => projectBelongsToOwner(row, ownerEmail)) : rows;
}

async function readProjectsMeta(ownerEmail?: string): Promise<Array<ReturnType<typeof projectToMeta>>> {
  if (isSpacesCloudStoreEnabled()) {
    const now = Date.now();
    if (!ownerEmail && !isSpacesV2Enabled() && spacesMetaGetCache && spacesMetaGetCache.expiresAt > now) {
      return spacesMetaGetCache.rows;
    }
    const rows = (await scanDdbProjectsMeta(ownerEmail)).map(projectToMeta);
    if (!ownerEmail && !isSpacesV2Enabled()) {
      spacesMetaGetCache = { rows, expiresAt: now + SPACES_GET_CACHE_TTL_MS };
    }
    return rows;
  }
  return (await readProjects(ownerEmail)).map(projectToMeta);
}

function projectToMeta(project: ProjectRecord | ProjectListItem) {
  const spacesCount =
    "spaces" in project
      ? Object.keys(project.spaces || {}).length
      : Math.max(0, project.spacesCount ?? 0);
  return {
    id: project.id,
    name: project.name,
    rootSpaceId: project.rootSpaceId,
    metadata: project.metadata ?? {},
    ownerUserEmail: project.ownerUserEmail,
    ownerUserName: project.ownerUserName,
    ownerUserImage: project.ownerUserImage,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    revision: project.revision,
    spacesCount,
  };
}

async function writeProjects(
  updater: (projects: ProjectRecord[]) => Promise<ProjectRecord[]> | ProjectRecord[],
): Promise<ProjectRecord[]> {
  if (isSpacesCloudStoreEnabled()) {
    throw new Error("writeProjects is not supported with cloud persistence enabled");
  }
  return updateJsonStore(spacesStore, updater);
}

function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function projectBelongsToOwner(
  project: Pick<ProjectRecord, "ownerUserEmail">,
  ownerEmail: string,
): boolean {
  return normalizeOwnerEmail(project.ownerUserEmail) === ownerEmail;
}

async function deleteProjectS3Media(args: {
  ownerEmail: string;
  ownerProjects: ProjectRecord[];
  projectToDelete: ProjectRecord;
}): Promise<{ failed: number; requested: number; retained: number; succeeded: number }> {
  const globalDatasets = await listGlobalDatasets(args.ownerEmail);
  const { deleteKeys, retainedKeys } = planProjectS3Deletes({
    globalDatasets,
    otherProjects: args.ownerProjects,
    projectToDelete: args.projectToDelete,
  });
  if (retainedKeys.length > 0) {
    console.log(
      `[Cleanup] Skipping ${retainedKeys.length} S3 object(s) still referenced by other projects or global datasets.`,
    );
  }
  let succeeded = 0;
  let failed = 0;
  for (const key of deleteKeys) {
    try {
      await deleteFromS3(key);
      succeeded += 1;
      console.log(`[Cleanup] Successfully removed: ${key}`);
    } catch (error) {
      failed += 1;
      console.error(`[Cleanup] Failed to remove ${key}:`, error);
    }
  }
  return {
    failed,
    requested: deleteKeys.length,
    retained: retainedKeys.length,
    succeeded,
  };
}

async function recordProjectRouteTelemetry(args: {
  actualRevision?: number | null;
  errorCode?: string;
  errorMessage?: string;
  expectedRevision?: number | null;
  operation: SpacesSaveOperation;
  ownerEmail?: string;
  projectId?: string;
  route: string;
  s3DeleteFailed?: number;
  s3DeleteRequested?: number;
  s3DeleteSucceeded?: number;
  startedAt: number;
  stats?: SpacesProjectPayloadStats;
  status: SpacesSaveStatus;
  storeStats?: SpacesWriteStoreStats;
}) {
  await recordSpacesSaveTelemetry({
    actualRevision: args.actualRevision,
    chunkCount: args.storeStats?.chunkCount,
    chunksWriteMs: args.storeStats?.chunksWriteMs,
    contentSha256: args.storeStats?.contentSha256,
    cleanupMs: args.storeStats?.cleanupMs,
    durationMs: Date.now() - args.startedAt,
    edgeCount: args.stats?.edgeCount,
    errorCode: args.errorCode,
    errorMessage: args.errorMessage,
    expectedRevision: args.expectedRevision,
    mediaRefsWriteMs: args.storeStats?.mediaRefsWriteMs,
    mediaKeyCount: args.storeStats?.mediaKeyCount ?? args.stats?.mediaKeyCount,
    metaWriteMs: args.storeStats?.metaWriteMs,
    metadataBytes: args.stats?.metadataBytes,
    nodeCount: args.stats?.nodeCount,
    operation: args.operation,
    ownerHash: spacesTelemetryOwnerHash(args.ownerEmail),
    payloadBytes: args.storeStats?.payloadBytes ?? args.stats?.payloadBytes,
    projectId: args.projectId,
    route: args.route,
    s3DeleteFailed: args.s3DeleteFailed,
    s3DeleteRequested: args.s3DeleteRequested,
    s3DeleteSucceeded: args.s3DeleteSucceeded,
    spaceCount: args.stats?.spaceCount,
    status: args.status,
    storageFormat: args.storeStats?.storageFormat,
  });
}

function saveStatusForError(error: unknown): SpacesSaveStatus {
  if (error instanceof SpacesRevisionConflictError || error instanceof SpacesV2RevisionConflictError) {
    return "conflict";
  }
  if (error instanceof SpacesV2IntegrityError) return "error";
  if (isPayloadShapeError(error)) return "rejected";
  return "error";
}

function saveCodeForError(error: unknown): string {
  if (error instanceof SpacesRevisionConflictError || error instanceof SpacesV2RevisionConflictError) return "REVISION_CONFLICT";
  if (error instanceof SpacesV2IntegrityError) return `PROJECT_DATA_INTEGRITY_${error.code}`;
  if (isWriteLockBusyError(error)) return "SAVE_LOCK_BUSY";
  if (isPayloadShapeError(error)) return "INVALID_PROJECT_PAYLOAD";
  return (error as { name?: string } | null)?.name || "SAVE_FAILED";
}

function devBypassUserFromRequest(req: Request): AuthUser | null {
  if (process.env.NODE_ENV === "production") return null;
  const code = req.headers.get("x-foldder-dev-passcode");
  if (code !== "6666") return null;
  return {
    email: "dev-bypass@local.foldder",
    name: "Local Bypass",
    image: null,
  };
}

async function requireAuthUser(req: Request): Promise<
  { ok: true; user: AuthUser } | { ok: false; response: NextResponse }
> {
  const bypass = devBypassUserFromRequest(req);
  if (bypass) {
    return { ok: true, user: bypass };
  }
  const session = await auth();
  const email = normalizeOwnerEmail(session?.user?.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    user: {
      email,
      name: session?.user?.name ?? null,
      image: session?.user?.image ?? null,
    },
  };
}

export async function GET(req: Request) {
  try {
    const authState = await requireAuthUser(req);
    if (!authState.ok) return authState.response;
    const ownerEmail = authState.user.email;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const wantsFull = searchParams.get("full") === "1";
    const wantsMeta = searchParams.get("meta") === "1";
    const limitRaw = Number(searchParams.get("limit") ?? "");
    const cursor = searchParams.get("cursor");

    if (id && id.length > 0) {
      const project = await readProjectByIdResilient(id);
      if (!project || !projectBelongsToOwner(project, ownerEmail)) {
        return jsonNoStore({ error: "Project not found" }, { status: 404 });
      }
      return jsonNoStore(project);
    }

    if (wantsFull && !wantsMeta) {
      const rows = await readProjects(ownerEmail);
      return jsonNoStore(rows);
    }

    const meta = (await readProjectsMeta(ownerEmail))
      .filter((p) => projectBelongsToOwner(p, ownerEmail))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (Number.isFinite(limitRaw) && limitRaw > 0) {
      const cursorIdx = cursor ? meta.findIndex((row) => row.id === cursor) : -1;
      const start = cursorIdx >= 0 ? cursorIdx + 1 : 0;
      const items = meta.slice(start, start + limitRaw);
      const nextCursor = items.length === limitRaw ? items[items.length - 1]?.id ?? null : null;
      return jsonNoStore({ items, nextCursor });
    }
    return jsonNoStore(meta);
  } catch (error) {
    if (error instanceof SpacesV2IntegrityError) {
      console.error("[spaces][GET] integrity failed:", error);
      return jsonNoStore(
        {
          error: "Project data integrity check failed.",
          code: "PROJECT_DATA_INTEGRITY_ERROR",
          detail: error.code,
          retryable: false,
        },
        { status: 500 },
      );
    }
    console.error("[spaces][GET] failed:", error);
    return jsonNoStore({ error: "Failed to read projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let telemetryOwnerEmail = "";
  let telemetryProjectId: string | undefined;
  let telemetryExpectedRevision: number | null | undefined;
  let telemetryOperation: SpacesSaveOperation = "unknown";
  let telemetryStats: SpacesProjectPayloadStats | undefined;
  try {
    const authState = await requireAuthUser(req);
    if (!authState.ok) return authState.response;
    const ownerEmail = authState.user.email;
    telemetryOwnerEmail = ownerEmail;
    const ownerName = authState.user.name;
    const ownerImage = authState.user.image;

    const body = (await req.json()) as ProjectBody;
    telemetryProjectId = body.id;
    telemetryStats = summarizeSpacesProjectPayload(body);

    if (isSpacesCloudStoreEnabled()) {
      const { id, name, rootSpaceId, spaces, metadata } = body;
      const expectedRevision =
        typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
          ? body.expectedRevision
          : typeof body.revision === "number" && Number.isFinite(body.revision)
            ? body.revision
            : null;
      telemetryExpectedRevision = expectedRevision;
      if (id) {
        let existing: ProjectRecord | null = null;
        let corruptedExistingMeta: ProjectListItem | null = null;
        try {
          existing = await readProjectByIdResilient(id);
        } catch (error) {
          if (error instanceof SpacesV2IntegrityError && isSpacesV2Enabled()) {
            const metaOnly = await readSpacesV2ProjectMetaById(spacesV2TableName(), id);
            if (metaOnly && projectBelongsToOwner(metaOnly, ownerEmail)) {
              corruptedExistingMeta = metaOnly;
              console.warn(
                `[spaces][POST] repairing project ${id} from client payload after ${error.code}.`,
              );
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }

        if (!existing && !corruptedExistingMeta && body.createIfMissing === true) {
          telemetryOperation = "create_if_missing";
          const timestamp = new Date().toISOString();
          const resolvedRoot =
            rootSpaceId != null && rootSpaceId !== ""
              ? rootSpaceId
              : spaces && typeof spaces === "object" && "root" in spaces
                ? "root"
                : "root";
          const newProject: ProjectRecord = {
            id,
            name: name || "New Project",
            rootSpaceId: resolvedRoot,
            spaces:
              spaces || {
                [resolvedRoot]: {
                  id: resolvedRoot,
                  name: "Main Space",
                  nodes: [],
                  edges: [],
                  createdAt: timestamp,
                  updatedAt: timestamp,
                },
              },
            metadata: metadata ?? {},
            ownerUserEmail: ownerEmail,
            ownerUserName: ownerName,
            ownerUserImage: ownerImage,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          const writeResult = await writeDdbProject(newProject, {
            allowProjectIdMetaScan: false,
            expectedRevision: 0,
          });
          newProject.revision = writeResult.revision;
          spacesGetCache = null;
          spacesMetaGetCache = null;
          await recordProjectRouteTelemetry({
            actualRevision: writeResult.revision,
            expectedRevision: 0,
            operation: telemetryOperation,
            ownerEmail,
            projectId: newProject.id,
            route: "/api/spaces",
            startedAt,
            stats: summarizeSpacesProjectPayload(newProject),
            status: "ok",
            storeStats: writeResult.telemetry,
          });
          return jsonNoStore(newProject);
        }
        const existingMeta = existing ?? corruptedExistingMeta;
        if (!existingMeta || !projectBelongsToOwner(existingMeta, ownerEmail)) {
          telemetryOperation = "save";
          await recordProjectRouteTelemetry({
            errorCode: "PROJECT_NOT_FOUND",
            errorMessage: "Project not found",
            expectedRevision,
            operation: telemetryOperation,
            ownerEmail,
            projectId: id,
            route: "/api/spaces",
            startedAt,
            stats: telemetryStats,
            status: "rejected",
          });
          return jsonNoStore({ error: "Project not found" }, { status: 404 });
        }
        if (!existing && corruptedExistingMeta && !spaces) {
          telemetryOperation = "save";
          await recordProjectRouteTelemetry({
            errorCode: "PROJECT_DATA_INTEGRITY_ERROR",
            errorMessage: "Cannot repair corrupted project without a full spaces payload.",
            expectedRevision,
            operation: telemetryOperation,
            ownerEmail,
            projectId: id,
            route: "/api/spaces",
            startedAt,
            stats: telemetryStats,
            status: "rejected",
          });
          return jsonNoStore(
            {
              error: "Project data integrity check failed. Reload or contact support before saving.",
              code: "PROJECT_DATA_INTEGRITY_ERROR",
              detail: "MISSING_REPAIR_PAYLOAD",
              retryable: false,
            },
            { status: 500 },
          );
        }

        telemetryOperation = "save";
        const savedProject: ProjectRecord = {
          id: existingMeta.id,
          name: name || existingMeta.name,
          rootSpaceId: rootSpaceId || existingMeta.rootSpaceId,
          spaces: spaces || existing?.spaces || {},
          metadata: metadata || existingMeta.metadata,
          ownerUserEmail: existingMeta.ownerUserEmail || ownerEmail,
          ownerUserName: ownerName,
          ownerUserImage: ownerImage,
          createdAt: existingMeta.createdAt,
          updatedAt: new Date().toISOString(),
        };
        const writeExpectedRevision =
          corruptedExistingMeta && typeof corruptedExistingMeta.revision === "number"
            ? corruptedExistingMeta.revision
            : expectedRevision;
        const writeResult = await writeDdbProject(savedProject, { expectedRevision: writeExpectedRevision });
        savedProject.revision = writeResult.revision;
        spacesGetCache = null;
        spacesMetaGetCache = null;
        await recordProjectRouteTelemetry({
          actualRevision: writeResult.revision,
          expectedRevision: writeExpectedRevision,
          operation: telemetryOperation,
          ownerEmail,
          projectId: savedProject.id,
          route: "/api/spaces",
          startedAt,
          stats: summarizeSpacesProjectPayload(savedProject),
          status: "ok",
          storeStats: writeResult.telemetry,
        });
        return jsonNoStore(savedProject);
      }

      telemetryOperation = "create";
      const projectId = uuidv4();
      telemetryProjectId = projectId;
      telemetryExpectedRevision = 0;
      const initialSpaceId = uuidv4();
      const resolvedRoot =
        rootSpaceId != null && rootSpaceId !== ""
          ? rootSpaceId
          : spaces && typeof spaces === "object" && "root" in spaces
            ? "root"
            : initialSpaceId;

      const timestamp = new Date().toISOString();
      const newProject: ProjectRecord = {
        id: projectId,
        name: name || "New Project",
        rootSpaceId: resolvedRoot,
        spaces:
          spaces || {
            [initialSpaceId]: {
              id: initialSpaceId,
              name: "Main Space",
              nodes: [],
              edges: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        metadata: metadata ?? {},
        ownerUserEmail: ownerEmail,
        ownerUserName: ownerName,
        ownerUserImage: ownerImage,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const writeResult = await writeDdbProject(newProject, {
        allowProjectIdMetaScan: false,
        expectedRevision: 0,
      });
      newProject.revision = writeResult.revision;
      spacesGetCache = null;
      spacesMetaGetCache = null;
      await recordProjectRouteTelemetry({
        actualRevision: writeResult.revision,
        expectedRevision: 0,
        operation: telemetryOperation,
        ownerEmail,
        projectId: newProject.id,
        route: "/api/spaces",
        startedAt,
        stats: summarizeSpacesProjectPayload(newProject),
        status: "ok",
        storeStats: writeResult.telemetry,
      });
      return jsonNoStore(newProject);
    }

    return await runSpacesDbExclusive(async () => {
      let projectFound = true;
      let savedProject: ProjectRecord | null = null;
      const projects = await writeProjects((currentProjects) => {
        const projectsCopy = [...currentProjects];
        const { id, name, rootSpaceId, spaces, metadata } = body;

        if (id) {
          telemetryProjectId = id;
          const index = projectsCopy.findIndex((project) => project.id === id);
          if (index === -1 || !projectBelongsToOwner(projectsCopy[index], ownerEmail)) {
            if (index === -1 && body.createIfMissing === true) {
              telemetryOperation = "create_if_missing";
              telemetryExpectedRevision = 0;
              const resolvedRoot =
                rootSpaceId != null && rootSpaceId !== ""
                  ? rootSpaceId
                  : spaces && typeof spaces === "object" && "root" in spaces
                    ? "root"
                    : "root";
              const timestamp = new Date().toISOString();
              const newProject: ProjectRecord = {
                id,
                name: name || "New Project",
                rootSpaceId: resolvedRoot,
                spaces:
                  spaces || {
                    [resolvedRoot]: {
                      id: resolvedRoot,
                      name: "Main Space",
                      nodes: [],
                      edges: [],
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    },
                  },
                metadata: metadata ?? {},
                ownerUserEmail: ownerEmail,
                ownerUserName: ownerName,
                ownerUserImage: ownerImage,
                revision: 1,
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              projectsCopy.push(newProject);
              savedProject = newProject;
              return projectsCopy;
            }
            projectFound = false;
            return projectsCopy;
          }

          telemetryOperation = "save";
          const previousRevision =
            typeof projectsCopy[index].revision === "number" && Number.isFinite(projectsCopy[index].revision)
              ? projectsCopy[index].revision
              : 0;
          const expectedRevision =
            typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
              ? body.expectedRevision
              : typeof body.revision === "number" && Number.isFinite(body.revision)
                ? body.revision
                : null;
          telemetryExpectedRevision = expectedRevision;
          if (expectedRevision !== null && expectedRevision !== previousRevision) {
            throw new SpacesRevisionConflictError(id, expectedRevision, previousRevision);
          }

          projectsCopy[index] = {
            ...projectsCopy[index],
            name: name || projectsCopy[index].name,
            rootSpaceId: rootSpaceId || projectsCopy[index].rootSpaceId,
            spaces: spaces || projectsCopy[index].spaces,
            metadata: metadata || projectsCopy[index].metadata,
            ownerUserEmail: projectsCopy[index].ownerUserEmail || ownerEmail,
            ownerUserName: ownerName,
            ownerUserImage: ownerImage,
            revision: previousRevision + 1,
            updatedAt: new Date().toISOString(),
          };
          savedProject = projectsCopy[index];
          return projectsCopy;
        }

        telemetryOperation = "create";
        const projectId = uuidv4();
        telemetryProjectId = projectId;
        telemetryExpectedRevision = 0;
        const initialSpaceId = uuidv4();
        const resolvedRoot =
          rootSpaceId != null && rootSpaceId !== ""
            ? rootSpaceId
            : spaces && typeof spaces === "object" && "root" in spaces
              ? "root"
              : initialSpaceId;

        const timestamp = new Date().toISOString();
        const myProjectsCount = projectsCopy.filter((p) =>
          projectBelongsToOwner(p, ownerEmail),
        ).length;
        const newProject: ProjectRecord = {
          id: projectId,
          name: name || `New Project ${myProjectsCount + 1}`,
          rootSpaceId: resolvedRoot,
          spaces:
            spaces || {
              [initialSpaceId]: {
                id: initialSpaceId,
                name: "Main Space",
                nodes: [],
                edges: [],
                createdAt: timestamp,
                updatedAt: timestamp,
              },
          },
          metadata: metadata ?? {},
          ownerUserEmail: ownerEmail,
          ownerUserName: ownerName,
          ownerUserImage: ownerImage,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        projectsCopy.push(newProject);
        savedProject = newProject;
        return projectsCopy;
      });

      if (!projectFound) {
        await recordProjectRouteTelemetry({
          errorCode: "PROJECT_NOT_FOUND",
          errorMessage: "Project not found",
          expectedRevision: telemetryExpectedRevision,
          operation: telemetryOperation === "unknown" ? "save" : telemetryOperation,
          ownerEmail,
          projectId: telemetryProjectId,
          route: "/api/spaces",
          startedAt,
          stats: telemetryStats,
          status: "rejected",
        });
        return jsonNoStore({ error: "Project not found" }, { status: 404 });
      }

      spacesGetCache = null;
      spacesMetaGetCache = null;
      const fallback = projects[projects.length - 1] ?? null;
      const returnedProject = savedProject ?? fallback;
      if (returnedProject) {
        await recordProjectRouteTelemetry({
          actualRevision: returnedProject.revision ?? null,
          expectedRevision: telemetryExpectedRevision,
          operation: telemetryOperation,
          ownerEmail,
          projectId: returnedProject.id,
          route: "/api/spaces",
          startedAt,
          stats: summarizeSpacesProjectPayload(returnedProject),
          status: "ok",
        });
      }
      return jsonNoStore(savedProject ?? fallback);
    });
  } catch (error) {
    await recordProjectRouteTelemetry({
      errorCode: saveCodeForError(error),
      errorMessage: errorMessage(error),
      expectedRevision: telemetryExpectedRevision,
      operation: telemetryOperation,
      ownerEmail: telemetryOwnerEmail,
      projectId: telemetryProjectId,
      route: "/api/spaces",
      startedAt,
      stats: telemetryStats,
      status: saveStatusForError(error),
    });
    if (error instanceof SpacesRevisionConflictError || error instanceof SpacesV2RevisionConflictError) {
      return jsonNoStore(
        {
          error:
            "Project changed on another device. Reload the project before saving again.",
          conflict: true,
          actualRevision: error.actualRevision,
        },
        { status: 409 },
      );
    }
    if (error instanceof SpacesV2IntegrityError) {
      return jsonNoStore(
        {
          error: "Project data integrity check failed. Reload or contact support before saving.",
          code: "PROJECT_DATA_INTEGRITY_ERROR",
          detail: error.code,
          retryable: false,
        },
        { status: 500 },
      );
    }
    if (isWriteLockBusyError(error)) {
      return jsonNoStore(
        {
          error: "Project is already saving. Try again in a few seconds.",
          retryable: true,
          code: "SAVE_LOCK_BUSY",
        },
        { status: 423 },
      );
    }
    if (isPayloadShapeError(error)) {
      return jsonNoStore(
        {
          error: "Project payload is not valid for saving.",
          code: "INVALID_PROJECT_PAYLOAD",
        },
        { status: 400 },
      );
    }
    console.error("Save error:", error);
    return jsonNoStore(
      {
        error: "Failed to save project",
        code: "SAVE_FAILED",
        retryable: true,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  let telemetryOwnerEmail = "";
  let telemetryProjectId: string | undefined;
  let telemetryStats: SpacesProjectPayloadStats | undefined;
  let s3DeleteRequested = 0;
  let s3DeleteSucceeded = 0;
  let s3DeleteFailed = 0;
  try {
    const authState = await requireAuthUser(req);
    if (!authState.ok) return authState.response;
    const ownerEmail = authState.user.email;
    telemetryOwnerEmail = ownerEmail;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    telemetryProjectId = id ?? undefined;
    if (!id || id.length === 0) return jsonNoStore({ error: "ID required" }, { status: 400 });

    if (isSpacesCloudStoreEnabled()) {
      const projectToDelete = await readProjectByIdResilient(id);
      if (!projectToDelete || !projectBelongsToOwner(projectToDelete, ownerEmail)) {
        await recordProjectRouteTelemetry({
          errorCode: "PROJECT_NOT_FOUND",
          errorMessage: "Project not found",
          operation: "delete_project",
          ownerEmail,
          projectId: id,
          route: "/api/spaces",
          startedAt,
          status: "rejected",
        });
        return jsonNoStore({ error: "Project not found" }, { status: 404 });
      }
      if (projectToDelete) {
        telemetryStats = summarizeSpacesProjectPayload(projectToDelete);
        const ownerProjects = await readProjects(ownerEmail);
        const s3Result = await deleteProjectS3Media({
          ownerEmail,
          ownerProjects,
          projectToDelete,
        });
        s3DeleteRequested = s3Result.requested;
        s3DeleteSucceeded = s3Result.succeeded;
        s3DeleteFailed = s3Result.failed;
      }

      await deleteDdbProject(id);
      spacesGetCache = null;
      spacesMetaGetCache = null;
      await recordProjectRouteTelemetry({
        operation: "delete_project",
        ownerEmail,
        projectId: id,
        route: "/api/spaces",
        s3DeleteFailed,
        s3DeleteRequested,
        s3DeleteSucceeded,
        startedAt,
        stats: telemetryStats,
        status: "ok",
      });
      return jsonNoStore({ ok: true, id });
    }

    return await runSpacesDbExclusive(async () => {
      const projects = await readProjects();
      const projectToDelete = projects.find((project) => project.id === id);

      if (!projectToDelete || !projectBelongsToOwner(projectToDelete, ownerEmail)) {
        await recordProjectRouteTelemetry({
          errorCode: "PROJECT_NOT_FOUND",
          errorMessage: "Project not found",
          operation: "delete_project",
          ownerEmail,
          projectId: id,
          route: "/api/spaces",
          startedAt,
          status: "rejected",
        });
        return jsonNoStore({ error: "Project not found" }, { status: 404 });
      }
      if (projectToDelete) {
        telemetryStats = summarizeSpacesProjectPayload(projectToDelete);
        console.log(`[Cleanup] Deleting project "${projectToDelete.name}"...`);
        const s3Result = await deleteProjectS3Media({
          ownerEmail,
          ownerProjects: projects,
          projectToDelete,
        });
        s3DeleteRequested = s3Result.requested;
        s3DeleteSucceeded = s3Result.succeeded;
        s3DeleteFailed = s3Result.failed;
      }

      const filtered = await writeProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== id),
      );
      spacesGetCache = null;
      await recordProjectRouteTelemetry({
        operation: "delete_project",
        ownerEmail,
        projectId: id,
        route: "/api/spaces",
        s3DeleteFailed,
        s3DeleteRequested,
        s3DeleteSucceeded,
        startedAt,
        stats: telemetryStats,
        status: "ok",
      });
      return jsonNoStore({ ok: true, id, remaining: filtered.length });
    });
  } catch (error) {
    await recordProjectRouteTelemetry({
      errorCode: (error as { name?: string } | null)?.name || "DELETE_PROJECT_FAILED",
      errorMessage: errorMessage(error),
      operation: "delete_project",
      ownerEmail: telemetryOwnerEmail,
      projectId: telemetryProjectId,
      route: "/api/spaces",
      s3DeleteFailed,
      s3DeleteRequested,
      s3DeleteSucceeded,
      startedAt,
      stats: telemetryStats,
      status: "error",
    });
    console.error("Delete error:", error);
    return jsonNoStore({ error: "Failed to delete project" }, { status: 500 });
  }
}
