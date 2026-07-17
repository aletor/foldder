import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";
import type { MediaListItem, MediaListOutput } from "@/app/spaces/media-list-output";
import { coverTextRegionsOnPageRaster } from "./pdf-scan-clean-background";
import { collectMissingPdfFonts } from "./pdf-scan-font-map";
import { extractPdfScanEmbeddedImages, sha256Hex } from "./pdf-scan-images";
import { extractPdfTextSpans } from "./pdf-scan-text-spans";
import { assertPdfBuffer, pdfScanObjectKey, sanitizePdfFileName, stagePdfScanSource } from "./pdf-scan-stage";
import {
  PDF_SCAN_DEFAULT_DPI,
  PDF_SCAN_MAX_PAGES,
  type PdfScanImageAsset,
  type PdfScanLayoutOutput,
  type PdfScanSourceMeta,
  type PdfScanSummary,
  type PdfScanTextSpan,
} from "./pdf-scan-types";

export type RunPdfScanInput = {
  buffer?: Buffer;
  /** Reutilizar PDF ya subido en staged (sin re-subir). */
  source?: PdfScanSourceMeta;
  fileName?: string;
  userEmail: string;
  dpi?: number;
  maxPages?: number;
};

export type RunPdfScanResult = {
  jobId: string;
  mode: "texts";
  source: PdfScanSourceMeta;
  scan: PdfScanSummary;
  images: PdfScanImageAsset[];
  textPreview: Array<{ id: string; page: number; text: string }>;
  output: PdfScanLayoutOutput;
  mediaListOutput: MediaListOutput;
};

async function uploadJpegThumb(buffer: Buffer, maxEdge: number): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
}

async function resolveBuffer(input: RunPdfScanInput): Promise<{ buffer: Buffer; source: PdfScanSourceMeta }> {
  if (input.source?.s3Key) {
    const buffer = await getFromS3(input.source.s3Key);
    assertPdfBuffer(buffer);
    return { buffer, source: input.source };
  }
  if (!input.buffer) throw new Error("Se requiere file o source.s3Key.");
  const staged = await stagePdfScanSource({
    buffer: input.buffer,
    fileName: input.fileName || "document.pdf",
    userEmail: input.userEmail,
  });
  return { buffer: input.buffer, source: staged.source };
}

export async function runPdfScanTexts(input: RunPdfScanInput): Promise<RunPdfScanResult> {
  const { buffer, source } = await resolveBuffer(input);
  const dpi = input.dpi ?? PDF_SCAN_DEFAULT_DPI;
  const maxPages = input.maxPages ?? PDF_SCAN_MAX_PAGES;
  const jobId = `pdfscan_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const contentSha256 = source.contentSha256 || sha256Hex(buffer);
  const fileName = sanitizePdfFileName(source.fileName || input.fileName || "document.pdf");

  const pages = await renderPdfPages(buffer, { maxPages, dpi });
  if (!pages.length) throw new Error("No se pudo rasterizar ninguna página del PDF.");

  const textSpans = await extractPdfTextSpans(buffer, { dpi, maxPages });
  const spansByPage = new Map<number, PdfScanTextSpan[]>();
  for (const span of textSpans) {
    const list = spansByPage.get(span.page) ?? [];
    list.push(span);
    spansByPage.set(span.page, list);
  }

  const layoutPages: PdfScanLayoutOutput["pages"] = [];
  for (const page of pages) {
    const pageSpans = spansByPage.get(page.pageNumber) ?? [];
    const cleanedPng = await coverTextRegionsOnPageRaster(page.pngBuffer, pageSpans);
    const bgKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/pages",
      `${contentSha256.slice(0, 12)}-p${page.pageNumber}-${dpi}-clean.jpg`,
    );
    const jpeg = await sharp(cleanedPng).jpeg({ quality: 85 }).toBuffer();
    await uploadBufferToS3Key(bgKey, jpeg, "image/jpeg");
    layoutPages.push({
      pageNumber: page.pageNumber,
      widthPx: page.width,
      heightPx: page.height,
      widthPt: page.originalWidthPt,
      heightPt: page.originalHeightPt,
      backgroundUrl: stableKnowledgeFileUrlFromKey(bgKey),
      backgroundS3Key: bgKey,
      textSpans: pageSpans,
    });
  }

  const embedded = await extractPdfScanEmbeddedImages(buffer, { maxPages });
  const images: PdfScanImageAsset[] = [];
  for (let i = 0; i < embedded.length; i += 1) {
    const img = embedded[i]!;
    const id = `img_${img.contentHash.slice(0, 10)}_${i}`;
    const fullKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/images",
      `${contentSha256.slice(0, 12)}-${id}.png`,
    );
    const thumbKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/thumbs",
      `${contentSha256.slice(0, 12)}-${id}-thumb.jpg`,
    );
    await uploadBufferToS3Key(fullKey, img.buffer, img.mime || "image/png");
    const thumb = await uploadJpegThumb(img.buffer, 240);
    await uploadBufferToS3Key(thumbKey, thumb, "image/jpeg");
    images.push({
      id,
      page: img.pageNumber,
      width: img.width,
      height: img.height,
      url: stableKnowledgeFileUrlFromKey(fullKey),
      thumbUrl: stableKnowledgeFileUrlFromKey(thumbKey),
      s3Key: fullKey,
      contentHash: img.contentHash,
    });
  }

  const first = layoutPages[0]!;
  const fontsMissing = collectMissingPdfFonts(textSpans.map((s) => s.fontName));
  const output: PdfScanLayoutOutput = {
    kind: "pdf_scan_layout",
    jobId,
    mode: "texts",
    dpi,
    pageCount: layoutPages.length,
    pages: layoutPages,
    fidelity: {
      mode: "texts",
      textFieldCount: textSpans.length,
      pathCount: 0,
      imageLayerCount: images.length,
      fontsMissing,
      notes: [
        "Modo Textos editables: raster limpio + campos de texto tipográficos.",
        fontsMissing.length
          ? `Fuentes sin match exacto: ${fontsMissing.slice(0, 6).join(", ")}.`
          : "Tipografías mapeadas a sistema/Google Fonts.",
      ],
    },
  };

  const mediaItems: MediaListItem[] = images.map((img, order) => ({
    id: img.id,
    order,
    title: `Imagen p${img.page} · ${img.width}×${img.height}`,
    mediaType: "image",
    url: img.url,
    s3Key: img.s3Key,
    width: img.width,
    height: img.height,
    status: "generated",
    metadata: {
      pdfScanJobId: jobId,
      pageNumber: img.page,
      contentHash: img.contentHash,
    },
  }));

  const mediaListOutput: MediaListOutput = {
    kind: "media_list",
    sourceNodeId: "",
    sourceNodeType: "pdfScan",
    title: fileName,
    status: mediaItems.length ? "frames_ready" : "empty",
    items: mediaItems,
    metadata: {
      cineNodeId: jobId,
      generatedAt: new Date().toISOString(),
      totalFrames: mediaItems.length,
    },
  };

  return {
    jobId,
    mode: "texts",
    source: { ...source, fileName, contentSha256 },
    scan: {
      pageCount: layoutPages.length,
      dpi,
      widthPx: first.widthPx,
      heightPx: first.heightPx,
      widthPt: first.widthPt,
      heightPt: first.heightPt,
      textSpanCount: textSpans.length,
      imageCount: images.length,
      pathCount: 0,
      scannedAt: new Date().toISOString(),
      mode: "texts",
    },
    images,
    textPreview: textSpans.slice(0, 40).map((s) => ({ id: s.id, page: s.page, text: s.text.slice(0, 120) })),
    output,
    mediaListOutput,
  };
}

/** @deprecated Prefer runPdfScanTexts */
export const runPdfScan = runPdfScanTexts;
