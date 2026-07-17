import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildProjectMediaObjectKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { ensureBrowserUploadCorsForS3, getPresignedUploadUrl } from "@/lib/s3-utils";
import {
  extensionForProjectMediaContentType,
  isAllowedProjectMediaContentType,
  normalizeProjectMediaContentType,
} from "@/lib/project-media-upload-policy";

export const runtime = "nodejs";

const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";

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

function requiresStableProjectId(): boolean {
  return Boolean(process.env[SPACES_V2_DDB_TABLE_ENV]?.trim());
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json().catch(() => null)) as UploadTicketRequest | null;
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const contentType = normalizeProjectMediaContentType(
      typeof body?.contentType === "string" ? body.contentType : "",
      filename,
    );

    if (!isAllowedProjectMediaContentType(contentType, filename)) {
      return NextResponse.json({ error: "unsupported media type" }, { status: 400 });
    }

    const projectId = safeSegment(body?.projectId, "");
    if (requiresStableProjectId() && !projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const mediaId = safeSegment(body?.mediaId, randomUUID());
    const ext = extensionForProjectMediaContentType(contentType, filename);
    const key = buildProjectMediaObjectKey({
      contentExt: ext,
      mediaId,
      projectId: projectId || "unsaved",
      userEmail: authState.user.email,
    });
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
