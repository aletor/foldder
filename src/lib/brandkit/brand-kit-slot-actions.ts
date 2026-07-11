import type { BrandKitDocument, Provenance, SlotAction, SlotId, SlotState } from "./brand-kit-types";
import { isSemanticTextSlot, mergeSemanticValues } from "./brand-kit-reconcile";

const NOW = () => new Date().toISOString();
const MAX_HISTORY = 5;

function clearReconcileMeta<T>(slot: SlotState<T>): SlotState<T> {
  const { needsReviewReason: _reason, reconciliation: _reconciliation, ...rest } = slot;
  return rest as SlotState<T>;
}

function userProvenance(): Provenance {
  return { type: "user_input", detail: "tú" };
}

function pushHistory<T>(slot: SlotState<T>, value: T, provenance: Provenance): SlotState<T> {
  if (slot.value === undefined || !slot.provenance) return slot;
  const entry = { value: slot.value, provenance: slot.provenance, ts: slot.updatedAt };
  return {
    ...slot,
    history: [entry, ...slot.history].slice(0, MAX_HISTORY),
  };
}

export function applySlotAction(doc: BrandKitDocument, slotId: SlotId, action: SlotAction): BrandKitDocument {
  const slot = doc.slots[slotId];
  if (!slot) return doc;

  let next: SlotState<unknown> = { ...slot };

  switch (action.action) {
    case "set": {
      if (next.value !== undefined && next.provenance) {
        next = pushHistory(next, next.value, next.provenance);
      }
      next = clearReconcileMeta({
        ...next,
        status: "resolved",
        value: action.value,
        provenance: userProvenance(),
        confidence: 1,
        updatedAt: NOW(),
      });
      break;
    }
    case "choose_candidate": {
      const candidate = next.candidates[action.candidateIndex];
      if (!candidate) return doc;
      if (next.value !== undefined && next.provenance) {
        next = pushHistory(next, next.value, next.provenance);
      }
      next = clearReconcileMeta({
        ...next,
        status: "resolved",
        value: candidate.value,
        provenance: candidate.provenance,
        confidence: Math.max(candidate.score, next.confidence),
        candidates: next.candidates,
        locked: action.lock ?? next.locked,
        updatedAt: NOW(),
      });
      break;
    }
    case "merge_candidates": {
      const [leftIndex, rightIndex] = action.candidateIndices;
      const left = next.candidates[leftIndex];
      const right = next.candidates[rightIndex];
      if (!left || !right || !isSemanticTextSlot(slotId)) return doc;
      if (next.value !== undefined && next.provenance) {
        next = pushHistory(next, next.value, next.provenance);
      }
      const mergedValue = mergeSemanticValues(slotId, left.value, right.value);
      next = clearReconcileMeta({
        ...next,
        status: "resolved",
        value: mergedValue,
        provenance: userProvenance(),
        confidence: Math.max(left.score, right.score, next.confidence),
        candidates: [],
        updatedAt: NOW(),
      });
      break;
    }
    case "dismiss_candidate": {
      const remaining = next.candidates.filter((_, index) => index !== action.candidateIndex);
      if (remaining.length === next.candidates.length) return doc;
      if (remaining.length === 1) {
        const candidate = remaining[0];
        next = clearReconcileMeta({
          ...next,
          status: "resolved",
          value: candidate.value,
          provenance: candidate.provenance,
          confidence: Math.max(candidate.score, next.confidence),
          candidates: [],
          updatedAt: NOW(),
        });
        break;
      }
      next = {
        ...next,
        candidates: remaining,
        updatedAt: NOW(),
      };
      break;
    }
    case "clear": {
      next = {
        ...next,
        status: "empty",
        value: undefined,
        provenance: undefined,
        confidence: 0,
        candidates: [],
        updatedAt: NOW(),
      };
      break;
    }
    case "lock": {
      next = clearReconcileMeta({ ...next, locked: true, updatedAt: NOW() });
      break;
    }
    case "unlock": {
      next = { ...next, locked: false, updatedAt: NOW() };
      break;
    }
    case "revert": {
      const index = action.historyIndex ?? 0;
      const entry = next.history[index];
      if (!entry) return doc;
      next = {
        ...next,
        status: "resolved",
        value: entry.value,
        provenance: entry.provenance,
        confidence: 1,
        history: next.history.filter((_, i) => i !== index),
        updatedAt: NOW(),
      };
      break;
    }
    default:
      return doc;
  }

  return {
    ...doc,
    slots: { ...doc.slots, [slotId]: next },
    updatedAt: NOW(),
  };
}

export function patchBrandKitDocument(doc: BrandKitDocument, patch: Partial<BrandKitDocument>): BrandKitDocument {
  return {
    ...doc,
    ...patch,
    slots: patch.slots ? { ...doc.slots, ...patch.slots } : doc.slots,
    updatedAt: NOW(),
  };
}
