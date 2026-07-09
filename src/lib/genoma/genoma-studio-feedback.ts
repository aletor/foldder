import type { GenomaDocument, SlotAction, SlotId } from "./genoma-types";
import { summarizeGenomaBoard } from "./genoma-board-status";
import { genomaLocaleEs } from "./genoma-locale.es";
import { authoritativeSourceLabel } from "./genoma-source-policy";
import { GENOMA_SLOT_LABELS } from "./genoma-types";

export type GenomaToastTone = "neutral" | "success" | "warn" | "error";

export type GenomaToast = {
  id: string;
  tone: GenomaToastTone;
  title: string;
  detail?: string;
};

let toastCounter = 0;

export function createGenomaToast(
  tone: GenomaToastTone,
  title: string,
  detail?: string,
): GenomaToast {
  toastCounter += 1;
  return { id: `genoma-toast-${toastCounter}`, tone, title, detail };
}

export function buildAnalysisCompleteToast(before: GenomaDocument, after: GenomaDocument): GenomaToast {
  const prev = summarizeGenomaBoard(before);
  const next = summarizeGenomaBoard(after);
  const newSources = Math.max(0, next.sources - prev.sources);
  const newConflicts = Math.max(0, next.conflicts - prev.conflicts);
  const newSupplemental = Math.max(0, next.supplemental - prev.supplemental);

  if (newConflicts > 0) {
    return createGenomaToast(
      "warn",
      genomaLocaleEs.analysisDoneConflict(newConflicts),
      genomaLocaleEs.analysisDoneConflictHint,
    );
  }

  if (newSupplemental > 0) {
    return createGenomaToast(
      "neutral",
      genomaLocaleEs.analysisDoneSupplemental(newSupplemental),
      genomaLocaleEs.analysisDoneSupplementalHint,
    );
  }

  return createGenomaToast(
    "success",
    newSources > 0 ? genomaLocaleEs.analysisDoneAdded(newSources) : genomaLocaleEs.analysisDone,
    next.needsYou > 0 ? genomaLocaleEs.analysisDoneNeedsYou(next.needsYou) : genomaLocaleEs.analysisDoneClean,
  );
}

export function buildSlotActionToast(slotId: SlotId, action: SlotAction): GenomaToast | null {
  const label = GENOMA_SLOT_LABELS[slotId] ?? slotId;

  switch (action.action) {
    case "lock":
      return createGenomaToast("success", genomaLocaleEs.slotLocked(label), genomaLocaleEs.slotLockedHint);
    case "unlock":
      return createGenomaToast("neutral", genomaLocaleEs.slotUnlocked(label));
    case "choose_candidate":
      return createGenomaToast(
        action.lock ? "success" : "neutral",
        action.lock ? genomaLocaleEs.slotConfirmed(label) : genomaLocaleEs.slotChosen(label),
      );
    case "merge_candidates":
      return createGenomaToast("success", genomaLocaleEs.slotMerged(label));
    case "dismiss_candidate":
      return createGenomaToast("neutral", genomaLocaleEs.slotIgnoredSource(label));
    case "revert":
      return createGenomaToast("neutral", genomaLocaleEs.slotReverted(label));
    default:
      return null;
  }
}

export function buildAuthoritativeToast(doc: GenomaDocument, authoritative: boolean): GenomaToast {
  if (!authoritative) {
    return createGenomaToast("neutral", genomaLocaleEs.authoritativeRemoved);
  }
  const label = authoritativeSourceLabel(doc.sources);
  return createGenomaToast(
    "success",
    genomaLocaleEs.authoritativeSet,
    label ? genomaLocaleEs.authoritativeSetDetail(label) : undefined,
  );
}

export function buildLogoUploadToast(): GenomaToast {
  return createGenomaToast("success", genomaLocaleEs.logoUploadSuccess);
}
