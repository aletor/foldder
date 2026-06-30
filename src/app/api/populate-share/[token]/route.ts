import { NextResponse } from "next/server";
import { findPopulateShareByToken } from "@/lib/populate-share-db";
import { populateShareAccessError } from "@/lib/populate-share-access";
import { toPublicPopulateShareRecord } from "@/lib/populate-share-types";

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const row = await findPopulateShareByToken(token);
    const access = populateShareAccessError(row);
    if (access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    return NextResponse.json({ share: toPublicPopulateShareRecord(row!) });
  } catch (error) {
    console.error("[populate-share/[token]] failed:", error);
    return NextResponse.json({ error: "Failed to load share" }, { status: 500 });
  }
}
