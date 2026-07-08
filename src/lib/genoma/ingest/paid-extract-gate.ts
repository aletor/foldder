/**
 * Gates de operaciones de pago en Genoma.
 *
 * - **Ingest:** soltar un documento no duplicado autoriza visión multimodal y refinado de voz.
 * - **Post-corona:** vectorización, generación de imagen y matting BiRefNet sobre rasgo ya elegido.
 */

import type { Genome } from "../model/trait";

export function genomeHasCrownedTrait(genome: Genome): boolean {
  return Object.values(genome.traits).some((t) => t && t.crownedIds.length > 0);
}

/** Visión + voz LLM en ingesta — true si el documento es nuevo en el corpus. */
export function allowPaidIngestAnalysis(duplicateContent: boolean): boolean {
  return !duplicateContent;
}

export type VisionIngestGateInput = {
  duplicateContent: boolean;
  /** El usuario soltó al menos un documento (la ingesta en curso). */
  hasSources: boolean;
};

/** Gate del pase de lectura visual — NO depende de corona previa. */
export function resolveVisionIngestGate(input: VisionIngestGateInput): {
  willRunVision: boolean;
  reason: string;
} {
  if (input.duplicateContent) {
    return { willRunVision: false, reason: "duplicate_content" };
  }
  if (!input.hasSources) {
    return { willRunVision: false, reason: "no_sources_dropped" };
  }
  return { willRunVision: true, reason: "ingest_drop_authorizes_vision" };
}

/** Vectorización, generación de imagen, BiRefNet — solo tras coronación previa. */
export function allowPaidPostCoronaOps(genomeSeed: Genome): boolean {
  return genomeHasCrownedTrait(genomeSeed);
}

/** @deprecated Usar `allowPaidPostCoronaOps` o `allowPaidIngestAnalysis` según el contexto. */
export function allowPaidExtractOps(genomeSeed: Genome): boolean {
  return allowPaidPostCoronaOps(genomeSeed);
}
