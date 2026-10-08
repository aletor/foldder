import { NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { ensureBrowserUploadCorsForS3, getPresignedUploadUrl } from "@/lib/s3-utils";
import { buildBrandKitIngestObjectKey } from "@/lib/brandkit/ingest/upload-brand-kit-file";
import { BRAND_KIT_INGEST_MAX_FILE_BYTES } from "@/lib/brandkit/ingest/brand-kit-ingest-upload-limits";

export const runtime = "nodejs";

type UploadTicketRequest = {
  contentType?: unknown;
  filename?: unknown;
  size?: unknown;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json().catch(() => null)) as UploadTicketRequest | null;
    const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
    const contentType =
      typeof body?.contentType === "string" && body.contentType.trim()
        ? body.contentType.trim()
        : "application/octet-stream";
    const size = typeof body?.size === "number" && Number.isFinite(body.size) ? body.size : 0;

    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }
    if (size > BRAND_KIT_INGEST_MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file too large (max 32 MB)" }, { status: 413 });
    }

    const key = buildBrandKitIngestObjectKey(authState.user.email, filename, contentType);
    await ensureBrowserUploadCorsForS3().catch((error) => {
      console.warn(
        "[brandKit/ingest-upload-url] S3 CORS self-check failed; signed upload may need bucket CORS.",
        error,
      );
    });
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return NextResponse.json({
      key,
      method: "PUT",
      s3Key: key,
      uploadUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload ticket failed";
    console.error("[brandKit/ingest-upload-url]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
