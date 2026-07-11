import type { GalleryValue, BrandKitDocument, SlotId, SlotState } from "./brand-kit-types";
import { BRAND_KIT_SLOT_IDS, BRAND_KIT_SLOT_LABELS } from "./brand-kit-types";
import { pendingBrandKitSlotIds } from "./brand-kit-defaults";
import { countPendingBrandKitConflicts } from "./brand-kit-reconcile";
import { countLockedBrandKitSlots } from "./brand-kit-stream-merge";
import { countSupplementalObservations } from "./brand-kit-source-policy";
import { brandKitLocaleEs } from "./brand-kit-locale.es";

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

export type BrandKitBoardSummary = {
  conflicts: number;
  candidates: number;
  supplemental: number;
  locked: number;
  pending: number;
  resolved: number;
  sources: number;
  needsYou: number;
};

export function summarizeBrandKitBoard(doc: BrandKitDocument): BrandKitBoardSummary {
  const conflicts = countPendingBrandKitConflicts(doc.slots);
  const supplemental = countSupplementalObservations(doc.slots);
  const locked = countLockedBrandKitSlots(doc.slots);
  const pending = pendingBrandKitSlotIds(doc).length;
  const resolved = BRAND_KIT_SLOT_IDS.filter((id) => doc.slots[id]?.status === "resolved").length;
  const candidates = BRAND_KIT_SLOT_IDS.filter((id) => doc.slots[id]?.status === "candidates").length;

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
    return { kind: "analyzing", label: brandKitLocaleEs.slotAnalyzing };
  }

  if (slot.reconciliation?.outcome === "contradiction" && slot.status === "candidates") {
    return { kind: "conflict", label: brandKitLocaleEs.conflictChip };
  }

  if (slot.status === "candidates") {
    if (slot.candidates.length === 1) {
      return { kind: "candidates", label: brandKitLocaleEs.reviewChip };
    }
    return {
      kind: "candidates",
      label: brandKitLocaleEs.candidatesChip(slot.candidates.length),
    };
  }

  const supplementalCount = supplementalCountForSlot(slot);
  if (slot.locked && supplementalCount > 0) {
    return {
      kind: "supplemental",
      label: brandKitLocaleEs.supplementalChip(supplementalCount),
    };
  }

  if (slot.status === "pending") {
    return { kind: "pending", label: brandKitLocaleEs.pendingChip };
  }

  if (slot.locked) {
    return { kind: "locked", label: brandKitLocaleEs.locked };
  }

  return { kind: null };
}

export function slotLabel(slotId: SlotId): string {
  return BRAND_KIT_SLOT_LABELS[slotId] ?? slotId;
}

export type BrandKitBoardActionItem = {
  slotId: SlotId;
  kind: "conflict" | "candidates" | "pending";
};

/** Bloques que requieren decisión del usuario (conflicto, opciones o pendiente). */
export function brandKitBoardActionItems(doc: BrandKitDocument): BrandKitBoardActionItem[] {
  const items: BrandKitBoardActionItem[] = [];
  for (const slotId of BRAND_KIT_SLOT_IDS) {
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
export function brandKitExportBlockedReason(
  doc: BrandKitDocument,
  completenessPercent: number,
): string | null {
  if (completenessPercent >= 40 && doc.compiled) return null;
  if (completenessPercent < 40) {
    return brandKitLocaleEs.exportNeedsCompleteness(completenessPercent);
  }
  return brandKitLocaleEs.exportNeedsCompile;
}
