import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";
import { inferMimeTypeFromPath } from "@/lib/api-media-access";
import { findPopulateShareByToken } from "@/lib/populate-share-db";
import { populateShareAccessError } from "@/lib/populate-share-access";
import { listPopulateShareExportS3Keys } from "@/lib/populate-live-export";
import {
  collectPopulateShareMediaKeys,
  isPopulateShareMediaKey,
} from "@/lib/populate-share-public-media";

const ONE_HOUR = 3600;

/** Imagen del formulario público: solo claves que ya van en ese enlace o en su galería. */
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const key = new URL(req.url).searchParams.get("key")?.trim() ?? "";
    if (!isPopulateShareMediaKey(key)) {
      return NextResponse.json({ error: "Invalid media key." }, { status: 400 });
    }

    const row = await findPopulateShareByToken(token);
    const access = populateShareAccessError(row);
    if (access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const share = row!;
    const allowed = collectPopulateShareMediaKeys(share.payload);
    if (!allowed.has(key)) {
      const exportKeys = await listPopulateShareExportS3Keys(share);
      if (!exportKeys.includes(key)) {
        return NextResponse.json({ error: "Forbidden media key." }, { status: 403 });
      }
    }

    const object = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    );
    if (!object.Body) {
      return NextResponse.json({ error: "Empty media object." }, { status: 404 });
    }

    const contentType =
      object.ContentType && object.ContentType !== "application/octet-stream"
        ? object.ContentType
        : inferMimeTypeFromPath(key);
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, max-age=${ONE_HOUR}`,
      "Content-Type": contentType,
    });
    if (object.ContentLength != null) headers.set("Content-Length", String(object.ContentLength));
    if (object.ETag) headers.set("ETag", object.ETag);

    return new Response(object.Body.transformToWebStream(), { headers, status: 200 });
  } catch (error) {
    console.error("[populate-share/media]", error);
    return NextResponse.json({ error: "Failed to load media." }, { status: 500 });
  }
}
