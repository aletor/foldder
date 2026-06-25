import { NextResponse } from "next/server";
import { findPopulateShareByToken } from "@/lib/populate-share-db";
import { toPublicPopulateShareRecord } from "@/lib/populate-share-types";

function isPastIsoDate(value: string): boolean {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const row = await findPopulateShareByToken(token);
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (!row.options.enabled) {
      return NextResponse.json({ error: "disabled" }, { status: 410 });
    }
    if (row.options.autoDisableAt && isPastIsoDate(row.options.autoDisableAt)) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }
    return NextResponse.json({ share: toPublicPopulateShareRecord(row) });
  } catch (error) {
    console.error("[populate-share/[token]] failed:", error);
    return NextResponse.json({ error: "Failed to load share" }, { status: 500 });
  }
}
