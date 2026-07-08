import type { Provenance, SlotState } from "../genoma-types";

export function buildBatchSlotPatch<T>(options: {
  current?: SlotState<unknown>;
  value: T;
  provenance: Provenance;
  confidence: number;
  locked?: boolean;
}): Partial<SlotState<unknown>> {
  const { current, value, provenance, confidence, locked } = options;
  const isLocked = locked ?? current?.locked ?? false;

  if (isLocked && current?.status === "resolved" && current.value !== undefined) {
    const candidate = { value, score: confidence, provenance: { ...provenance, detail: "alternativas" } };
    const existing = current.candidates ?? [];
    return {
      status: "resolved",
      value: current.value,
      provenance: current.provenance,
      confidence: current.confidence,
      locked: true,
      candidates: [...existing, candidate],
    };
  }

  return {
    status: "resolved",
    value,
    provenance,
    confidence,
    candidates: [],
    locked: isLocked,
  };
}

export const batchLlmProvenance = (sourceUrl?: string): Provenance => ({
  type: "llm_synthesis",
  detail: "batch v2",
  sourceUrl,
});
