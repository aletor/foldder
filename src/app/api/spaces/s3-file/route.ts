import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";
import { inferMimeTypeFromPath } from "@/lib/api-media-access";
import { parseCanvasThumbMaxSideParam, isRasterImagePathOrMime } from "@/lib/canvas-media-thumbnail";
import { ensureMediaDerivative, mediaReadRedirectUrl } from "@/lib/s3-media-delivery";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";

const PREFIX = "knowledge-files/";
const BROWSER_CACHE = "private, max-age=3000";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAllowedKey(key: string): boolean {
  return isSafeKnowledgeFilesKey(key) && key.startsWith(PREFIX);
}

function sanitizeRangeHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^bytes=\d*-\d*(?:,\d*-\d*)?$/.test(trimmed) ? trimmed : undefined;
}

function wantsByteStream(req: NextRequest): boolean {
  if (process.env.FOLDDER_S3_FILE_STREAM === "1") return true;
  return new URL(req.url).searchParams.get("stream") === "1";
}

function redirectToSigned(url: string) {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "private, max-age=600",
    },
  });
}

function bytesResponse(body: Buffer, contentType: string, status = 200, extra?: HeadersInit) {
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  return new Response(bytes.buffer, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": BROWSER_CACHE,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": contentType,
      ...extra,
    },
  });
}

async function streamStoredObject(key: string, req: NextRequest, thumbServed: boolean) {
  const range = thumbServed ? undefined : sanitizeRangeHeader(req.headers.get("range"));
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
    "Cache-Control": BROWSER_CACHE,
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

    const thumbMaxSide = parseCanvasThumbMaxSideParam(searchParams.get("thumb"));
    const stream = wantsByteStream(req);
    let objectKey = key;
    let freshThumb: { body: Buffer; contentType: string } | null = null;

    if (thumbMaxSide && isRasterImagePathOrMime(key)) {
      const prepared = await ensureMediaDerivative(key, thumbMaxSide);
      if (prepared) {
        objectKey = prepared.key;
        if (prepared.body && prepared.contentType) {
          freshThumb = { body: prepared.body, contentType: prepared.contentType };
        }
      }
    }

    if (!stream) {
      if (freshThumb) {
        return bytesResponse(freshThumb.body, freshThumb.contentType);
      }
      try {
        const signed = await mediaReadRedirectUrl(objectKey);
        return redirectToSigned(signed);
      } catch (error) {
        console.warn("[spaces/s3-file] redirect failed; streaming object.", error);
      }
    }

    if (freshThumb) {
      return bytesResponse(freshThumb.body, freshThumb.contentType);
    }
    return await streamStoredObject(objectKey, req, objectKey !== key);
  } catch (error) {
    console.error("[spaces/s3-file]", error);
    return NextResponse.json({ error: "Failed to generate file URL." }, { status: 500 });
  }
}
