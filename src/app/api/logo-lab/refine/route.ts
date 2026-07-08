import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getLogoLabFixture } from "@/lib/genoma/logo-lab/fixtures";
import { renderVisionBatchFramePng } from "@/lib/genoma/logo-lab/render-page";
import { refineLogoLabBbox } from "@/lib/genoma/logo-lab/refine-bbox";
import { resolveAuditBbox } from "@/lib/genoma/ingest/page-vision-pass-bbox";
import { getLogoLabUpload } from "@/lib/genoma/logo-lab/upload-store";

export const runtime = "nodejs";
export const maxDuration = 60;

type RefineBody = {
  fixtureId?: string;
  uploadId?: string;
  pageNumber: number;
  bbox: [number, number, number, number];
};

async function resolvePdfBuffer(body: RefineBody, form?: FormData): Promise<Buffer | null> {
  if (body.uploadId) {
    return getLogoLabUpload(body.uploadId)?.buffer ?? null;
  }
  const file = form?.get("file");
  if (file instanceof File && file.size > 0) {
    return Buffer.from(await file.arrayBuffer());
  }
  if (body.fixtureId) {
    const fixture = getLogoLabFixture(body.fixtureId);
    if (!fixture || !fs.existsSync(fixture.pdfPath)) return null;
    return fs.readFileSync(fixture.pdfPath);
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: RefineBody;
  let form: FormData | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as RefineBody;
  } else {
    form = await request.formData();
    const bboxRaw = form.get("bbox");
    let bbox: [number, number, number, number] = [0, 0, 0, 0];
    if (typeof bboxRaw === "string") {
      try {
        bbox = JSON.parse(bboxRaw) as [number, number, number, number];
      } catch {
        return NextResponse.json({ error: "invalid_bbox" }, { status: 400 });
      }
    }
    body = {
      fixtureId: typeof form.get("fixtureId") === "string" ? String(form.get("fixtureId")) : undefined,
      uploadId: typeof form.get("uploadId") === "string" ? String(form.get("uploadId")) : undefined,
      pageNumber: Number(form.get("pageNumber")),
      bbox,
    };
  }

  if (!Number.isInteger(body.pageNumber) || body.pageNumber < 1) {
    return NextResponse.json({ error: "missing_page" }, { status: 400 });
  }
  if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
    return NextResponse.json({ error: "invalid_bbox" }, { status: 400 });
  }

  const pdfBuffer = await resolvePdfBuffer(body, form);
  if (!pdfBuffer) {
    return NextResponse.json({ error: "pdf_not_found" }, { status: 404 });
  }

  try {
    const frame = await renderVisionBatchFramePng(pdfBuffer, body.pageNumber);
    const seedBbox = resolveAuditBbox(body.bbox);
    const refined = await refineLogoLabBbox({
      pdfBuffer,
      pageNumber: body.pageNumber,
      seedBbox,
      framePng: frame.pngBuffer,
      frameWidth: frame.width,
      frameHeight: frame.height,
    });

    return NextResponse.json({
      seedBbox: refined.seedBbox,
      refinedBbox: refined.refinedBbox,
      method: refined.method,
      pdfObjectCount: refined.pdfObjectCount,
      logoCropBase64: refined.logoCropPng.toString("base64"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refine_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
