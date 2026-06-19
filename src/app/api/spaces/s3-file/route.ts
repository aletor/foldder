import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";
import { inferMimeTypeFromPath } from "@/lib/api-media-access";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";

const PREFIX = "knowledge-files/";
const ONE_HOUR = 3600;

function isAllowedKey(key: string): boolean {
  return isSafeKnowledgeFilesKey(key) && key.startsWith(PREFIX);
}

function sanitizeRangeHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^bytes=\d*-\d*(?:,\d*-\d*)?$/.test(trimmed) ? trimmed : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key")?.trim() ?? "";
    if (!isAllowedKey(key)) {
      return NextResponse.json({ error: "Invalid S3 key." }, { status: 400 });
    }
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden S3 key." }, { status: 403 });
    }

    const range = sanitizeRangeHeader(req.headers.get("range"));
    const object = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Range: range,
      }),
    );

    if (!object.Body) {
      return NextResponse.json({ error: "Empty S3 object." }, { status: 404 });
    }

    const contentType =
      object.ContentType && object.ContentType !== "application/octet-stream"
        ? object.ContentType
        : inferMimeTypeFromPath(key);

    const headers = new Headers({
      "Accept-Ranges": object.AcceptRanges || "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `private, max-age=${ONE_HOUR}`,
      "Content-Type": contentType,
    });
    if (object.ContentLength != null) headers.set("Content-Length", String(object.ContentLength));
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
    if (object.ETag) headers.set("ETag", object.ETag);
    if (object.LastModified) headers.set("Last-Modified", object.LastModified.toUTCString());

    return new Response(object.Body.transformToWebStream(), {
      headers,
      status: object.ContentRange ? 206 : 200,
    });
  } catch (error) {
    console.error("[spaces/s3-file]", error);
    return NextResponse.json({ error: "Failed to generate file URL." }, { status: 500 });
  }
}
