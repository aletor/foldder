/**
 * Layerizer — subida de artefactos derivados a S3 (capas RGBA + fondo limpio).
 * El master nunca se reescribe; estos son artefactos nuevos bajo user-assets/generated/layerizer.
 */

import { uploadBufferToS3Key } from "@/lib/s3-utils";
import {
  buildUserAssetObjectKey,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";

export interface UploadedArtifact {
  s3Key: string;
  url: string;
}

export async function uploadLayerizerArtifact(input: {
  userEmail: string;
  jobId: string;
  name: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<UploadedArtifact> {
  const ext = (input.contentType || "image/png").includes("png") ? "png" : "bin";
  const key = buildUserAssetObjectKey({
    filename: `${input.jobId}_${input.name}.${ext}`,
    folder: "generated/layerizer",
    unique: true,
    userEmail: input.userEmail,
  });
  await uploadBufferToS3Key(key, input.buffer, input.contentType || "image/png");
  return { s3Key: key, url: stableKnowledgeFileUrlFromKey(key) };
}
