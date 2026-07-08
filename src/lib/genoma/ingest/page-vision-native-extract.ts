/**
 * Fase B — extracción nativa dirigida por bbox (Fase A).
 * Orden: clúster vectorial → SVG (vector_native) · XObject → raster full-res (xobject_native) · render crop (fallback).
 */

import crypto from "node:crypto";
import sharp from "sharp";
import { configurePdfJsForNodeServer, pdfJsGetDocumentInit } from "@/lib/brain/pdfjs-server";
import { renderPdfPageCrop, type PixelBBox } from "@/lib/brain/pdf-page-render";
import { computeInkLogoPHash } from "@/lib/brain/pdf-logo-pipeline";
import type { LogoAssetOrigin } from "../model/trait-values";
import { nativeAssetAllowsVectorize } from "../projection/logo-crown-policy";
import type { BBoxXYXY } from "./page-vision-pass-bbox";
import { composeSvgFromPaintWalk, walkPdfPaintToSvgPaths, type PaintWalkAudit } from "./page-vision-pdf-vector-walk";
import { verifyWordmarkIntegrity, type WordmarkIntegrityResult } from "./page-vision-wordmark-integrity";
import { getPdfJsObject, warmPdfJsPageObjects } from "./pdfjs-object-resolve";

export type { LogoAssetOrigin };
export { nativeAssetAllowsVectorize };

export type NativeLogoAsset = {
  origin: LogoAssetOrigin;
  pageNumber: number;
  bbox: BBoxXYXY;
  /** SVG completo cuando origin=vector_native */
  svg?: string;
  /** Raster sin compresión adicional cuando origin=xobject_native | render_crop */
  rasterBuffer?: Buffer;
  mime: "image/svg+xml" | "image/png";
  signature: string;
  /** pHash sobre tinta del asset (para consolidación Fase B) */
  logoPHash: string;
  pathAudit?: PaintWalkAudit;
  wordmarkIntegrity?: WordmarkIntegrityResult;
};

const NATIVE_RASTER_DPI = 300;

function channelsForRawPixelBuffer(bytes: number, pixelCount: number): 1 | 3 | 4 | null {
  if (bytes === pixelCount * 4) return 4;
  if (bytes === pixelCount * 3) return 3;
  if (bytes === pixelCount) return 1;
  return null;
}

async function rasterBufferFromPdfJsImage(
  image: { data?: Uint8Array; width?: number; height?: number },
): Promise<Buffer | null> {
  const w = image.width ?? 0;
  const h = image.height ?? 0;
  const data = image.data;
  if (!w || !h || !data?.length) return null;
  const pixelCount = w * h;
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const channels = channelsForRawPixelBuffer(bytes.length, pixelCount);
  if (!channels) return null;
  try {
    return await sharp(bytes, { raw: { width: w, height: h, channels } }).png().toBuffer();
  } catch {
    return null;
  }
}

function bboxToPixel(bbox: BBoxXYXY, pageWidth: number, pageHeight: number): PixelBBox {
  return {
    x: Math.round(bbox[0] * pageWidth),
    y: Math.round(bbox[1] * pageHeight),
    width: Math.max(1, Math.round((bbox[2] - bbox[0]) * pageWidth)),
    height: Math.max(1, Math.round((bbox[3] - bbox[1]) * pageHeight)),
  };
}

async function extractVectorNativeSvg(
  buffer: Buffer,
  pageNumber: number,
  targetBbox: BBoxXYXY,
  opts?: { collectAudit?: boolean; textInLogo?: string },
): Promise<{ svg: string | null; audit?: PaintWalkAudit; wordmarkIntegrity?: WordmarkIntegrityResult }> {
  const pdfjs = await configurePdfJsForNodeServer();
  const ops = pdfjs.OPS;
  const pdf = await pdfjs
    .getDocument(pdfJsGetDocumentInit(buffer) as Parameters<typeof pdfjs.getDocument>[0])
    .promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pw = viewport.width;
    const ph = viewport.height;
    const walked = await walkPdfPaintToSvgPaths({
      page,
      ops: ops as Record<string, number | undefined>,
      pageWidth: pw,
      pageHeight: ph,
      targetBbox,
      collectAudit: opts?.collectAudit,
    });
    const svg = composeSvgFromPaintWalk({ paths: walked.paths, gradients: walked.gradients, pageHeight: ph });
    const wordmarkIntegrity =
      svg && opts?.textInLogo?.trim() && opts.textInLogo.toLowerCase() !== "unknown"
        ? await verifyWordmarkIntegrity(svg, opts.textInLogo)
        : undefined;
    return { svg, audit: walked.audit, wordmarkIntegrity };
  } finally {
    await pdf.destroy();
  }
}

async function finalizeNativeAsset(input: {
  origin: LogoAssetOrigin;
  pageNumber: number;
  bbox: BBoxXYXY;
  svg?: string;
  rasterBuffer?: Buffer;
  pathAudit?: PaintWalkAudit;
  wordmarkIntegrity?: WordmarkIntegrityResult;
}): Promise<NativeLogoAsset | null> {
  if (input.svg) {
    const svgBuffer = Buffer.from(input.svg, "utf8");
    const rasterForHash = await sharp(svgBuffer).png().toBuffer().catch(() => null);
    const logoPHash = rasterForHash ? await computeInkLogoPHash(rasterForHash) : "";
    return {
      origin: input.origin,
      pageNumber: input.pageNumber,
      bbox: input.bbox,
      svg: input.svg,
      mime: "image/svg+xml",
      signature: crypto.createHash("sha256").update(svgBuffer).digest("hex").slice(0, 32),
      logoPHash,
      pathAudit: input.pathAudit,
      wordmarkIntegrity: input.wordmarkIntegrity,
    };
  }
  if (!input.rasterBuffer?.length) return null;
  const logoPHash = await computeInkLogoPHash(input.rasterBuffer);
  return {
    origin: input.origin,
    pageNumber: input.pageNumber,
    bbox: input.bbox,
    rasterBuffer: input.rasterBuffer,
    mime: "image/png",
    signature: logoPHash.slice(0, 32),
    logoPHash,
  };
}

/** Extrae logo nativo dentro del bbox de Fase A. */
export async function extractNativeLogoInBbox(input: {
  buffer: Buffer;
  pageNumber: number;
  bbox: BBoxXYXY;
  pageWidth?: number;
  pageHeight?: number;
  textInLogo?: string;
  collectPathAudit?: boolean;
}): Promise<NativeLogoAsset | null> {
  const vector = await extractVectorNativeSvg(input.buffer, input.pageNumber, input.bbox, {
    collectAudit: input.collectPathAudit,
    textInLogo: input.textInLogo,
  });
  if (vector.svg) {
    return finalizeNativeAsset({
      origin: "vector_native",
      pageNumber: input.pageNumber,
      bbox: input.bbox,
      svg: vector.svg,
      pathAudit: vector.audit,
      wordmarkIntegrity: vector.wordmarkIntegrity,
    });
  }

  const pdfjs = await configurePdfJsForNodeServer();
  const ops = pdfjs.OPS;
  const pdf = await pdfjs
    .getDocument(pdfJsGetDocumentInit(input.buffer) as Parameters<typeof pdfjs.getDocument>[0])
    .promise;
  try {
    const page = await pdf.getPage(input.pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pw = input.pageWidth ?? viewport.width;
    const ph = input.pageHeight ?? viewport.height;
    const ol = await page.getOperatorList();
    const imageOps = new Set(
      [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter(
        (v): v is number => typeof v === "number",
      ),
    );
    await warmPdfJsPageObjects(page, ol, imageOps);

    for (let i = 0; i < ol.fnArray.length; i += 1) {
      if (!imageOps.has(ol.fnArray[i]!)) continue;
      const args = ol.argsArray[i] ?? [];
      const inlineImage = ol.fnArray[i] === ops.paintInlineImageXObject ? args[0] : null;
      let image: { data?: Uint8Array; width?: number; height?: number } | null = null;
      if (inlineImage && typeof inlineImage === "object") {
        image = inlineImage as { data?: Uint8Array; width?: number; height?: number };
      } else if (typeof args[0] === "string") {
        image = (await getPdfJsObject(page, args[0])) as {
          data?: Uint8Array;
          width?: number;
          height?: number;
        } | null;
      }
      if (!image?.data?.length) continue;
      const w = image.width ?? 0;
      const h = image.height ?? 0;
      if (w < 20 || h < 12) continue;
      const png = await rasterBufferFromPdfJsImage(image);
      if (!png) continue;
      return finalizeNativeAsset({
        origin: "xobject_native",
        pageNumber: input.pageNumber,
        bbox: input.bbox,
        rasterBuffer: png,
      });
    }
  } finally {
    await pdf.destroy();
  }

  const pixelBbox = bboxToPixel(
    input.bbox,
    input.pageWidth ?? 481.89,
    input.pageHeight ?? 623.622,
  );
  const crop = await renderPdfPageCrop(input.buffer, input.pageNumber, pixelBbox, NATIVE_RASTER_DPI);
  return finalizeNativeAsset({
    origin: "render_crop",
    pageNumber: input.pageNumber,
    bbox: input.bbox,
    rasterBuffer: crop,
  });
}

