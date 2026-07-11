/**
 * Fase C — puente logo-intake → candidatos BrandKit v2 (ingest PDF deck/manual).
 * Sustituye page-vision para logos cuando BRAND_KIT_LOGO_INTAKE_PDF=1.
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Candidate, LogoValue, Provenance } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { saveBatchDocs } from "@/lib/brandkit/logo-intake/batch-store";
import { renderCandidateAdjusted } from "@/lib/brandkit/logo-intake/crop";
import { runLogoIntakePipeline } from "@/lib/brandkit/logo-intake/pipeline";
import type { IntakeDocInput, IntakePageSelector } from "@/lib/brandkit/logo-intake/render";
import type { LogoCandidate, LogoProposal } from "@/lib/brandkit/logo-intake/types";
import type { SemanticPaletteResult } from "@/lib/brandkit/logo-intake/palette-sample";
import { deckLogoVisionPageNumbers, brandManualVisionPageNumbers } from "./page-vision-pass-selection";
import {
  bboxPageToSourceBbox,
  ingestLogoScoreFromQuality,
} from "./ingest-logo-crop-core";
import { uploadBrandKitIngestFile } from "./upload-brand-kit-file";

export function isBrandKitLogoIntakePdfEnabled(): boolean {
  return process.env.BRAND_KIT_LOGO_INTAKE_PDF === "1";
}

export type LogoIntakePdfScope = "deck" | "manual";

export type LogoIntakePdfExtractResult = {
  candidates: Candidate<LogoValue>[];
  semanticPalette?: SemanticPaletteResult;
  visionDetail: string;
  proposal: LogoProposal | null;
};

function pageSelectorForScope(scope: LogoIntakePdfScope): IntakePageSelector {
  return (totalPages) =>
    scope === "deck" ? deckLogoVisionPageNumbers(totalPages) : brandManualVisionPageNumbers(totalPages);
}

function logoProvenanceFromIntake(fileName: string, pageNumber: number, contentSha256: string): Provenance {
  return {
    type: "pdf_xobject",
    detail: `logo-intake · pág. ${pageNumber}`,
    fileId: contentSha256,
    sourceUrl: fileName,
  };
}

function rankSignalsForIntakeLogo(
  fileName: string,
  pageNumber: number,
  totalPages: number,
  index: number,
): string[] {
  return [
    brandKitLocaleEs.logoPageSignal(pageNumber, totalPages),
    fileName,
    index === 0 ? "logo principal" : "variante",
    "logo-intake",
  ];
}

async function resolveCandidatePng(input: {
  candidate: LogoCandidate;
  batchId: string;
  useHiRes: boolean;
}): Promise<{ png: Buffer; width: number; height: number }> {
  if (input.useHiRes) {
    const hiRes = await renderCandidateAdjusted({
      batchId: input.batchId,
      docId: input.candidate.docId,
      docKind: "pdf",
      page: input.candidate.page,
      bboxPage: input.candidate.bboxPage,
    });
    return hiRes;
  }

  const raw = Buffer.from(input.candidate.cropPng, "base64");
  const png =
    input.candidate.cropMime === "image/png"
      ? raw
      : await sharp(raw).png().toBuffer();
  const meta = await sharp(png).metadata();
  return {
    png,
    width: meta.width ?? input.candidate.cropWidthPx,
    height: meta.height ?? input.candidate.cropHeightPx,
  };
}

async function mapLogoIntakeCandidateToBrandKit(input: {
  candidate: LogoCandidate;
  batchId: string;
  fileName: string;
  contentSha256: string;
  totalPages: number;
  userEmail: string;
  index: number;
  useHiRes: boolean;
}): Promise<Candidate<LogoValue>> {
  const { png, width, height } = await resolveCandidatePng({
    candidate: input.candidate,
    batchId: input.batchId,
    useHiRes: input.useHiRes,
  });
  const stem = input.fileName.replace(/\.[^.]+$/, "").slice(0, 40);
  const uploaded = await uploadBrandKitIngestFile({
    userEmail: input.userEmail,
    filename: `${stem}-logo-intake-p${input.candidate.page}-${input.index + 1}.png`,
    mime: "image/png",
    buffer: png,
  });

  const baseScore = input.index === 0 ? 0.88 : 0.74;
  const score = ingestLogoScoreFromQuality(input.candidate.quality, baseScore, input.index);

  const value: LogoValue = {
    assetId: uploaded.url,
    previewUrl: uploaded.url,
    format: "png",
    width,
    height,
    background: "transparent",
    variants: [],
    sourcePageNumber: input.candidate.page,
    sourceBbox: bboxPageToSourceBbox(input.candidate.bboxPage),
    sourceDocName: input.fileName,
    sourcePdfSha256: input.contentSha256,
    totalDocPages: input.totalPages,
    detectionMethod: "vision_bbox",
  };

  return {
    value,
    score,
    provenance: logoProvenanceFromIntake(input.fileName, input.candidate.page, input.contentSha256),
    rankSignals: rankSignalsForIntakeLogo(
      input.fileName,
      input.candidate.page,
      input.totalPages,
      input.index,
    ),
    rankLabel: input.index === 0 ? brandKitLocaleEs.bestOption : undefined,
  };
}

function summarizeLogoIntakeProposal(proposal: LogoProposal, candidateCount: number): string {
  if (candidateCount > 0) {
    const pages = new Set<number>();
    if (proposal.best) pages.add(proposal.best.page);
    for (const alt of proposal.alternatives) pages.add(alt.page);
    return `${candidateCount} candidatos · logo-intake · ${pages.size} pág.`;
  }
  return `Sin logo claro · logo-intake · ${proposal.visionCalls} llamada(s)`;
}

export function paletteSignalsFromLogoIntakeSemantic(
  palette: SemanticPaletteResult,
  contentSha256: string,
): { hex: string; provenance: Provenance; weight?: number }[] {
  const seen = new Set<string>();
  const out: { hex: string; provenance: Provenance; weight?: number }[] = [];
  for (const entry of palette.entries) {
    const hex = entry.hex.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    const pages = entry.pages.length ? entry.pages.join(",") : "?";
    out.push({
      hex,
      provenance: {
        type: "pdf_xobject",
        detail: `logo-intake · ${entry.role} · pág. ${pages}`,
        fileId: contentSha256,
      },
      weight: Math.min(0.92, 0.55 + entry.score * 0.35),
    });
  }
  return out;
}

export async function extractLogoCandidatesFromPdfLogoIntake(input: {
  buffer: Buffer;
  fileName: string;
  contentSha256: string;
  userEmail: string;
  route?: string;
  totalPages: number;
  scope: LogoIntakePdfScope;
}): Promise<LogoIntakePdfExtractResult> {
  const batchId = `ingest-${randomUUID()}`;
  const docId = "pdf0";
  const docs: IntakeDocInput[] = [
    {
      docId,
      docName: input.fileName,
      buffer: input.buffer,
      kind: "pdf",
    },
  ];

  saveBatchDocs({
    batchId,
    projectId: `ingest-${input.userEmail}`,
    docs,
  });

  const proposal = await runLogoIntakePipeline({
    batchId,
    docs,
    userEmail: input.userEmail,
    selectPages: pageSelectorForScope(input.scope),
  });

  const ordered: LogoCandidate[] = [];
  if (proposal.best) ordered.push(proposal.best);
  for (const alt of proposal.alternatives) {
    if (alt.id === proposal.best?.id) continue;
    ordered.push(alt);
  }

  const candidates: Candidate<LogoValue>[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    candidates.push(
      await mapLogoIntakeCandidateToBrandKit({
        candidate: ordered[index]!,
        batchId,
        fileName: input.fileName,
        contentSha256: input.contentSha256,
        totalPages: input.totalPages,
        userEmail: input.userEmail,
        index,
        useHiRes: index === 0,
      }),
    );
  }

  return {
    candidates,
    semanticPalette: proposal.semanticPalette,
    visionDetail: summarizeLogoIntakeProposal(proposal, candidates.length),
    proposal,
  };
}
