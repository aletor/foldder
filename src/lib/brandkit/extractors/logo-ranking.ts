/**
 * Ranking final de candidatos de logo: penaliza formas sólidas de plantilla y
 * detecta ambigüedad real (picker) vs. ganador claro.
 */

import {
  BRAND_BEHAVIOR_PRIMARY,
  BRAND_BEHAVIOR_SECONDARY,
  classifyBrandBehaviorSlot,
  compareBrandCandidates,
} from "./brand-behavior";
import type { ScoredBrandKitLogoHarvest } from "./logo-harvest-types";
import { simpleSolidShapePenalty, visualTiebreakScore, LOGONESS_MAX_DISTINCT_COLORS } from "./logo-ness";

export const LOGO_AMBIGUITY_SCORE_DELTA = 0.02;
export const LOGO_AMBIGUITY_TIEBREAK_DELTA = 0.08;
export const LOGO_CLEAR_VISUAL_LEAD = 0.12;

export type RankedBrandKitLogoHarvest = ScoredBrandKitLogoHarvest & { slot: "primary" | "secondary" };

function applySimpleSolidBrandPenalty(entry: ScoredBrandKitLogoHarvest): ScoredBrandKitLogoHarvest {
  if (!entry.logoNess?.simpleSolidShape) return entry;
  const penalty = simpleSolidShapePenalty(entry.logoNess);
  return {
    ...entry,
    brandBehavior: {
      ...entry.brandBehavior,
      total: Math.max(0, entry.brandBehavior.total - penalty),
    },
    visualTiebreak: visualTiebreakScore(entry.logoNess),
  };
}

function isViableLogo(entry: ScoredBrandKitLogoHarvest): boolean {
  return entry.brandBehavior.total >= BRAND_BEHAVIOR_SECONDARY && !entry.logoNess?.simpleSolidShape;
}

/** Variantes de polaridad sintetizadas no cuentan como candidatos distintos. */
function isPhotoLikePrimary(entry: ScoredBrandKitLogoHarvest): boolean {
  if (!entry.logoNess) return false;
  return entry.logoNess.containsFace || entry.logoNess.distinctColors > LOGONESS_MAX_DISTINCT_COLORS;
}

function assignPrimarySlot(entry: ScoredBrandKitLogoHarvest, rank: number): "primary" | "secondary" | "discard" {
  const slot = classifyBrandBehaviorSlot(entry.brandBehavior.total, rank, entry.brandBehavior);
  if (slot === "primary" && isPhotoLikePrimary(entry)) return "secondary";
  return slot;
}

/** Variantes de polaridad sintetizadas no cuentan como candidatos distintos. */
function isPrimaryContender(entry: ScoredBrandKitLogoHarvest): boolean {
  if (!isViableLogo(entry)) return false;
  if (entry.evidenceDetail?.includes("sintetizado")) return false;
  return true;
}

export function detectAmbiguousLogoPrimaries(entries: ScoredBrandKitLogoHarvest[]): boolean {
  const viable = [...entries].filter(isPrimaryContender).sort((a, b) =>
    compareBrandCandidates(
      { brandBehavior: a.brandBehavior, visualTiebreak: a.visualTiebreak },
      { brandBehavior: b.brandBehavior, visualTiebreak: b.visualTiebreak },
    ),
  );
  const logoLike = viable.filter((entry) => !isPhotoLikePrimary(entry));
  if (logoLike.length < 2) return false;

  const top = logoLike[0]!;
  if (top.brandBehavior.total < BRAND_BEHAVIOR_PRIMARY * 0.85) return false;

  const challengers = logoLike.filter(
    (entry) =>
      entry.logoPHash !== top.logoPHash &&
      Math.abs(entry.brandBehavior.total - top.brandBehavior.total) <= LOGO_AMBIGUITY_SCORE_DELTA,
  );
  if (challengers.length === 0) return false;

  const bestChallengerTiebreak = Math.max(...challengers.map((entry) => entry.visualTiebreak));
  if (top.visualTiebreak - bestChallengerTiebreak >= LOGO_CLEAR_VISUAL_LEAD) return false;

  const tied = logoLike.filter(
    (entry) =>
      Math.abs(entry.brandBehavior.total - top.brandBehavior.total) <= LOGO_AMBIGUITY_SCORE_DELTA &&
      Math.abs(entry.visualTiebreak - top.visualTiebreak) <= LOGO_AMBIGUITY_TIEBREAK_DELTA,
  );
  const distinctMarks = new Set(tied.map((entry) => entry.logoPHash));
  return tied.length >= 2 && distinctMarks.size >= 2;
}

export function finalizeLogoHarvestRanking(entries: ScoredBrandKitLogoHarvest[]): {
  logos: RankedBrandKitLogoHarvest[];
  ambiguousPrimary: boolean;
} {
  const penalized = entries.map(applySimpleSolidBrandPenalty);
  penalized.sort((a, b) =>
    compareBrandCandidates(
      { brandBehavior: a.brandBehavior, visualTiebreak: a.visualTiebreak },
      { brandBehavior: b.brandBehavior, visualTiebreak: b.visualTiebreak },
    ),
  );

  const kept = penalized
    .filter(isViableLogo)
    .sort((a, b) => {
      const aPhoto = isPhotoLikePrimary(a) ? 1 : 0;
      const bPhoto = isPhotoLikePrimary(b) ? 1 : 0;
      if (aPhoto !== bPhoto) return aPhoto - bPhoto;
      return compareBrandCandidates(
        { brandBehavior: a.brandBehavior, visualTiebreak: a.visualTiebreak },
        { brandBehavior: b.brandBehavior, visualTiebreak: b.visualTiebreak },
      );
    });
  const ambiguousPrimary = detectAmbiguousLogoPrimaries(penalized);

  if (ambiguousPrimary) {
    const logoLike = kept.filter((entry) => !isPhotoLikePrimary(entry));
    const top = logoLike[0];
    return {
      logos: kept.map((entry) => ({
        ...entry,
        slot:
          top && entry.logoPHash === top.logoPHash && entry.variant === top.variant
            ? ("primary" as const)
            : ("secondary" as const),
      })),
      ambiguousPrimary: true,
    };
  }

  const ranked = kept
    .map((entry, rank) => ({
      ...entry,
      slot: assignPrimarySlot(entry, rank),
    }))
    .filter((entry): entry is RankedBrandKitLogoHarvest => entry.slot !== "discard");

  if (!ranked.some((entry) => entry.slot === "primary")) {
    const best = ranked.find((entry) => !isPhotoLikePrimary(entry));
    if (best) {
      return {
        logos: ranked.map((entry) =>
          entry.logoPHash === best.logoPHash && entry.variant === best.variant
            ? { ...entry, slot: "primary" as const }
            : { ...entry, slot: "secondary" as const },
        ),
        ambiguousPrimary: false,
      };
    }
  }

  return {
    logos: ranked,
    ambiguousPrimary: false,
  };
}
