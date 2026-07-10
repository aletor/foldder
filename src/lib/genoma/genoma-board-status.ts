import type { GalleryValue, GenomaDocument, SlotId, SlotState } from "./genoma-types";
import { GENOMA_SLOT_IDS, GENOMA_SLOT_LABELS } from "./genoma-types";
import { pendingGenomaSlotIds } from "./genoma-defaults";
import { countPendingGenomaConflicts } from "./genoma-reconcile";
import { countLockedGenomaSlots } from "./genoma-stream-merge";
import { countSupplementalObservations } from "./genoma-source-policy";
import { genomaLocaleEs } from "./genoma-locale.es";

export type SlotAttentionKind =
  | "conflict"
  | "candidates"
  | "supplemental"
  | "pending"
  | "analyzing"
  | "locked"
  | null;

export type SlotAttention = {
  kind: SlotAttentionKind;
  label?: string;
};

export type GenomaBoardSummary = {
  conflicts: number;
  candidates: number;
  supplemental: number;
  locked: number;
  pending: number;
  resolved: number;
  sources: number;
  needsYou: number;
};

export function summarizeGenomaBoard(doc: GenomaDocument): GenomaBoardSummary {
  const conflicts = countPendingGenomaConflicts(doc.slots);
  const supplemental = countSupplementalObservations(doc.slots);
  const locked = countLockedGenomaSlots(doc.slots);
  const pending = pendingGenomaSlotIds(doc).length;
  const resolved = GENOMA_SLOT_IDS.filter((id) => doc.slots[id]?.status === "resolved").length;
  const candidates = GENOMA_SLOT_IDS.filter((id) => doc.slots[id]?.status === "candidates").length;

  return {
    conflicts,
    candidates,
    supplemental,
    locked,
    pending,
    resolved,
    sources: doc.sources.length,
    needsYou: conflicts + candidates + pending,
  };
}

function supplementalCountForSlot(slot: SlotState<unknown>): number {
  const evidence = slot.supplementalEvidence?.length ?? 0;
  const archived = slot.archivedCandidates?.length ?? 0;
  const galleryArchived =
    slot.id === "gallery"
      ? ((slot.value as GalleryValue | undefined)?.archivedHarvest?.length ?? 0)
      : 0;
  return evidence + archived + galleryArchived;
}

export function getSlotAttention(slot: SlotState<unknown>, activeSlotId?: SlotId): SlotAttention {
  if (activeSlotId === slot.id) {
    return { kind: "analyzing", label: genomaLocaleEs.slotAnalyzing };
  }

  if (slot.reconciliation?.outcome === "contradiction" && slot.status === "candidates") {
    return { kind: "conflict", label: genomaLocaleEs.conflictChip };
  }

  if (slot.status === "candidates") {
    if (slot.candidates.length === 1) {
      return { kind: "candidates", label: genomaLocaleEs.reviewChip };
    }
    return {
      kind: "candidates",
      label: genomaLocaleEs.candidatesChip(slot.candidates.length),
    };
  }

  const supplementalCount = supplementalCountForSlot(slot);
  if (slot.locked && supplementalCount > 0) {
    return {
      kind: "supplemental",
      label: genomaLocaleEs.supplementalChip(supplementalCount),
    };
  }

  if (slot.status === "pending") {
    return { kind: "pending", label: genomaLocaleEs.pendingChip };
  }

  if (slot.locked) {
    return { kind: "locked", label: genomaLocaleEs.locked };
  }

  return { kind: null };
}

export function slotLabel(slotId: SlotId): string {
  return GENOMA_SLOT_LABELS[slotId] ?? slotId;
}

export type GenomaBoardActionItem = {
  slotId: SlotId;
  kind: "conflict" | "candidates" | "pending";
};

/** Bloques que requieren decisión del usuario (conflicto, opciones o pendiente). */
export function genomaBoardActionItems(doc: GenomaDocument): GenomaBoardActionItem[] {
  const items: GenomaBoardActionItem[] = [];
  for (const slotId of GENOMA_SLOT_IDS) {
    const slot = doc.slots[slotId];
    if (!slot) continue;
    if (slot.reconciliation?.outcome === "contradiction" && slot.status === "candidates") {
      items.push({ slotId, kind: "conflict" });
    } else if (slot.status === "candidates") {
      items.push({ slotId, kind: "candidates" });
    } else if (slot.status === "pending" || slot.status === "needs_user") {
      items.push({ slotId, kind: "pending" });
    }
  }
  return items;
}

/** Mensaje cuando export JSON está deshabilitado; null si ya se puede exportar. */
export function genomaExportBlockedReason(
  doc: GenomaDocument,
  completenessPercent: number,
): string | null {
  if (completenessPercent >= 40 && doc.compiled) return null;
  if (completenessPercent < 40) {
    return genomaLocaleEs.exportNeedsCompleteness(completenessPercent);
  }
  return genomaLocaleEs.exportNeedsCompile;
}
