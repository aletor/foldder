import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureBrowserUploadCorsForS3, getPresignedUploadUrl } from "@/lib/s3-utils";

export const runtime = "nodejs";

const ALLOWED_PREFIXES = ["image/", "video/", "audio/"];

type UploadTicketRequest = {
  contentType?: unknown;
  filename?: unknown;
  mediaId?: unknown;
  projectId?: unknown;
};

function safeSegment(value: unknown, fallback: string): string {
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
    const body = (await req.json().catch(() => null)) as UploadTicketRequest | null;
    const contentType = typeof body?.contentType === "string"
      ? body.contentType.trim().toLowerCase()
      : "application/octet-stream";

    if (!ALLOWED_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
      return NextResponse.json({ error: "unsupported media type" }, { status: 400 });
    }

    const projectId = safeSegment(body?.projectId, "unsaved");
    const mediaId = safeSegment(body?.mediaId, randomUUID());
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const ext = extensionForContentType(contentType, filename);
    const key = `knowledge-files/project-media/${projectId}/${mediaId}.${ext}`;
    await ensureBrowserUploadCorsForS3().catch((error) => {
      console.warn("[project-media-upload-url] S3 CORS self-check failed; signed upload may need bucket CORS.", error);
    });
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    const stableUrl = `/api/spaces/s3-file?key=${encodeURIComponent(key)}`;

    return NextResponse.json({
      key,
      method: "PUT",
      s3Key: key,
      uploadUrl,
      url: stableUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload ticket failed";
    console.error("[project-media-upload-url]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
