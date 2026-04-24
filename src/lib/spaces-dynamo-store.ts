import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { ddbClient } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";

type SpaceNodeGraph = {
  createdAt?: string;
  edges?: unknown[];
  id: string;
  name: string;
  nodes?: unknown[];
  updatedAt?: string;
  [key: string]: unknown;
};

export type ProjectRecord = {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  rootSpaceId: string;
  spaces: Record<string, SpaceNodeGraph>;
  updatedAt: string;
};

export type ProjectListItem = {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  rootSpaceId: string;
  spacesCount: number | null;
  updatedAt: string;
};

type SpacesMetaItem = {
  id: string;
  entityType: "project-meta";
  projectId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  name: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  rootSpaceId: string;
  storageFormat: "chunks-v1";
  chunkCount: number;
  listPk?: string;
  listSk?: string;
  revision?: number;
  commitStatus?: "committed" | "pending" | "invalid";
  contentSha256?: string;
  updatedAt: string;
};

type SpacesChunkItem = {
  id: string;
  entityType: "project-chunk";
  projectId: string;
  revision?: number;
  chunkIndex: number;
  chunkData: string;
  updatedAt: string;
};

type LegacyInlineProject = ProjectRecord & {
  entityType?: undefined;
};

const SPACES_CHUNK_CHAR_SIZE = 240_000;
const SPACES_LIST_PK = "PROJECTS";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isLegacyInlineProject(item: unknown): item is LegacyInlineProject {
  if (!isRecord(item)) return false;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.rootSpaceId === "string" &&
    isRecord(item.spaces)
  );
}

function isMetaItem(item: unknown): item is SpacesMetaItem {
  if (!isRecord(item)) return false;
  return item.entityType === "project-meta" && typeof item.projectId === "string";
}

function isChunkItem(item: unknown): item is SpacesChunkItem {
  if (!isRecord(item)) return false;
  return (
    item.entityType === "project-chunk" &&
    typeof item.projectId === "string" &&
    typeof item.chunkIndex === "number" &&
    typeof item.chunkData === "string"
  );
}

function splitBase64Chunks(base64: string): string[] {
  if (!base64) return [""];
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += SPACES_CHUNK_CHAR_SIZE) {
    chunks.push(base64.slice(i, i + SPACES_CHUNK_CHAR_SIZE));
  }
  return chunks;
}

function buildChunkKey(projectId: string, index: number, revision?: number): string {
  if (typeof revision === "number" && Number.isFinite(revision) && revision > 0) {
    return `${projectId}#rev#${revision}#chunk#${index}`;
  }
  return `${projectId}#chunk#${index}`;
}

function buildListSortKey(updatedAt: string, projectId: string): string {
  return `${updatedAt}#${projectId}`;
}

function projectSortDesc(a: ProjectRecord, b: ProjectRecord): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isSpaceGraph(value: unknown): value is SpaceNodeGraph {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function normalizeSpacesForCommit(
  rawSpaces: unknown,
  rootSpaceId: string,
  nowIso: string,
): Record<string, SpaceNodeGraph> {
  const normalized: Record<string, SpaceNodeGraph> = {};
  const source = isRecord(rawSpaces) ? rawSpaces : {};
  for (const [spaceKey, maybeSpace] of Object.entries(source)) {
    if (!isRecord(maybeSpace)) continue;
    const sidRaw = maybeSpace.id;
    const sid =
      typeof sidRaw === "string" && sidRaw.trim() ? sidRaw.trim() : spaceKey;
    const nameRaw = maybeSpace.name;
    const name =
      typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : "Main Space";
    normalized[sid] = {
      ...maybeSpace,
      id: sid,
      name,
      nodes: Array.isArray(maybeSpace.nodes) ? maybeSpace.nodes : [],
      edges: Array.isArray(maybeSpace.edges) ? maybeSpace.edges : [],
      createdAt:
        typeof maybeSpace.createdAt === "string" && maybeSpace.createdAt
          ? maybeSpace.createdAt
          : nowIso,
      updatedAt:
        typeof maybeSpace.updatedAt === "string" && maybeSpace.updatedAt
          ? maybeSpace.updatedAt
          : nowIso,
    };
  }

  if (!normalized[rootSpaceId]) {
    normalized[rootSpaceId] = {
      id: rootSpaceId,
      name: "Main Space",
      nodes: [],
      edges: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  return normalized;
}

function validateProjectForCommit(project: ProjectRecord): void {
  if (!project.id || typeof project.id !== "string") {
    throw new Error("[spaces-dynamo] invalid project id");
  }
  if (!project.name || typeof project.name !== "string") {
    throw new Error("[spaces-dynamo] invalid project name");
  }
  if (!project.rootSpaceId || typeof project.rootSpaceId !== "string") {
    throw new Error("[spaces-dynamo] invalid project rootSpaceId");
  }
  if (!isRecord(project.spaces)) {
    throw new Error("[spaces-dynamo] invalid project spaces");
  }
  if (!isSpaceGraph(project.spaces[project.rootSpaceId])) {
    throw new Error("[spaces-dynamo] rootSpaceId does not exist in spaces");
  }
}

function buildRecoverySpaces(meta: SpacesMetaItem): Record<string, SpaceNodeGraph> {
  const rootId = (meta.rootSpaceId || "").trim() || "root";
  return {
    [rootId]: {
      id: rootId,
      name: "Main Space",
      nodes: [],
      edges: [],
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      _recovered: true,
    },
  };
}

function projectFromMeta(
  meta: SpacesMetaItem,
  spaces: Record<string, SpaceNodeGraph>,
  extraMetadata?: Record<string, unknown>,
): ProjectRecord {
  return {
    id: meta.projectId,
    name: meta.name,
    rootSpaceId: meta.rootSpaceId,
    metadata: {
      ...(meta.metadata ?? {}),
      ...(extraMetadata ?? {}),
    },
    ownerUserEmail: meta.ownerUserEmail,
    ownerUserName: meta.ownerUserName,
    ownerUserImage: meta.ownerUserImage,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    spaces,
  };
}

function parseSpacesFromChunks(meta: SpacesMetaItem, chunks: SpacesChunkItem[]): Record<string, SpaceNodeGraph> {
  const targetRevision =
    typeof meta.revision === "number" && Number.isFinite(meta.revision) && meta.revision > 0
      ? meta.revision
      : null;
  const selected = targetRevision
    ? chunks.filter((chunk) => chunk.revision === targetRevision)
    : chunks.filter((chunk) => typeof chunk.revision !== "number");

  const pool = selected.length > 0 ? selected : chunks;
  const ordered = [...pool].sort((a, b) => a.chunkIndex - b.chunkIndex);
  if (ordered.length !== meta.chunkCount) {
    throw new Error(
      `[spaces-dynamo] chunk count mismatch for ${meta.projectId}. expected ${meta.chunkCount} got ${ordered.length}`,
    );
  }

  const joinedBase64 = ordered.map((c) => c.chunkData).join("");
  const spacesJson = Buffer.from(joinedBase64, "base64").toString("utf8");
  return JSON.parse(spacesJson) as Record<string, SpaceNodeGraph>;
}

async function scanAllItems(tableName: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    out.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

async function scanMetaItems(tableName: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "attribute_not_exists(#entityType) OR #entityType = :meta",
          ExpressionAttributeNames: {
            "#chunkCount": "chunkCount",
            "#commitStatus": "commitStatus",
            "#createdAt": "createdAt",
            "#entityType": "entityType",
            "#metadata": "metadata",
            "#name": "name",
            "#ownerUserEmail": "ownerUserEmail",
            "#ownerUserImage": "ownerUserImage",
            "#ownerUserName": "ownerUserName",
            "#projectId": "projectId",
            "#rootSpaceId": "rootSpaceId",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":meta": "project-meta",
          },
          ProjectionExpression:
            "id, #projectId, #entityType, #name, #rootSpaceId, #metadata, #ownerUserEmail, #ownerUserName, #ownerUserImage, #createdAt, #updatedAt, #chunkCount, #commitStatus",
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    out.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

async function scanChunksForProject(tableName: string, projectId: string): Promise<SpacesChunkItem[]> {
  const out: SpacesChunkItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "#entityType = :chunk AND #projectId = :projectId",
          ExpressionAttributeNames: {
            "#entityType": "entityType",
            "#projectId": "projectId",
          },
          ExpressionAttributeValues: {
            ":chunk": "project-chunk",
            ":projectId": projectId,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    for (const item of response.Items ?? []) {
      if (isChunkItem(item)) out.push(item);
    }
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

async function readMetaOrLegacy(tableName: string, id: string): Promise<SpacesMetaItem | LegacyInlineProject | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id },
      }),
    ),
  );

  const item = response.Item;
  if (!item) return null;
  if (isMetaItem(item)) return item;
  if (isLegacyInlineProject(item)) return item;
  return null;
}

async function findMetaByProjectId(
  tableName: string,
  projectId: string,
): Promise<SpacesMetaItem | null> {
  const items = await scanMetaItems(tableName);
  for (const item of items) {
    if (isMetaItem(item) && item.projectId === projectId) {
      return item;
    }
  }
  return null;
}

export async function readDdbProjectById(tableName: string, id: string): Promise<ProjectRecord | null> {
  let row = await readMetaOrLegacy(tableName, id);
  if (!row) {
    row = await findMetaByProjectId(tableName, id);
  }
  if (!row) return null;

  if (isLegacyInlineProject(row)) {
    return row;
  }

  if (row.commitStatus === "invalid") {
    return null;
  }

  const chunks = await scanChunksForProject(tableName, row.projectId);
  try {
    return projectFromMeta(row, parseSpacesFromChunks(row, chunks));
  } catch (error) {
    console.error(`[spaces-dynamo] failed to rebuild project ${row.projectId}, using recovery fallback:`, error);
    return projectFromMeta(row, buildRecoverySpaces(row), {
      _recoveredFromCorruptChunks: true,
    });
  }
}

export async function readAllDdbProjects(tableName: string): Promise<ProjectRecord[]> {
  const items = await scanAllItems(tableName);

  const projects: ProjectRecord[] = [];
  const metaByProjectId = new Map<string, SpacesMetaItem>();
  const chunksByProjectId = new Map<string, SpacesChunkItem[]>();

  for (const item of items) {
    if (isLegacyInlineProject(item)) {
      projects.push(item);
      continue;
    }
    if (isMetaItem(item)) {
      metaByProjectId.set(item.projectId, item);
      continue;
    }
    if (isChunkItem(item)) {
      const current = chunksByProjectId.get(item.projectId) ?? [];
      current.push(item);
      chunksByProjectId.set(item.projectId, current);
    }
  }

  for (const [projectId, meta] of metaByProjectId.entries()) {
    const chunks = chunksByProjectId.get(projectId) ?? [];
    try {
      projects.push(projectFromMeta(meta, parseSpacesFromChunks(meta, chunks)));
    } catch (error) {
      console.error(`[spaces-dynamo] failed to rebuild project ${projectId}, using recovery fallback:`, error);
      projects.push(
        projectFromMeta(meta, buildRecoverySpaces(meta), {
          _recoveredFromCorruptChunks: true,
        }),
      );
    }
  }

  return projects.sort(projectSortDesc);
}

export async function readAllDdbProjectsMeta(tableName: string): Promise<ProjectListItem[]> {
  const listGsi = process.env.FOLDDER_SPACES_DDB_LIST_GSI?.trim();
  const items = listGsi
    ? await (async () => {
        try {
          const out: Record<string, unknown>[] = [];
          let exclusiveStartKey: Record<string, unknown> | undefined;
          do {
            const response = await withDynamoRetry(() =>
              ddbClient.send(
                new QueryCommand({
                  TableName: tableName,
                  IndexName: listGsi,
                  KeyConditionExpression: "#listPk = :listPk",
                  ExpressionAttributeNames: {
                    "#chunkCount": "chunkCount",
                    "#commitStatus": "commitStatus",
                    "#createdAt": "createdAt",
                    "#entityType": "entityType",
                    "#listPk": "listPk",
                    "#metadata": "metadata",
                    "#name": "name",
                    "#ownerUserEmail": "ownerUserEmail",
                    "#ownerUserImage": "ownerUserImage",
                    "#ownerUserName": "ownerUserName",
                    "#projectId": "projectId",
                    "#rootSpaceId": "rootSpaceId",
                    "#updatedAt": "updatedAt",
                  },
                  ExpressionAttributeValues: {
                    ":listPk": SPACES_LIST_PK,
                  },
                  ProjectionExpression:
                    "id, #projectId, #entityType, #name, #rootSpaceId, #metadata, #ownerUserEmail, #ownerUserName, #ownerUserImage, #createdAt, #updatedAt, #chunkCount, #commitStatus",
                  ScanIndexForward: false,
                  ExclusiveStartKey: exclusiveStartKey,
                }),
              ),
            );
            out.push(...((response.Items ?? []) as Record<string, unknown>[]));
            exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
          } while (exclusiveStartKey);
          if (out.length === 0) {
            return scanMetaItems(tableName);
          }
          return out;
        } catch (error) {
          console.error("[spaces-dynamo] readAllDdbProjectsMeta query failed, falling back to scan:", error);
          return scanMetaItems(tableName);
        }
      })()
    : await scanMetaItems(tableName);
  const projectsById = new Map<string, ProjectListItem>();

  for (const item of items) {
    if (isMetaItem(item)) {
      if (item.commitStatus === "invalid") continue;
      projectsById.set(item.projectId, {
        id: item.projectId,
        name: item.name,
        rootSpaceId: item.rootSpaceId,
        metadata: item.metadata ?? {},
        ownerUserEmail: item.ownerUserEmail,
        ownerUserName: item.ownerUserName,
        ownerUserImage: item.ownerUserImage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        spacesCount: null,
      });
      continue;
    }

    if (isLegacyInlineProject(item)) {
      projectsById.set(item.id, {
        id: item.id,
        name: item.name,
        rootSpaceId: item.rootSpaceId,
        metadata: item.metadata ?? {},
        ownerUserEmail: item.ownerUserEmail,
        ownerUserName: item.ownerUserName,
        ownerUserImage: item.ownerUserImage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        spacesCount: Object.keys(item.spaces || {}).length,
      });
    }
  }
  return [...projectsById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertDdbProject(
  tableName: string,
  project: ProjectRecord,
  options?: { allowProjectIdMetaScan?: boolean },
): Promise<void> {
  const nowIso = project.updatedAt || new Date().toISOString();
  const normalizedRoot =
    typeof project.rootSpaceId === "string" && project.rootSpaceId.trim()
      ? project.rootSpaceId.trim()
      : "root";
  const normalizedSpaces = normalizeSpacesForCommit(project.spaces, normalizedRoot, nowIso);
  const normalizedProject: ProjectRecord = {
    ...project,
    rootSpaceId: normalizedRoot,
    updatedAt: nowIso,
    spaces: normalizedSpaces,
  };
  validateProjectForCommit(normalizedProject);

  const spacesJson = JSON.stringify(normalizedProject.spaces || {});
  const spacesRoundTrip = JSON.parse(spacesJson) as Record<string, SpaceNodeGraph>;
  if (!isRecord(spacesRoundTrip)) {
    throw new Error("[spaces-dynamo] spaces serialization check failed");
  }
  const contentSha256 = sha256Hex(spacesJson);
  const spacesB64 = Buffer.from(spacesJson, "utf8").toString("base64");
  const chunks = splitBase64Chunks(spacesB64);
  const rebuilt = Buffer.from(chunks.join(""), "base64").toString("utf8");
  if (rebuilt !== spacesJson) {
    throw new Error("[spaces-dynamo] chunk serialization integrity check failed");
  }

  const allowProjectIdMetaScan = options?.allowProjectIdMetaScan ?? true;
  let existing = await readMetaOrLegacy(tableName, normalizedProject.id);
  if (!existing && allowProjectIdMetaScan) {
    existing = await findMetaByProjectId(tableName, normalizedProject.id);
  }
  const previousRevision = isMetaItem(existing) && typeof existing.revision === "number"
    ? existing.revision
    : 0;
  const nextRevision = Math.max(1, previousRevision + 1);
  const metaPrimaryId =
    isMetaItem(existing) && typeof existing.id === "string" && existing.id.trim()
      ? existing.id
      : normalizedProject.id;
  const newChunkKeys = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = buildChunkKey(normalizedProject.id, i, nextRevision);
    newChunkKeys.add(chunkId);
    await ddbClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          id: chunkId,
          entityType: "project-chunk",
          projectId: normalizedProject.id,
          revision: nextRevision,
          chunkIndex: i,
          chunkData: chunks[i],
          updatedAt: normalizedProject.updatedAt,
        } as SpacesChunkItem,
      }),
    );
  }

  await ddbClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        id: metaPrimaryId,
        entityType: "project-meta",
        projectId: normalizedProject.id,
        createdAt: normalizedProject.createdAt,
        listPk: SPACES_LIST_PK,
        listSk: buildListSortKey(normalizedProject.updatedAt, normalizedProject.id),
        metadata: normalizedProject.metadata ?? {},
        name: normalizedProject.name,
        ownerUserEmail: normalizedProject.ownerUserEmail,
        ownerUserName: normalizedProject.ownerUserName,
        ownerUserImage: normalizedProject.ownerUserImage,
        rootSpaceId: normalizedProject.rootSpaceId,
        storageFormat: "chunks-v1",
        revision: nextRevision,
        commitStatus: "committed",
        contentSha256,
        chunkCount: chunks.length,
        updatedAt: normalizedProject.updatedAt,
      } as SpacesMetaItem,
    }),
  );

  // Proyecto nuevo: no hay revisiones anteriores que limpiar.
  if (previousRevision > 0) {
    const allProjectChunks = await scanChunksForProject(tableName, normalizedProject.id);
    for (const chunk of allProjectChunks) {
      if (newChunkKeys.has(chunk.id)) continue;
      await ddbClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: chunk.id },
        }),
      );
    }
  }
}

export async function deleteDdbProject(tableName: string, id: string): Promise<void> {
  let existing = await readMetaOrLegacy(tableName, id);
  if (!existing) {
    existing = await findMetaByProjectId(tableName, id);
  }
  const metaKey = isMetaItem(existing) ? existing.id : id;

  const existingChunks = await scanChunksForProject(tableName, id);
  for (const chunk of existingChunks) {
    await ddbClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { id: chunk.id },
      }),
    );
  }

  await ddbClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id: metaKey },
    }),
  );
}
