import type { BrandBehaviorScore } from "./brand-behavior";
import type { LogoNessMetrics } from "./logo-ness";
import type { PixelBBox } from "@/lib/brain/pdf-page-render";

export type RawGenomaLogoHarvest = {
  buffer: Buffer;
  variant: "positive" | "negative";
  confidence: number;
  pageNumber: number;
  /** Bbox en píxeles de página @ PDF_PAGE_RENDER_DEFAULT_DPI (150). */
  sourceBbox?: PixelBBox;
  evidenceDetail?: string;
  slot: "primary" | "secondary";
  brandBehavior: BrandBehaviorScore;
  visualTiebreak: number;
  logoNess: LogoNessMetrics;
  logoPHash: string;
  isolationMethod?: "keying" | "birefnet";
};

export type ScoredGenomaLogoHarvest = Omit<RawGenomaLogoHarvest, "slot">;
