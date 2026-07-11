/**
 * logo-intake — detección de logo con validación humana.
 * PROHIBIDO importar: page-vision-pass-bbox, logo-lab/refine-bbox, logo-lab/pick-best-logo.
 */

export type CropMime = "image/jpeg" | "image/png";

export interface LogoCandidate {
  id: string;
  docId: string;
  docName: string;
  page: number;
  bboxPage: [number, number, number, number];
  cropPng: string;
  cropMime: CropMime;
  cropWidthPx: number;
  cropHeightPx: number;
  pHash: string;
  model: {
    isDocumentIssuerLogo: boolean;
    isComplete: boolean;
    cutEdges: boolean;
    variant: "full" | "isotype" | "wordmark" | "unknown";
    brandText: string | null;
    variantLabel: string | null;
    isProhibited: boolean;
    confidence: number;
  };
  quality: QualityScore;
}

export interface QualityScore {
  total: number;
  resolutionPts: number;
  sharpnessPts: number;
  completePts: number;
  noCutPts: number;
  confidencePts: number;
}

import type { SemanticPaletteResult } from "@/lib/brandkit/logo-intake/palette-sample";

export interface LogoProposal {
  batchId: string;
  best: LogoCandidate | null;
  lowQuality: boolean;
  alternatives: LogoCandidate[];
  groups: { pHashRep: string; count: number; docIds: string[] }[];
  semanticPalette?: SemanticPaletteResult;
  palettePending?: boolean;
  timings: {
    renderMs: number;
    visionMs: number;
    cropMs: number;
    hiResMs: number;
    paletteMs?: number;
    totalMs: number;
  };
  visionCalls: number;
}

export type BrandLogoStatus = "none" | "proposed" | "validated" | "manual";

export interface BrandLogoAssetMeta {
  widthPx: number;
  heightPx: number;
  hasSvg?: boolean;
}

export interface BrandLogoState {
  projectId: string;
  status: BrandLogoStatus;
  asset?: BrandLogoAssetMeta;
  pHash?: string;
  origin?:
    | { kind: "auto"; candidateId: string; docId: string }
    | { kind: "manual"; fileName: string }
    | {
        kind: "adjusted";
        candidateId: string;
        docId: string;
        originalBboxPage: [number, number, number, number];
        adjustedBboxPage: [number, number, number, number];
      };
  validatedAt?: string;
  sightings: { docId: string; page: number; at: string }[];
  activeBatchId?: string | null;
}

export type LogoIntakeAnalyzeResult =
  | { locked: true; state: BrandLogoState; newSightings: number }
  | { locked: false; proposal: LogoProposal; state: BrandLogoState };

export type LogoIntakeEventKind = "accept_best" | "accept_alternative" | "manual_upload" | "adjusted";

export interface LogoIntakeEvent {
  projectId: string;
  kind: LogoIntakeEventKind;
  at: string;
  candidateId?: string;
  fileName?: string;
  areaDelta?: number;
}
