import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";
import {
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";

const ALLOWED_PREFIXES = ["knowledge-files/", "renders/video-editor/"];

function isAllowedKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..") || key.includes("\0")) return false;
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function sanitizeHeaderFilename(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "download";
}

export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const url = new URL(req.url);
    const key = url.searchParams.get("key") || "";
    const filename = sanitizeHeaderFilename(url.searchParams.get("filename") || key.split("/").pop() || "download");
    if (!isAllowedKey(key)) {
      return NextResponse.json({ error: "invalid_key" }, { status: 400 });
    }
    if (key.startsWith("knowledge-files/")) {
      const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
      if (!allowed) return NextResponse.json({ error: "forbidden_key" }, { status: 403 });
    }

    const object = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    if (!object.Body) {
      return NextResponse.json({ error: "empty_object" }, { status: 404 });
    }

    const body = object.Body.transformToWebStream();
    return new Response(body, {
      headers: {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(object.ContentLength ? { "Content-Length": String(object.ContentLength) } : {}),
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "download_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
