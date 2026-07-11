/**
 * Acciones puras: preparar y aplicar vectorización del logo coronado.
 */

import type { LogoVectorSourceRef, VectorizeTrace } from "../model/evidence";
import { crown, getTrait, upsertTrait, type Genome } from "../model/trait";
import type { TraitId } from "../model/trait-ids";
import type { LogoValue } from "../model/trait-values";
import {
  buildVectorizeAttemptTrace,
  vectorizeEvaluatedFlags,
} from "./vectorize-trace";
import { isNativeVectorLogoUrl } from "./logo-display-url";
import { nativeAssetAllowsVectorize, wordmarkIntegrityPasses } from "./logo-crown-policy";

export { isNativeVectorLogoUrl } from "./logo-display-url";

export type LogoVectorizeJob = {
  candidateId: string;
  logoUrl: string;
  logoSignature: string;
  vectorSource?: LogoVectorSourceRef;
  evaluatedFlags: Record<string, unknown>;
};

export type LogoVectorizeApiResult = {
  vectorUrl?: string;
  walletReservationId?: string;
  reason?: string;
  code?: string;
};

export function buildLogoVectorizeJob(
  genome: Genome,
  candidateId: string,
): LogoVectorizeJob | null {
  const trait = getTrait(genome, "logo.primary");
  const candidate = trait?.candidates.find((c) => c.id === candidateId);
  if (!trait || !candidate) return null;

  const logo = candidate.value as LogoValue;
  if (candidate.derived?.vectorUrl?.trim()) return null;
  if (logo.assetOrigin && !nativeAssetAllowsVectorize(logo.assetOrigin)) return null;

  const rasterUrl = candidate.derived?.rasterImageUrl ?? logo.imageUrl;
  if (!rasterUrl || isNativeVectorLogoUrl(rasterUrl)) return null;

  const sourceRef = candidate.sourceRefs[0];
  const source = sourceRef ? genome.sources.find((s) => s.id === sourceRef) : undefined;
  const vectorSource: LogoVectorSourceRef | undefined = sourceRef
    ? {
        sourceId: sourceRef,
        pageNumber: logo.sourcePageNumber,
        bbox: logo.sourceBbox,
        contentSha256: source?.contentSha256,
      }
    : undefined;

  return {
    candidateId,
    logoUrl: rasterUrl,
    logoSignature: candidate.signature,
    vectorSource,
    evaluatedFlags: vectorizeEvaluatedFlags({
      logo,
      hadVectorUrl: Boolean(candidate.derived?.vectorUrl),
    }),
  };
}

export function findCrownedLogoVectorizeJob(genome: Genome): LogoVectorizeJob | null {
  const trait = getTrait(genome, "logo.primary");
  const crownedId = trait?.crownedIds[0];
  if (!crownedId) return null;
  return buildLogoVectorizeJob(genome, crownedId);
}

export function logoCandidateNeedsVectorize(
  genome: Genome,
  traitId: TraitId,
  candidateId: string,
): boolean {
  if (traitId !== "logo.primary") return false;
  return buildLogoVectorizeJob(genome, candidateId) !== null;
}

function pendingVectorizeTrace(job: LogoVectorizeJob): VectorizeTrace {
  return {
    attempted: false,
    status: "skipped_reason",
    skippedReason: "vectorize_pending",
    evaluatedFlags: job.evaluatedFlags,
  };
}

export function logoCandidateAllowsCrown(genome: Genome, traitId: TraitId, candidateId: string): boolean {
  if (traitId !== "logo.primary") return true;
  const trait = getTrait(genome, traitId);
  const candidate = trait?.candidates.find((c) => c.id === candidateId);
  if (!candidate) return false;
  const logo = candidate.value as LogoValue;
  if (logo.assetOrigin === "vector_native") {
    return wordmarkIntegrityPasses(candidate.signals);
  }
  return true;
}

export function applyCrownWithOptionalVectorizePending(
  genome: Genome,
  traitId: TraitId,
  candidateId: string,
): { genome: Genome; job: LogoVectorizeJob | null; blockedReason?: string } {
  const trait = getTrait(genome, traitId);
  if (!trait) return { genome, job: null };

  if (!logoCandidateAllowsCrown(genome, traitId, candidateId)) {
    return { genome, job: null, blockedReason: "wordmark_integrity_failed" };
  }

  const job = traitId === "logo.primary" ? buildLogoVectorizeJob(genome, candidateId) : null;
  let next = upsertTrait(genome, crown(trait, candidateId));

  if (traitId === "logo.primary" && job) {
    const logoTrait = getTrait(next, "logo.primary");
    if (logoTrait) {
      next = upsertTrait(next, {
        ...logoTrait,
        candidates: logoTrait.candidates.map((c) =>
          c.id === candidateId
            ? {
                ...c,
                derived: {
                  ...c.derived,
                  vectorSource: job.vectorSource,
                  vectorize: pendingVectorizeTrace(job),
                },
              }
            : c,
        ),
      });
    }
  }

  return { genome: next, job };
}

export function applyVectorizePendingToCandidate(
  genome: Genome,
  job: LogoVectorizeJob,
): Genome {
  const trait = getTrait(genome, "logo.primary");
  if (!trait) return genome;
  return upsertTrait(genome, {
    ...trait,
    candidates: trait.candidates.map((c) =>
      c.id === job.candidateId
        ? {
            ...c,
            derived: {
              ...c.derived,
              vectorSource: job.vectorSource,
              vectorize: pendingVectorizeTrace(job),
            },
          }
        : c,
    ),
  });
}

export function applyVectorizeResultToGenome(
  genome: Genome,
  job: LogoVectorizeJob,
  result: LogoVectorizeApiResult,
): Genome {
  const trait = getTrait(genome, "logo.primary");
  if (!trait) return genome;

  const trace = buildVectorizeAttemptTrace({
    vectorUrl: result.vectorUrl,
    reason: result.reason ?? result.code,
    walletReservationId: result.walletReservationId,
    evaluatedFlags: job.evaluatedFlags,
  });

  return upsertTrait(genome, {
    ...trait,
    candidates: trait.candidates.map((c) => {
      if (c.id !== job.candidateId) return c;
      const logoValue = c.value as LogoValue;
      const vectorUrl = result.vectorUrl?.trim() || c.derived?.vectorUrl;
      const rasterImageUrl =
        c.derived?.rasterImageUrl ??
        (logoValue.imageUrl && !isNativeVectorLogoUrl(logoValue.imageUrl) ? logoValue.imageUrl : undefined);
      return {
        ...c,
        value: c.value,
        derived: {
          ...c.derived,
          rasterImageUrl,
          vectorUrl,
          vectorize: trace,
          generatedAt: c.derived?.generatedAt ?? new Date().toISOString(),
        },
      };
    }),
  });
}
