import { NextRequest, NextResponse } from "next/server";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { renderStyleGuideV2, styleGuideFilename } from "@/lib/brandkit/style-guide-render";
import type { StyleGuideExportMode } from "@/lib/brandkit/style-guide-export-types";
import { evaluateStyleGuidePrintGate } from "@/lib/brandkit/style-guide-print-gate";
import { renderHtmlToPdfBuffer } from "@/lib/brandkit/style-guide-pdf-chromium";
import { getBrainVersion } from "@/lib/brain/brain-meta";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 60;

type StyleGuidePdfRequestBody = {
  assets?: unknown;
  exportMode?: StyleGuideExportMode;
  projectName?: string;
  brainVersion?: number;
  generatedAt?: string;
};

export async function POST(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as StyleGuidePdfRequestBody;
    if (!body.assets) {
      return NextResponse.json({ error: "assets required" }, { status: 400 });
    }

    const exportMode: StyleGuideExportMode = body.exportMode === "cliente" ? "cliente" : "operativo";
    const assets = normalizeProjectAssets(body.assets);
    const printGate = evaluateStyleGuidePrintGate(assets, exportMode);
    if (!printGate.allowed) {
      return NextResponse.json(
        { error: printGate.blockers[0]?.code ?? "print_gate_blocked", message: printGate.blockers[0]?.message },
        { status: 409 },
      );
    }

    const doc = renderStyleGuideV2(assets, {
      exportMode,
      projectName: body.projectName,
      brainVersion: body.brainVersion ?? getBrainVersion(assets.brainMeta),
      generatedAt: body.generatedAt,
    });

    const pdf = await renderHtmlToPdfBuffer({ html: doc.html });
    const filename = styleGuideFilename(body.projectName, doc.generatedAt);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pdf_generation_failed";
    if (message === "chromium_not_available") {
      return NextResponse.json({ error: "chromium_not_available" }, { status: 503 });
    }
    console.error("[style-guide/pdf]", error);
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
