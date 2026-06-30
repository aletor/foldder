import { NextResponse } from "next/server";
import { findPopulateShareByToken, incrementPopulateShareGenerations } from "@/lib/populate-share-db";
import { populateShareAccessError } from "@/lib/populate-share-access";
import { emitPopulateLiveExport } from "@/lib/populate-live-export";
import type { PopulateExportProvenance } from "@/lib/populate-live-export-types";

type ExportBody = {
  dataUrl?: string;
  provenance?: PopulateExportProvenance;
};

function isProvenance(value: unknown): value is PopulateExportProvenance {
  if (!value || typeof value !== "object") return false;
  const p = value as PopulateExportProvenance;
  return typeof p.templateNodeId === "string" && p.templateNodeId.trim().length > 0;
}

/** Persiste PNG en S3 y añade `projectFiles kind:export` (server-side, dueño del share). */
export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const row = await findPopulateShareByToken(token);
    const access = populateShareAccessError(row);
    if (access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json()) as ExportBody;
    if (!body.dataUrl || typeof body.dataUrl !== "string") {
      return NextResponse.json({ error: "dataUrl required" }, { status: 400 });
    }
    if (!isProvenance(body.provenance)) {
      return NextResponse.json({ error: "provenance.templateNodeId required" }, { status: 400 });
    }

    const item = await emitPopulateLiveExport({
      share: row!,
      dataUrl: body.dataUrl,
      provenance: body.provenance,
    });
    await incrementPopulateShareGenerations(token);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error("[populate-share/export] failed:", error);
    const message = error instanceof Error ? error.message : "Failed to export";
    const status = /no encontrado|no pertenece|no está ligado/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
