import { NextRequest, NextResponse } from "next/server";
import { bufferContentSha256 } from "@/lib/brandkit/ingest/paid-operations-server";
import { runPageVisionPassNivel1ForPdf } from "@/lib/brandkit/ingest/page-vision-pass-nivel1-runner";
import { harvestLogoLabDocument } from "@/lib/brandkit/logo-lab/harvest-document-logos";
import { storeLogoLabUpload } from "@/lib/brandkit/logo-lab/upload-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "pdf_only" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }

  const contentSha256 = bufferContentSha256(buffer);
  const uploadId = contentSha256.slice(0, 16);

  try {
    const audit = await runPageVisionPassNivel1ForPdf({
      buffer,
      fileName: file.name,
      contentSha256,
      writeAudit: false,
      route: "/api/logo-lab/analyze",
    });

    const harvest = await harvestLogoLabDocument({ pdfBuffer: buffer, audit });

    storeLogoLabUpload({ uploadId, buffer, fileName: file.name, audit, harvest });

    return NextResponse.json({
      uploadId,
      fileName: file.name,
      contentSha256,
      audit,
      harvest,
      selectedPages: audit.selectedPages,
      logoInstanceCount: audit.pages.reduce(
        (sum, p) => sum + (p.result?.logoInstances?.length ?? 0),
        0,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "analyze_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
