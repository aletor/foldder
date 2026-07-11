import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getLogoLabFixture } from "@/lib/brandkit/logo-lab/fixtures";
import { getGoldenDocument } from "@/lib/brandkit/logo-lab/golden/manifest";
import { goldenPdfExists, resolveGoldenPdfPath } from "@/lib/brandkit/logo-lab/golden/paths";
import { renderVisionBatchFramePng } from "@/lib/brandkit/logo-lab/render-page";
import { getLogoLabUpload } from "@/lib/brandkit/logo-lab/upload-store";

export const runtime = "nodejs";

async function resolvePdfBuffer(
  request: NextRequest,
  form?: FormData,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; response: NextResponse }> {
  if (request.method === "POST") {
    const file = form?.get("file");
    if (file instanceof File && file.size > 0) {
      return { ok: true, buffer: Buffer.from(await file.arrayBuffer()) };
    }
  }

  const uploadId = request.nextUrl.searchParams.get("uploadId")?.trim();
  if (uploadId) {
    const upload = getLogoLabUpload(uploadId);
    if (!upload) {
      return { ok: false, response: NextResponse.json({ error: "upload_not_found" }, { status: 404 }) };
    }
    return { ok: true, buffer: upload.buffer };
  }

  const goldenId = request.nextUrl.searchParams.get("golden")?.trim();
  if (goldenId) {
    const doc = getGoldenDocument(goldenId);
    if (!doc) {
      return { ok: false, response: NextResponse.json({ error: "unknown_golden_doc" }, { status: 404 }) };
    }
    if (!goldenPdfExists(doc.file)) {
      return { ok: false, response: NextResponse.json({ error: "golden_pdf_not_found" }, { status: 404 }) };
    }
    return { ok: true, buffer: fs.readFileSync(resolveGoldenPdfPath(doc.file)) };
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return { ok: false, response: NextResponse.json({ error: "missing_id_or_upload" }, { status: 400 }) };
  }

  const fixture = getLogoLabFixture(id);
  if (!fixture) {
    return { ok: false, response: NextResponse.json({ error: "unknown_fixture" }, { status: 404 }) };
  }
  if (!fs.existsSync(fixture.pdfPath)) {
    return { ok: false, response: NextResponse.json({ error: "pdf_not_found", path: fixture.fileName }, { status: 404 }) };
  }
  return { ok: true, buffer: fs.readFileSync(fixture.pdfPath) };
}

function resolvePageNumber(request: NextRequest, formPage?: FormDataEntryValue | null): number | null {
  const raw =
    request.nextUrl.searchParams.get("page") ??
    (typeof formPage === "string" ? formPage : null);
  if (!raw) return null;
  const pageNumber = Number(raw);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  return pageNumber;
}

async function renderPageResponse(buffer: Buffer, pageNumber: number) {
  const rendered = await renderVisionBatchFramePng(buffer, pageNumber);
  return new NextResponse(new Uint8Array(rendered.pngBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
      "X-Logo-Lab-Page": String(pageNumber),
      "X-Logo-Lab-Frame": rendered.frame,
      "X-Logo-Lab-Dpi": String(rendered.dpi),
      "X-Logo-Lab-Width": String(rendered.width),
      "X-Logo-Lab-Height": String(rendered.height),
    },
  });
}

export async function GET(request: NextRequest) {
  const pageNumber = resolvePageNumber(request);
  if (pageNumber === null) {
    return NextResponse.json({ error: "missing_page" }, { status: 400 });
  }

  const pdf = await resolvePdfBuffer(request);
  if (!pdf.ok) return pdf.response;

  try {
    return await renderPageResponse(pdf.buffer, pageNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : "render_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST con file+page — el body solo se lee una vez (FormData no es re-iterable). */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const pageNumber = resolvePageNumber(request, form.get("page"));
  if (pageNumber === null) {
    return NextResponse.json({ error: "missing_page" }, { status: 400 });
  }

  const pdf = await resolvePdfBuffer(request, form);
  if (!pdf.ok) return pdf.response;

  try {
    return await renderPageResponse(pdf.buffer, pageNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : "render_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
