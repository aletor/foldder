import { NextRequest, NextResponse } from "next/server";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";

export async function GET(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key")?.trim() || "";
    if (!isSafeKnowledgeFilesKey(key)) {
      return NextResponse.json({ error: "invalid_key" }, { status: 400 });
    }
    const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
    if (!allowed) {
      return NextResponse.json({ error: "forbidden_key" }, { status: 403 });
    }
    return NextResponse.json({ url: stableKnowledgeFileUrlFromKey(key) });
  } catch (error) {
    console.error("[brain/knowledge/view]", error);
    return NextResponse.json({ error: "Failed to generate view URL." }, { status: 500 });
  }
}
