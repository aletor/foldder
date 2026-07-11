import type { BrandKitEvidence } from "./brand-kit-evidence";

export type { BrandKitEvidence } from "./brand-kit-evidence";

export type SlotId =
  | "logo"
  | "palette"
  | "typography"
  | "voice"
  | "essence"
  | "visualWorld"
  | "gallery";

export type SlotStatus = "pending" | "candidates" | "resolved" | "needs_user" | "empty";

export type ProvenanceType =
  | "css_var"
  | "computed_style"
  | "link_icon"
  | "manifest"
  | "jsonld"
  | "og_meta"
  | "header_img"
  | "site_repetition"
  | "font_face"
  | "font_link"
  | "pdf_font_dict"
  | "pdf_xobject"
  | "pdf_vector_fill"
  | "file_upload"
  | "llm_synthesis"
  | "user_input"
  | "seed_form";

export interface Provenance {
  type: ProvenanceType;
  detail: string;
  sourceUrl?: string;
  fileId?: string;
}

export interface Candidate<T> {
  value: T;
  score: number;
  provenance: Provenance;
  rankSignals?: string[];
  rankLabel?: string;
}

export interface SlotHistoryEntry<T> {
  value: T;
  provenance: Provenance;
  ts: string;
}

export interface SlotReconciliation {
  outcome: "reinforcement" | "extension" | "contradiction";
  previousSummary: string;
  incomingSummary: string;
  sourceLabel?: string;
}

export interface SlotState<T = unknown> {
  id: SlotId;
  status: SlotStatus;
  value?: T;
  candidates: Candidate<T>[];
  confidence: number;
  provenance?: Provenance;
  locked: boolean;
  history: SlotHistoryEntry<T>[];
  updatedAt: string;
  needsReviewReason?: string;
  reconciliation?: SlotReconciliation;
  supplementalEvidence?: SupplementalEvidence[];
  archivedCandidates?: Candidate<unknown>[];
}

export type LogoVariantKind = "principal" | "mono" | "negativo" | "icono";

export type LogoDetectionMethod = "vision_bbox" | "upload" | "web" | "adjusted" | "heuristic";

export interface LogoSourceBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoValue {
  assetId: string;
  previewUrl?: string;
  format: "svg" | "png" | "jpg" | "webp" | "ico";
  width: number;
  height: number;
  background: "transparent" | "solid";
  variants: { kind: LogoVariantKind; assetId: string; previewUrl?: string }[];
  sourcePageNumber?: number;
  sourceBbox?: LogoSourceBbox;
  sourceDocName?: string;
  sourcePdfSha256?: string;
  totalDocPages?: number;
  detectionMethod?: LogoDetectionMethod;
}

export interface PaletteValue {
  colors: {
    hex: string;
    role: "primary" | "secondary" | "accent" | "background" | "text" | "neutral";
    usageWeight?: number;
  }[];
}

export interface TypographyValue {
  families: {
    family: string;
    role: "display" | "heading" | "body";
    source: "google" | "adobe" | "custom" | "system";
    fallbacks: string[];
    weights: number[];
  }[];
}

export interface VoiceValue {
  summary: string;
  descriptors: string[];
  rules: string[];
  avoid: string[];
  evidence: BrandKitEvidence[];
}

export interface EssenceBelief {
  label: string;
  explanation?: string;
  evidence?: string;
}

export interface EssenceValue {
  summary: string;
  headline?: string;
  headlineOrigin?: "extracted" | "generated";
  headlineProvenance?: Provenance;
  purpose?: string;
  promise?: string;
  pov?: string;
  beliefs: EssenceBelief[];
  evidence: BrandKitEvidence[];
  brandContext?: string;
}

export interface VisualWorldValue {
  summary: string;
  moodTags: string[];
  visualTraits: string[];
  limits: string[];
  evidence: BrandKitEvidence[];
  galleryRefs: string[];
}

export interface GalleryValue {
  harvested: {
    assetId: string;
    previewUrl?: string;
    included: boolean;
    provenance: Provenance;
    rankScore?: number;
    rankSignals?: string[];
  }[];
  generated: {
    assetId: string;
    previewUrl?: string;
    verdict?: "up" | "down";
    promptVersion: number;
    category?: "people_mood" | "places" | "objects" | "textures" | "general";
    categoryLabel?: string;
  }[];
  stylePromptVersion: number;
  styleToneExplanation?: string;
  archivedHarvest?: GalleryValue["harvested"];
}

export interface CompiledArtifacts {
  stylePrompt: string;
  negativePrompt: string;
  paletteTokens: Record<string, unknown>;
  fontStack: Record<string, unknown>;
  copyRules: string;
  logoPackManifest: Record<string, unknown>;
}

export interface SupplementalEvidence {
  quote: string;
  sourceRef: string;
  sourceLabel?: string;
  ts: string;
}

export interface SourceRef {
  kind: "url" | "file";
  ref: string;
  ts: string;
  authoritative?: boolean;
  contentSha256?: string;
  pdfStorageKey?: string;
  pageCount?: number;
}

export interface BrandKitDocument {
  brandName?: { value: string; provenance: Provenance };
  sources: SourceRef[];
  slots: Record<SlotId, SlotState<unknown>>;
  compiled: CompiledArtifacts | null;
  compiledHash?: string;
  updatedAt: string;
}

/** Slots legacy leídos solo durante migración de documentos antiguos. */
export type LegacyOnelinerValue = { text: string; origin: "extracted" | "generated" };
export type LegacyValuesValue = { values: { label: string; evidence?: string }[] };
export type LegacyProhibitionsValue = { items: { text: string; compiledNegative?: string }[] };

export type BrandKitNodeStatus = "empty" | "running" | "done" | "partial";

export interface BrandKitNodeData {
  label?: string;
  brandKit?: BrandKitDocument;
  status?: BrandKitNodeStatus;
  jobId?: string;
  lastError?: string;
}

export type SlotAction =
  | { action: "set"; value: unknown }
  | { action: "choose_candidate"; candidateIndex: number; lock?: boolean }
  | { action: "merge_candidates"; candidateIndices: [number, number] }
  | { action: "dismiss_candidate"; candidateIndex: number }
  | { action: "clear" }
  | { action: "lock" }
  | { action: "unlock" }
  | { action: "revert"; historyIndex?: number };

export const BRAND_KIT_SLOT_IDS: SlotId[] = [
  "logo",
  "palette",
  "typography",
  "voice",
  "essence",
  "visualWorld",
  "gallery",
];

export const BRAND_KIT_COMPLETENESS_SLOT_IDS: SlotId[] = [...BRAND_KIT_SLOT_IDS];

export const BRAND_KIT_SLOT_LABELS: Record<SlotId, string> = {
  logo: "Logo",
  palette: "Color palette",
  typography: "Fonts",
  voice: "Voice",
  essence: "Esencia",
  visualWorld: "Mundo visual",
  gallery: "Gallery",
};
