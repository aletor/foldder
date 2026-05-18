import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { buildUserAssetObjectKey, requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { ensureBrowserUploadCorsForS3, getPresignedUploadUrl } from "@/lib/s3-utils";

export const runtime = "nodejs";

const MAX_DIRECT_UPLOAD_BYTES = 40 * 1024 * 1024;

const ALLOWED_EXT = new Set(["pdf", "docx", "txt", "md", "rtf", "html", "htm", "jpg", "jpeg", "png", "webp"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/rtf",
  "text/html",
  "application/xhtml+xml",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type UploadUrlRequest = {
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
};

function getExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  return ext === "jpeg" ? "jpg" : ext;
}

function sanitizeKnowledgeFilename(filename: string): string {
  const clean = filename
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return clean || `knowledge-${Date.now()}.bin`;
}

function contentTypeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  if (ext === "rtf") return "application/rtf";
  if (ext === "html" || ext === "htm") return "text/html";
  if (ext === "jpg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

function isAllowedUpload(filename: string, contentType: string): boolean {
  const ext = getExt(filename);
  const mime = contentType.toLowerCase();
  const isImage = mime.startsWith("image/") || ["jpg", "png", "webp"].includes(ext);
  const isHtml = ext === "html" || ext === "htm";
  const isBrowserUnknownMime = mime === "application/octet-stream" && ALLOWED_EXT.has(ext);
  return ALLOWED_EXT.has(ext) && (ALLOWED_MIME.has(mime) || mime.startsWith("text/") || isImage || isHtml || isBrowserUnknownMime);
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = (await req.json().catch(() => null)) as UploadUrlRequest | null;
    const filename = typeof body?.filename === "string" ? sanitizeKnowledgeFilename(body.filename) : "";
    let contentType = typeof body?.contentType === "string" && body.contentType.trim()
      ? body.contentType.trim().toLowerCase()
      : "application/octet-stream";
    const size = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!filename || !isAllowedUpload(filename, contentType)) {
      return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
    }
    if (contentType === "application/octet-stream") {
      contentType = contentTypeForExt(getExt(filename));
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });
    }
    if (size > MAX_DIRECT_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file_too_large", maxBytes: MAX_DIRECT_UPLOAD_BYTES }, { status: 413 });
    }

    const key = buildUserAssetObjectKey({
      userEmail: authState.user.email,
      folder: "brain/knowledge",
      filename,
    });

    await ensureBrowserUploadCorsForS3().catch((error) => {
      console.warn("[brain/knowledge/upload-url] S3 CORS self-check failed; signed upload may need bucket CORS.", error);
    });
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-knowledge",
      route: "/api/spaces/brain/knowledge/upload-url",
      operation: "presign_put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: 0,
      metadata: { key, contentType, requestedBytes: size },
    });

    return NextResponse.json({
      key,
      s3Key: key,
      method: "PUT",
      uploadUrl,
      maxBytes: MAX_DIRECT_UPLOAD_BYTES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload ticket failed";
    console.error("[brain/knowledge/upload-url]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
