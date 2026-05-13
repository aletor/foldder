import { NextRequest, NextResponse } from "next/server";
import { s3ObjectExists } from "@/lib/s3-utils";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";

const PREFIX = "knowledge-files/";

/** GET ?key=knowledge-files/... */
export async function GET(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const key = req.nextUrl.searchParams.get("key");
    if (!key || typeof key !== "string" || !key.startsWith(PREFIX) || !isSafeKnowledgeFilesKey(key)) {
      return NextResponse.json({ error: "invalid key" }, { status: 400 });
    }
    const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
    if (!allowed) return NextResponse.json({ error: "forbidden key" }, { status: 403 });
    const exists = await s3ObjectExists(key);
    return NextResponse.json({ exists, key });
  } catch (e: unknown) {
    console.error("[s3-object-exists]", e);
    return NextResponse.json({ error: "head failed" }, { status: 500 });
  }
}
