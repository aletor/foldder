import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import {
  buildProjectMediaObjectKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";
import { uploadBufferToS3Key } from "@/lib/s3-utils";

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
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
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
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    let usageUserEmail: string | undefined;
    try {
      usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    } catch (error) {
      console.warn("[project-media-upload] usage user resolution failed; continuing upload.", error);
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
      return NextResponse.json({ error: "unsupported media type" }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }
    const preserveQuality = form.get("preserveQuality") === "1";
    const normalized = contentType.startsWith("image/") && !preserveQuality
      ? await normalizeUploadedImageForFoldder(rawBuffer, contentType)
      : {
          buffer: rawBuffer,
          contentType,
          ext: extensionForContentType(contentType, file.name || ""),
          optimized: false,
          originalBytes: rawBuffer.length,
        };

    const projectId = safeSegment(form.get("projectId"), "unsaved");
    const mediaId = safeSegment(form.get("mediaId"), randomUUID());
    const key = buildProjectMediaObjectKey({
      contentExt: normalized.ext,
      mediaId,
      projectId,
      userEmail: authState.user.email,
    });

    await uploadBufferToS3Key(key, normalized.buffer, normalized.contentType);
    recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/project-media-upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: normalized.buffer.length,
      metadata: {
        key,
        contentType: normalized.contentType,
        optimized: normalized.optimized,
        originalBytes: normalized.originalBytes,
        preserveQuality,
      },
    }).catch((error) => {
      console.warn("[project-media-upload] usage recording failed; upload kept.", error);
    });

    const stableUrl = stableKnowledgeFileUrlFromKey(key);
    return NextResponse.json({ key, s3Key: key, url: stableUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    console.error("[project-media-upload]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
