import { NextRequest, NextResponse } from "next/server";
import { getPresignedUrl } from "@/lib/s3-utils";

const PREFIX = "knowledge-files/";

function isAllowedKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..") || key.includes("\0")) return false;
  return key.startsWith(PREFIX);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key")?.trim() ?? "";
    if (!isAllowedKey(key)) {
      return NextResponse.json({ error: "Invalid S3 key." }, { status: 400 });
    }
    const url = await getPresignedUrl(key);
    const res = NextResponse.redirect(url, { status: 307 });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (error) {
    console.error("[spaces/s3-file]", error);
    return NextResponse.json({ error: "Failed to generate file URL." }, { status: 500 });
  }
}
