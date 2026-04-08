import { NextResponse } from "next/server";
import { getPresignedUrl } from "@/lib/s3-utils";

const PREFIX = "knowledge-files/";

function isAllowedKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..") || key.includes("\0")) return false;
  return key.startsWith(PREFIX);
}

/**
 * Devuelve URLs prefirmadas nuevas para claves S3 del bucket (p. ej. tras cargar un proyecto guardado).
 * Las URLs previas caducan (~1 h); el cliente debe persistir `data.s3Key` y llamar aquí al abrir.
 */
export async function POST(req: Request) {
  try {
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
        urls[key] = await getPresignedUrl(key);
      })
    );
    return NextResponse.json({ urls });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "presign failed";
    console.error("[s3-presign]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
