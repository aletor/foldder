import type { SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { getSlotAttention } from "@/lib/brandkit/brand-kit-board-status";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

export type MosaicCellStatusTone = "neutral" | "attention" | "confirmed" | "pending";

/** Un solo sistema de badge: Confirmado | Pendiente | Revisión. */
export function resolveMosaicCellStatus(
  slot: SlotState<unknown> | undefined,
  activeSlotId?: SlotId,
): { label: string | null; tone: MosaicCellStatusTone } {
  if (!slot || slot.status === "empty") {
    return { label: null, tone: "neutral" };
  }

  const attention = getSlotAttention(slot, activeSlotId);
  if (attention.kind === "conflict" || attention.kind === "candidates" || attention.kind === "supplemental") {
    return { label: brandKitLocaleEs.sectionStatusReview, tone: "attention" };
  }
  if (attention.kind === "pending" || attention.kind === "analyzing") {
    return { label: brandKitLocaleEs.pendingChip, tone: "pending" };
  }

  if (slot.locked) {
    return { label: brandKitLocaleEs.confirmedStatus, tone: "confirmed" };
  }

  if (slot.status === "resolved") {
    if (slot.needsReviewReason) {
      return { label: brandKitLocaleEs.sectionStatusReview, tone: "attention" };
    }
    return { label: brandKitLocaleEs.pendingChip, tone: "pending" };
  }

  return { label: brandKitLocaleEs.pendingChip, tone: "pending" };
}
