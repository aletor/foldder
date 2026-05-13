import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { ddbClient } from "../src/lib/dynamo-utils";
import { withDynamoRetry } from "../src/lib/dynamo-retry";

type MetaLikeRow = {
  id: string;
  entityType?: string;
  ownerUserEmail?: string;
  projectId?: string;
  updatedAt?: string;
};

const LIST_PK = "PROJECTS";
const OWNER_PK_PREFIX = "OWNER#";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asMetaLike(item: unknown): MetaLikeRow | null {
  if (!isRecord(item)) return null;
  if (typeof item.id !== "string" || item.id.length === 0) return null;
  const entityType = typeof item.entityType === "string" ? item.entityType : undefined;
  if (entityType && entityType !== "project-meta") return null;
  return {
    id: item.id,
    entityType,
    ownerUserEmail: typeof item.ownerUserEmail === "string" ? item.ownerUserEmail : undefined,
    projectId: typeof item.projectId === "string" ? item.projectId : undefined,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
  };
}

function listSk(updatedAt: string, projectId: string): string {
  return `${updatedAt}#${projectId}`;
}

function ownerPk(email: string | undefined): string | undefined {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return undefined;
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 20);
  return `${OWNER_PK_PREFIX}${hash}`;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const tableName = process.env.FOLDDER_SPACES_DDB_TABLE?.trim();
  if (!tableName) {
    throw new Error("Missing env var FOLDDER_SPACES_DDB_TABLE");
  }

  console.log(`[backfill-spaces-list] table=${tableName}`);
  console.log(`[backfill-spaces-list] mode=${commit ? "commit" : "dry-run"}`);

  let scanned = 0;
  let eligible = 0;
  let updated = 0;
  let skipped = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ProjectionExpression: "id, entityType, projectId, updatedAt, listPk, ownerPk, ownerUserEmail",
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );

    for (const raw of response.Items ?? []) {
      scanned += 1;
      const item = asMetaLike(raw);
      if (!item) continue;
      const row = raw as Record<string, unknown>;
      const nextOwnerPk = ownerPk(item.ownerUserEmail);
      if (
        typeof row.listPk === "string" &&
        row.listPk.length > 0 &&
        (!nextOwnerPk || row.ownerPk === nextOwnerPk)
      ) {
        skipped += 1;
        continue;
      }

      const projectId = item.projectId || item.id;
      const updatedAt = item.updatedAt || new Date(0).toISOString();
      eligible += 1;

      if (!commit) continue;

      await withDynamoRetry(() =>
        ddbClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id: item.id },
            UpdateExpression: nextOwnerPk
              ? "SET #listPk = :listPk, #listSk = :listSk, #ownerPk = :ownerPk"
              : "SET #listPk = :listPk, #listSk = :listSk",
            ExpressionAttributeNames: {
              "#listPk": "listPk",
              "#listSk": "listSk",
              ...(nextOwnerPk ? { "#ownerPk": "ownerPk" } : {}),
            },
            ExpressionAttributeValues: {
              ":listPk": LIST_PK,
              ":listSk": listSk(updatedAt, projectId),
              ...(nextOwnerPk ? { ":ownerPk": nextOwnerPk } : {}),
            },
          }),
        ),
      );
      updated += 1;
    }

    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  console.log(
    `[backfill-spaces-list] scanned=${scanned} eligible=${eligible} skipped=${skipped} updated=${updated}`,
  );
  if (!commit) {
    console.log("[backfill-spaces-list] dry-run complete. Re-run with --commit to write changes.");
  }
}

main().catch((error) => {
  console.error("[backfill-spaces-list] failed:", error);
  process.exitCode = 1;
});
