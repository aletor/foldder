import { NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import {
  buildUserDesignerAssetObjectKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";
import { uploadBufferToS3Key } from "@/lib/s3-utils";

export const runtime = "nodejs";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bin"]);

function contentTypeForExt(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

/**
 * Sube un binario a la ruta Designer (`…_HR` | `…_OPT`) del espacio.
 * Flujo actual del Designer: solo sube `OPT` (imagen ya optimizada en cliente). `HR` queda por compatibilidad con datos antiguos.
 * FormData: file, spaceId (opcional), assetId, variant (HR | OPT), ext (opcional, sin punto)
 */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const assetId = formData.get("assetId");
    const variant = formData.get("variant");
    const spaceId = formData.get("spaceId");
    const extRaw = formData.get("ext");

    if (typeof assetId !== "string" || (variant !== "HR" && variant !== "OPT")) {
      return NextResponse.json({ error: "assetId and variant (HR|OPT) required" }, { status: 400 });
    }

    let ext =
      typeof extRaw === "string" && extRaw.length > 0
        ? extRaw.replace(/^\./, "").toLowerCase()
        : "";
    if (!ext) {
      const name = file.name || "";
      const dot = name.lastIndexOf(".");
      ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "bin";
    }
    if (!ALLOWED_EXT.has(ext)) {
      ext = "bin";
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const rawContentType = file.type || contentTypeForExt(ext);
    const normalized = rawContentType.startsWith("image/")
      ? await normalizeUploadedImageForFoldder(rawBuffer, rawContentType)
      : {
          buffer: rawBuffer,
          contentType: rawContentType,
          ext,
          optimized: false,
          originalBytes: rawBuffer.length,
        };

    const space =
      typeof spaceId === "string" && spaceId.length > 0 ? spaceId : null;
    const key = buildUserDesignerAssetObjectKey({
      assetId,
      contentExt: normalized.ext,
      spaceId: space,
      userEmail: authState.user.email,
      variant,
    });
    await uploadBufferToS3Key(key, normalized.buffer, normalized.contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/designer-asset-upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: normalized.buffer.length,
      metadata: {
        key,
        variant,
        contentType: normalized.contentType,
        optimized: normalized.optimized,
        originalBytes: normalized.originalBytes,
      },
    });
    const url = stableKnowledgeFileUrlFromKey(key);

    return NextResponse.json({ url, s3Key: key, assetId, variant });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    console.error("[designer-asset-upload]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
