/**
 * Layerizer — configuración de coste y selección de proveedor (server-side).
 *
 * El display de coste en vivo (Estado 2) y el `reserve` del wallet se calculan a
 * partir de estas constantes. Coste estimado del §8 del spec:
 * - extraer objeto (segment + matting): ×N
 * - fondo limpio (clean plate): plano por imagen (1 llamada)
 * - amodal: ×M (solo objetos con toggle ON)
 */

import type { LayerizerSelectionLike } from "./layerizer-cost";

/** Coste por etapa, en USD. Estimaciones del §8 (ajustar con datos reales). */
export const LAYERIZER_COST_USD = {
  /** Paso A — Gemini vision (pre-pago, fuera del job pagado). */
  detect: 0.002,
  /** Paso A.2 — afinado de bounds por objeto con SAM 3.1 (texto). */
  detectRefinePerObject: 0.006,
  /** Paso B+C por objeto — segmentación SAM 3 + matting BiRefNet. */
  perObjectExtract: 0.02,
  /** Paso D — fondo limpio (Nano Banana / Gemini), plano por imagen. */
  cleanPlate: 0.02,
  /** Paso E por objeto — amodal (Nano Banana), experimental. */
  perObjectAmodal: 0.04,
} as const;

/** Multiplicador de holgura sobre la estimación al reservar en el wallet. */
export const LAYERIZER_RESERVE_MULTIPLIER = 1.25;

/** Service IDs del wallet/usage para cada etapa (alta en USAGE_SERVICES). */
export const LAYERIZER_SERVICE_IDS = {
  detect: "layerizer-detect",
  segment: "layerizer-segment",
  matting: "layerizer-matting",
  cleanPlate: "layerizer-clean-plate",
  amodal: "layerizer-amodal",
} as const;

/**
 * Host de segmentación/matting. fal.ai es el preferido (SAM 3 realtime por
 * websocket para el preview del Estado 2); Replicate es el fallback.
 * Se elige por env para no bloquear si falta FAL_KEY en un entorno.
 */
export type LayerizerProviderHost = "fal" | "replicate";

export function resolveLayerizerHost(): LayerizerProviderHost {
  const explicit = (process.env.LAYERIZER_PROVIDER || "").toLowerCase();
  if (explicit === "fal" || explicit === "replicate") return explicit;
  if (process.env.FAL_KEY) return "fal";
  return "replicate";
}

/** Endpoints de proveedor por host (no inventar otros — §7). */
export const LAYERIZER_PROVIDER_ENDPOINTS = {
  fal: {
    segment: "fal-ai/sam-3-1/image", // SAM 3.1 con prompts (text/point/box) → masks[]
    matting: "fal-ai/birefnet/v2", // mask_only:true → image = máscara alfa
    realtime: "fal-ai/sam-3-1/image", // fal.realtime.connect(...) (optimización futura)
  },
  replicate: {
    // Fallback: mismos modelos conceptuales en Replicate.
    segment: "meta/sam-2", // SAM en Replicate (placeholder de versión)
    matting: "851-labs/background-remover", // ya integrado en /api/spaces/matte
  },
} as const;

/** Coste estimado total (USD) de una selección, para el display en vivo y el reserve. */
export function estimateLayerizerJobCostUsd(selection: LayerizerSelectionLike[]): number {
  const objectCount = selection.length;
  const amodalCount = selection.filter((s) => s.amodalComplete).length;
  const extract = objectCount * LAYERIZER_COST_USD.perObjectExtract;
  const cleanPlate = objectCount > 0 ? LAYERIZER_COST_USD.cleanPlate : 0;
  const amodal = amodalCount * LAYERIZER_COST_USD.perObjectAmodal;
  return extract + cleanPlate + amodal;
}
