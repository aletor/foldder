/**
 * Layerizer — persistencia del job en DynamoDB.
 *
 * El job de extracción se ejecuta y streamea dentro de una sola request (NDJSON),
 * así que DynamoDB no orquesta: sirve para (1) reconexión/estado vía /status si el
 * stream se corta y (2) idempotencia por (jobId + paso) — igual que el ledger del wallet.
 *
 * Degradación elegante: si `FOLDDER_LAYERIZER_JOBS_DDB_TABLE` no está configurada,
 * todas las funciones son no-op y el job vive solo en memoria durante la request.
 */

import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient, isDynamoEnabled } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import type {
  LayerizerJob,
  LayerizerJobStatus,
  LayerizerOutput,
} from "@/app/spaces/layerizer/layerizer-types";

export const LAYERIZER_JOBS_DDB_TABLE_ENV = "FOLDDER_LAYERIZER_JOBS_DDB_TABLE";

function tableName(): string | null {
  if (!isDynamoEnabled(LAYERIZER_JOBS_DDB_TABLE_ENV)) return null;
  return process.env[LAYERIZER_JOBS_DDB_TABLE_ENV]?.trim() || null;
}

function jobPk(jobId: string): string {
  return `LAYERIZER_JOB#${jobId}`;
}

type JobItem = LayerizerJob & {
  pk: string;
  sk: "JOB";
  entityType: "layerizer-job";
};

/** Crea (o sobrescribe) el registro del job. No-op si DDB no está configurado. */
export async function putLayerizerJob(job: LayerizerJob): Promise<void> {
  const table = tableName();
  if (!table) return;
  const now = new Date().toISOString();
  const item: JobItem = {
    ...job,
    createdAt: job.createdAt ?? now,
    updatedAt: now,
    pk: jobPk(job.id),
    sk: "JOB",
    entityType: "layerizer-job",
  };
  await withDynamoRetry(() =>
    ddbClient.send(new PutCommand({ TableName: table, Item: item })),
  );
}

/** Lee el registro del job. Devuelve null si no existe o DDB no está configurado. */
export async function getLayerizerJob(jobId: string): Promise<LayerizerJob | null> {
  const table = tableName();
  if (!table) return null;
  const res = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({ TableName: table, Key: { pk: jobPk(jobId), sk: "JOB" } }),
    ),
  );
  if (!res.Item) return null;
  const { pk: _pk, sk: _sk, entityType: _entityType, ...job } = res.Item as JobItem;
  void _pk;
  void _sk;
  void _entityType;
  return job;
}

/** Actualiza estado (y opcionalmente progreso/error) del job. No-op si DDB no configurado. */
export async function patchLayerizerJobStatus(
  jobId: string,
  status: LayerizerJobStatus,
  extra?: { error?: LayerizerJob["error"] },
): Promise<void> {
  const table = tableName();
  if (!table) return;
  const now = new Date().toISOString();
  const sets: string[] = ["#s = :s", "updatedAt = :u"];
  const names: Record<string, string> = { "#s": "status" };
  const values: Record<string, unknown> = { ":s": status, ":u": now };
  if (extra?.error !== undefined) {
    sets.push("#e = :e");
    names["#e"] = "error";
    values[":e"] = extra.error;
  }
  await withDynamoRetry(() =>
    ddbClient.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: jobPk(jobId), sk: "JOB" },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    ),
  );
}

/** Marca el job como terminado y guarda la salida. No-op si DDB no configurado. */
export async function completeLayerizerJob(
  jobId: string,
  status: "done" | "partial",
  output: LayerizerOutput,
): Promise<void> {
  const table = tableName();
  if (!table) return;
  const now = new Date().toISOString();
  await withDynamoRetry(() =>
    ddbClient.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: jobPk(jobId), sk: "JOB" },
        UpdateExpression: "SET #s = :s, #o = :o, updatedAt = :u",
        ExpressionAttributeNames: { "#s": "status", "#o": "output" },
        ExpressionAttributeValues: { ":s": status, ":o": output, ":u": now },
      }),
    ),
  );
}
