import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash, randomUUID } from "node:crypto";
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
  revision?: number;
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
  revision?: number;
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
  storageFormat: "chunks-v1" | "chunks-v2";
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

type ProjectChunkPayload = {
  metadata?: Record<string, unknown>;
  spaces: Record<string, SpaceNodeGraph>;
  version?: number;
};

const SPACES_CHUNK_CHAR_SIZE = 240_000;
const SPACES_META_METADATA_MAX_BYTES = 64_000;
const SPACES_META_MAX_DEPTH = 6;
const SPACES_META_MAX_ARRAY_ITEMS = 30;
const SPACES_META_MAX_OBJECT_KEYS = 80;
const SPACES_META_MAX_STRING_BYTES = 4_000;
const SPACES_LIST_PK = "PROJECTS";
const SPACES_WRITE_LOCK_TTL_MS = 45_000;
const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]+)*;base64,/i;
const MEDIA_PAYLOAD_KEY_RE =
  /^(base64|blob|buffer|bytes|data|dataUrl|image|imageData|imageUrl|mask|preview|src|thumbnail|thumb|url|value)$/i;

export class SpacesRevisionConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
  ) {
    super(
      `Project ${projectId} revision conflict. Expected ${expectedRevision}, current ${actualRevision}.`,
    );
    this.name = "SpacesRevisionConflictError";
  }
}

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

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function compactLargeStringForMeta(value: string, key: string): string | Record<string, unknown> {
  const dataUrlMatch = value.match(DATA_URL_RE);
  const bytes = Buffer.byteLength(value, "utf8");
  if (dataUrlMatch || bytes > SPACES_META_MAX_STRING_BYTES || MEDIA_PAYLOAD_KEY_RE.test(key)) {
    const maybeRemoteAsset =
      /^(https?:\/\/|\/api\/spaces\/s3-file\?|\/api\/spaces\/project-media)/i.test(value) &&
      bytes <= SPACES_META_MAX_STRING_BYTES;
    if (maybeRemoteAsset && !dataUrlMatch) return value;
    return {
      _omittedFromMetaItem: dataUrlMatch ? "data-url" : "large-string",
      byteLength: bytes,
      mimeType: dataUrlMatch?.[1],
    };
  }
  return value;
}

function compactValueForMetaItem(value: unknown, key = "", depth = 0): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return compactLargeStringForMeta(value, key);
  if (typeof value !== "object") return undefined;

  if (depth >= SPACES_META_MAX_DEPTH) {
    return { _omittedFromMetaItem: "max-depth" };
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, SPACES_META_MAX_ARRAY_ITEMS)
      .map((item) => compactValueForMetaItem(item, key, depth + 1));
    if (value.length > SPACES_META_MAX_ARRAY_ITEMS) {
      items.push({ _omittedFromMetaItem: "array-tail", count: value.length - SPACES_META_MAX_ARRAY_ITEMS });
    }
    return items;
  }

  const source = value as Record<string, unknown>;
  const compacted: Record<string, unknown> = {};
  const entries = Object.entries(source);
  let written = 0;
  for (const [childKey, childValue] of entries) {
    if (written >= SPACES_META_MAX_OBJECT_KEYS) break;
    const compactedValue = compactValueForMetaItem(childValue, childKey, depth + 1);
    if (compactedValue === undefined) continue;
    compacted[childKey] = compactedValue;
    written += 1;
  }
  if (entries.length > SPACES_META_MAX_OBJECT_KEYS) {
    compacted._omittedFromMetaItem = {
      reason: "object-tail",
      count: entries.length - SPACES_META_MAX_OBJECT_KEYS,
    };
  }
  return compacted;
}

function extractSafeMetaKey(
  compacted: Record<string, unknown>,
  key: string,
): Record<string, unknown> | unknown[] | undefined {
  const value = compacted[key];
  if (!isRecord(value) && !Array.isArray(value)) return undefined;
  return jsonByteLength(value) <= 12_000 ? value : undefined;
}

function compactMetadataForMetaItem(metadata: Record<string, unknown>): Record<string, unknown> {
  const compactedRaw = compactValueForMetaItem(metadata);
  const compacted = isRecord(compactedRaw) ? compactedRaw : {};
  if (jsonByteLength(compacted) <= SPACES_META_METADATA_MAX_BYTES) return compacted;

  const fallback: Record<string, unknown> = {
    _storedInProjectChunks: true,
    _summaryOnly: true,
    _originalMetadataBytes: jsonByteLength(metadata),
  };
  const ui = extractSafeMetaKey(compacted, "ui");
  const saveManifest = extractSafeMetaKey(compacted, "saveManifest");
  const projectFiles = extractSafeMetaKey(compacted, "projectFiles");
  if (ui) fallback.ui = ui;
  if (saveManifest) fallback.saveManifest = saveManifest;
  if (projectFiles) fallback.projectFiles = projectFiles;

  if (jsonByteLength(fallback) <= SPACES_META_METADATA_MAX_BYTES) return fallback;
  return {
    _storedInProjectChunks: true,
    _summaryOnly: true,
    _originalMetadataBytes: jsonByteLength(metadata),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "ConditionalCheckFailedException";
}

async function acquireProjectWriteLock(
  tableName: string,
  projectId: string,
): Promise<{ id: string; owner: string }> {
  const id = `${projectId}#write-lock`;
  const owner = randomUUID();

  for (let attempt = 0; attempt < 10; attempt++) {
    const now = Date.now();
    try {
      await withDynamoRetry(() =>
        ddbClient.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              id,
              entityType: "project-write-lock",
              projectId,
              owner,
              expiresAt: now + SPACES_WRITE_LOCK_TTL_MS,
              updatedAt: new Date(now).toISOString(),
            },
            ConditionExpression: "attribute_not_exists(id) OR #expiresAt < :now",
            ExpressionAttributeNames: {
              "#expiresAt": "expiresAt",
            },
            ExpressionAttributeValues: {
              ":now": now,
            },
          }),
        ),
      );
      return { id, owner };
    } catch (error) {
      if (!isConditionalCheckFailed(error)) throw error;
      await sleep(80 + attempt * 120 + Math.floor(Math.random() * 90));
    }
  }

  throw new Error(`[spaces-dynamo] write lock busy for project ${projectId}`);
}

async function releaseProjectWriteLock(
  tableName: string,
  lock: { id: string; owner: string },
): Promise<void> {
  try {
    await withDynamoRetry(() =>
      ddbClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: lock.id },
          ConditionExpression: "#owner = :owner",
          ExpressionAttributeNames: {
            "#owner": "owner",
          },
          ExpressionAttributeValues: {
            ":owner": lock.owner,
          },
        }),
      ),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) {
      console.warn(`[spaces-dynamo] failed to release write lock for ${lock.id}:`, error);
    }
  }
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
  payloadMetadata?: Record<string, unknown>,
  extraMetadata?: Record<string, unknown>,
): ProjectRecord {
  const baseMetadata = payloadMetadata ?? meta.metadata ?? {};
  return {
    id: meta.projectId,
    name: meta.name,
    rootSpaceId: meta.rootSpaceId,
    metadata: {
      ...baseMetadata,
      ...(extraMetadata ?? {}),
    },
    ownerUserEmail: meta.ownerUserEmail,
    ownerUserName: meta.ownerUserName,
    ownerUserImage: meta.ownerUserImage,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    spaces,
  };
}

function parseJsonFromChunks(meta: SpacesMetaItem, chunks: SpacesChunkItem[]): unknown {
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
  const payloadJson = Buffer.from(joinedBase64, "base64").toString("utf8");
  if (meta.contentSha256 && sha256Hex(payloadJson) !== meta.contentSha256) {
    throw new Error(`[spaces-dynamo] chunk content hash mismatch for ${meta.projectId}`);
  }
  return JSON.parse(payloadJson) as unknown;
}

function parseProjectPayloadFromChunks(meta: SpacesMetaItem, chunks: SpacesChunkItem[]): ProjectChunkPayload {
  const parsed = parseJsonFromChunks(meta, chunks);
  if (meta.storageFormat === "chunks-v2") {
    if (!isRecord(parsed) || !isRecord(parsed.spaces)) {
      throw new Error(`[spaces-dynamo] invalid chunks-v2 payload for ${meta.projectId}`);
    }
    return {
      spaces: parsed.spaces as Record<string, SpaceNodeGraph>,
      metadata: isRecord(parsed.metadata) ? parsed.metadata : {},
      version: typeof parsed.version === "number" ? parsed.version : 2,
    };
  }
  if (!isRecord(parsed)) {
    throw new Error(`[spaces-dynamo] invalid chunks-v1 spaces payload for ${meta.projectId}`);
  }
  return {
    spaces: parsed as Record<string, SpaceNodeGraph>,
  };
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
            "#revision": "revision",
            "#rootSpaceId": "rootSpaceId",
            "#storageFormat": "storageFormat",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":meta": "project-meta",
          },
          ProjectionExpression:
            "id, #projectId, #entityType, #name, #rootSpaceId, #metadata, #ownerUserEmail, #ownerUserName, #ownerUserImage, #createdAt, #updatedAt, #chunkCount, #commitStatus, #revision, #storageFormat",
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
    const payload = parseProjectPayloadFromChunks(row, chunks);
    return projectFromMeta(row, payload.spaces, payload.metadata);
  } catch (error) {
    console.error(`[spaces-dynamo] failed to rebuild project ${row.projectId}, using recovery fallback:`, error);
    return projectFromMeta(row, buildRecoverySpaces(row), undefined, {
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
      const payload = parseProjectPayloadFromChunks(meta, chunks);
      projects.push(projectFromMeta(meta, payload.spaces, payload.metadata));
    } catch (error) {
      console.error(`[spaces-dynamo] failed to rebuild project ${projectId}, using recovery fallback:`, error);
      projects.push(
        projectFromMeta(meta, buildRecoverySpaces(meta), undefined, {
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
                    "#revision": "revision",
                    "#rootSpaceId": "rootSpaceId",
                    "#storageFormat": "storageFormat",
                    "#updatedAt": "updatedAt",
                  },
                  ExpressionAttributeValues: {
                    ":listPk": SPACES_LIST_PK,
                  },
                  ProjectionExpression:
                    "id, #projectId, #entityType, #name, #rootSpaceId, #metadata, #ownerUserEmail, #ownerUserName, #ownerUserImage, #createdAt, #updatedAt, #chunkCount, #commitStatus, #revision, #storageFormat",
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
        revision: item.revision,
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
        revision: item.revision,
        spacesCount: Object.keys(item.spaces || {}).length,
      });
    }
  }
  return [...projectsById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertDdbProject(
  tableName: string,
  project: ProjectRecord,
  options?: { allowProjectIdMetaScan?: boolean; expectedRevision?: number | null },
): Promise<{ revision: number }> {
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

  const chunkPayload: ProjectChunkPayload = {
    version: 2,
    spaces: normalizedProject.spaces || {},
    metadata: normalizedProject.metadata ?? {},
  };
  const chunkPayloadJson = JSON.stringify(chunkPayload);
  const chunkPayloadRoundTrip = JSON.parse(chunkPayloadJson) as ProjectChunkPayload;
  if (!isRecord(chunkPayloadRoundTrip) || !isRecord(chunkPayloadRoundTrip.spaces)) {
    throw new Error("[spaces-dynamo] project payload serialization check failed");
  }
  const contentSha256 = sha256Hex(chunkPayloadJson);
  const payloadB64 = Buffer.from(chunkPayloadJson, "utf8").toString("base64");
  const chunks = splitBase64Chunks(payloadB64);
  const rebuilt = Buffer.from(chunks.join(""), "base64").toString("utf8");
  if (rebuilt !== chunkPayloadJson) {
    throw new Error("[spaces-dynamo] chunk serialization integrity check failed");
  }
  const metaMetadata = compactMetadataForMetaItem(normalizedProject.metadata ?? {});

  const lock = await acquireProjectWriteLock(tableName, normalizedProject.id);
  try {
    const allowProjectIdMetaScan = options?.allowProjectIdMetaScan ?? true;
    let existing = await readMetaOrLegacy(tableName, normalizedProject.id);
    if (!existing && allowProjectIdMetaScan) {
      existing = await findMetaByProjectId(tableName, normalizedProject.id);
    }
    const previousRevision = isMetaItem(existing) && typeof existing.revision === "number"
      ? existing.revision
      : 0;
    const expectedRevision =
      typeof options?.expectedRevision === "number" && Number.isFinite(options.expectedRevision)
        ? options.expectedRevision
        : null;
    if (expectedRevision !== null && expectedRevision !== previousRevision) {
      throw new SpacesRevisionConflictError(
        normalizedProject.id,
        expectedRevision,
        previousRevision,
      );
    }

    const nextRevision = Math.max(1, previousRevision + 1);
    const metaPrimaryId =
      isMetaItem(existing) && typeof existing.id === "string" && existing.id.trim()
        ? existing.id
        : normalizedProject.id;
    const newChunkKeys = new Set<string>();

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = buildChunkKey(normalizedProject.id, i, nextRevision);
      newChunkKeys.add(chunkId);
      await withDynamoRetry(() =>
        ddbClient.send(
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
        ),
      );
    }

    await withDynamoRetry(() =>
      ddbClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            id: metaPrimaryId,
            entityType: "project-meta",
            projectId: normalizedProject.id,
            createdAt: normalizedProject.createdAt,
            listPk: SPACES_LIST_PK,
            listSk: buildListSortKey(normalizedProject.updatedAt, normalizedProject.id),
            metadata: metaMetadata,
            name: normalizedProject.name,
            ownerUserEmail: normalizedProject.ownerUserEmail,
            ownerUserName: normalizedProject.ownerUserName,
            ownerUserImage: normalizedProject.ownerUserImage,
            rootSpaceId: normalizedProject.rootSpaceId,
            storageFormat: "chunks-v2",
            revision: nextRevision,
            commitStatus: "committed",
            contentSha256,
            chunkCount: chunks.length,
            updatedAt: normalizedProject.updatedAt,
          } as SpacesMetaItem,
        }),
      ),
    );

    // Proyecto nuevo: no hay revisiones anteriores que limpiar.
    if (previousRevision > 0) {
      const allProjectChunks = await scanChunksForProject(tableName, normalizedProject.id);
      for (const chunk of allProjectChunks) {
        if (newChunkKeys.has(chunk.id)) continue;
        await withDynamoRetry(() =>
          ddbClient.send(
            new DeleteCommand({
              TableName: tableName,
              Key: { id: chunk.id },
            }),
          ),
        );
      }
    }

    return { revision: nextRevision };
  } finally {
    await releaseProjectWriteLock(tableName, lock);
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
