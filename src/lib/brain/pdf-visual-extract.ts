import crypto from "crypto";
import sharp from "sharp";
import zlib from "zlib";
import { configurePdfJsForNodeServer, pdfJsGetDocumentInit } from "@/lib/brain/pdfjs-server";

export const MAX_PDF_VISUAL_IMAGES = 5;

const MAX_PDF_IMAGE_CANDIDATES = 120;
const MIN_EXTRACTED_IMAGE_DIMENSION = 96;
const STRONG_EXTRACTED_IMAGE_DIMENSION = 180;
const STRONG_EXTRACTED_IMAGE_AREA = 45_000;

export type PdfVisualImage = { name: string; buffer: Buffer; mime: string; width?: number; height?: number };

export type PdfEmbeddedRasterImage = {
  buffer: Buffer;
  width: number;
  height: number;
  pageNumber: number;
  mime: string;
  contentHash: string;
};

export const LOGO_EMBEDDED_MIN_SIDE = 20;
export const LOGO_EMBEDDED_MAX_SIDE = 420;
export const LOGO_EMBEDDED_MAX_AREA = 80_000;

type PdfVisualCandidate = PdfVisualImage & {
  area: number;
  hash: string;
  index: number;
  isStrong: boolean;
  score: number;
};

export function countPdfImageObjects(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Subtype\s*\/Image\b/g) ?? []).length;
}

function pdfDictNumber(dict: string, key: string): number | null {
  const match = dict.match(new RegExp(`/${key}\\s+(\\d+)`));
  return match ? Number(match[1]) : null;
}

function pdfImageChannels(dict: string): number | null {
  if (/\/ColorSpace\s*\/DeviceRGB\b/.test(dict)) return 3;
  if (/\/ColorSpace\s*\/DeviceGray\b/.test(dict)) return 1;
  if (/\/ColorSpace\s*\/DeviceCMYK\b/.test(dict)) return 4;
  return null;
}

function pdfStreamStartOffset(buffer: Buffer, streamTokenEnd: number): number {
  if (buffer[streamTokenEnd] === 0x0d && buffer[streamTokenEnd + 1] === 0x0a) return streamTokenEnd + 2;
  if (buffer[streamTokenEnd] === 0x0a || buffer[streamTokenEnd] === 0x0d) return streamTokenEnd + 1;
  return streamTokenEnd;
}

function pdfStreamEndOffset(buffer: Buffer, endstreamStart: number): number {
  if (endstreamStart >= 2 && buffer[endstreamStart - 2] === 0x0d && buffer[endstreamStart - 1] === 0x0a) {
    return endstreamStart - 2;
  }
  if (endstreamStart >= 1 && (buffer[endstreamStart - 1] === 0x0a || buffer[endstreamStart - 1] === 0x0d)) {
    return endstreamStart - 1;
  }
  return endstreamStart;
}

function pdfObjectImageName(originalName: string, index: number, ext: string): string {
  const stem = originalName.replace(/\.[^.]+$/, "").slice(0, 90) || "PDF";
  return `${stem} - imagen ${index}.${ext}`;
}

async function convertPdfImageStreamToUploadable(
  dict: string,
  stream: Buffer,
): Promise<{ buffer: Buffer; mime: string; width: number; height: number } | null> {
  const width = pdfDictNumber(dict, "Width") ?? 0;
  const height = pdfDictNumber(dict, "Height") ?? 0;
  if (/\/Filter\s*(?:\[)?\s*\/DCTDecode\b/.test(dict)) {
    if (width && height) return { buffer: stream, mime: "image/jpeg", width, height };
    try {
      const metadata = await sharp(stream).metadata();
      return {
        buffer: stream,
        mime: "image/jpeg",
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
      };
    } catch {
      return null;
    }
  }
  if (/\/Filter\s*(?:\[)?\s*\/JPXDecode\b/.test(dict)) return null;
  if (!/\/Filter\s*(?:\[)?\s*\/FlateDecode\b/.test(dict)) return null;

  const bits = pdfDictNumber(dict, "BitsPerComponent") ?? 8;
  const channels = pdfImageChannels(dict);
  if (!width || !height || !channels || bits !== 8) return null;
  if (width < MIN_EXTRACTED_IMAGE_DIMENSION || height < MIN_EXTRACTED_IMAGE_DIMENSION) return null;

  let raw: Buffer;
  try {
    raw = zlib.inflateSync(stream);
  } catch {
    return null;
  }

  const expected = width * height * channels;
  if (raw.length < expected) return null;
  try {
    const png = await sharp(raw.subarray(0, expected), { raw: { width, height, channels: channels as 1 | 2 | 3 | 4 } })
      .png()
      .toBuffer();
    return { buffer: png, mime: "image/png", width, height };
  } catch {
    return null;
  }
}

function buildPdfVisualCandidate(input: {
  buffer: Buffer;
  height: number;
  index: number;
  mime: string;
  originalName: string;
  seen: Set<string>;
  width: number;
}): PdfVisualCandidate | null {
  const width = Math.round(input.width);
  const height = Math.round(input.height);
  if (width < MIN_EXTRACTED_IMAGE_DIMENSION || height < MIN_EXTRACTED_IMAGE_DIMENSION) return null;

  const hash = crypto.createHash("sha1").update(input.buffer).digest("hex");
  if (input.seen.has(hash)) return null;
  input.seen.add(hash);

  const area = width * height;
  const isStrong =
    width >= STRONG_EXTRACTED_IMAGE_DIMENSION &&
    height >= STRONG_EXTRACTED_IMAGE_DIMENSION &&
    area >= STRONG_EXTRACTED_IMAGE_AREA;
  return {
    name: input.originalName,
    buffer: input.buffer,
    mime: input.mime,
    width,
    height,
    area,
    hash,
    index: input.index,
    isStrong,
    score: area + Math.min(width, height) * 400 + (isStrong ? 1_000_000 : 0),
  };
}

function selectPdfVisualImageCandidates(candidates: PdfVisualCandidate[], originalName: string): PdfVisualImage[] {
  const preferred = candidates.filter((candidate) => candidate.isStrong);
  const pool = preferred.length >= MAX_PDF_VISUAL_IMAGES ? preferred : candidates;
  return pool
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_PDF_VISUAL_IMAGES)
    .sort((a, b) => a.index - b.index)
    .map((candidate, index) => ({
      name: pdfObjectImageName(originalName, index + 1, candidate.mime === "image/jpeg" ? "jpg" : "png"),
      buffer: candidate.buffer,
      mime: candidate.mime,
      width: candidate.width,
      height: candidate.height,
    }));
}

function hasEnoughStrongCandidates(candidates: PdfVisualCandidate[]): boolean {
  return candidates.filter((candidate) => candidate.isStrong).length >= MAX_PDF_VISUAL_IMAGES;
}

function getPdfJsObject(page: unknown, objectName: string): Promise<unknown> {
  const objectStore = (page as { objs?: { get?: (name: string, callback: (value: unknown) => void) => void } }).objs;
  const getObject = objectStore?.get;
  if (!getObject) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, 200);

    try {
      getObject.call(objectStore, objectName, (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      });
    } catch {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

async function convertPdfJsImageToUploadable(
  image: unknown,
): Promise<{ buffer: Buffer; height: number; mime: string; width: number } | null> {
  if (image == null || typeof image !== "object") return null;
  const imageLike = image as {
    data?: Uint8Array | Uint8ClampedArray;
    height?: number;
    width?: number;
  };
  const width = imageLike.width ?? 0;
  const height = imageLike.height ?? 0;
  const data = imageLike.data;
  if (!width || !height || !data) return null;

  const pixelCount = width * height;
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const channels =
    bytes.length === pixelCount * 4
      ? 4
      : bytes.length === pixelCount * 3
        ? 3
        : bytes.length === pixelCount
          ? 1
          : null;
  if (!channels) return null;

  try {
    const png = await sharp(bytes, { raw: { width, height, channels: channels as 1 | 2 | 3 | 4 } })
      .png()
      .toBuffer();
    return { buffer: png, mime: "image/png", width, height };
  } catch {
    return null;
  }
}

async function extractDecodedImagesFromPdfBuffer(
  buffer: Buffer,
  originalName: string,
  seen: Set<string>,
): Promise<PdfVisualCandidate[]> {
  const candidates: PdfVisualCandidate[] = [];
  try {
    const pdfjs = await configurePdfJsForNodeServer();
    const ops = pdfjs.OPS as Record<string, number | undefined>;
    const imageOps = new Set(
      [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter(
        (value): value is number => typeof value === "number",
      ),
    );
    const pdf = await pdfjs.getDocument(pdfJsGetDocumentInit(buffer) as Parameters<typeof pdfjs.getDocument>[0]).promise;

    let scannedImages = 0;
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages && scannedImages < MAX_PDF_IMAGE_CANDIDATES; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const operatorList = await page.getOperatorList();
        for (let index = 0; index < operatorList.fnArray.length && scannedImages < MAX_PDF_IMAGE_CANDIDATES; index += 1) {
          const op = operatorList.fnArray[index];
          if (!imageOps.has(op)) continue;
          scannedImages += 1;
          const args = operatorList.argsArray[index] ?? [];
          const inlineImage = op === ops.paintInlineImageXObject ? args[0] : null;
          const image = inlineImage || (typeof args[0] === "string" ? await getPdfJsObject(page, args[0]) : null);
          const converted = await convertPdfJsImageToUploadable(image);
          if (!converted) continue;
          const candidate = buildPdfVisualCandidate({
            buffer: converted.buffer,
            height: converted.height,
            index: MAX_PDF_IMAGE_CANDIDATES + scannedImages,
            mime: converted.mime,
            originalName,
            seen,
            width: converted.width,
          });
          if (candidate) candidates.push(candidate);
        }
      }
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    console.warn("[brain/pdf-visual-extract] PDF embedded image decode failed:", error);
  }
  return candidates;
}

export function isLogoSizedEmbeddedImage(width: number, height: number): boolean {
  if (width < LOGO_EMBEDDED_MIN_SIDE || height < LOGO_EMBEDDED_MIN_SIDE) return false;
  if (width > LOGO_EMBEDDED_MAX_SIDE || height > LOGO_EMBEDDED_MAX_SIDE) return false;
  if (width * height > LOGO_EMBEDDED_MAX_AREA) return false;
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return ratio <= 8;
}

/** Imágenes raster embebidas en PDF (XObject). Por defecto filtradas a escala de logo. */
export async function extractEmbeddedRasterImagesFromPdf(
  buffer: Buffer,
  options?: { maxPages?: number; maxScans?: number; mode?: "logo" | "all"; maxImages?: number },
): Promise<PdfEmbeddedRasterImage[]> {
  const maxPages = options?.maxPages ?? 20;
  const maxScans = options?.maxScans ?? 80;
  const mode = options?.mode ?? "logo";
  const maxImages = options?.maxImages ?? (mode === "logo" ? 40 : 40);
  const images: PdfEmbeddedRasterImage[] = [];
  const seen = new Set<string>();

  try {
    const pdfjs = await configurePdfJsForNodeServer();
    const ops = pdfjs.OPS as Record<string, number | undefined>;
    const imageOps = new Set(
      [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter(
        (value): value is number => typeof value === "number",
      ),
    );
    const pdf = await pdfjs.getDocument(pdfJsGetDocumentInit(buffer) as Parameters<typeof pdfjs.getDocument>[0]).promise;

    let scannedImages = 0;
    try {
      const pageLimit = Math.min(pdf.numPages, maxPages);
      for (let pageNumber = 1; pageNumber <= pageLimit && scannedImages < maxScans; pageNumber += 1) {
        let page;
        let operatorList;
        try {
          page = await pdf.getPage(pageNumber);
          operatorList = await page.getOperatorList();
        } catch (pageError) {
          console.warn(
            `[brain/pdf-visual-extract] skip page ${pageNumber} operator list:`,
            pageError,
          );
          continue;
        }
        for (let index = 0; index < operatorList.fnArray.length && scannedImages < maxScans; index += 1) {
          const op = operatorList.fnArray[index];
          if (!imageOps.has(op)) continue;
          scannedImages += 1;
          try {
            const args = operatorList.argsArray[index] ?? [];
            const inlineImage = op === ops.paintInlineImageXObject ? args[0] : null;
            const image =
              inlineImage || (typeof args[0] === "string" ? await getPdfJsObject(page, args[0]) : null);
            const converted = await convertPdfJsImageToUploadable(image);
            if (!converted) continue;
            if (mode === "logo" && !isLogoSizedEmbeddedImage(converted.width, converted.height)) continue;
            if (mode === "all" && (converted.width < 48 || converted.height < 48)) continue;
            const contentHash = crypto.createHash("sha256").update(converted.buffer).digest("hex");
            if (seen.has(contentHash)) continue;
            seen.add(contentHash);
            images.push({
              buffer: converted.buffer,
              width: converted.width,
              height: converted.height,
              pageNumber,
              mime: converted.mime,
              contentHash,
            });
            if (images.length >= maxImages) {
              return images;
            }
          } catch (imageError) {
            console.warn(
              `[brain/pdf-visual-extract] skip embedded image p${pageNumber} idx${index}:`,
              imageError,
            );
          }
        }
      }
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    console.warn("[brain/pdf-visual-extract] embedded raster logo scan failed:", error);
  }

  return images;
}

export async function extractVisualImagesFromPdfBuffer(buffer: Buffer, originalName: string): Promise<PdfVisualImage[]> {
  const ascii = buffer.toString("latin1");
  const candidates: PdfVisualCandidate[] = [];
  const seen = new Set<string>();
  const re = /(\d+)\s+(\d+)\s+obj([\s\S]*?)\bstream\b/g;
  let match: RegExpExecArray | null;
  let scannedImages = 0;

  while ((match = re.exec(ascii)) && scannedImages < MAX_PDF_IMAGE_CANDIDATES) {
    const dict = match[3] || "";
    if (!/\/Subtype\s*\/Image\b/.test(dict)) continue;
    scannedImages += 1;
    const streamTokenEnd = match.index + match[0].length;
    const endstream = ascii.indexOf("endstream", streamTokenEnd);
    if (endstream < 0) break;
    const start = pdfStreamStartOffset(buffer, streamTokenEnd);
    const end = pdfStreamEndOffset(buffer, endstream);
    if (end <= start) continue;
    const converted = await convertPdfImageStreamToUploadable(dict, buffer.subarray(start, end));
    if (!converted) continue;
    const candidate = buildPdfVisualCandidate({
      buffer: converted.buffer,
      height: converted.height,
      index: scannedImages,
      mime: converted.mime,
      originalName,
      seen,
      width: converted.width,
    });
    if (candidate) candidates.push(candidate);
    re.lastIndex = endstream + "endstream".length;
  }

  if (!hasEnoughStrongCandidates(candidates)) {
    const decodedCandidates = await extractDecodedImagesFromPdfBuffer(buffer, originalName, seen);
    candidates.push(...decodedCandidates);
  }
  return selectPdfVisualImageCandidates(candidates, originalName);
}
