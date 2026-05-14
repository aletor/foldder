import { createHash, randomUUID } from "node:crypto";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient, isDynamoEnabled } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import {
  collectS3KeysFromProjectSpaces,
  collectS3KeysFromValue,
} from "@/lib/s3-media-hydrate";

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";
const MAX_ERROR_MESSAGE_CHARS = 500;

export type SpacesSaveOperation =
  | "create"
  | "create_if_missing"
  | "delete_project"
  | "save"
  | "unknown";

export type SpacesSaveStatus = "ok" | "error" | "conflict" | "rejected";

export type SpacesProjectPayloadStats = {
  edgeCount: number;
  mediaKeyCount: number;
  metadataBytes: number;
  nodeCount: number;
  payloadBytes: number;
  spaceCount: number;
};

export type SpacesWriteStoreStats = {
  chunkCount?: number;
  contentSha256?: string;
  mediaKeyCount?: number;
  payloadBytes?: number;
  storageFormat?: string;
};

export type SpacesSaveTelemetryEvent = {
  actualRevision?: number | null;
  chunkCount?: number;
  contentSha256?: string;
  durationMs: number;
  edgeCount?: number;
  errorCode?: string;
  errorMessage?: string;
  expectedRevision?: number | null;
  mediaKeyCount?: number;
  metadataBytes?: number;
  nodeCount?: number;
  operation: SpacesSaveOperation;
  ownerHash?: string;
  payloadBytes?: number;
  projectId?: string;
  route: string;
  s3DeleteFailed?: number;
  s3DeleteRequested?: number;
  s3DeleteSucceeded?: number;
  spaceCount?: number;
  status: SpacesSaveStatus;
  storageFormat?: string;
};

type SpacesTelemetryItem = SpacesSaveTelemetryEvent & {
  createdAt: string;
  entityType: "spaces-save-telemetry";
  pk: string;
  sk: string;
};

function telemetryTableName(): string {
  if (isDynamoEnabled(SPACES_V2_DDB_TABLE_ENV)) {
    return process.env[SPACES_V2_DDB_TABLE_ENV]?.trim() || "";
  }
  if (isDynamoEnabled(SPACES_DDB_TABLE_ENV)) {
    return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
  }
  return "";
}

function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function spacesTelemetryOwnerHash(email: string | null | undefined): string {
  const normalized = normalizeOwnerEmail(email);
  if (!normalized) return "";
  return createHash("sha256").update(normalized).digest("hex").slice(0, 20);
}

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

function truncateError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.length > MAX_ERROR_MESSAGE_CHARS
    ? `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...`
    : message;
}

function sanitizeEvent(event: SpacesSaveTelemetryEvent): SpacesSaveTelemetryEvent {
  return {
    ...event,
    contentSha256: event.contentSha256?.slice(0, 64),
    errorMessage: truncateError(event.errorMessage),
    ownerHash: event.ownerHash || undefined,
    projectId: event.projectId || undefined,
  };
}

function dayPk(createdAt: string): string {
  return `SPACES_TELEMETRY#${createdAt.slice(0, 10)}`;
}

export function summarizeSpacesProjectPayload(input: {
  metadata?: unknown;
  spaces?: unknown;
}): SpacesProjectPayloadStats {
  const spaces = input.spaces && typeof input.spaces === "object"
    ? (input.spaces as Record<string, { edges?: unknown[]; nodes?: unknown[] }>)
    : {};
  const graphs = Object.values(spaces);
  const nodeCount = graphs.reduce((acc, graph) => acc + (Array.isArray(graph.nodes) ? graph.nodes.length : 0), 0);
  const edgeCount = graphs.reduce((acc, graph) => acc + (Array.isArray(graph.edges) ? graph.edges.length : 0), 0);
  const mediaKeys = new Set([
    ...collectS3KeysFromProjectSpaces(spaces),
    ...collectS3KeysFromValue(input.metadata || {}),
  ]);
  return {
    edgeCount,
    mediaKeyCount: mediaKeys.size,
    metadataBytes: jsonBytes(input.metadata || {}),
    nodeCount,
    payloadBytes: jsonBytes({ metadata: input.metadata || {}, spaces }),
    spaceCount: graphs.length,
  };
}

export async function recordSpacesSaveTelemetry(event: SpacesSaveTelemetryEvent): Promise<void> {
  const createdAt = new Date().toISOString();
  const clean = sanitizeEvent(event);
  console.info("[spaces-save-telemetry]", JSON.stringify({ createdAt, ...clean }));

  const tableName = telemetryTableName();
  if (!tableName) return;

  const item: SpacesTelemetryItem = {
    ...clean,
    createdAt,
    entityType: "spaces-save-telemetry",
    pk: dayPk(createdAt),
    sk: `${createdAt}#${randomUUID()}`,
  };
  try {
    await withDynamoRetry(() =>
      ddbClient.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        }),
      ),
    );
  } catch (error) {
    console.warn("[spaces-save-telemetry] failed to persist telemetry:", error);
  }
}

export async function readRecentSpacesSaveTelemetry(options?: {
  days?: number;
  limit?: number;
}): Promise<SpacesTelemetryItem[]> {
  const tableName = telemetryTableName();
  if (!tableName) return [];

  const days = Math.max(1, Math.min(14, Math.floor(options?.days ?? 2)));
  const limit = Math.max(1, Math.min(500, Math.floor(options?.limit ?? 100)));
  const out: SpacesTelemetryItem[] = [];

  for (let i = 0; i < days && out.length < limit; i += 1) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: { "#pk": "pk" },
          ExpressionAttributeValues: { ":pk": `SPACES_TELEMETRY#${day}` },
          Limit: limit - out.length,
          ScanIndexForward: false,
        }),
      ),
    );
    for (const item of response.Items ?? []) {
      if ((item as { entityType?: unknown }).entityType === "spaces-save-telemetry") {
        out.push(item as SpacesTelemetryItem);
      }
    }
  }

  return out
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
