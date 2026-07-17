import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";
import type { MediaListItem, MediaListOutput } from "@/app/spaces/media-list-output";
import { coverTextRegionsOnPageRaster } from "./pdf-scan-clean-background";
import { extractPdfScanEmbeddedImages, sha256Hex } from "./pdf-scan-images";
import { pageNeedsOcr, parseOcrBlocksJson } from "./pdf-scan-ocr-heuristics";
import { extractPdfTextSpans } from "./pdf-scan-text-spans";
import { assertPdfBuffer, pdfScanObjectKey, sanitizePdfFileName } from "./pdf-scan-stage";
import {
  PDF_SCAN_DEFAULT_DPI,
  PDF_SCAN_MAX_PAGES,
  PDF_SCAN_OCR_MAX_PAGES,
  type PdfScanImageAsset,
  type PdfScanLayoutOutput,
  type PdfScanOcrMeta,
  type PdfScanSourceMeta,
  type PdfScanSummary,
  type PdfScanTextSpan,
} from "./pdf-scan-types";

export { looksLikeScannedPdf, pageNeedsOcr, parseOcrBlocksJson } from "./pdf-scan-ocr-heuristics";

export const PDF_SCAN_OCR_ROUTE = "/api/spaces/pdf-scan/ocr";
/** Estimación wallet por página (Gemini Flash + imagen). */
export const PDF_SCAN_OCR_USD_PER_PAGE = 0.008;

const OCR_PROMPT = `Eres un motor OCR. La imagen es UNA página de un PDF escaneado.
Extrae TODO el texto legible en orden de lectura.
Devuelve SOLO JSON válido (sin markdown) con esta forma:
{
  "blocks": [
    {
      "text": "texto del bloque",
      "x": 0.0,
      "y": 0.0,
      "w": 0.1,
      "h": 0.05
    }
  ]
}
Coordenadas normalizadas 0–1 respecto al ancho/alto de la página (origen arriba-izquierda).
Agrupa por párrafos/líneas naturales. No inventes texto. Si no hay texto: {"blocks":[]}.`;

export async function defaultPdfScanOcrInvoker(input: {
  pageNumber: number;
  mimeType: string;
  base64: string;
  userEmail?: string;
  pageWidth: number;
  pageHeight: number;
}): Promise<{ spans: Omit<PdfScanTextSpan, "id" | "page">[]; usage?: { inputTokens: number; outputTokens: number } }> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY para OCR.");

  const modelName = process.env.PDF_SCAN_OCR_GEMINI_MODEL?.trim() || process.env.BRAIN_VISION_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  // UNA sola llamada de pago por página. Sin reintentos ni prompt alternativo.
  const r = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [
          { text: OCR_PROMPT },
          { inlineData: { mimeType: input.mimeType, data: input.base64 } },
        ],
      },
    ],
    config: {
      systemInstruction: "Respondes únicamente JSON válido de OCR. Sin markdown ni explicaciones.",
    },
  });

  const { recordApiUsage, parseGeminiUsageMetadata } = await import("@/lib/api-usage");
  const usage = parseGeminiUsageMetadata(r);
  await recordApiUsage({
    provider: "gemini",
    userEmail: input.userEmail,
    serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
    route: PDF_SCAN_OCR_ROUTE,
    operation: "pdf_scan_ocr_page",
    model: modelName,
    costIsKnown: Boolean(usage),
    costUsd: usage ? estimateGeminiUsd(modelName, usage.inputTokens, usage.outputTokens) : PDF_SCAN_OCR_USD_PER_PAGE,
    metadata: usage ? { ...usage } : undefined,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
  });

  const raw = parseJsonObjectFromVisionModelText(r.text ?? "");
  if (!raw) {
    throw new Error(`OCR página ${input.pageNumber}: respuesta vacía o no JSON.`);
  }
  const spans = parseOcrBlocksJson(raw, input.pageWidth, input.pageHeight);
  return {
    spans,
    usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : undefined,
  };
}

export type RunPdfScanOcrInput = {
  source: PdfScanSourceMeta;
  userEmail: string;
  dpi?: number;
  maxPages?: number;
  /** Páginas ya OCR (evitar doble cargo). */
  pagesDone?: number[];
  /** Override tests. */
  invokeOcr?: typeof defaultPdfScanOcrInvoker;
};

export type RunPdfScanOcrResult = {
  jobId: string;
  mode: "texts";
  source: PdfScanSourceMeta;
  scan: PdfScanSummary;
  images: PdfScanImageAsset[];
  textPreview: Array<{ id: string; page: number; text: string }>;
  output: PdfScanLayoutOutput;
  mediaListOutput: MediaListOutput;
  ocr: PdfScanOcrMeta;
  actualCostUsd: number;
  pagesAttempted: number[];
  /** Si se detuvo por error de proveedor tras alguna página OK. */
  stoppedEarly?: { page: number; message: string };
};

async function uploadJpegThumb(buffer: Buffer, maxEdge: number): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
}

/**
 * OCR opt-in (F6): páginas sin texto nativo útil.
 * Determinista salvo la llamada Gemini (1/página, sin auto-retry).
 */
export async function runPdfScanOcr(input: RunPdfScanOcrInput): Promise<RunPdfScanOcrResult> {
  const buffer = await getFromS3(input.source.s3Key);
  assertPdfBuffer(buffer);
  const dpi = input.dpi ?? PDF_SCAN_DEFAULT_DPI;
  const maxPages = Math.min(input.maxPages ?? PDF_SCAN_OCR_MAX_PAGES, PDF_SCAN_OCR_MAX_PAGES, PDF_SCAN_MAX_PAGES);
  const jobId = `pdfocr_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const contentSha256 = input.source.contentSha256 || sha256Hex(buffer);
  const fileName = sanitizePdfFileName(input.source.fileName || "document.pdf");
  const pagesDone = new Set(input.pagesDone ?? []);
  const invoke = input.invokeOcr ?? defaultPdfScanOcrInvoker;

  const pages = await renderPdfPages(buffer, { maxPages, dpi });
  if (!pages.length) throw new Error("No se pudo rasterizar ninguna página del PDF.");

  const nativeSpans = await extractPdfTextSpans(buffer, { dpi, maxPages });
  const spansByPage = new Map<number, PdfScanTextSpan[]>();
  for (const span of nativeSpans) {
    const list = spansByPage.get(span.page) ?? [];
    list.push(span);
    spansByPage.set(span.page, list);
  }

  const pagesToOcr = pages
    .filter((p) => pageNeedsOcr(spansByPage.get(p.pageNumber) ?? []) && !pagesDone.has(p.pageNumber))
    .map((p) => p.pageNumber);

  if (!pagesToOcr.length) {
    throw new Error(
      pagesDone.size
        ? "No quedan páginas pendientes de OCR."
        : "Este PDF ya tiene texto nativo suficiente; OCR no es necesario.",
    );
  }

  const ocrSpansByPage = new Map<number, PdfScanTextSpan[]>();
  const pagesCompleted: number[] = [];
  let actualCostUsd = 0;
  let stoppedEarly: RunPdfScanOcrResult["stoppedEarly"];
  let blockCount = 0;

  for (const pageNumber of pagesToOcr) {
    const page = pages.find((p) => p.pageNumber === pageNumber)!;
    const jpeg = await sharp(page.pngBuffer)
      .resize({ width: Math.min(1280, page.width), height: Math.min(1280, page.height), fit: "inside" })
      .jpeg({ quality: 82 })
      .toBuffer();
    try {
      const { spans, usage } = await invoke({
        pageNumber,
        mimeType: "image/jpeg",
        base64: jpeg.toString("base64"),
        userEmail: input.userEmail,
        pageWidth: page.width,
        pageHeight: page.height,
      });
      const modelName = process.env.PDF_SCAN_OCR_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
      actualCostUsd += usage
        ? estimateGeminiUsd(modelName, usage.inputTokens, usage.outputTokens)
        : PDF_SCAN_OCR_USD_PER_PAGE;
      const withIds: PdfScanTextSpan[] = spans.map((s, i) => ({
        ...s,
        id: `ocr_p${pageNumber}_${i}`,
        page: pageNumber,
      }));
      ocrSpansByPage.set(pageNumber, withIds);
      blockCount += withIds.length;
      pagesCompleted.push(pageNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ocr_failed";
      stoppedEarly = { page: pageNumber, message };
      // No más llamadas de pago en esta operación.
      break;
    }
  }

  if (!pagesCompleted.length) {
    throw new Error(stoppedEarly?.message || "OCR falló sin páginas completadas.");
  }

  // Layout texts: nativo en páginas no-OCR + OCR en páginas hechas (esta pasada + previas se tratan como OCR solo en pagesCompleted).
  const layoutPages: PdfScanLayoutOutput["pages"] = [];
  for (const page of pages) {
    const native = spansByPage.get(page.pageNumber) ?? [];
    const ocrSpans = ocrSpansByPage.get(page.pageNumber);
    const pageSpans = ocrSpans ?? native;
    const cleanedPng = await coverTextRegionsOnPageRaster(page.pngBuffer, pageSpans);
    const bgKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/pages",
      `${contentSha256.slice(0, 12)}-p${page.pageNumber}-${dpi}-ocr.jpg`,
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

  const embedded = await extractPdfScanEmbeddedImages(buffer, { maxPages, maxImages: 40 });
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

  const allSpans = layoutPages.flatMap((p) => p.textSpans);
  const first = layoutPages[0]!;
  const allDone = [...pagesDone, ...pagesCompleted];
  const ocr: PdfScanOcrMeta = {
    applied: true,
    provider: "gemini-vision",
    pagesDone: [...new Set(allDone)].sort((a, b) => a - b),
    blockCount,
    stoppedEarly: Boolean(stoppedEarly),
  };

  const output: PdfScanLayoutOutput = {
    kind: "pdf_scan_layout",
    jobId,
    mode: "texts",
    dpi,
    pageCount: layoutPages.length,
    pages: layoutPages,
    fidelity: {
      mode: "texts",
      textFieldCount: allSpans.length,
      pathCount: 0,
      imageLayerCount: images.length,
      fontsMissing: [],
      notes: [
        `OCR opt-in: ${pagesCompleted.length} página(s) con Gemini (1 llamada/página).`,
        stoppedEarly
          ? `Detenido en p${stoppedEarly.page}: ${stoppedEarly.message}. Pulsa OCR de nuevo para el resto (nuevo cargo).`
          : "OCR completado sin errores de proveedor.",
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
    metadata: { pdfScanJobId: jobId, pageNumber: img.page, contentHash: img.contentHash },
  }));

  return {
    jobId,
    mode: "texts",
    source: { ...input.source, fileName, contentSha256 },
    scan: {
      pageCount: layoutPages.length,
      dpi,
      widthPx: first.widthPx,
      heightPx: first.heightPx,
      widthPt: first.widthPt,
      heightPt: first.heightPt,
      textSpanCount: allSpans.length,
      imageCount: images.length,
      scannedAt: new Date().toISOString(),
      mode: "texts",
      ocr,
    },
    images,
    textPreview: allSpans.slice(0, 40).map((s) => ({ id: s.id, page: s.page, text: s.text })),
    output,
    mediaListOutput: {
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
    },
    ocr,
    actualCostUsd,
    pagesAttempted: pagesToOcr,
    stoppedEarly,
  };
}
