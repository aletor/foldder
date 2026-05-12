import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 220 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "video/", "audio/"];

function safeSegment(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || fallback;
}

function extensionForContentType(contentType: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  const fromName = dot >= 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (fromName) return fromName;
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "bin";
}

export async function POST(req: Request) {
  try {
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
      return NextResponse.json({ error: "unsupported media type" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const projectId = safeSegment(form.get("projectId"), "unsaved");
    const mediaId = safeSegment(form.get("mediaId"), randomUUID());
    const ext = extensionForContentType(contentType, file.name || "");
    const key = `knowledge-files/project-media/${projectId}/${mediaId}.${ext}`;

    await uploadBufferToS3Key(key, buffer, contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/project-media-upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: buffer.length,
      metadata: { key, contentType },
    });

    const signedUrl = await getPresignedUrl(key);
    const stableUrl = `/api/spaces/s3-file?key=${encodeURIComponent(key)}`;
    return NextResponse.json({ key, s3Key: key, url: stableUrl, signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    console.error("[project-media-upload]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
