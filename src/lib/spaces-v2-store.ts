import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { ddbClient } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import {
  collectS3KeysFromProjectSpaces,
  collectS3KeysFromValue,
} from "@/lib/s3-media-hydrate";
import type { SpacesWriteStoreStats } from "@/lib/spaces-save-telemetry";
import type { ProjectListItem, ProjectRecord } from "@/lib/spaces-dynamo-store";

type SpaceNodeGraph = ProjectRecord["spaces"][string];

type SpacesV2MetaItem = {
  pk: string;
  sk: "META";
  entityType: "spaces-v2-project-meta";
  projectId: string;
  ownerHash: string;
  ownerPk: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  listSk: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  rootSpaceId: string;
  metadata: Record<string, unknown>;
  revision: number;
  chunkCount: number;
  contentSha256: string;
  mediaKeyCount: number;
  spacesCount: number;
  storageFormat: "spaces-v2-chunks";
  uiUpdatedAt?: string;
};

type SpacesV2ChunkItem = {
  pk: string;
  sk: string;
  entityType: "spaces-v2-project-chunk";
  projectId: string;
  revision: number;
  chunkIndex: number;
  chunkData: string;
  updatedAt: string;
};

type SpacesV2MediaRefItem = {
  pk: string;
  sk: string;
  entityType: "spaces-v2-media-ref";
  projectId: string;
  ownerHash: string;
  ownerPk: string;
  ownerUserEmail?: string;
  listSk: string;
  s3Key: string;
  s3KeyHash: string;
  updatedAt: string;
};

type ProjectChunkPayload = {
  metadata?: Record<string, unknown>;
  spaces: Record<string, SpaceNodeGraph>;
  version: 2;
};

type MetaCondition =
  | {
      expression?: undefined;
      names?: undefined;
      values?: undefined;
    }
  | {
      expression: string;
      names: Record<string, string>;
      values?: Record<string, unknown>;
    };

export class SpacesV2RevisionConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
  ) {
    super(`Project ${projectId} revision conflict. Expected ${expectedRevision}, current ${actualRevision}.`);
    this.name = "SpacesV2RevisionConflictError";
  }
}

export class SpacesV2IntegrityError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly code:
      | "CHUNK_COUNT_MISMATCH"
      | "CHUNK_HASH_MISMATCH"
      | "INVALID_CHUNK_PAYLOAD"
      | "INVALID_CHUNK_JSON",
    message: string,
  ) {
    super(message);
    this.name = "SpacesV2IntegrityError";
  }
}

const CHUNK_CHAR_SIZE = 240_000;
const META_METADATA_MAX_BYTES = 64_000;
const META_MAX_DEPTH = 6;
const META_MAX_ARRAY_ITEMS = 30;
const META_MAX_OBJECT_KEYS = 80;
const META_MAX_STRING_BYTES = 4_000;
const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]+)*;base64,/i;
const MEDIA_PAYLOAD_KEY_RE =
  /^(base64|blob|buffer|bytes|data|dataUrl|image|imageData|imageUrl|mask|preview|src|thumbnail|thumb|url|value)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function ownerHash(email: string | null | undefined): string {
  return createHash("sha256").update(normalizeOwnerEmail(email)).digest("hex").slice(0, 20);
}

function projectPk(projectId: string): string {
  return `PROJECT#${projectId}`;
}

function ownerPk(email: string | null | undefined): string {
  return `USER#${ownerHash(email)}`;
}

function listSk(updatedAt: string, projectId: string): string {
  return `${updatedAt}#${projectId}`;
}

function chunkSk(revision: number, index: number): string {
  return `CHUNK#${String(revision).padStart(12, "0")}#${String(index).padStart(6, "0")}`;
}

function mediaSk(key: string): string {
  return `MEDIA#${sha256Hex(key)}`;
}

function mediaOwnerListSk(key: string): string {
  return `MEDIA#${sha256Hex(key)}`;
}

function metaWriteCondition(expectedRevision: number | null): MetaCondition {
  if (expectedRevision === null) return {};
  if (expectedRevision <= 0) {
    return {
      expression: "attribute_not_exists(#pk)",
      names: { "#pk": "pk" },
    };
  }
  return {
    expression: "#revision = :expectedRevision",
    names: { "#revision": "revision" },
    values: { ":expectedRevision": expectedRevision },
  };
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

function splitBase64Chunks(base64: string): string[] {
  if (!base64) return [""];
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += CHUNK_CHAR_SIZE) {
    chunks.push(base64.slice(i, i + CHUNK_CHAR_SIZE));
  }
  return chunks;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "ConditionalCheckFailedException";
}

function compactLargeStringForMeta(value: string, key: string): string | Record<string, unknown> {
  const dataUrlMatch = value.match(DATA_URL_RE);
  const bytes = Buffer.byteLength(value, "utf8");
  if (dataUrlMatch || bytes > META_MAX_STRING_BYTES || MEDIA_PAYLOAD_KEY_RE.test(key)) {
    const maybeRemoteAsset =
      /^(https?:\/\/|\/api\/spaces\/s3-file\?|\/api\/spaces\/project-media)/i.test(value) &&
      bytes <= META_MAX_STRING_BYTES;
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

  if (depth >= META_MAX_DEPTH) return { _omittedFromMetaItem: "max-depth" };

  if (Array.isArray(value)) {
    const items = value
      .slice(0, META_MAX_ARRAY_ITEMS)
      .map((item) => compactValueForMetaItem(item, key, depth + 1));
    if (value.length > META_MAX_ARRAY_ITEMS) {
      items.push({ _omittedFromMetaItem: "array-tail", count: value.length - META_MAX_ARRAY_ITEMS });
    }
    return items;
  }

  const source = value as Record<string, unknown>;
  const compacted: Record<string, unknown> = {};
  const entries = Object.entries(source);
  let written = 0;
  for (const [childKey, childValue] of entries) {
    if (written >= META_MAX_OBJECT_KEYS) break;
    const compactedValue = compactValueForMetaItem(childValue, childKey, depth + 1);
    if (compactedValue === undefined) continue;
    compacted[childKey] = compactedValue;
    written += 1;
  }
  if (entries.length > META_MAX_OBJECT_KEYS) {
    compacted._omittedFromMetaItem = {
      reason: "object-tail",
      count: entries.length - META_MAX_OBJECT_KEYS,
    };
  }
  return compacted;
}

function compactMetadataForMetaItem(metadata: Record<string, unknown>): Record<string, unknown> {
  const compactedRaw = compactValueForMetaItem(metadata);
  const compacted = isRecord(compactedRaw) ? compactedRaw : {};
  if (jsonByteLength(compacted) <= META_METADATA_MAX_BYTES) return compacted;
  return {
    _storedInProjectChunks: true,
    _summaryOnly: true,
    _originalMetadataBytes: jsonByteLength(metadata),
  };
}

function isMetaItem(item: unknown): item is SpacesV2MetaItem {
  return (
    isRecord(item) &&
    item.entityType === "spaces-v2-project-meta" &&
    typeof item.projectId === "string" &&
    item.sk === "META"
  );
}

function isChunkItem(item: unknown): item is SpacesV2ChunkItem {
  return (
    isRecord(item) &&
    item.entityType === "spaces-v2-project-chunk" &&
    typeof item.projectId === "string" &&
    typeof item.chunkIndex === "number" &&
    typeof item.chunkData === "string"
  );
}

function isMediaRefItem(item: unknown): item is SpacesV2MediaRefItem & { sk: string } {
  return (
    isRecord(item) &&
    item.entityType === "spaces-v2-media-ref" &&
    typeof item.sk === "string" &&
    typeof item.s3Key === "string"
  );
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
    const sid =
      typeof maybeSpace.id === "string" && maybeSpace.id.trim()
        ? maybeSpace.id.trim()
        : spaceKey;
    const name =
      typeof maybeSpace.name === "string" && maybeSpace.name.trim()
        ? maybeSpace.name.trim()
        : "Main Space";
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
  if (!project.id || typeof project.id !== "string") throw new Error("[spaces-v2] invalid project id");
  if (!project.name || typeof project.name !== "string") throw new Error("[spaces-v2] invalid project name");
  if (!project.rootSpaceId || typeof project.rootSpaceId !== "string") {
    throw new Error("[spaces-v2] invalid project rootSpaceId");
  }
  if (!isRecord(project.spaces)) throw new Error("[spaces-v2] invalid project spaces");
  if (!isRecord(project.spaces[project.rootSpaceId])) {
    throw new Error("[spaces-v2] rootSpaceId does not exist in spaces");
  }
}

function collectS3KeysFromProjectRecord(project: ProjectRecord): string[] {
  return [
    ...new Set([
      ...collectS3KeysFromProjectSpaces(project.spaces || {}),
      ...collectS3KeysFromValue(project.metadata || {}),
    ]),
  ];
}

async function queryAllProjectItems(tableName: string, projectId: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: { "#pk": "pk" },
          ExpressionAttributeValues: { ":pk": projectPk(projectId) },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    out.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return out;
}

async function getMetaItem(tableName: string, projectId: string): Promise<SpacesV2MetaItem | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: projectPk(projectId), sk: "META" },
      }),
    ),
  );
  return isMetaItem(response.Item) ? response.Item : null;
}

function parseProjectPayloadFromChunks(meta: SpacesV2MetaItem, chunks: SpacesV2ChunkItem[]): ProjectChunkPayload {
  const selected = chunks
    .filter((chunk) => chunk.revision === meta.revision)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
  if (selected.length !== meta.chunkCount) {
    throw new SpacesV2IntegrityError(
      meta.projectId,
      "CHUNK_COUNT_MISMATCH",
      `[spaces-v2] chunk count mismatch for ${meta.projectId}. expected ${meta.chunkCount} got ${selected.length}`,
    );
  }
  const payloadJson = Buffer.from(selected.map((c) => c.chunkData).join(""), "base64").toString("utf8");
  if (sha256Hex(payloadJson) !== meta.contentSha256) {
    throw new SpacesV2IntegrityError(
      meta.projectId,
      "CHUNK_HASH_MISMATCH",
      `[spaces-v2] chunk content hash mismatch for ${meta.projectId}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson) as unknown;
  } catch (error) {
    throw new SpacesV2IntegrityError(
      meta.projectId,
      "INVALID_CHUNK_JSON",
      `[spaces-v2] invalid chunk JSON for ${meta.projectId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed) || !isRecord(parsed.spaces)) {
    throw new SpacesV2IntegrityError(
      meta.projectId,
      "INVALID_CHUNK_PAYLOAD",
      `[spaces-v2] invalid chunk payload for ${meta.projectId}`,
    );
  }
  return {
    version: 2,
    spaces: parsed.spaces as Record<string, SpaceNodeGraph>,
    metadata: isRecord(parsed.metadata) ? parsed.metadata : {},
  };
}

function projectFromMeta(meta: SpacesV2MetaItem, payload: ProjectChunkPayload): ProjectRecord {
  const chunkMetadata = payload.metadata ?? meta.metadata ?? {};
  const metaUi = isRecord(meta.metadata?.ui) ? meta.metadata.ui : undefined;
  return {
    id: meta.projectId,
    name: meta.name,
    rootSpaceId: meta.rootSpaceId,
    metadata: metaUi ? { ...chunkMetadata, ui: metaUi } : chunkMetadata,
    ownerUserEmail: meta.ownerUserEmail,
    ownerUserName: meta.ownerUserName,
    ownerUserImage: meta.ownerUserImage,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    spaces: payload.spaces,
  };
}

function metaToListItem(meta: SpacesV2MetaItem): ProjectListItem {
  return {
    id: meta.projectId,
    name: meta.name,
    rootSpaceId: meta.rootSpaceId,
    metadata: meta.metadata ?? {},
    ownerUserEmail: meta.ownerUserEmail,
    ownerUserName: meta.ownerUserName,
    ownerUserImage: meta.ownerUserImage,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    spacesCount: meta.spacesCount ?? null,
  };
}

async function deleteItemsInBatches(tableName: string, keys: Array<{ pk: string; sk: string }>): Promise<void> {
  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25);
    if (batch.length === 0) continue;
    await withDynamoRetry(() =>
      ddbClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: batch.map((Key) => ({
              DeleteRequest: { Key },
            })),
          },
        }),
      ),
    );
  }
}

async function cleanupSupersededItems(
  tableName: string,
  projectId: string,
  nextRevision: number,
  currentMediaKeys: Set<string>,
): Promise<void> {
  const items = await queryAllProjectItems(tableName, projectId);
  const staleKeys: Array<{ pk: string; sk: string }> = [];
  const pk = projectPk(projectId);
  for (const item of items) {
    if (!isRecord(item) || typeof item.sk !== "string") continue;
    if (isChunkItem(item) && item.revision !== nextRevision) {
      staleKeys.push({ pk, sk: item.sk });
      continue;
    }
    if (isMediaRefItem(item)) {
      if (!currentMediaKeys.has(item.s3Key)) staleKeys.push({ pk, sk: item.sk });
    }
  }
  await deleteItemsInBatches(tableName, staleKeys);
}

export async function readSpacesV2ProjectById(tableName: string, projectId: string): Promise<ProjectRecord | null> {
  const items = await queryAllProjectItems(tableName, projectId);
  const meta = items.find(isMetaItem) ?? null;
  if (!meta) return null;
  const chunks = items.filter(isChunkItem);
  const payload = parseProjectPayloadFromChunks(meta, chunks);
  return projectFromMeta(meta, payload);
}

export async function readSpacesV2ProjectsMetaForOwner(
  tableName: string,
  ownerEmail: string,
): Promise<ProjectListItem[]> {
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  if (!normalizedOwner) return [];

  const out: ProjectListItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: process.env.FOLDDER_SPACES_V2_OWNER_GSI?.trim() || "ownerPk-listSk-index",
          KeyConditionExpression: "#ownerPk = :ownerPk",
          ExpressionAttributeNames: { "#ownerPk": "ownerPk" },
          ExpressionAttributeValues: { ":ownerPk": ownerPk(normalizedOwner) },
          ScanIndexForward: false,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    for (const item of response.Items ?? []) {
      if (isMetaItem(item)) out.push(metaToListItem(item));
    }
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

export async function readSpacesV2ProjectsForOwner(
  tableName: string,
  ownerEmail: string,
): Promise<ProjectRecord[]> {
  const metas = await readSpacesV2ProjectsMetaForOwner(tableName, ownerEmail);
  const projects = await Promise.all(metas.map((meta) => readSpacesV2ProjectById(tableName, meta.id)));
  return projects.filter((project): project is ProjectRecord => Boolean(project));
}

export async function updateSpacesV2ProjectUi(
  tableName: string,
  args: {
    ownerEmail: string;
    projectId: string;
    ui: Record<string, unknown>;
  },
): Promise<{ revision: number } | null> {
  const meta = await getMetaItem(tableName, args.projectId);
  if (!meta) return null;
  if (normalizeOwnerEmail(meta.ownerUserEmail) !== normalizeOwnerEmail(args.ownerEmail)) return null;

  const metadata = isRecord(meta.metadata) ? meta.metadata : {};
  const nextMeta: SpacesV2MetaItem = {
    ...meta,
    metadata: compactMetadataForMetaItem({
      ...metadata,
      ui: args.ui,
    }),
    uiUpdatedAt: new Date().toISOString(),
  };

  await withDynamoRetry(() =>
    ddbClient.send(
      new PutCommand({
        TableName: tableName,
        Item: nextMeta,
        ConditionExpression: "#revision = :expectedRevision",
        ExpressionAttributeNames: { "#revision": "revision" },
        ExpressionAttributeValues: { ":expectedRevision": meta.revision },
      }),
    ),
  );

  return { revision: meta.revision };
}

export async function readAllSpacesV2Projects(tableName: string): Promise<ProjectRecord[]> {
  const metas: ProjectListItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
          ExpressionAttributeNames: { "#entityType": "entityType" },
          ExpressionAttributeValues: { ":meta": "spaces-v2-project-meta" },
          FilterExpression: "#entityType = :meta",
        }),
      ),
    );
    for (const item of response.Items ?? []) {
      if (isMetaItem(item)) metas.push(metaToListItem(item));
    }
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const projects: ProjectRecord[] = [];
  for (let i = 0; i < metas.length; i += 8) {
    const batch = metas.slice(i, i + 8);
    const settled = await Promise.allSettled(
      batch.map((meta) => readSpacesV2ProjectById(tableName, meta.id)),
    );
    for (let j = 0; j < settled.length; j += 1) {
      const result = settled[j];
      if (result.status === "fulfilled" && result.value) {
        projects.push(result.value);
      } else if (result.status === "rejected") {
        console.warn("[spaces-v2] failed to read project for admin inventory:", batch[j]?.id, result.reason);
      }
    }
  }
  return projects;
}

export async function readSpacesV2ProjectMediaRefByOwnerKey(
  tableName: string,
  ownerEmail: string,
  key: string,
): Promise<Pick<SpacesV2MediaRefItem, "projectId" | "s3Key"> | null> {
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  if (!normalizedOwner || !key) return null;

  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: process.env.FOLDDER_SPACES_V2_OWNER_GSI?.trim() || "ownerPk-listSk-index",
        KeyConditionExpression: "#ownerPk = :ownerPk AND #listSk = :listSk",
        ExpressionAttributeNames: {
          "#listSk": "listSk",
          "#ownerPk": "ownerPk",
        },
        ExpressionAttributeValues: {
          ":listSk": mediaOwnerListSk(key),
          ":ownerPk": ownerPk(normalizedOwner),
        },
        Limit: 1,
      }),
    ),
  );
  const indexed = (response.Items ?? []).find(isMediaRefItem);
  if (indexed && indexed.s3Key === key) {
    return { projectId: indexed.projectId, s3Key: indexed.s3Key };
  }

  // Backward compatibility for refs written before media refs were indexed by owner.
  const projects = await readSpacesV2ProjectsForOwner(tableName, normalizedOwner);
  for (const project of projects) {
    const keys = collectS3KeysFromProjectRecord(project);
    if (keys.includes(key)) return { projectId: project.id, s3Key: key };
  }
  return null;
}

export async function upsertSpacesV2Project(
  tableName: string,
  project: ProjectRecord,
  options?: { expectedRevision?: number | null },
): Promise<{ revision: number; telemetry: SpacesWriteStoreStats }> {
  const nowIso = project.updatedAt || new Date().toISOString();
  const createdAt = project.createdAt || nowIso;
  const normalizedRoot =
    typeof project.rootSpaceId === "string" && project.rootSpaceId.trim()
      ? project.rootSpaceId.trim()
      : "root";
  const normalizedProject: ProjectRecord = {
    ...project,
    createdAt,
    ownerUserEmail: normalizeOwnerEmail(project.ownerUserEmail),
    rootSpaceId: normalizedRoot,
    updatedAt: nowIso,
    spaces: normalizeSpacesForCommit(project.spaces, normalizedRoot, nowIso),
  };
  validateProjectForCommit(normalizedProject);

  const existing = await getMetaItem(tableName, normalizedProject.id);
  const previousRevision = existing?.revision ?? 0;
  const expectedRevision =
    typeof options?.expectedRevision === "number" && Number.isFinite(options.expectedRevision)
      ? options.expectedRevision
      : null;
  if (expectedRevision !== null && previousRevision !== expectedRevision) {
    throw new SpacesV2RevisionConflictError(normalizedProject.id, expectedRevision, previousRevision);
  }

  const nextRevision = Math.max(1, previousRevision + 1);
  const chunkPayload: ProjectChunkPayload = {
    version: 2,
    spaces: normalizedProject.spaces,
    metadata: normalizedProject.metadata ?? {},
  };
  const payloadJson = JSON.stringify(chunkPayload);
  const contentSha256 = sha256Hex(payloadJson);
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64");
  const chunks = splitBase64Chunks(payloadB64);
  const rebuilt = Buffer.from(chunks.join(""), "base64").toString("utf8");
  if (rebuilt !== payloadJson) throw new Error("[spaces-v2] chunk serialization integrity check failed");

  const pk = projectPk(normalizedProject.id);
  const metaCondition = metaWriteCondition(expectedRevision);
  const writtenChunkKeys: Array<{ pk: string; sk: string }> = [];
  let chunksWriteMs = 0;
  let mediaRefsWriteMs = 0;
  let metaWriteMs = 0;
  let cleanupMs = 0;
  try {
    let phaseStartedAt = Date.now();
    for (let i = 0; i < chunks.length; i++) {
      const sk = chunkSk(nextRevision, i);
      writtenChunkKeys.push({ pk, sk });
      await withDynamoRetry(() =>
        ddbClient.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              pk,
              sk,
              entityType: "spaces-v2-project-chunk",
              projectId: normalizedProject.id,
              revision: nextRevision,
              chunkIndex: i,
              chunkData: chunks[i],
              updatedAt: normalizedProject.updatedAt,
            } as SpacesV2ChunkItem,
          }),
        ),
      );
    }
    chunksWriteMs = Date.now() - phaseStartedAt;

    const mediaKeys = collectS3KeysFromProjectRecord(normalizedProject);
    const mediaKeySet = new Set(mediaKeys);
    const owner = ownerHash(normalizedProject.ownerUserEmail);
    phaseStartedAt = Date.now();
    for (const s3Key of mediaKeySet) {
      await withDynamoRetry(() =>
        ddbClient.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              pk,
              sk: mediaSk(s3Key),
              entityType: "spaces-v2-media-ref",
              projectId: normalizedProject.id,
              ownerHash: owner,
              ownerPk: ownerPk(normalizedProject.ownerUserEmail),
              ownerUserEmail: normalizedProject.ownerUserEmail,
              listSk: mediaOwnerListSk(s3Key),
              s3Key,
              s3KeyHash: sha256Hex(s3Key),
              updatedAt: normalizedProject.updatedAt,
            } as SpacesV2MediaRefItem,
          }),
        ),
      );
    }
    mediaRefsWriteMs = Date.now() - phaseStartedAt;

    phaseStartedAt = Date.now();
    await withDynamoRetry(() =>
      ddbClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk,
            sk: "META",
            entityType: "spaces-v2-project-meta",
            projectId: normalizedProject.id,
            ownerHash: owner,
            ownerPk: ownerPk(normalizedProject.ownerUserEmail),
            ownerUserEmail: normalizedProject.ownerUserEmail,
            ownerUserName: normalizedProject.ownerUserName,
            ownerUserImage: normalizedProject.ownerUserImage,
            listSk: listSk(normalizedProject.updatedAt, normalizedProject.id),
            createdAt: normalizedProject.createdAt,
            updatedAt: normalizedProject.updatedAt,
            name: normalizedProject.name,
            rootSpaceId: normalizedProject.rootSpaceId,
            metadata: compactMetadataForMetaItem(normalizedProject.metadata ?? {}),
            revision: nextRevision,
            chunkCount: chunks.length,
            contentSha256,
            mediaKeyCount: mediaKeys.length,
            spacesCount: Object.keys(normalizedProject.spaces || {}).length,
            storageFormat: "spaces-v2-chunks",
          } as SpacesV2MetaItem,
          ConditionExpression: metaCondition.expression,
          ExpressionAttributeNames: metaCondition.names,
          ExpressionAttributeValues: metaCondition.values,
        }),
      ),
    );
    metaWriteMs = Date.now() - phaseStartedAt;

    phaseStartedAt = Date.now();
    await cleanupSupersededItems(tableName, normalizedProject.id, nextRevision, mediaKeySet);
    cleanupMs = Date.now() - phaseStartedAt;
    return {
      revision: nextRevision,
      telemetry: {
        chunkCount: chunks.length,
        chunksWriteMs,
        contentSha256,
        cleanupMs,
        mediaRefsWriteMs,
        mediaKeyCount: mediaKeys.length,
        metaWriteMs,
        payloadBytes: Buffer.byteLength(payloadJson, "utf8"),
        storageFormat: "spaces-v2-chunks",
      },
    };
  } catch (error) {
    await deleteItemsInBatches(tableName, writtenChunkKeys).catch((cleanupError) => {
      console.warn("[spaces-v2] failed to remove orphan chunks after write failure:", cleanupError);
    });
    if (isConditionalCheckFailed(error)) {
      const latest = await getMetaItem(tableName, normalizedProject.id);
      throw new SpacesV2RevisionConflictError(
        normalizedProject.id,
        expectedRevision ?? previousRevision,
        latest?.revision ?? previousRevision,
      );
    }
    throw error;
  }
}

export async function deleteSpacesV2Project(tableName: string, projectId: string): Promise<void> {
  const items = await queryAllProjectItems(tableName, projectId);
  await deleteItemsInBatches(
    tableName,
    items
      .filter((item): item is Record<string, unknown> & { pk: string; sk: string } => {
        return isRecord(item) && typeof item.pk === "string" && typeof item.sk === "string";
      })
      .map((item) => ({ pk: item.pk, sk: item.sk })),
  );
}
