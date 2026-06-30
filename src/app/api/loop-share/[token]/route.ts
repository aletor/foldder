import { NextResponse } from "next/server";
import { findLoopShareByToken } from "@/lib/loop-share-db";
import { toPublicLoopShareRecord } from "@/lib/loop-share-types";

function isPastIsoDate(value: string): boolean {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const row = await findLoopShareByToken(token);
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (!row.options.enabled) {
      return NextResponse.json({ error: "disabled" }, { status: 410 });
    }
    if (row.options.autoDisableAt && isPastIsoDate(row.options.autoDisableAt)) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }
    return NextResponse.json({ share: toPublicLoopShareRecord(row) });
  } catch (error) {
    console.error("[loop-share/[token]] failed:", error);
    return NextResponse.json({ error: "Failed to load share" }, { status: 500 });
  }
}
