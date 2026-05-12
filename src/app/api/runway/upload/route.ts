import { NextResponse } from 'next/server';
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import { uploadToS3, getPresignedUrl } from '@/lib/s3-utils';

export const runtime = "nodejs";

function filenameWithExtension(filename: string | undefined, ext: string) {
  const base = (filename || `runway-upload-${Date.now()}`)
    .trim()
    .replace(/\.[^.]+$/, "");
  return `${base || `runway-upload-${Date.now()}`}.${ext}`;
}

export async function POST(req: Request) {
  try {
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'video/mp4';
    const normalized = contentType.startsWith("image/")
      ? await normalizeUploadedImageForFoldder(buffer, contentType)
      : {
          buffer,
          contentType,
          ext: file.name.split(".").pop() || "bin",
          optimized: false,
          originalBytes: buffer.length,
        };
    
    console.log(`[Runway Upload] Uploading ${file.name} (${normalized.contentType})...`);

    // Upload to S3
    const s3Key = await uploadToS3(
      contentType.startsWith("image/")
        ? filenameWithExtension(file.name, normalized.ext)
        : file.name,
      normalized.buffer,
      normalized.contentType,
    );
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-knowledge",
      route: "/api/runway/upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: normalized.buffer.length,
      metadata: {
        key: s3Key,
        contentType: normalized.contentType,
        optimized: normalized.optimized,
        originalBytes: normalized.originalBytes,
      },
    });

    // Get a URL that Runway can access
    const url = await getPresignedUrl(s3Key);

    return NextResponse.json({ url, s3Key });
  } catch (error: unknown) {
    console.error("[Runway Upload Error]:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
