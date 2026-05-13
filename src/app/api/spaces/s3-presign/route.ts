import { NextResponse } from "next/server";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";

const PREFIX = "knowledge-files/";

function isAllowedKey(key: string): boolean {
  return isSafeKnowledgeFilesKey(key) && key.startsWith(PREFIX);
}

/**
 * Devuelve URLs estables same-origin para claves S3 accesibles por el usuario.
 * El cliente debe persistir `data.s3Key`; la lectura real pasa por `/api/spaces/s3-file`.
 */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.json();
    const raw = body?.keys;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: "keys array required" }, { status: 400 });
    }
    const unique = [...new Set(raw.filter((k): k is string => typeof k === "string" && isAllowedKey(k)))];
    if (unique.length === 0) {
      return NextResponse.json({ urls: {} });
    }
    if (unique.length > 300) {
      return NextResponse.json({ error: "too many keys" }, { status: 400 });
    }
    const urls: Record<string, string> = {};
    await Promise.all(
      unique.map(async (key) => {
        if (await canUserAccessKnowledgeFileKey(authState.user.email, key)) {
          urls[key] = stableKnowledgeFileUrlFromKey(key);
        }
      })
    );
    return NextResponse.json({ urls });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "presign failed";
    console.error("[s3-presign]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
