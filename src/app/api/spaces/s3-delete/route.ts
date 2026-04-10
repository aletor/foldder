import { NextRequest, NextResponse } from "next/server";
import { deleteFromS3 } from "@/lib/s3-utils";

const PREFIX = "knowledge-files/";

/**
 * Borra objetos en S3 por clave (solo prefijo permitido).
 * Usado al eliminar nodos/proyectos o al sustituir un asset por uno nuevo.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { keys?: unknown };
    const raw = body.keys;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "keys must be an array" }, { status: 400 });
    }
    const keys = raw.filter(
      (k): k is string =>
        typeof k === "string" && k.startsWith(PREFIX) && !k.includes(".."),
    );
    if (keys.length === 0) {
      return NextResponse.json({ deleted: 0, skipped: raw.length });
    }
    const unique = [...new Set(keys)];
    let deleted = 0;
    const errors: string[] = [];
    for (const key of unique) {
      try {
        await deleteFromS3(key);
        deleted += 1;
      } catch (e) {
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return NextResponse.json({ deleted, requested: unique.length, errors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("[s3-delete]", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
