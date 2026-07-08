import { NextRequest, NextResponse } from "next/server";
import { logoUrlSignature } from "@/lib/brandkit/logo-signature";
import { isVectorizerConfigured, vectorizeRasterBuffer } from "@/lib/brandkit/vectorizer-ai-client";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";

export const runtime = "nodejs";

function filenameFromKey(key: string): string {
  const base = key.split("/").pop() || "logo.png";
  return base.includes(".") ? base : `${base}.png`;
}

function contentTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

export async function POST(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    if (!isVectorizerConfigured()) {
      return NextResponse.json({ error: "vectorizer_not_configured" }, { status: 503 });
    }

    const body = (await req.json()) as { logoRef?: string };
    const logoRef = body.logoRef?.trim();
    if (!logoRef) {
      return NextResponse.json({ error: "logoRef required" }, { status: 400 });
    }

    const s3Key = resolveKnowledgeFilesS3Key(logoRef);
    let raster: Buffer;
    let filename = "logo.png";
    let contentType = "image/png";

    if (s3Key) {
      const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
      if (!allowed) {
        return NextResponse.json({ error: "forbidden_key" }, { status: 403 });
      }
      filename = filenameFromKey(s3Key);
      contentType = contentTypeFromFilename(filename);
      raster = await getFromS3(s3Key);
    } else if (/^https:\/\//i.test(logoRef)) {
      const remote = await fetch(logoRef);
      if (!remote.ok) {
        return NextResponse.json({ error: "logo_fetch_failed" }, { status: 400 });
      }
      contentType = remote.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      raster = Buffer.from(await remote.arrayBuffer());
      const urlName = new URL(logoRef).pathname.split("/").pop();
      if (urlName) filename = urlName;
    } else {
      return NextResponse.json({ error: "logo_ref_not_resolvable" }, { status: 400 });
    }
    const sig = logoUrlSignature(logoRef).replace(/[^\w.-]+/g, "_").slice(0, 48) || "logo";
    const svg = await vectorizeRasterBuffer({
      buffer: raster,
      filename,
      contentType,
      mode: "production",
      audit: { reason: "brandkit_logo_validate", logoSignature: sig, cached: false },
    });
    const vectorKey = buildUserAssetObjectKey({
      userEmail: authState.user.email,
      folder: `brain/brand/logos/vector/${sig}`,
      filename: "primary.svg",
      unique: false,
    });

    await uploadBufferToS3Key(vectorKey, svg, "image/svg+xml");

    return NextResponse.json({
      vectorKey,
      vectorUrl: `/api/spaces/s3-file?key=${encodeURIComponent(vectorKey)}`,
      bytes: svg.length,
    });
  } catch (error) {
    console.error("[brain/brand/vectorize-logo]", error);
    const message = error instanceof Error ? error.message : "vectorize_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
