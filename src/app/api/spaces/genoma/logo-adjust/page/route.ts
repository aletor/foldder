import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { loadGenomaSourcePdf } from "@/lib/genoma/ingest/genoma-source-pdf-store";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import type { NormalizedBboxPage } from "@/lib/genoma/genoma-logo-bbox";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseBboxPage(raw: string | null): NormalizedBboxPage | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const nums = parsed.map((value) => Number(value));
    if (nums.some((value) => !Number.isFinite(value))) return null;
    return nums as NormalizedBboxPage;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  const contentSha256 = request.nextUrl.searchParams.get("contentSha256")?.trim();
  const pageNumber = Number(request.nextUrl.searchParams.get("pageNumber"));
  const bboxRaw = request.nextUrl.searchParams.get("bboxPage");
  if (!contentSha256 || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const pdfBuffer = await loadGenomaSourcePdf(auth.user.email, contentSha256);
  if (!pdfBuffer) {
    return NextResponse.json({ error: "pdf_not_found" }, { status: 404 });
  }

  const pages = await renderPdfPagesAt(pdfBuffer, [pageNumber], { dpi: 144 });
  const page = pages[0];
  if (!page) {
    return NextResponse.json({ error: "page_not_found" }, { status: 404 });
  }

  const bboxPage = parseBboxPage(bboxRaw) ?? ([0.04, 0.03, 0.32, 0.12] as NormalizedBboxPage);

  return NextResponse.json({
    imageBase64: page.pngBuffer.toString("base64"),
    mime: "image/png",
    width: page.width,
    height: page.height,
    page: pageNumber,
    bboxPage,
  });
}
