import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";

function safeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safePHash(pHash: string): string {
  return pHash.replace(/[^\w.-]+/g, "_").slice(0, 48) || "logo";
}

export function buildCanonicalLogoRasterKey(input: {
  userEmail: string;
  projectId: string;
  pHash: string;
}): string {
  return buildUserAssetObjectKey({
    userEmail: input.userEmail,
    folder: `brandKit/logos/raster/${safeProjectId(input.projectId)}/${safePHash(input.pHash)}`,
    filename: "logo.png",
    unique: false,
  });
}

export function canonicalLogoRasterUrl(s3Key: string, pHash: string): string {
  return `/api/spaces/s3-file?key=${encodeURIComponent(s3Key)}&v=${encodeURIComponent(pHash)}`;
}

export async function uploadCanonicalLogoRaster(input: {
  userEmail: string;
  projectId: string;
  pHash: string;
  png: Buffer;
}): Promise<{ s3Key: string; imageUrl: string }> {
  const s3Key = buildCanonicalLogoRasterKey(input);
  await uploadBufferToS3Key(s3Key, input.png, "image/png");
  return { s3Key, imageUrl: canonicalLogoRasterUrl(s3Key, input.pHash) };
}
