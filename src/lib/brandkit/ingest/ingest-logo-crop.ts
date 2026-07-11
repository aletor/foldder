/**
 * Pipeline compartido de recorte de logo para ingest BrandKit (Fase A).
 * Reutiliza crop + trim + quality de logo-intake sin acoplar a batch-store.
 */

import type { Candidate, LogoValue, Provenance } from "@/lib/brandkit/brand-kit-types";
import { uploadBrandKitIngestFile } from "./upload-brand-kit-file";
import {
  bboxPageToSourceBbox,
  cropAndScoreIngestLogo,
  ingestLogoScoreFromQuality,
  type IngestLogoCropInput,
  type IngestLogoCropResult,
} from "./ingest-logo-crop-core";

export type { IngestLogoCropInput, IngestLogoCropResult };
export { cropAndScoreIngestLogo, ingestLogoScoreFromQuality, bboxPageToSourceBbox };

export async function uploadIngestLogoCrop(input: {
  userEmail: string;
  filenameStem: string;
  crop: IngestLogoCropResult;
  provenance: Provenance;
  fileMeta: {
    fileName: string;
    contentSha256: string;
    sourcePageNumber?: number;
    totalDocPages?: number;
    detectionMethod?: LogoValue["detectionMethod"];
    background?: LogoValue["background"];
  };
  baseScore: number;
  index?: number;
}): Promise<Candidate<LogoValue>> {
  const uploaded = await uploadBrandKitIngestFile({
    userEmail: input.userEmail,
    filename: `${input.filenameStem}.png`,
    mime: "image/png",
    buffer: input.crop.png,
  });

  return {
    score: ingestLogoScoreFromQuality(input.crop.quality, input.baseScore, input.index ?? 0),
    provenance: input.provenance,
    value: {
      assetId: uploaded.url,
      previewUrl: uploaded.url,
      format: "png",
      width: input.crop.width,
      height: input.crop.height,
      background: input.fileMeta.background ?? "transparent",
      variants: [],
      sourcePageNumber: input.fileMeta.sourcePageNumber,
      sourceBbox: bboxPageToSourceBbox(input.crop.bboxPage),
      sourceDocName: input.fileMeta.fileName,
      sourcePdfSha256: input.fileMeta.contentSha256,
      totalDocPages: input.fileMeta.totalDocPages,
      detectionMethod: input.fileMeta.detectionMethod ?? "vision_bbox",
    },
  };
}

export async function buildIngestLogoCandidateFromBBox(input: {
  pagePng: Buffer;
  pageWidth: number;
  pageHeight: number;
  bboxPage: import("@/lib/brandkit/logo-intake/bbox").BBoxPage;
  padding?: number;
  trim?: boolean;
  userEmail: string;
  filenameStem: string;
  provenance: Provenance;
  fileName: string;
  contentSha256: string;
  sourcePageNumber?: number;
  totalDocPages?: number;
  baseScore: number;
  index?: number;
  background?: LogoValue["background"];
  qualityMeta?: IngestLogoCropInput["qualityMeta"];
  detectionMethod?: LogoValue["detectionMethod"];
}): Promise<Candidate<LogoValue> | null> {
  const crop = await cropAndScoreIngestLogo({
    pagePng: input.pagePng,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    bboxPage: input.bboxPage,
    padding: input.padding,
    trim: input.trim,
    qualityMeta: input.qualityMeta,
  });
  if (!crop) return null;

  return uploadIngestLogoCrop({
    userEmail: input.userEmail,
    filenameStem: input.filenameStem,
    crop,
    provenance: input.provenance,
    fileMeta: {
      fileName: input.fileName,
      contentSha256: input.contentSha256,
      sourcePageNumber: input.sourcePageNumber,
      totalDocPages: input.totalDocPages,
      background: input.background,
      detectionMethod: input.detectionMethod,
    },
    baseScore: input.baseScore,
    index: input.index,
  });
}
