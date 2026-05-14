import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteFromS3 } from "@/lib/s3-utils";

const PREFIX = "knowledge-files/";

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isAdminUser(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  if (configured.length === 0) return false;
  return configured.includes(email);
}

async function ensureAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const guard = await ensureAdmin();
    if (guard) return guard;

    const body = (await req.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) {
      return NextResponse.json({ error: "keys must be an array" }, { status: 400 });
    }

    const keys = [...new Set(body.keys)].filter(
      (k): k is string =>
        typeof k === "string" && k.startsWith(PREFIX) && !k.includes(".."),
    );
    if (keys.length === 0) {
      return NextResponse.json({ deleted: 0, skipped: Array.isArray(body.keys) ? body.keys.length : 0 });
    }

    let deleted = 0;
    const errors: string[] = [];
    for (const key of keys) {
      try {
        await deleteFromS3(key);
        deleted += 1;
      } catch (e) {
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      deleted,
      requested: keys.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    console.error("[admin][s3-delete] failed:", error);
    return NextResponse.json({ error: "Failed to delete files" }, { status: 500 });
  }
}
