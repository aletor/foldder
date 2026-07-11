import sharp from "sharp";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import type { NormalizedBboxPage } from "@/lib/brandkit/brand-kit-logo-bbox";
import type { BrandKitSourceDocKind } from "@/lib/brandkit/ingest/brand-kit-source-pdf-store";

export async function renderLogoAdjustPage(input: {
  source: { buffer: Buffer; kind: BrandKitSourceDocKind };
  pageNumber: number;
}): Promise<{ pngBuffer: Buffer; width: number; height: number }> {
  if (input.source.kind === "pdf") {
    const pages = await renderPdfPagesAt(input.source.buffer, [input.pageNumber], { dpi: 144 });
    const page = pages[0];
    if (!page) throw new Error("page_not_found");
    return { pngBuffer: page.pngBuffer, width: page.width, height: page.height };
  }

  if (input.pageNumber !== 1) throw new Error("page_not_found");

  const pngBuffer = await sharp(input.source.buffer, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("page_not_found");
  return { pngBuffer, width, height };
}

export type LogoAdjustPagePayload = {
  imageBase64: string;
  mime: string;
  width: number;
  height: number;
  page: number;
  bboxPage: NormalizedBboxPage;
  sourceKind: BrandKitSourceDocKind;
};

export async function buildLogoAdjustPagePayload(input: {
  source: { buffer: Buffer; kind: BrandKitSourceDocKind };
  pageNumber: number;
  bboxPage: NormalizedBboxPage;
}): Promise<LogoAdjustPagePayload> {
  const rendered = await renderLogoAdjustPage(input);
  return {
    imageBase64: rendered.pngBuffer.toString("base64"),
    mime: "image/png",
    width: rendered.width,
    height: rendered.height,
    page: input.pageNumber,
    bboxPage: input.bboxPage,
    sourceKind: input.source.kind,
  };
}
