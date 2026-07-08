import type { BrainVisualStyleSlotKey } from "@/app/spaces/project-assets-metadata";

export type InterpretationStatus = "ghost" | "proposed" | "validated" | "conflict" | "rejected";

export type RefCategory = BrainVisualStyleSlotKey;

export const BRANDKIT_REF_CATEGORIES: readonly RefCategory[] = [
  "people",
  "textures",
  "objects",
  "environment",
  "protagonist",
] as const;

export type SectionId =
  | "logo"
  | "palette"
  | "typography"
  | "messages"
  | "tone"
  | `references.${RefCategory}`;

/** Claves de elemento Brand Board (sidecar). */
export type ElementKey = string;

export type EvidenceKind =
  | "web-css"
  | "pdf-embedded"
  | "pdf-llm"
  | "image-analysis"
  | "llm-synthesis"
  | "user"
  | "legacy"
  | "derived";

export interface EvidenceRef {
  sourceId: string;
  kind: EvidenceKind;
  detail?: string;
  confidence: number;
  extractedAt: string;
}

export interface ConflictRef {
  candidates: Array<{ value: unknown; evidence: EvidenceRef[] }>;
  raisedAt: string;
}

export interface InterpretationMeta {
  status: InterpretationStatus;
  confidence: number;
  evidence: EvidenceRef[];
  conflict?: ConflictRef;
  proposedAt?: string;
  validatedAt?: string;
  staleSince?: string;
  history?: Array<{ value: unknown; replacedAt: string }>;
}

export interface BrandKitBoardMeta {
  interpretation: Record<ElementKey, InterpretationMeta>;
  review: { pending: number; conflicts: number };
  board: {
    lastRunId?: string;
    sectionSeq: Partial<Record<SectionId, number>>;
    sectionState: Partial<Record<SectionId, "idle" | "running" | "error">>;
  };
}

export interface RefImageView {
  id: string;
  assetUrl: string;
  thumbUrl?: string;
  category: RefCategory;
  sourceId: string;
  canonical: boolean;
  meta: InterpretationMeta;
}

export interface ReferenceSectionView {
  rule: string;
  ruleMeta: InterpretationMeta;
  items: RefImageView[];
  order: string[];
}

export interface SwatchView {
  id: string;
  hex: string;
  role?: string;
  meta: InterpretationMeta;
}

export interface BrandBoardView {
  logo: {
    primary: { url: string | null; meta: InterpretationMeta };
    alt: { url: string | null; meta: InterpretationMeta };
  };
  palette: SwatchView[];
  typography: {
    primaryFamily: string | null;
    secondaryFamily: string | null;
    weights: string[];
    metaPrimary: InterpretationMeta;
    metaSecondary: InterpretationMeta;
  };
  voice: {
    tagline: string | null;
    taglineMeta: InterpretationMeta;
    toneChips: Array<{ text: string; meta: InterpretationMeta }>;
  };
  references: Record<RefCategory, ReferenceSectionView>;
  sourcesCount: number;
  completenessPercent: number;
  review: { pending: number; conflicts: number };
}

export type BrandKitSourceType = "url" | "pdf" | "doc" | "image" | "logo";
