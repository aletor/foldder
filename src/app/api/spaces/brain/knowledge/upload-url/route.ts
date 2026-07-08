import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import {
  isAllowedKnowledgeUpload,
  resolveKnowledgeContentType,
  sanitizeKnowledgeFilename,
} from "@/lib/brain/knowledge-upload-policy";
import { buildUserAssetObjectKey, requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { ensureBrowserUploadCorsForS3, getPresignedUploadUrl } from "@/lib/s3-utils";

export const runtime = "nodejs";

const MAX_DIRECT_UPLOAD_BYTES = 40 * 1024 * 1024;

type UploadUrlRequest = {
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = (await req.json().catch(() => null)) as UploadUrlRequest | null;
    const rawFilename = typeof body?.filename === "string" ? body.filename.trim() : "";
    const rawContentType = typeof body?.contentType === "string" ? body.contentType : "";
    const size = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!rawFilename || !isAllowedKnowledgeUpload(rawFilename, rawContentType)) {
      return NextResponse.json(
        {
          error: "unsupported_type",
          filename: rawFilename || undefined,
          contentType: rawContentType || undefined,
        },
        { status: 400 },
      );
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });
    }
    if (size > MAX_DIRECT_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file_too_large", maxBytes: MAX_DIRECT_UPLOAD_BYTES }, { status: 413 });
    }

    const filename = sanitizeKnowledgeFilename(rawFilename);
    const contentType = resolveKnowledgeContentType(rawFilename, rawContentType);
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
      metadata: { key, contentType, requestedBytes: size, originalFilename: rawFilename },
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
