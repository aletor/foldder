import sharp from "sharp";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import { mapPool } from "@/lib/brandkit/logo-intake/concurrency";

export const LOGO_INTAKE_MAX_LONG_EDGE = 1280;
export const LOGO_INTAKE_JPEG_QUALITY = 80;
export const LOGO_INTAKE_RENDER_DPI = 144;
export const LOGO_INTAKE_RENDER_CONCURRENCY = 6;

export type IntakeDocInput = {
  docId: string;
  docName: string;
  buffer: Buffer;
  kind: "pdf" | "image";
};

export type IntakeFrame = {
  docId: string;
  docName: string;
  docIndex: number;
  page: number;
  totalPages: number;
  jpegBase64: string;
  width: number;
  height: number;
  label: string;
};

export function selectPdfPages(totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const picked = new Set<number>();
  for (let p = 1; p <= 6; p += 1) picked.add(p);
  picked.add(totalPages);
  return [...picked].sort((a, b) => a - b);
}

export type IntakePageSelector = (totalPages: number, doc: IntakeDocInput) => number[];

function resolvePdfPages(
  totalPages: number,
  doc: IntakeDocInput,
  selectPages?: IntakePageSelector,
): number[] {
  const picked = selectPages?.(totalPages, doc) ?? selectPdfPages(totalPages);
  return [...new Set(picked.filter((p) => p >= 1 && p <= totalPages))].sort((a, b) => a - b);
}

async function resizeToJpeg(pngBuffer: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  let pipeline = sharp(pngBuffer);
  if (Math.max(width, height) > LOGO_INTAKE_MAX_LONG_EDGE) {
    pipeline = pipeline.resize({
      width: width >= height ? LOGO_INTAKE_MAX_LONG_EDGE : undefined,
      height: height > width ? LOGO_INTAKE_MAX_LONG_EDGE : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const jpeg = await pipeline.jpeg({ quality: LOGO_INTAKE_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const outMeta = await sharp(jpeg).metadata();
  return { jpeg, width: outMeta.width ?? 0, height: outMeta.height ?? 0 };
}

export async function renderIntakeFrames(
  docs: IntakeDocInput[],
  opts?: {
    onPagePrepared?: (done: number, total: number) => void;
    selectPages?: IntakePageSelector;
  },
): Promise<IntakeFrame[]> {
  let totalPages = 0;
  for (const doc of docs) {
    if (doc.kind === "image") totalPages += 1;
    else {
      const total = await countPdfPagesInBuffer(doc.buffer, 500);
      totalPages += resolvePdfPages(total, doc, opts?.selectPages).length;
    }
  }
  let donePages = 0;
  const tick = () => {
    donePages += 1;
    opts?.onPagePrepared?.(donePages, totalPages);
  };

  const nested = await mapPool(docs, LOGO_INTAKE_RENDER_CONCURRENCY, async (doc, docIndex) => {
    if (doc.kind === "image") {
      const { jpeg, width, height } = await resizeToJpeg(doc.buffer);
      tick();
      return [
        {
          docId: doc.docId,
          docName: doc.docName,
          docIndex,
          page: 1,
          totalPages: 1,
          jpegBase64: jpeg.toString("base64"),
          width,
          height,
          label: `doc:${docIndex} "${doc.docName}" page:1`,
        } satisfies IntakeFrame,
      ];
    }

    const totalPagesInDoc = await countPdfPagesInBuffer(doc.buffer, 500);
    const pages = resolvePdfPages(totalPagesInDoc, doc, opts?.selectPages);
    const rendered = await renderPdfPagesAt(doc.buffer, pages, {
      dpi: LOGO_INTAKE_RENDER_DPI,
      concurrency: LOGO_INTAKE_RENDER_CONCURRENCY,
    });
    const byPage = new Map(rendered.map((p) => [p.pageNumber, p]));

    return mapPool(pages, LOGO_INTAKE_RENDER_CONCURRENCY, async (pageNumber) => {
      const page = byPage.get(pageNumber);
      if (!page) throw new Error(`render_missing_page:${doc.docId}:${pageNumber}`);
      const { jpeg, width, height } = await resizeToJpeg(page.pngBuffer);
      tick();
      return {
        docId: doc.docId,
        docName: doc.docName,
        docIndex,
        page: pageNumber,
        totalPages: totalPagesInDoc,
        jpegBase64: jpeg.toString("base64"),
        width,
        height,
        label: `doc:${docIndex} "${doc.docName}" page:${pageNumber}`,
      } satisfies IntakeFrame;
    });
  });

  return nested.flat();
}
