import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AWS_REGION = process.env.AWS_REGION?.trim() || "us-east-1";

export const s3Client = new S3Client({
  region: AWS_REGION,
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
