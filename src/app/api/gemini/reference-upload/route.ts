import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { getPresignedUrl, uploadToS3 } from "@/lib/s3-utils";

const MAX_REFERENCE_BYTES = 3_500_000;

export async function POST(req: Request) {
  try {
    await assertApiServiceEnabled("gemini-nano");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      return NextResponse.json(
        { error: "reference too large after compression" },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";
    const key = await uploadToS3(file.name || `gemini-reference-${Date.now()}.jpg`, buffer, contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-assets",
      route: "/api/gemini/reference-upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: buffer.length,
      metadata: { key, contentType },
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
