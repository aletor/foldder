import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { renderHtmlToPdfBuffer } from "@/lib/brandkit/style-guide-pdf-chromium";
import { normalizeGenome, type Genome } from "@/lib/brandkit/model/trait";
import {
  brandKitStyleGuideFilename,
  renderBrandKitStyleGuide,
} from "@/lib/brandkit/projection/style-guide-render";
import type { BrandKitStyleGuideExportMode } from "@/lib/brandkit/projection/style-guide-export-types";
import {
  evaluateStyleGuideVectorizeGate,
  logVectorizeExportDecision,
} from "@/lib/brandkit/projection/style-guide-vectorize-gate";
import { verifyStyleGuidePdfFonts } from "@/lib/brandkit/projection/style-guide-font-gate";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  genome?: Genome;
  exportMode?: BrandKitStyleGuideExportMode;
  projectName?: string;
  generatedAt?: string;
  /** Opt-in: permite logo raster en el PDF (no recomendado). */
  allowRasterLogoBypass?: boolean;
};

export async function POST(req: NextRequest) {
  const auth = await requireSpacesAuthUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.genome) {
    return NextResponse.json({ error: "genome required" }, { status: 400 });
  }

  try {
    const genome = normalizeGenome(body.genome);
    const vectorizeGate = evaluateStyleGuideVectorizeGate(genome, {
      allowRasterLogoBypass: body.allowRasterLogoBypass === true,
    });
    logVectorizeExportDecision(genome, vectorizeGate);
    if (!vectorizeGate.allowed) {
      return NextResponse.json(
        {
          code: vectorizeGate.code,
          message: vectorizeGate.message,
          cta: vectorizeGate.cta,
          trace: vectorizeGate.trace,
        },
        { status: 422 },
      );
    }

    const doc = await renderBrandKitStyleGuide(genome, {
      exportMode: body.exportMode,
      projectName: body.projectName,
      generatedAt: body.generatedAt,
      forPdf: true,
    });
    const pdf = await renderHtmlToPdfBuffer({ html: doc.html, marginMm: 0 });

    let fontGate: Awaited<ReturnType<typeof verifyStyleGuidePdfFonts>> = { allowed: true };
    try {
      fontGate = await verifyStyleGuidePdfFonts(pdf, genome, doc.exportMode);
    } catch (fontErr) {
      console.warn("[brandKit/style-guide/pdf] font verification skipped", fontErr);
    }
    if (!fontGate.allowed) {
      return NextResponse.json(
        {
          code: fontGate.code,
          message: fontGate.message,
          missingFamilies: fontGate.missingFamilies,
        },
        { status: 422 },
      );
    }

    const filename = brandKitStyleGuideFilename(body.projectName, doc.generatedAt);

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
    console.error("[brandKit/style-guide/pdf]", error);
    return NextResponse.json(
      {
        error: "pdf_generation_failed",
        message:
          message === "pdf_generation_failed"
            ? "No se pudo generar el PDF del libro de estilo."
            : message,
      },
      { status: 500 },
    );
  }
}
