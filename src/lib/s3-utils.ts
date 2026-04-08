import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Force us-east-1 to match the bucket location and avoid endpoint conflicts
export const s3Client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});
console.log("[S3 Utils] Client hardcoded to: us-east-1");

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
  await s3Client.send(command).catch((err: any) => {
    console.error("Error uploading to S3:", err);
    throw err;
  });

  return params.Key;
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
  await s3Client.send(command).catch((err: any) => {
    console.error("Error deleting from S3:", err);
    throw err;
  });
}
