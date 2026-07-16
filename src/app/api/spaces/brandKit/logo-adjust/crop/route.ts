import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { loadBrandKitSourceForLogoAdjust } from "@/lib/brandkit/ingest/brand-kit-source-pdf-store";
import { ensureLogoAdjustCropPage } from "@/lib/brandkit/ingest/brand-kit-logo-adjust-page";
import { uploadBrandKitIngestFile } from "@/lib/brandkit/ingest/upload-brand-kit-file";
import {
  cropLogoFromPageImage,
  pageTupleToLogoSourceBbox,
  type NormalizedBboxPage,
} from "@/lib/brandkit/brand-kit-logo-crop-server";
import { isValidBboxPage } from "@/lib/brandkit/brand-kit-logo-bbox";
import { recordBrandKitLogoUserPattern } from "@/lib/brandkit/brand-kit-logo-user-patterns";
import type { LogoValue } from "@/lib/brandkit/brand-kit-types";

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

  let pageImage: {
    imageBuffer: Buffer;
    width: number;
    height: number;
    sourceKind: "pdf" | "raster";
  };
  try {
    pageImage = await ensureLogoAdjustCropPage({
      userEmail: auth.user.email,
      contentSha256,
      pageNumber,
      loadSource: () => loadBrandKitSourceForLogoAdjust(auth.user.email, contentSha256),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "source_not_found") {
      return NextResponse.json({ error: "source_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "crop_failed" }, { status: 500 });
  }

  let cropped: { buffer: Buffer; width: number; height: number };
  try {
    cropped = await cropLogoFromPageImage({
      pageImage: pageImage.imageBuffer,
      pageWidth: pageImage.width,
      pageHeight: pageImage.height,
      bboxPage,
    });
  } catch {
    return NextResponse.json({ error: "crop_failed" }, { status: 500 });
  }

  const docName = body.docName?.trim() || "documento";
  const stem = docName.replace(/\.[^.]+$/, "").slice(0, 40);
  const uploaded = await uploadBrandKitIngestFile({
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
    totalDocPages: previous?.totalDocPages ?? (pageImage.sourceKind === "raster" ? 1 : undefined),
    detectionMethod: "adjusted",
  };

  // No bloquear la respuesta por el patrón de uso.
  void recordBrandKitLogoUserPattern(auth.user.email, {
    contentSha256,
    pageNumber,
    bboxPage: [...bboxPage] as [number, number, number, number],
  }).catch(() => undefined);

  return NextResponse.json({ logo });
}
