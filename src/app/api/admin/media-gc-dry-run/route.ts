import path from "path";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { classifyMediaGcObjects } from "@/lib/admin-media-gc";
import { ddbClient, isDynamoEnabled } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import { readJsonStore } from "@/lib/json-persistence";
import {
  collectS3KeysFromProjectSpaces,
  collectS3KeysFromValue,
} from "@/lib/s3-media-hydrate";
import {
  readAllDdbProjects as readAllDdbProjectsStore,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import { readAllSpacesV2Projects } from "@/lib/spaces-v2-store";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

export const runtime = "nodejs";

const KNOWLEDGE_PREFIX = "knowledge-files/";
const MAX_SAMPLE_KEYS = 200;
const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

type S3ObjectRow = {
  key: string;
  lastModified: string | null;
  size: number;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isAdminUser(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  if (configured.length === 0) return process.env.NODE_ENV !== "production";
  return configured.includes(email);
}

function devBypassAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return req.headers.get("x-foldder-dev-passcode") === "6666";
}

async function ensureAdmin(req: NextRequest): Promise<NextResponse | null> {
  if (devBypassAllowed(req)) return null;
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

function collectS3KeysFromProject(project: ProjectRecord): string[] {
  return [
    ...new Set([
      ...collectS3KeysFromProjectSpaces(project.spaces || {}),
      ...collectS3KeysFromValue(project.metadata || {}),
    ]),
  ];
}

async function listAllKnowledgeObjects(): Promise<S3ObjectRow[]> {
  const out: S3ObjectRow[] = [];
  let token: string | undefined;
  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: token,
        MaxKeys: 1000,
        Prefix: KNOWLEDGE_PREFIX,
      }),
    );
    for (const row of response.Contents ?? []) {
      if (!row.Key) continue;
      out.push({
        key: row.Key,
        lastModified: row.LastModified ? row.LastModified.toISOString() : null,
        size: Number(row.Size ?? 0),
      });
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function referencedKeysFromSpacesV2(tableName: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
          ExpressionAttributeNames: {
            "#entityType": "entityType",
            "#s3Key": "s3Key",
          },
          ExpressionAttributeValues: {
            ":mediaRef": "spaces-v2-media-ref",
          },
          FilterExpression: "#entityType = :mediaRef",
          ProjectionExpression: "#s3Key",
        }),
      ),
    );
    for (const item of response.Items ?? []) {
      const key = (item as { s3Key?: unknown }).s3Key;
      if (typeof key === "string" && key.startsWith(KNOWLEDGE_PREFIX)) keys.add(key);
    }
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  try {
    const projects = await readAllSpacesV2Projects(tableName);
    for (const project of projects) {
      for (const key of collectS3KeysFromProject(project)) {
        if (key.startsWith(KNOWLEDGE_PREFIX)) keys.add(key);
      }
    }
  } catch (error) {
    console.warn("[admin][media-gc-dry-run] spaces_v2 project read failed; media refs still protect known keys.", error);
  }

  return keys;
}

async function referencedKeysFromProjects(): Promise<Set<string>> {
  if (isDynamoEnabled(SPACES_V2_DDB_TABLE_ENV)) {
    return referencedKeysFromSpacesV2(process.env[SPACES_V2_DDB_TABLE_ENV]?.trim() || "");
  }
  const projects = isDynamoEnabled(SPACES_DDB_TABLE_ENV)
    ? await readAllDdbProjectsStore(process.env[SPACES_DDB_TABLE_ENV]?.trim() || "")
    : await readJsonStore(spacesStore);
  return new Set(projects.flatMap(collectS3KeysFromProject));
}

export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdmin(req);
    if (guard) return guard;

    const [objects, referenced] = await Promise.all([
      listAllKnowledgeObjects(),
      referencedKeysFromProjects(),
    ]);
    const classification = classifyMediaGcObjects(objects, referenced);
    const candidates = classification.objects.filter((row) => row.candidate);
    const orphanObjects = classification.objects.filter((row) => !row.referenced);
    const unsavedObjects = classification.objects.filter((row) => row.unsaved);
    const referencedUnsaved = classification.objects.filter((row) => row.category === "referenced-unsaved");

    return NextResponse.json({
      dryRun: true,
      generatedAt: new Date().toISOString(),
      policyConfig: classification.policy,
      policy:
        "No objects are deleted by this endpoint. Candidates are informational only; physical deletion is limited to project deletion and the protected admin manager.",
      summary: classification.summary,
      samples: {
        orphans: orphanObjects.slice(0, MAX_SAMPLE_KEYS),
        safeCandidates: candidates.slice(0, MAX_SAMPLE_KEYS),
        unsaved: unsavedObjects.slice(0, MAX_SAMPLE_KEYS),
        referencedUnsaved: referencedUnsaved.slice(0, MAX_SAMPLE_KEYS),
      },
    });
  } catch (error) {
    console.error("[admin][media-gc-dry-run] failed:", error);
    return NextResponse.json({ error: "Failed to build media dry-run inventory" }, { status: 500 });
  }
}
