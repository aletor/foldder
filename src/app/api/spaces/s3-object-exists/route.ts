import { NextRequest, NextResponse } from "next/server";
import { s3ObjectExists } from "@/lib/s3-utils";

const PREFIX = "knowledge-files/";

/** GET ?key=knowledge-files/... */
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key");
    if (!key || typeof key !== "string" || !key.startsWith(PREFIX) || key.includes("..")) {
      return NextResponse.json({ error: "invalid key" }, { status: 400 });
    }
    const exists = await s3ObjectExists(key);
    return NextResponse.json({ exists, key });
  } catch (e: unknown) {
    console.error("[s3-object-exists]", e);
    return NextResponse.json({ error: "head failed" }, { status: 500 });
  }
}
