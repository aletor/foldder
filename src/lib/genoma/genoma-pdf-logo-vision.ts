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
import { deckLogoVisionPageNumbers } from "./ingest/page-vision-pass-selection";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { uploadGenomaIngestFile } from "./ingest/upload-genoma-file";
import { genomaLocaleEs } from "./genoma-locale.es";

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
}): Promise<PageVisionPassRunAudit> {
  const deckPages = deckLogoVisionPageNumbers(input.totalPages);
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
}): Promise<PdfLogoVisionResult | null> {
  const contentSha256 = bufferContentSha256(input.buffer);
  const totalPages = await countPdfPagesInBuffer(input.buffer, 200).catch(() => 0);
  const pdfStorageKey = await persistGenomaSourcePdf(input.userEmail, contentSha256, input.buffer);

  const audit = await runDeckLogoVisionAudit({
    buffer: input.buffer,
    fileName: input.fileName,
    contentSha256,
    userEmail: input.userEmail,
    route: input.route,
    totalPages,
  });

  if (!pageVisionAuditHasLogos(audit)) {
    return {
      candidates: [],
      contentSha256,
      pdfStorageKey,
      totalPages,
      pagesWithLogo: 0,
      visionDetail: summarizeDeckLogoVisionDetail(audit, 0),
    };
  }

  const entries = await buildProvisionalLogoCandidatesFromPageVision(audit, input.buffer, contentSha256.slice(0, 16));
  const pagesWithLogo = new Set(entries.map((entry) => entry.pageNumber)).size;
  const candidates: Candidate<LogoValue>[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    candidates.push(
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

  return {
    candidates,
    contentSha256,
    pdfStorageKey,
    totalPages,
    pagesWithLogo,
    visionDetail: `${candidates.length} candidatos · ${pagesWithLogo} pág.`,
  };
}
