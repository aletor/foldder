import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AWS_REGION = process.env.AWS_REGION?.trim() || "us-east-1";

export const s3Client = new S3Client({
  region: AWS_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "content-engine-ai-docs-832666711966";

export async function uploadToS3(filename: string, fileBuffer: Buffer, contentType: string) {
  // Sanitize filename: remove accents, spaces and special characters for AI compatibility
  const sanitizedFilename = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, "_") // Replace spaces with underscore
    .replace(/[^a-zA-Z0-9._-]/g, ""); // Remove everything else except basic chars

  const params = {
    Bucket: BUCKET_NAME,
    Key: `knowledge-files/${Date.now()}-${sanitizedFilename}`,
    Body: fileBuffer,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command).catch((err: unknown) => {
    console.error("Error uploading to S3:", err);
    throw err;
  });

  return params.Key;
}

/** Subida con clave explícita (p. ej. assets Designer `…/designer/{id}_HR.jpg`). */
export async function uploadBufferToS3Key(key: string, fileBuffer: Buffer, contentType: string): Promise<string> {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  };
  const command = new PutObjectCommand(params);
  await s3Client.send(command).catch((err: unknown) => {
    console.error("Error uploading to S3 (explicit key):", err);
    throw err;
  });
  return key;
}

export async function s3ObjectExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    );
    return true;
  } catch (e: unknown) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (e as { name?: string })?.name;
    if (status === 404 || name === "NotFound") return false;
    throw e;
  }
}

export async function getFromS3(key: string): Promise<Buffer> {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  const command = new GetObjectCommand(params);
  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error("Failed to retrieve file body from S3.");
  }

  // Format correctly for AWS SDK v3
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}

export async function getPresignedUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 900) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

let browserUploadCorsPromise: Promise<void> | null = null;

function sameStringList(a: string[] | undefined, b: string[]): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function ensureBrowserUploadCorsForS3(): Promise<void> {
  if (process.env.FOLDDER_SKIP_S3_CORS_ENSURE === "1") return;
  if (!browserUploadCorsPromise) {
    browserUploadCorsPromise = ensureBrowserUploadCorsForS3Inner().catch((error) => {
      browserUploadCorsPromise = null;
      throw error;
    });
  }
  return browserUploadCorsPromise;
}

async function ensureBrowserUploadCorsForS3Inner(): Promise<void> {
  const ruleId = "foldder-browser-project-media-upload";
  const desiredRule: CORSRule = {
    ID: ruleId,
    AllowedHeaders: ["*"],
    AllowedMethods: ["GET", "HEAD", "PUT"],
    AllowedOrigins: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3000,
  };

  let rules: CORSRule[] = [];
  try {
    const existing = await s3Client.send(new GetBucketCorsCommand({ Bucket: BUCKET_NAME }));
    rules = existing.CORSRules ?? [];
  } catch (error) {
    const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    if (
      err.name !== "NoSuchCORSConfiguration" &&
      err.Code !== "NoSuchCORSConfiguration" &&
      err.$metadata?.httpStatusCode !== 404
    ) {
      throw error;
    }
  }

  const current = rules.find((rule) => rule.ID === ruleId);
  if (
    current &&
    sameStringList(current.AllowedHeaders, desiredRule.AllowedHeaders ?? []) &&
    sameStringList(current.AllowedMethods, desiredRule.AllowedMethods ?? []) &&
    sameStringList(current.AllowedOrigins, desiredRule.AllowedOrigins ?? []) &&
    sameStringList(current.ExposeHeaders, desiredRule.ExposeHeaders ?? []) &&
    current.MaxAgeSeconds === desiredRule.MaxAgeSeconds
  ) {
    return;
  }

  await s3Client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [...rules.filter((rule) => rule.ID !== ruleId), desiredRule],
      },
    }),
  );
}

export async function deleteFromS3(key: string) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  const command = new DeleteObjectCommand(params);
  await s3Client.send(command).catch((err: unknown) => {
    console.error("Error deleting from S3:", err);
    throw err;
  });
}
