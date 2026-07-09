import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { loadGenomaSourcePdf } from "@/lib/genoma/ingest/genoma-source-pdf-store";
import { uploadGenomaIngestFile } from "@/lib/genoma/ingest/upload-genoma-file";
import {
  cropLogoFromPdfPage,
  pageTupleToLogoSourceBbox,
  type NormalizedBboxPage,
} from "@/lib/genoma/genoma-logo-crop-server";
import { isValidBboxPage } from "@/lib/genoma/genoma-logo-bbox";
import type { LogoValue } from "@/lib/genoma/genoma-types";

export const runtime = "nodejs";
export const maxDuration = 60;

type CropBody = {
  contentSha256?: string;
  pageNumber?: number;
  bboxPage?: NormalizedBboxPage;
  docName?: string;
  previousLogo?: LogoValue;
};

function normalizeBboxPage(raw: unknown): NormalizedBboxPage | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((value) => Number(value));
  if (!isValidBboxPage(nums)) return null;
  return nums as NormalizedBboxPage;
}

export async function POST(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  let body: CropBody;
  try {
    body = (await request.json()) as CropBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const contentSha256 = body.contentSha256?.trim();
  const pageNumber = Number(body.pageNumber);
  const bboxPage = normalizeBboxPage(body.bboxPage);
  if (!contentSha256 || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!bboxPage) {
    return NextResponse.json({ error: "invalid_bbox" }, { status: 400 });
  }

  const pdfBuffer = await loadGenomaSourcePdf(auth.user.email, contentSha256);
  if (!pdfBuffer) {
    return NextResponse.json({ error: "pdf_not_found" }, { status: 404 });
  }

  const cropped = await cropLogoFromPdfPage({
    pdfBuffer,
    pageNumber,
    bboxPage,
  });

  const docName = body.docName?.trim() || "documento.pdf";
  const stem = docName.replace(/\.[^.]+$/, "").slice(0, 40);
  const uploaded = await uploadGenomaIngestFile({
    userEmail: auth.user.email,
    filename: `${stem}-logo-adjusted-p${pageNumber}.png`,
    mime: "image/png",
    buffer: cropped.buffer,
  });

  const previous = body.previousLogo;
  const logo: LogoValue = {
    assetId: uploaded.url,
    previewUrl: uploaded.url,
    format: "png",
    width: cropped.width,
    height: cropped.height,
    background: previous?.background ?? "transparent",
    variants: previous?.variants ?? [],
    sourcePageNumber: pageNumber,
    sourceBbox: pageTupleToLogoSourceBbox(bboxPage),
    sourceDocName: previous?.sourceDocName ?? docName,
    sourcePdfSha256: contentSha256,
    totalDocPages: previous?.totalDocPages,
    detectionMethod: "adjusted",
  };

  return NextResponse.json({ logo });
}
