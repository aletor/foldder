import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { scoreBrandBoardLogoRegion } from "./genoma-brand-board-logo-regions";
import type { BBoxPage } from "./logo-intake/bbox";

const LOGO_KEYWORDS =
  /logo|logotipo|logotype|wordmark|isotipo|imagotipo|marca|brand\s*mark|identidad\s*visual/i;

const HERO_REGION: BBoxPage = [0.02, 0.02, 0.98, 0.45];

function guaranteedLogoPages(totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const picked = new Set<number>([1]);
  if (totalPages >= 2) picked.add(2);
  if (totalPages >= 3) picked.add(totalPages);
  return [...picked].sort((a, b) => a - b);
}

function keywordBoostPages(fullText: string, totalPages: number): number[] {
  if (!LOGO_KEYWORDS.test(fullText)) return [];
  const picked = new Set<number>();
  for (let page = 1; page <= Math.min(8, totalPages); page += 1) picked.add(page);
  if (totalPages > 8) picked.add(totalPages);
  return [...picked];
}

async function visuallyRankPdfPages(
  pdfBuffer: Buffer,
  totalPages: number,
  maxVisualPages = 16,
): Promise<{ pageNumber: number; score: number }[]> {
  const stride = totalPages <= maxVisualPages ? 1 : Math.ceil(totalPages / maxVisualPages);
  const pageNumbers: number[] = [];
  for (let page = 1; page <= totalPages; page += stride) pageNumbers.push(page);

  const rendered = await renderPdfPages(pdfBuffer, { maxPages: totalPages, dpi: 96 });
  const byPage = new Map(rendered.map((row) => [row.pageNumber, row]));
  const scored: { pageNumber: number; score: number }[] = [];

  for (const pageNumber of pageNumbers) {
    const page = byPage.get(pageNumber);
    if (!page) continue;
    const heroScore = await scoreBrandBoardLogoRegion(
      page.pngBuffer,
      HERO_REGION,
      page.width,
      page.height,
      1,
    );
    const centerScore = await scoreBrandBoardLogoRegion(
      page.pngBuffer,
      [0.25, 0.25, 0.75, 0.75],
      page.width,
      page.height,
      0.85,
    );
    scored.push({ pageNumber, score: Math.max(heroScore, centerScore) });
  }

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Rankea páginas probables de logo antes de visión cara.
 * Combina portada/cierre, keywords en texto y señal visual barata (96 DPI).
 */
export async function rankPdfPagesForLogoVision(input: {
  pdfBuffer: Buffer;
  totalPages: number;
  fileName?: string;
  fullText?: string;
  maxPages?: number;
}): Promise<number[]> {
  const totalPages = Math.max(0, input.totalPages);
  if (totalPages <= 0) return [];
  if (totalPages <= 12) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const cap = Math.min(10, Math.max(4, input.maxPages ?? 8));
  const picked = new Set<number>(guaranteedLogoPages(totalPages));

  if (input.fileName && LOGO_KEYWORDS.test(input.fileName)) {
    picked.add(1);
    picked.add(2);
  }

  for (const page of keywordBoostPages(input.fullText?.trim() ?? "", totalPages)) {
    picked.add(page);
  }

  const visual = await visuallyRankPdfPages(input.pdfBuffer, totalPages);
  for (const row of visual.slice(0, 4)) {
    if (row.score >= 0.42) picked.add(row.pageNumber);
  }

  return [...picked].sort((a, b) => a - b).slice(0, cap);
}

/** Deck: portada + cierre + top visual (máx. 4 páginas). */
export async function rankDeckPdfPagesForLogoVision(input: {
  pdfBuffer: Buffer;
  totalPages: number;
  fullText?: string;
}): Promise<number[]> {
  const ranked = await rankPdfPagesForLogoVision({
    ...input,
    maxPages: 4,
  });
  if (ranked.length) return ranked;
  return guaranteedLogoPages(input.totalPages);
}
