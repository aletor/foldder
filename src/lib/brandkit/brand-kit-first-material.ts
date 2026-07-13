import type { BrandKitDocument, SlotId, SlotState } from "./brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "./brand-kit-types";
import { authoritativeSourceLabel } from "./brand-kit-source-policy";

const REVIEW_REASON_LITERAL = "La síntesis necesita revisión";

const BENIGN_REVIEW_REASON =
  /la síntesis necesita revisión|revisa la síntesis antes de confirmar|galería insuficiente/i;

function now(): string {
  return new Date().toISOString();
}

/** Primer material: una sola fuente, sin fuente autoritativa ni slots bloqueados. */
export function isFirstBrandKitMaterial(doc: BrandKitDocument): boolean {
  if (doc.sources.length > 1) return false;
  if (authoritativeSourceLabel(doc.sources)) return false;
  return !BRAND_KIT_SLOT_IDS.some((id) => doc.slots[id]?.locked);
}

function isBenignReviewReason(reason?: string): boolean {
  if (!reason?.trim()) return false;
  if (reason === REVIEW_REASON_LITERAL) return true;
  return BENIGN_REVIEW_REASON.test(reason);
}

function hasRealConflict(slot: SlotState<unknown>): boolean {
  return slot.reconciliation?.outcome === "contradiction" && slot.status === "candidates";
}

function resolveSingleCandidateSlot(slot: SlotState<unknown>): SlotState<unknown> {
  if (slot.status !== "candidates" || slot.candidates.length !== 1) return slot;
  const candidate = slot.candidates[0]!;
  return {
    ...slot,
    status: "resolved",
    value: candidate.value,
    provenance: candidate.provenance ?? slot.provenance,
    confidence: Math.max(slot.confidence, candidate.score, 0.62),
    candidates: [],
    needsReviewReason: undefined,
    reconciliation: undefined,
    updatedAt: now(),
  };
}

/**
 * Tras la primera ingesta: quita ruido de revisión que no tiene sentido sin material previo.
 * Conserva conflictos reales entre fuentes.
 */
export function sootheFirstMaterialSlots(doc: BrandKitDocument): BrandKitDocument {
  if (!isFirstBrandKitMaterial(doc)) return doc;

  const slots = { ...doc.slots };
  const semanticIds: SlotId[] = ["essence", "voice", "visualWorld"];

  for (const slotId of semanticIds) {
    const slot = slots[slotId];
    if (!slot) continue;
    if (hasRealConflict(slot)) continue;

    let next = slot;
    if (next.status === "candidates" && next.candidates.length === 1) {
      next = resolveSingleCandidateSlot(next);
    }

    if (next.status === "resolved" && isBenignReviewReason(next.needsReviewReason)) {
      next = { ...next, needsReviewReason: undefined, reconciliation: undefined, updatedAt: now() };
    }

    if (next !== slot) slots[slotId] = next;
  }

  return { ...doc, slots, updatedAt: now() };
}
