/**
 * El modal de material nuevo (§4) — la joya.
 *
 * Al añadir material a un brandKit ya poblado, cada candidato nuevo se compara por
 * FIRMA contra lo que ya hay. El resultado nunca es un merge: es una de tres
 * salidas cerradas.
 *
 * - `known`  → firma ya conocida (mismo logo/color/fuente): silencio absoluto,
 *              se archiva. (Devolvemos el id que coincide para poder reforzar
 *              evidencia sobre el candidato existente si se quiere.)
 * - `prompt` → aporta algo nuevo con evidencia suficiente: modal de UNA frase con
 *              tres botones (primaria / secundaria / ignorar, o el equivalente del
 *              rasgo). Esto ES la resolución de conflictos de BrandKit.
 * - `noise`  → evidencia baja: archivado sin molestar.
 */

import type { Candidate } from "./evidence";
import { signatureDistance } from "./signature";
import type { Genome, Trait } from "./trait";
import { getTrait } from "./trait";
import type { TraitId } from "./trait-ids";

export type IncomingVerdict =
  | { kind: "known"; matchedCandidateId: string }
  | { kind: "prompt"; trait: TraitId; candidate: Candidate<unknown> }
  | { kind: "noise" };

export interface ClassifyOptions {
  /** Score mínimo para molestar al usuario con el modal. Por defecto 0.6. */
  promptThreshold?: number;
  /** Distancia máxima de firma para considerar "ya conocido". Por defecto 0 (idéntico). */
  knownSignatureDistance?: number;
  /** Distancia entre firmas (por defecto la unificada texto/pHash). */
  distance?: (a: string, b: string) => number;
}

const DEFAULTS = {
  promptThreshold: 0.6,
  knownSignatureDistance: 0,
} as const;

function findKnown<T>(
  trait: Trait<T> | undefined,
  candidate: Candidate<unknown>,
  distance: (a: string, b: string) => number,
  maxDistance: number,
): string | null {
  if (!trait) return null;
  for (const existing of trait.candidates) {
    if (existing.id === candidate.id) continue;
    if (distance(existing.signature, candidate.signature) <= maxDistance) {
      return existing.id;
    }
  }
  return null;
}

/**
 * Clasifica un candidato entrante contra el brandKit actual. Puro y determinista:
 * no muta nada; devuelve solo el veredicto. El caller decide qué hacer (archivar,
 * abrir modal, o descartar).
 */
export function classifyIncoming(
  genome: Genome,
  traitId: TraitId,
  candidate: Candidate<unknown>,
  options: ClassifyOptions = {},
): IncomingVerdict {
  const promptThreshold = options.promptThreshold ?? DEFAULTS.promptThreshold;
  const knownSignatureDistance = options.knownSignatureDistance ?? DEFAULTS.knownSignatureDistance;
  const distance = options.distance ?? signatureDistance;

  // El usuario manda: si lo aportó él, nunca es ruido ni silencio.
  const isUserSupplied = candidate.status === "user_supplied";

  const trait = getTrait(genome, traitId);
  const matchedCandidateId = findKnown(trait, candidate, distance, knownSignatureDistance);
  if (matchedCandidateId && !isUserSupplied) {
    return { kind: "known", matchedCandidateId };
  }

  if (isUserSupplied || candidate.evidenceScore >= promptThreshold) {
    return { kind: "prompt", trait: traitId, candidate };
  }

  return { kind: "noise" };
}
