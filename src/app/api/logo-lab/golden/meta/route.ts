import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { getGoldenDocument } from "@/lib/brandkit/logo-lab/golden/manifest";
import { goldenPdfExists, resolveGoldenPdfPath } from "@/lib/brandkit/logo-lab/golden/paths";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const docId = request.nextUrl.searchParams.get("doc")?.trim();
  if (!docId) {
    return NextResponse.json({ error: "missing_doc" }, { status: 400 });
  }

  const doc = getGoldenDocument(docId);
  if (!doc) {
    return NextResponse.json({ error: "unknown_doc" }, { status: 404 });
  }

  if (!goldenPdfExists(doc.file)) {
    return NextResponse.json({
      docId,
      pdfAvailable: false,
      totalPages: 0,
      sha256: doc.sha256,
    });
  }

  const buffer = fs.readFileSync(resolveGoldenPdfPath(doc.file));
  const totalPages = await countPdfPagesInBuffer(buffer, 500);

  return NextResponse.json({
    docId,
    pdfAvailable: true,
    totalPages,
    sha256: doc.sha256,
    file: doc.file,
  });
}
