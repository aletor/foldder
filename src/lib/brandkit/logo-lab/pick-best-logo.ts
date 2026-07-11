import type { PageVisionLogoInstance } from "@/lib/brandkit/ingest/page-vision-pass-schema";
import { isViableLogoHarvestBbox } from "@/lib/brandkit/ingest/page-vision-pass-bbox";
import { resolveLogoLabBbox } from "@/lib/brandkit/logo-lab/bbox-overlay";

export type LogoLabRefinePayload = {
  seedBbox: readonly [number, number, number, number];
  refinedBbox: readonly [number, number, number, number];
  method: "pdf_object" | "contrast" | "seed_only";
  logoCropBase64: string;
};

export type LogoLabDocumentCandidate = {
  pageNumber: number;
  index: number;
  instance: PageVisionLogoInstance;
  refine: LogoLabRefinePayload | null;
};

const IDEAL_AREA_MIN = 0.0015;
const IDEAL_AREA_MAX = 0.055;
const HUGE_AREA = 0.1;

/** Ranking barato (sin LLM ni pHash): confianza del modelo + calidad del afinado + forma del bbox. */
export function scoreLogoLabDocumentCandidate(candidate: LogoLabDocumentCandidate): number {
  const { instance, refine } = candidate;
  let score = instance.confidence * 70;

  if (instance.isComplete) score += 8;
  if (instance.variant !== "unknown") score += 5;
  if (instance.variant === "horizontal" || instance.variant === "isotipo") score += 2;

  const bbox = refine?.refinedBbox ?? resolveLogoLabBbox(instance.bbox);
  const area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
  if (area >= IDEAL_AREA_MIN && area <= IDEAL_AREA_MAX) score += 12;
  else if (area > HUGE_AREA) score -= 30;
  else if (area < 0.0004) score -= 12;

  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const aspect = width / Math.max(height, 1e-6);
  if (aspect >= 0.35 && aspect <= 7) score += 4;

  if (refine) {
    if (refine.method === "pdf_object") score += 14;
    else if (refine.method === "contrast") score += 7;
    if (refine.logoCropBase64.length > 0) score += 3;
  } else {
    score -= 20;
  }

  // Portada / primeras páginas suelen tener el wordmark más limpio.
  if (candidate.pageNumber <= 2) score += 4;
  else if (candidate.pageNumber <= 5) score += 2;

  return score;
}

export function pickBestLogoLabDocumentCandidate(
  candidates: LogoLabDocumentCandidate[],
): LogoLabDocumentCandidate | null {
  const withCrop = candidates.filter(
    (c) => c.refine?.logoCropBase64 && isViableLogoLabCandidate(c),
  );
  if (!withCrop.length) return null;

  return withCrop.reduce((best, cur) =>
    scoreLogoLabDocumentCandidate(cur) > scoreLogoLabDocumentCandidate(best) ? cur : best,
  );
}

function isViableLogoLabCandidate(candidate: LogoLabDocumentCandidate): boolean {
  const bbox = candidate.refine?.refinedBbox ?? resolveLogoLabBbox(candidate.instance.bbox);
  if (!isViableLogoHarvestBbox(bbox)) return false;
  const cropLen = candidate.refine?.logoCropBase64.length ?? 0;
  return cropLen >= 400;
}
