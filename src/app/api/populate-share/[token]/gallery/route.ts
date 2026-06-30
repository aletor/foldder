import { NextResponse } from "next/server";
import { findPopulateShareByToken } from "@/lib/populate-share-db";
import { populateShareAccessError } from "@/lib/populate-share-access";
import { listPopulateGalleryItems } from "@/lib/populate-live-export";
import { normalizePopulateShareRecord } from "@/lib/populate-share-types";

/** Galería pública filtrada por `matchId` del enlace (nunca toda la temporada). */
export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const row = await findPopulateShareByToken(token);
    const access = populateShareAccessError(row);
    if (access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const share = normalizePopulateShareRecord(row!);
    const items = await listPopulateGalleryItems(share);
    return NextResponse.json({
      matchId: share.matchId,
      matchLabel: share.matchLabel,
      items,
    });
  } catch (error) {
    console.error("[populate-share/gallery] failed:", error);
    return NextResponse.json({ error: "Failed to load gallery" }, { status: 500 });
  }
}
