import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { getPresignedUrl, uploadToS3 } from "@/lib/s3-utils";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";

const MAX_REFERENCE_BYTES = 3_500_000;

export const runtime = "nodejs";

function filenameWithExtension(filename: string | undefined, ext: string) {
  const base = (filename || `gemini-reference-${Date.now()}`)
    .trim()
    .replace(/\.[^.]+$/, "");
  return `${base || `gemini-reference-${Date.now()}`}.${ext}`;
}

export async function POST(req: Request) {
  try {
    await assertApiServiceEnabled("gemini-nano");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const rawContentType = file.type || "image/jpeg";
    const normalized = rawContentType.startsWith("image/")
      ? await normalizeUploadedImageForFoldder(rawBuffer, rawContentType)
      : {
          buffer: rawBuffer,
          contentType: rawContentType,
          ext: "bin",
          optimized: false,
          originalBytes: rawBuffer.length,
        };

    if (normalized.buffer.length > MAX_REFERENCE_BYTES) {
      return NextResponse.json(
        { error: "reference too large after compression" },
        { status: 413 },
      );
    }

    const key = await uploadToS3(
      filenameWithExtension(file.name, normalized.ext),
      normalized.buffer,
      normalized.contentType,
    );
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-assets",
      route: "/api/gemini/reference-upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: normalized.buffer.length,
      metadata: {
        key,
        contentType: normalized.contentType,
        optimized: normalized.optimized,
        originalBytes: normalized.originalBytes,
      },
    });
    const url = await getPresignedUrl(key);
    return NextResponse.json({ url, s3Key: key });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      const message =
        error.reason === "paid_api_beta_allowlist"
          ? "APIs de pago bloqueadas durante la beta para este usuario."
          : `API bloqueada en admin: ${error.label}`;
      return NextResponse.json({ error: message, status: 423 }, { status: 423 });
    }
    const message = error instanceof Error ? error.message : "upload failed";
    console.error("[gemini-reference-upload]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
