import sharp from "sharp";
import type { Candidate, LogoValue, Provenance } from "./genoma-types";
import { bufferContentSha256 } from "./ingest/paid-operations-server";
import { persistGenomaSourcePdf } from "./ingest/genoma-source-pdf-store";
import {
  buildProvisionalLogoCandidatesFromPageVision,
  pageVisionAuditHasLogos,
} from "./ingest/page-vision-pass-apply";
import type { PageVisionLogoCandidateEntry } from "./ingest/page-vision-pass-apply";
import { runPageVisionPassForPdf, type PageVisionPassRunAudit } from "./ingest/page-vision-pass-runner";
import {
  isPageVisionNivel1Enabled,
  runPageVisionPassNivel1ForPdf,
} from "./ingest/page-vision-pass-nivel1-runner";
import { rankDeckPdfPagesForLogoVision } from "./rank-pdf-pages-for-logo";
import { mergeLogoCandidatesByIoU } from "./merge-logo-candidates";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { uploadGenomaIngestFile } from "./ingest/upload-genoma-file";
import { genomaLocaleEs } from "./genoma-locale.es";
import { buildHeuristicLogoCandidatesFromPdfCover } from "./ingest/ingest-logo-heuristic";
import {
  extractLogoCandidatesFromPdfLogoIntake,
  isGenomaLogoIntakePdfEnabled,
} from "./ingest/ingest-logo-intake-bridge";

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/(?:png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function logoProvenanceFromVision(fileName: string, pageNumber: number, contentSha256: string): Provenance {
  return {
    type: "pdf_xobject",
    detail: `visión PDF · pág. ${pageNumber}`,
    fileId: contentSha256,
    sourceUrl: fileName,
  };
}

function rankSignalsForVisionLogo(
  fileName: string,
  pageNumber: number,
  totalPages: number,
  slot: "primary" | "secondary",
): string[] {
  return [
    genomaLocaleEs.logoPageSignal(pageNumber, totalPages),
    fileName,
    slot === "primary" ? "logo principal" : "variante",
    "visión por página",
  ];
}

async function uploadVisionLogoImage(
  userEmail: string,
  fileName: string,
  pageNumber: number,
  imageUrl: string,
): Promise<{ url: string; fileId: string; width: number; height: number }> {
  const raw = dataUrlToBuffer(imageUrl);
  if (!raw) throw new Error("invalid_logo_image");
  const meta = await sharp(raw).metadata();
  const stem = fileName.replace(/\.[^.]+$/, "").slice(0, 40);
  const uploaded = await uploadGenomaIngestFile({
    userEmail,
    filename: `${stem}-logo-p${pageNumber}.png`,
    mime: "image/png",
    buffer: raw,
  });
  return {
    url: uploaded.url,
    fileId: uploaded.fileId,
    width: meta.width ?? 256,
    height: meta.height ?? 256,
  };
}

export async function mapVisionLogoEntryToCandidate(input: {
  entry: PageVisionLogoCandidateEntry;
  fileName: string;
  contentSha256: string;
  totalPages: number;
  userEmail: string;
  index: number;
}): Promise<Candidate<LogoValue>> {
  const traitValue = input.entry.candidate.value;
  const uploaded = await uploadVisionLogoImage(
    input.userEmail,
    input.fileName,
    input.entry.pageNumber,
    input.entry.imageUrl,
  );
  const score = input.entry.slot === "primary" ? Math.max(0.82, 0.9 - input.index * 0.04) : 0.72 - input.index * 0.03;

  const value: LogoValue = {
    assetId: uploaded.url,
    previewUrl: uploaded.url,
    format: "png",
    width: uploaded.width,
    height: uploaded.height,
    background: "transparent",
    variants: [],
    sourcePageNumber: traitValue.sourcePageNumber ?? input.entry.pageNumber,
    sourceBbox: traitValue.sourceBbox,
    sourceDocName: input.fileName,
    sourcePdfSha256: input.contentSha256,
    totalDocPages: input.totalPages,
    detectionMethod: "vision_bbox",
  };

  return {
    value,
    score,
    provenance: logoProvenanceFromVision(input.fileName, input.entry.pageNumber, input.contentSha256),
    rankSignals: rankSignalsForVisionLogo(
      input.fileName,
      input.entry.pageNumber,
      input.totalPages,
      input.entry.slot,
    ),
    rankLabel: input.index === 0 ? genomaLocaleEs.bestOption : undefined,
  };
}

export type PdfLogoVisionResult = {
  candidates: Candidate<LogoValue>[];
  contentSha256: string;
  pdfStorageKey: string;
  totalPages: number;
  pagesWithLogo: number;
  visionDetail?: string;
};

function summarizeDeckLogoVisionDetail(audit: PageVisionPassRunAudit, candidateCount: number): string {
  if (candidateCount > 0) return "";
  const analyzed = audit.pages.length;
  const failed = audit.pages.filter((page) => !page.ok);
  if (failed.length === analyzed) {
    const firstError = failed[0]?.rootError?.slice(0, 80);
    return firstError ? `Modelo sin respuesta: ${firstError}` : `Modelo sin respuesta (${analyzed} pág.)`;
  }
  const withLogo = audit.pages.filter(
    (page) => page.ok && (page.result?.logoInstances.length ?? 0) > 0,
  ).length;
  return `Sin logo claro · ${withLogo}/${analyzed} pág. con marca`;
}

async function runDeckLogoVisionAudit(input: {
  buffer: Buffer;
  fileName: string;
  contentSha256: string;
  userEmail: string;
  route?: string;
  totalPages: number;
  forcedPageNumbers?: number[];
  fullText?: string;
}): Promise<PageVisionPassRunAudit> {
  const deckPages =
    input.forcedPageNumbers ??
    (await rankDeckPdfPagesForLogoVision({
      pdfBuffer: input.buffer,
      totalPages: input.totalPages,
      fullText: input.fullText,
    }));
  const passInput = {
    buffer: input.buffer,
    fileName: input.fileName,
    contentSha256: input.contentSha256,
    userEmail: input.userEmail,
    route: input.route ?? "/api/spaces/genoma/ingest",
    writeAudit: false as const,
    forcedPageNumbers: deckPages,
  };

  if (isPageVisionNivel1Enabled()) {
    return runPageVisionPassNivel1ForPdf(passInput);
  }

  return runPageVisionPassForPdf({
    ...passInput,
    selectionScope: "deck-logo-cover",
  });
}

export async function extractLogoCandidatesFromDeckPdf(input: {
  buffer: Buffer;
  fileName: string;
  userEmail: string;
  route?: string;
  fullText?: string;
}): Promise<PdfLogoVisionResult | null> {
  const contentSha256 = bufferContentSha256(input.buffer);
  const totalPages = await countPdfPagesInBuffer(input.buffer, 200).catch(() => 0);
  const pdfStorageKey = await persistGenomaSourcePdf(input.userEmail, contentSha256, input.buffer);
  const pageNumbers = await rankDeckPdfPagesForLogoVision({
    pdfBuffer: input.buffer,
    totalPages,
    fullText: input.fullText,
  });

  const pools: Candidate<LogoValue>[] = [];
  let visionDetailParts: string[] = [];

  if (isGenomaLogoIntakePdfEnabled()) {
    try {
      const intake = await extractLogoCandidatesFromPdfLogoIntake({
        buffer: input.buffer,
        fileName: input.fileName,
        contentSha256,
        userEmail: input.userEmail,
        route: input.route,
        totalPages,
        scope: "deck",
      });
      pools.push(...intake.candidates);
      if (intake.candidates.length) visionDetailParts.push("logo-intake");
    } catch (error) {
      console.warn("[genoma:deck-logo-intake]", error instanceof Error ? error.message : error);
    }
  }

  const audit = await runDeckLogoVisionAudit({
    buffer: input.buffer,
    fileName: input.fileName,
    contentSha256,
    userEmail: input.userEmail,
    route: input.route,
    totalPages,
    forcedPageNumbers: pageNumbers,
    fullText: input.fullText,
  });

  if (pageVisionAuditHasLogos(audit)) {
    const entries = await buildProvisionalLogoCandidatesFromPageVision(
      audit,
      input.buffer,
      contentSha256.slice(0, 16),
    );
    for (let index = 0; index < entries.length; index += 1) {
      pools.push(
        await mapVisionLogoEntryToCandidate({
          entry: entries[index]!,
          fileName: input.fileName,
          contentSha256,
          totalPages,
          userEmail: input.userEmail,
          index,
        }),
      );
    }
    if (entries.length) visionDetailParts.push("page-vision");
  }

  const heuristic = await buildHeuristicLogoCandidatesFromPdfCover({
    pdfBuffer: input.buffer,
    fileName: input.fileName,
    contentSha256,
    userEmail: input.userEmail,
    totalPages,
    pageNumbers,
    limitPerPage: 1,
  });
  pools.push(...heuristic);
  if (heuristic.length) visionDetailParts.push("heurística");

  const candidates = mergeLogoCandidatesByIoU(pools);
  const pagesWithLogo = new Set(candidates.map((row) => row.value.sourcePageNumber ?? 1)).size;

  if (!candidates.length) {
    return {
      candidates: [],
      contentSha256,
      pdfStorageKey,
      totalPages,
      pagesWithLogo: 0,
      visionDetail: summarizeDeckLogoVisionDetail(audit, 0),
    };
  }

  return {
    candidates,
    contentSha256,
    pdfStorageKey,
    totalPages,
    pagesWithLogo,
    visionDetail: `${candidates.length} candidatos · ${visionDetailParts.join(" + ") || "fusión"}`,
  };
}
