import type { GenomaDocument, SlotId } from "./genoma-types";
import { genomaBoardActionItems, slotLabel, type GenomaBoardActionItem } from "./genoma-board-status";

export type GenomaReviewQueueItem = GenomaBoardActionItem;

export function buildGenomaReviewQueue(doc: GenomaDocument, skipped: ReadonlySet<SlotId>): GenomaReviewQueueItem[] {
  return genomaBoardActionItems(doc).filter((item) => !skipped.has(item.slotId));
}

export function genomaReviewQuestion(doc: GenomaDocument, item: GenomaReviewQueueItem): string {
  const slot = doc.slots[item.slotId];
  const label = slotLabel(item.slotId).toLowerCase();

  if (item.kind === "conflict" || slot.reconciliation?.outcome === "contradiction") {
    return `Tus fuentes no están de acuerdo en ${label}: ¿cuál manda?`;
  }
  if (item.kind === "candidates") {
    const count = slot.candidates.length;
    return `Foldder tiene ${count} propuesta${count === 1 ? "" : "s"} para ${label}: elige una.`;
  }
  return `${slotLabel(item.slotId)} necesita tu decisión.`;
}

export function reviewQueueProgressLabel(index: number, total: number): string {
  return `Pregunta ${Math.min(index + 1, Math.max(total, 1))} de ${Math.max(total, 1)}`;
}
