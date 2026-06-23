/**
 * Layerizer — desglose de coste para el display en vivo (Estado 2) y el reserve del wallet.
 * El coste suma por acción (§8): extraer objeto (×N) + fondo limpio (1) + amodal (×M).
 */

import { LAYERIZER_COST_USD } from "./layerizer-config";

/** Mínimo que necesitamos de una selección para estimar coste (evita acoplar tipos UI). */
export interface LayerizerSelectionLike {
  amodalComplete: boolean;
}

export interface LayerizerCostBreakdown {
  objectCount: number;
  amodalCount: number;
  extractUsd: number;
  cleanPlateUsd: number;
  amodalUsd: number;
  totalUsd: number;
}

export function layerizerCostBreakdown(
  selection: LayerizerSelectionLike[],
): LayerizerCostBreakdown {
  const objectCount = selection.length;
  const amodalCount = selection.filter((s) => s.amodalComplete).length;
  const extractUsd = objectCount * LAYERIZER_COST_USD.perObjectExtract;
  const cleanPlateUsd = objectCount > 0 ? LAYERIZER_COST_USD.cleanPlate : 0;
  const amodalUsd = amodalCount * LAYERIZER_COST_USD.perObjectAmodal;
  return {
    objectCount,
    amodalCount,
    extractUsd,
    cleanPlateUsd,
    amodalUsd,
    totalUsd: extractUsd + cleanPlateUsd + amodalUsd,
  };
}
