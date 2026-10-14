import { NextResponse, after } from "next/server";
import { isRasterImagePathOrMime } from "@/lib/canvas-media-thumbnail";
import { ensureCanvasAndStudioDerivatives } from "@/lib/s3-media-delivery";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 60;

const PREFIX = "knowledge-files/";

/** Prepara los WebP de lienzo y de studio después de una subida directa a S3. */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!isSafeKnowledgeFilesKey(key) || !key.startsWith(PREFIX)) {
      return NextResponse.json({ error: "Invalid S3 key." }, { status: 400 });
    }
    const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden S3 key." }, { status: 403 });
    }
    if (!isRasterImagePathOrMime(key)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    after(() => ensureCanvasAndStudioDerivatives(key));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "derivative failed";
    console.error("[media-derivatives]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
