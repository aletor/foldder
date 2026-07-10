import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PDFiumLibrary, type PDFiumLibrary as PDFiumLibraryType } from "@hyzyla/pdfium";

export const PDF_PAGE_RENDER_MAX_PAGES = 30;
export const PDF_PAGE_RENDER_DEFAULT_DPI = 150;

export type RenderedPdfPage = {
  pageNumber: number;
  width: number;
  height: number;
  pngBuffer: Buffer;
  originalWidthPt: number;
  originalHeightPt: number;
};

export type RenderPdfPagesOptions = {
  maxPages?: number;
  dpi?: number;
};

const PDFIUM_WASM_PATH = path.join(process.cwd(), "node_modules/@hyzyla/pdfium/dist/pdfium.wasm");

let pdfiumLibraryPromise: Promise<PDFiumLibraryType> | null = null;

async function getPdfiumLibrary(): Promise<PDFiumLibraryType> {
  pdfiumLibraryPromise ??= (async () => {
    if (fs.existsSync(PDFIUM_WASM_PATH)) {
      const wasmBytes = fs.readFileSync(PDFIUM_WASM_PATH);
      return PDFiumLibrary.init({
        wasmBinary: wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength),
      });
    }
    return PDFiumLibrary.init();
  })();
  return pdfiumLibraryPromise;
}

/** Convierte bitmap RGBA de pdfium (FPDF_REVERSE_BYTE_ORDER) a PNG RGB. */
export async function bgraBitmapToPng(data: Uint8Array, width: number, height: number): Promise<Buffer> {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i] ?? 0;
    rgb[j + 1] = data[i + 1] ?? 0;
    rgb[j + 2] = data[i + 2] ?? 0;
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

export async function renderPdfPages(
  buffer: Buffer,
  options?: RenderPdfPagesOptions,
): Promise<RenderedPdfPage[]> {
  const maxPages = options?.maxPages ?? PDF_PAGE_RENDER_MAX_PAGES;
  const pageNumbers = Array.from({ length: maxPages }, (_, i) => i + 1);
  return renderPdfPagesAt(buffer, pageNumbers, { dpi: options?.dpi });
}

export type RenderPdfPagesAtOptions = {
  dpi?: number;
  concurrency?: number;
};

/** Render only the requested 1-indexed pages (single document load). */
export async function renderPdfPagesAt(
  buffer: Buffer,
  pageNumbers: number[],
  options?: RenderPdfPagesAtOptions,
): Promise<RenderedPdfPage[]> {
  const dpi = options?.dpi ?? PDF_PAGE_RENDER_DEFAULT_DPI;
  const concurrency = Math.max(1, options?.concurrency ?? 6);
  const scale = dpi / 72;
  const unique = [...new Set(pageNumbers.filter((p) => p >= 1))].sort((a, b) => a - b);
  if (!unique.length) return [];

  const library = await getPdfiumLibrary();
  const document = await library.loadDocument(buffer);
  try {
    const total = document.getPageCount();
    const targets = unique.filter((p) => p <= total);
    const pages: RenderedPdfPage[] = new Array(targets.length);
    let cursor = 0;

    async function worker(): Promise<void> {
      while (cursor < targets.length) {
        const idx = cursor;
        cursor += 1;
        const pageNumber = targets[idx]!;
        const page = document.getPage(pageNumber - 1);
        const original = page.getOriginalSize();
        const rendered = await page.render({ scale, render: "bitmap" });
        const pngBuffer = await bgraBitmapToPng(rendered.data, rendered.width, rendered.height);
        pages[idx] = {
          pageNumber,
          width: rendered.width,
          height: rendered.height,
          pngBuffer,
          originalWidthPt: original.originalWidth,
          originalHeightPt: original.originalHeight,
        };
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
    return pages.filter(Boolean);
  } finally {
    document.destroy();
  }
}

export type PixelBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clampPixelBBox(pageWidth: number, pageHeight: number, box: PixelBBox): PixelBBox {
  const x = Math.max(0, Math.min(box.x, pageWidth - 1));
  const y = Math.max(0, Math.min(box.y, pageHeight - 1));
  const width = Math.max(1, Math.min(box.width, pageWidth - x));
  const height = Math.max(1, Math.min(box.height, pageHeight - y));
  return { x, y, width, height };
}

export async function renderPdfPageCrop(
  buffer: Buffer,
  pageNumber: number,
  bbox: PixelBBox,
  dpi: number,
): Promise<Buffer> {
  const scale = dpi / 72;
  const library = await getPdfiumLibrary();
  const document = await library.loadDocument(buffer);
  try {
    const page = document.getPage(pageNumber - 1);
    const rendered = await page.render({ scale, render: "bitmap" });
    const pngBuffer = await bgraBitmapToPng(rendered.data, rendered.width, rendered.height);
    const clamped = clampPixelBBox(rendered.width, rendered.height, bbox);
    return sharp(pngBuffer)
      .extract({
        left: clamped.x,
        top: clamped.y,
        width: clamped.width,
        height: clamped.height,
      })
      .png()
      .toBuffer();
  } finally {
    document.destroy();
  }
}

export function buildS3PageRenderCacheKey(contentSha256: string, pageNumber: number, dpi: number): string {
  return `brain/brand/page-renders/${contentSha256}/p${pageNumber}-${dpi}.png`;
}
