import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

/** Objeto único en el bucket (mismo que subidas de medios). */
const DEFAULT_KEY = "foldder-meta/api-usage.jsonl";

function usageS3Key(): string {
  return process.env.FOLDDER_USAGE_S3_KEY?.trim() || DEFAULT_KEY;
}

export function isUsageS3Enabled(): boolean {
  if (process.env.FOLDDER_USAGE_S3_DISABLE === "1") return false;
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim() && BUCKET_NAME
  );
}

async function getObjectText(key: string): Promise<{ body: string; etag?: string }> {
  try {
    const r = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    const etag = r.ETag;
    if (!r.Body) return { body: "" };
    const body = await r.Body.transformToString();
    return { body, etag };
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    if (
      err.name === "NoSuchKey" ||
      err.Code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return { body: "" };
    }
    throw e;
  }
}

/**
 * Añade una línea NDJSON al log en S3.
 * - Cola global: serializa escrituras en este proceso.
 * - Primer objeto: Put con If-None-Match: * (crear si no existe).
 * - Luego: lectura + Put con If-Match (etag) y reintento en 412.
 */
let writeChain: Promise<void> = Promise.resolve();

export function appendUsageLineToS3Queued(line: string): Promise<void> {
  const run = writeChain.then(() => appendUsageLineToS3Inner(line));
  writeChain = run.catch((err) => {
    console.error("[api-usage-s3] cola: error (se continúa):", err);
  });
  return run;
}

const MAX_ETAG_RETRIES = 16;

async function appendUsageLineToS3Inner(line: string): Promise<void> {
  const key = usageS3Key();

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: line,
        ContentType: "application/x-ndjson",
        IfNoneMatch: "*",
      })
    );
    return;
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const conflict =
      err.name === "PreconditionFailed" ||
      err.$metadata?.httpStatusCode === 412;
    if (conflict) {
      /* ya existe el objeto: seguir con RMW */
    } else if (err.$metadata?.httpStatusCode === 400 || err.$metadata?.httpStatusCode === 501) {
      console.warn("[api-usage-s3] IfNoneMatch no aplicable, usando solo RMW:", err.message);
    } else {
      throw e;
    }
  }

  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { body, etag } = await getObjectText(key);
    const newBody = body + line;
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: newBody,
          ContentType: "application/x-ndjson",
          ...(etag ? { IfMatch: etag } : {}),
        })
      );
      return;
    } catch (e: unknown) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      const conflict =
        err.name === "PreconditionFailed" ||
        err.$metadata?.httpStatusCode === 412;
      if (conflict) {
        await new Promise((r) => setTimeout(r, 25 + Math.random() * 45));
        continue;
      }
      throw e;
    }
  }
  throw new Error(`[api-usage-s3] agotados reintentos (${MAX_ETAG_RETRIES})`);
}

export async function readUsageLogFromS3(): Promise<string> {
  if (!isUsageS3Enabled()) return "";
  const { body } = await getObjectText(usageS3Key());
  return body;
}
