import type { GenomaDocument, Provenance, SlotAction, SlotId, SlotState } from "./genoma-types";

const NOW = () => new Date().toISOString();
const MAX_HISTORY = 5;

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

export function applySlotAction(doc: GenomaDocument, slotId: SlotId, action: SlotAction): GenomaDocument {
  const slot = doc.slots[slotId];
  if (!slot) return doc;

  let next: SlotState<unknown> = { ...slot };

  switch (action.action) {
    case "set": {
      if (next.value !== undefined && next.provenance) {
        next = pushHistory(next, next.value, next.provenance);
      }
      next = {
        ...next,
        status: "resolved",
        value: action.value,
        provenance: userProvenance(),
        confidence: 1,
        updatedAt: NOW(),
      };
      break;
    }
    case "choose_candidate": {
      const candidate = next.candidates[action.candidateIndex];
      if (!candidate) return doc;
      if (next.value !== undefined && next.provenance) {
        next = pushHistory(next, next.value, next.provenance);
      }
      next = {
        ...next,
        status: "resolved",
        value: candidate.value,
        provenance: candidate.provenance,
        confidence: Math.max(candidate.score, next.confidence),
        candidates: next.candidates,
        locked: action.lock ?? next.locked,
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
      const { needsReviewReason: _removed, ...rest } = next;
      next = { ...rest, locked: true, updatedAt: NOW() };
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

export function patchGenomaDocument(doc: GenomaDocument, patch: Partial<GenomaDocument>): GenomaDocument {
  return {
    ...doc,
    ...patch,
    slots: patch.slots ? { ...doc.slots, ...patch.slots } : doc.slots,
    updatedAt: NOW(),
  };
}
