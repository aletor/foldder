/**
 * Completitud del libro: el ÚNICO porcentaje que la cara muestra (§5).
 *
 * No es "cuántos candidatos hay" sino "cuánto del libro está resuelto". Coronar
 * suma pleno; una propuesta sin coronar suma la mitad (hay señal pero falta la
 * decisión del usuario); vacío suma cero. Puro y determinista.
 */

import type { Genome, Trait } from "../model/trait";
import {
  IMAGE_CATEGORIES,
  imageTraitId,
  type TraitId,
} from "../model/trait-ids";

type Weighted = { id: TraitId; weight: number };

/** Rasgos de corona única y su peso en el libro. */
const SINGLE_WEIGHTS: Weighted[] = [
  { id: "logo.primary", weight: 20 },
  { id: "typography.primary", weight: 10 },
  { id: "typography.secondary", weight: 5 },
  { id: "color.primary", weight: 8 },
  { id: "color.secondary", weight: 6 },
  { id: "color.accent", weight: 4 },
  { id: "color.background", weight: 3 },
  { id: "color.text", weight: 3 },
  { id: "message.tagline", weight: 12 },
];

/** Rasgos multi: aportan según cuántas tarjetas se han coronado hasta un objetivo. */
const MULTI_WEIGHTS: Array<Weighted & { target: number }> = [
  { id: "message.tone", weight: 6, target: 3 },
  { id: "claim.forbidden", weight: 6, target: 2 },
  { id: "claim.absolute", weight: 4, target: 2 },
  ...IMAGE_CATEGORIES.map((c) => ({ id: imageTraitId(c), weight: 10 / IMAGE_CATEGORIES.length, target: 1 })),
];

function crownedCount(trait: Trait<unknown> | undefined): number {
  return trait?.crownedIds.length ?? 0;
}

function proposedCount(trait: Trait<unknown> | undefined): number {
  if (!trait) return 0;
  return trait.candidates.filter((c) => c.status === "proposed" || c.status === "user_supplied").length;
}

/** Factor de un rasgo single: coronado=1, propuesto=0.5, vacío=0. */
function singleFactor(trait: Trait<unknown> | undefined): number {
  if (!trait) return 0;
  if (trait.crownedIds.length > 0) return 1;
  return proposedCount(trait) > 0 ? 0.5 : 0;
}

/** Factor de un rasgo multi: coronadas cuentan pleno, propuestas media, hasta `target`. */
function multiFactor(trait: Trait<unknown> | undefined, target: number): number {
  if (!trait) return 0;
  const progress = crownedCount(trait) + 0.5 * Math.min(proposedCount(trait), target);
  return Math.min(1, progress / target);
}

/** Completitud 0..100 del libro. Ghost ⇒ 0; todo coronado ⇒ ~100. */
export function computeCompleteness(genome: Genome): number {
  let earned = 0;
  let total = 0;

  for (const { id, weight } of SINGLE_WEIGHTS) {
    total += weight;
    earned += weight * singleFactor(genome.traits[id]);
  }
  for (const { id, weight, target } of MULTI_WEIGHTS) {
    total += weight;
    earned += weight * multiFactor(genome.traits[id], target);
  }

  if (total === 0) return 0;
  return Math.round((earned / total) * 100);
}
