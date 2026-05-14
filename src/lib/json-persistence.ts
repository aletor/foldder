import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

export type JsonStoreConfig<T> = {
  createEmpty: () => T;
  defaultS3Key: string;
  localPath: string;
  s3KeyEnv: string;
};

function isJsonStoreS3Enabled(): boolean {
  const localOnly = (process.env.FOLDDER_JSON_STORE_LOCAL_ONLY || "")
    .trim()
    .toLowerCase();
  if (localOnly === "1" || localOnly === "true" || localOnly === "yes") {
    return false;
  }
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      BUCKET_NAME,
  );
}

function resolveS3Key<T>(config: JsonStoreConfig<T>): string {
  return process.env[config.s3KeyEnv]?.trim() || config.defaultS3Key;
}

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`[json-persistence] invalid JSON in ${label}: ${String(error)}`);
  }
}

async function readLocalJson<T>(config: JsonStoreConfig<T>): Promise<T> {
  try {
    const raw = await fs.readFile(config.localPath, "utf8");
    return parseJson<T>(raw, config.localPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return config.createEmpty();
    throw error;
  }
}

async function writeLocalJson<T>(
  config: JsonStoreConfig<T>,
  value: T,
  options?: { bestEffort?: boolean },
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(config.localPath), { recursive: true });
    await fs.writeFile(config.localPath, JSON.stringify(value, null, 2), "utf8");
  } catch (error) {
    if (options?.bestEffort) return;
    throw error;
  }
}

async function getS3JsonText(key: string): Promise<{ body: string; etag?: string; exists: boolean }> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    );
    return {
      body: response.Body ? await response.Body.transformToString() : "",
      etag: response.ETag,
      exists: true,
    };
  } catch (error) {
    const err = error as {
      Code?: string;
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      err.name === "NoSuchKey" ||
      err.Code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return { body: "", exists: false };
    }
    throw error;
  }
}

function isPreconditionFailure(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === "PreconditionFailed" || err.$metadata?.httpStatusCode === 412;
}

export async function readJsonStore<T>(config: JsonStoreConfig<T>): Promise<T> {
  if (!isJsonStoreS3Enabled()) {
    return readLocalJson(config);
  }

  const key = resolveS3Key(config);
  const remote = await getS3JsonText(key);
  if (remote.exists) {
    if (!remote.body.trim()) return config.createEmpty();
    return parseJson<T>(remote.body, `s3://${BUCKET_NAME}/${key}`);
  }

  return readLocalJson(config);
}

const MAX_S3_WRITE_RETRIES = 12;

export async function updateJsonStore<T>(
  config: JsonStoreConfig<T>,
  updater: (current: T) => Promise<T> | T,
): Promise<T> {
  if (!isJsonStoreS3Enabled()) {
    const current = await readLocalJson(config);
    const next = await updater(current);
    await writeLocalJson(config, next);
    return next;
  }

  const key = resolveS3Key(config);

  for (let attempt = 0; attempt < MAX_S3_WRITE_RETRIES; attempt++) {
    const remote = await getS3JsonText(key);
    if (remote.exists && !remote.etag) {
      throw new Error(`[json-persistence] missing ETag for ${key}`);
    }
    const current = remote.exists
      ? remote.body.trim()
        ? parseJson<T>(remote.body, `s3://${BUCKET_NAME}/${key}`)
        : config.createEmpty()
      : await readLocalJson(config);
    const next = await updater(current);
    const body = JSON.stringify(next, null, 2);

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: "application/json; charset=utf-8",
          ...(remote.exists ? { IfMatch: remote.etag } : { IfNoneMatch: "*" }),
        }),
      );
      await writeLocalJson(config, next, { bestEffort: true });
      return next;
    } catch (error) {
      if (isPreconditionFailure(error)) {
        await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 45));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`[json-persistence] exhausted S3 write retries for ${key}`);
}
