import sharp from "sharp";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import { expandBBoxPage, type BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import { normalizeBBoxPage } from "@/lib/genoma/logo-intake/bbox-ui";
import { getBatchDocBuffer } from "@/lib/genoma/logo-intake/batch-store";
import type { IntakeDocInput } from "@/lib/genoma/logo-intake/render";

const TARGET_LONG_EDGE_PX = 1000;
const CROP_PAD = 0.18;
export const HI_RES_DPI = 250;
export const EDIT_PAGE_LONG_EDGE = 2048;
export const THUMB_MAX_EDGE = 320;
export const THUMB_JPEG_QUALITY = 75;

export type FrameCropResult = {
  thumbJpeg: Buffer;
  thumbBase64: string;
  cropWidthPx: number;
  cropHeightPx: number;
  qualityCrop: Buffer;
};

export async function cropLogoFromFrame(input: {
  jpegBase64: string;
  frameWidth: number;
  frameHeight: number;
  bboxPage: BBoxPage;
}): Promise<FrameCropResult> {
  const jpeg = Buffer.from(input.jpegBase64, "base64");
  const left = Math.round(input.bboxPage[0] * input.frameWidth);
  const top = Math.round(input.bboxPage[1] * input.frameHeight);
  const width = Math.max(1, Math.round((input.bboxPage[2] - input.bboxPage[0]) * input.frameWidth));
  const height = Math.max(1, Math.round((input.bboxPage[3] - input.bboxPage[1]) * input.frameHeight));

  const qualityCrop = await sharp(jpeg).extract({ left, top, width, height }).toBuffer();
  const thumbJpeg = await sharp(qualityCrop)
    .resize({
      width: width >= height ? THUMB_MAX_EDGE : undefined,
      height: height > width ? THUMB_MAX_EDGE : undefined,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(thumbJpeg).metadata();

  return {
    thumbJpeg,
    thumbBase64: thumbJpeg.toString("base64"),
    cropWidthPx: width,
    cropHeightPx: height,
    qualityCrop,
    ...(meta.width && meta.height ? {} : {}),
  };
}

export async function cropLogoFromImageDoc(input: {
  doc: IntakeDocInput;
  bboxPage: BBoxPage;
}): Promise<FrameCropResult> {
  const meta = await sharp(input.doc.buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("invalid_image");
  const left = Math.round(input.bboxPage[0] * w);
  const top = Math.round(input.bboxPage[1] * h);
  const width = Math.max(1, Math.round((input.bboxPage[2] - input.bboxPage[0]) * w));
  const height = Math.max(1, Math.round((input.bboxPage[3] - input.bboxPage[1]) * h));
  const qualityCrop = await sharp(input.doc.buffer).extract({ left, top, width, height }).toBuffer();
  const thumbJpeg = await sharp(qualityCrop)
    .resize({
      width: width >= height ? THUMB_MAX_EDGE : undefined,
      height: height > width ? THUMB_MAX_EDGE : undefined,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return {
    thumbJpeg,
    thumbBase64: thumbJpeg.toString("base64"),
    cropWidthPx: width,
    cropHeightPx: height,
    qualityCrop,
  };
}

export async function renderCandidateHiRes(input: {
  batchId: string;
  docId: string;
  docKind: "pdf" | "image";
  page: number;
  bboxPage: BBoxPage;
  padding?: number;
}): Promise<{ png: Buffer; width: number; height: number }> {
  const pad = input.padding ?? CROP_PAD;
  const padded = pad > 0 ? expandBBoxPage(input.bboxPage, pad) : normalizeBBoxPage(input.bboxPage);

  if (input.docKind === "image") {
    const buffer = getBatchDocBuffer(input.batchId, input.docId);
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const left = Math.round(padded[0] * w);
    const top = Math.round(padded[1] * h);
    const width = Math.max(1, Math.round((padded[2] - padded[0]) * w));
    const height = Math.max(1, Math.round((padded[3] - padded[1]) * h));
    let png = await sharp(buffer).extract({ left, top, width, height }).png().toBuffer();
    png = await upscaleToTarget(png);
    const out = await sharp(png).metadata();
    return { png, width: out.width ?? 0, height: out.height ?? 0 };
  }

  const buffer = getBatchDocBuffer(input.batchId, input.docId);
  const [page] = await renderPdfPagesAt(buffer, [input.page], { dpi: HI_RES_DPI, concurrency: 1 });
  if (!page) throw new Error(`hi_res_page_missing:${input.page}`);

  const left = Math.round(padded[0] * page.width);
  const top = Math.round(padded[1] * page.height);
  const width = Math.max(1, Math.round((padded[2] - padded[0]) * page.width));
  const height = Math.max(1, Math.round((padded[3] - padded[1]) * page.height));

  let png = await sharp(page.pngBuffer).extract({ left, top, width, height }).png().toBuffer();
  png = await upscaleToTarget(png);
  const meta = await sharp(png).metadata();
  return { png, width: meta.width ?? 0, height: meta.height ?? 0 };
}

async function upscaleToTarget(png: Buffer): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const long = Math.max(meta.width ?? 1, meta.height ?? 1);
  if (long >= TARGET_LONG_EDGE_PX) return png;
  const scale = TARGET_LONG_EDGE_PX / long;
  return sharp(png)
    .resize({
      width: Math.round((meta.width ?? 1) * scale),
      height: Math.round((meta.height ?? 1) * scale),
    })
    .png()
    .toBuffer();
}

export async function renderEditPage(input: {
  batchId: string;
  docId: string;
  docKind: "pdf" | "image";
  page: number;
}): Promise<{ png: Buffer; width: number; height: number }> {
  if (input.docKind === "image") {
    const buffer = getBatchDocBuffer(input.batchId, input.docId);
    const meta = await sharp(buffer).metadata();
    const long = Math.max(meta.width ?? 1, meta.height ?? 1);
    const scale = long > EDIT_PAGE_LONG_EDGE ? EDIT_PAGE_LONG_EDGE / long : 1;
    const png = await sharp(buffer)
      .resize({
        width: Math.round((meta.width ?? 1) * scale),
        height: Math.round((meta.height ?? 1) * scale),
        fit: "fill",
      })
      .png()
      .toBuffer();
    const outMeta = await sharp(png).metadata();
    return { png, width: outMeta.width ?? 0, height: outMeta.height ?? 0 };
  }

  const buffer = getBatchDocBuffer(input.batchId, input.docId);
  const [page] = await renderPdfPagesAt(buffer, [input.page], { dpi: 144, concurrency: 1 });
  if (!page) throw new Error(`edit_page_missing:${input.page}`);
  const long = Math.max(page.width, page.height);
  const scale = EDIT_PAGE_LONG_EDGE / long;
  const png = await sharp(page.pngBuffer)
    .resize({
      width: Math.round(page.width * scale),
      height: Math.round(page.height * scale),
    })
    .png()
    .toBuffer();
  const meta = await sharp(png).metadata();
  return { png, width: meta.width ?? 0, height: meta.height ?? 0 };
}

export async function renderCandidateAdjusted(input: {
  batchId: string;
  docId: string;
  docKind: "pdf" | "image";
  page: number;
  bboxPage: BBoxPage;
}): Promise<{ png: Buffer; width: number; height: number }> {
  const pageFrame = await renderEditPage({
    batchId: input.batchId,
    docId: input.docId,
    docKind: input.docKind,
    page: input.page,
  });
  const bbox = normalizeBBoxPage(input.bboxPage);
  const left = Math.round(bbox[0] * pageFrame.width);
  const top = Math.round(bbox[1] * pageFrame.height);
  const width = Math.max(1, Math.round((bbox[2] - bbox[0]) * pageFrame.width));
  const height = Math.max(1, Math.round((bbox[3] - bbox[1]) * pageFrame.height));
  const png = await sharp(pageFrame.png).extract({ left, top, width, height }).png().toBuffer();
  const meta = await sharp(png).metadata();
  return { png, width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Recorta bbox al contenido no uniforme (equivalente a sharp.trim sobre el área actual). */
export async function trimBBoxPageFromPage(input: {
  pagePng: Buffer;
  pageWidth: number;
  pageHeight: number;
  bboxPage: BBoxPage;
  threshold?: number;
}): Promise<{ bboxPage: BBoxPage; trimmed: boolean }> {
  const meta = await sharp(input.pagePng).metadata();
  const pageWidth = meta.width ?? input.pageWidth;
  const pageHeight = meta.height ?? input.pageHeight;
  const bbox = normalizeBBoxPage(input.bboxPage);
  let left = Math.round(bbox[0] * pageWidth);
  let top = Math.round(bbox[1] * pageHeight);
  let width = Math.max(1, Math.round((bbox[2] - bbox[0]) * pageWidth));
  let height = Math.max(1, Math.round((bbox[3] - bbox[1]) * pageHeight));
  left = Math.min(left, Math.max(0, pageWidth - 1));
  top = Math.min(top, Math.max(0, pageHeight - 1));
  width = Math.min(width, pageWidth - left);
  height = Math.min(height, pageHeight - top);

  const cropped = await sharp(input.pagePng).extract({ left, top, width, height }).png().toBuffer();
  const trimmed = await sharp(cropped)
    .trim({ threshold: input.threshold ?? 18 })
    .toBuffer({ resolveWithObject: true });

  const trimLeft = Math.abs(trimmed.info.trimOffsetLeft ?? 0);
  const trimTop = Math.abs(trimmed.info.trimOffsetTop ?? 0);
  if (trimmed.info.width >= width && trimmed.info.height >= height) {
    return { bboxPage: bbox, trimmed: false };
  }

  const newBbox = normalizeBBoxPage([
    (left + trimLeft) / pageWidth,
    (top + trimTop) / pageHeight,
    (left + trimLeft + trimmed.info.width) / pageWidth,
    (top + trimTop + trimmed.info.height) / pageHeight,
  ]);
  return { bboxPage: newBbox, trimmed: true };
}
