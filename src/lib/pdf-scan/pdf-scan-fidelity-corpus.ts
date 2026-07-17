import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { extractPdfDocumentPaths } from "./pdf-document-paths";
import {
  PDF_FIDELITY_SSIM_PASS,
  comparePageFidelity,
  type PageFidelityReport,
} from "./pdf-document-fidelity";
import {
  PDF_SCAN_CORPUS_FIXTURE_IDS,
  getPdfScanCorpusFixture,
  type PdfScanCorpusFixtureId,
} from "./pdf-scan-corpus-fixtures";
import { extractPdfTextSpans } from "./pdf-scan-text-spans";
import type { PdfDocumentObject } from "./pdf-scan-types";

export const PDF_SCAN_CORPUS_DPI = 96;

/** Umbrales por fixture (anti-alias / tipografía SVG ≠ PDF). */
export const PDF_SCAN_CORPUS_THRESHOLDS: Record<
  PdfScanCorpusFixtureId,
  { minSsim: number; maxMae: number }
> = {
  "solid-rect": { minSsim: 0.72, maxMae: 55 },
  "two-shapes": { minSsim: 0.68, maxMae: 60 },
  /** Tipografía SVG ≠ PDF: MAE suele ser bajo en página casi blanca; SSIM más laxo. */
  "text-line": { minSsim: 0.5, maxMae: 20 },
  /** Fondo a página completa + shape; anti-alias en bordes. */
  "full-page-bg": { minSsim: 0.7, maxMae: 50 },
};

export type CorpusCaseResult = {
  id: PdfScanCorpusFixtureId;
  report: PageFidelityReport;
  pathCount: number;
  textCount: number;
  objectCount: number;
  passed: boolean;
  threshold: { minSsim: number; maxMae: number };
};

/**
 * Corre un caso del corpus: raster PDFium vs rebuild SVG de paths(+texto) extraídos.
 * Sin S3, sin LLM.
 */
export async function runPdfScanCorpusCase(
  id: PdfScanCorpusFixtureId,
  options?: { dpi?: number },
): Promise<CorpusCaseResult> {
  const dpi = options?.dpi ?? PDF_SCAN_CORPUS_DPI;
  const buffer = getPdfScanCorpusFixture(id);
  const pages = await renderPdfPages(buffer, { maxPages: 1, dpi });
  if (!pages.length) throw new Error(`corpus ${id}: no pages rendered`);
  const page = pages[0]!;

  const { paths } = await extractPdfDocumentPaths(buffer, { dpi, maxPages: 1 });
  const textSpans = id === "text-line" ? await extractPdfTextSpans(buffer, { dpi, maxPages: 1 }) : [];

  const objects: PdfDocumentObject[] = [
    ...paths.map((p, i) => ({
      type: "path" as const,
      id: `path_${i}`,
      d: p.d,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      fill: p.fill,
      stroke: p.stroke,
      strokeWidth: p.strokeWidth,
      opacity: p.opacity,
      blendMode: p.blendMode,
    })),
    ...textSpans.map((s) => ({
      type: "text" as const,
      id: s.id,
      text: s.text,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      fontWeight: s.fontWeight,
      italic: s.italic,
    })),
  ];

  const report = await comparePageFidelity({
    pageNumber: 1,
    referencePng: page.pngBuffer,
    objects,
    imageDataUrls: {},
    width: page.width,
    height: page.height,
  });

  const threshold = PDF_SCAN_CORPUS_THRESHOLDS[id];
  const passed = report.ssim >= threshold.minSsim && report.mae <= threshold.maxMae;

  return {
    id,
    report,
    pathCount: paths.length,
    textCount: textSpans.length,
    objectCount: objects.length,
    passed,
    threshold,
  };
}

export async function runPdfScanCorpusAll(options?: {
  dpi?: number;
  ids?: PdfScanCorpusFixtureId[];
}): Promise<CorpusCaseResult[]> {
  const ids = options?.ids ?? PDF_SCAN_CORPUS_FIXTURE_IDS;
  const out: CorpusCaseResult[] = [];
  for (const id of ids) {
    out.push(await runPdfScanCorpusCase(id, { dpi: options?.dpi }));
  }
  return out;
}

export { PDF_FIDELITY_SSIM_PASS };
