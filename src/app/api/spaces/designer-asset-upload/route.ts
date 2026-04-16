import { NextResponse } from "next/server";
import { getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildDesignerAssetObjectKey } from "@/lib/designer-asset-keys";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "bin"]);

/**
 * Sube un binario a la ruta Designer HR/OPT del espacio.
 * FormData: file, spaceId (opcional), assetId, variant (HR | OPT), ext (opcional, sin punto)
 */
export async function POST(req: Request) {
  try {
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `application/octet-stream`);

    const space =
      typeof spaceId === "string" && spaceId.length > 0 ? spaceId : null;
    const key = buildDesignerAssetObjectKey(space, assetId, variant, ext);
    await uploadBufferToS3Key(key, buffer, contentType);
    const url = await getPresignedUrl(key);

    return NextResponse.json({ url, s3Key: key, assetId, variant });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    console.error("[designer-asset-upload]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
