/**
 * Fallback heurístico de logo (sin IA) para brand boards e imágenes/PDF de portada.
 */

import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import type { Candidate, LogoValue, Provenance } from "@/lib/genoma/genoma-types";
import { rankBrandBoardLogoRegions } from "@/lib/genoma/genoma-brand-board-logo-regions";
import { expandBBoxPage } from "@/lib/genoma/logo-intake/bbox";
import { stabilizeLogoBboxAcrossDpi } from "@/lib/genoma/ensemble-logo-bbox-dpi";
import { buildIngestLogoCandidateFromBBox } from "./ingest-logo-crop";

function fileProvenance(fileId: string, detail: string): Provenance {
  return { type: "file_upload", detail, fileId };
}

export async function buildHeuristicLogoCandidatesFromPage(input: {
  pagePng: Buffer;
  pageWidth: number;
  pageHeight: number;
  fileName: string;
  contentSha256: string;
  userEmail: string;
  sourcePageNumber?: number;
  totalDocPages?: number;
  limit?: number;
  pdfBuffer?: Buffer;
}): Promise<Candidate<LogoValue>[]> {
  const ranked = await rankBrandBoardLogoRegions(input.pagePng, input.pageWidth, input.pageHeight, {
    userEmail: input.userEmail,
    contentSha256: input.contentSha256,
    pageNumber: input.sourcePageNumber ?? 1,
  });
  if (!ranked.length) return [];

  const out: Candidate<LogoValue>[] = [];
  const limit = input.limit ?? 2;
  const stem = input.fileName.replace(/\.[^.]+$/, "").slice(0, 24);

  for (let index = 0; index < Math.min(limit, ranked.length); index += 1) {
    const region = ranked[index]!;
    let bboxPage = expandBBoxPage(region.bbox, 0.04);
    let scoreBoost = 0;

    if (input.pdfBuffer && input.sourcePageNumber) {
      const stability = await stabilizeLogoBboxAcrossDpi({
        pdfBuffer: input.pdfBuffer,
        pageNumber: input.sourcePageNumber,
        bboxPage,
      });
      bboxPage = stability.bboxPage;
      scoreBoost = stability.stable ? 0.04 : -0.03;
    }

    const candidate = await buildIngestLogoCandidateFromBBox({
      pagePng: input.pagePng,
      pageWidth: input.pageWidth,
      pageHeight: input.pageHeight,
      bboxPage,
      padding: 0,
      trim: true,
      userEmail: input.userEmail,
      filenameStem: `${stem}-logo-heur-${index + 1}`,
      provenance: fileProvenance(
        input.contentSha256,
        `heurística · ${region.label} · ${input.fileName}`,
      ),
      fileName: input.fileName,
      contentSha256: input.contentSha256,
      sourcePageNumber: input.sourcePageNumber ?? 1,
      totalDocPages: input.totalDocPages ?? 1,
      baseScore: Math.min(0.9, 0.68 + region.score * 0.22 - index * 0.04 + scoreBoost),
      index,
      background: "solid",
      detectionMethod: "heuristic",
      qualityMeta: { isComplete: true, cutEdges: false, confidence: region.score },
    });
    if (candidate) out.push(candidate);
  }

  return out;
}

export async function buildHeuristicLogoCandidatesFromPdfCover(input: {
  pdfBuffer: Buffer;
  fileName: string;
  contentSha256: string;
  userEmail: string;
  totalPages: number;
  pageNumbers?: number[];
  limitPerPage?: number;
}): Promise<Candidate<LogoValue>[]> {
  const pages = input.pageNumbers?.length ? input.pageNumbers : [1];
  const out: Candidate<LogoValue>[] = [];

  for (const pageNumber of pages) {
    const rendered = await renderPdfPages(input.pdfBuffer, { maxPages: pageNumber, dpi: 144 });
    const page = rendered.find((row) => row.pageNumber === pageNumber);
    if (!page) continue;

    const pageCandidates = await buildHeuristicLogoCandidatesFromPage({
      pagePng: page.pngBuffer,
      pageWidth: page.width,
      pageHeight: page.height,
      fileName: input.fileName,
      contentSha256: input.contentSha256,
      userEmail: input.userEmail,
      sourcePageNumber: pageNumber,
      totalDocPages: input.totalPages,
      limit: input.limitPerPage ?? 1,
      pdfBuffer: input.pdfBuffer,
    });
    out.push(...pageCandidates);
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Garantiza al menos un candidato heurístico si la lista está vacía y hay página renderizable. */
export async function ensureHeuristicLogoCandidates(
  existing: Candidate<LogoValue>[],
  fallbackInput: Parameters<typeof buildHeuristicLogoCandidatesFromPage>[0],
): Promise<Candidate<LogoValue>[]> {
  if (existing.length) return existing;
  const heuristic = await buildHeuristicLogoCandidatesFromPage(fallbackInput);
  return heuristic.length ? heuristic : existing;
}
