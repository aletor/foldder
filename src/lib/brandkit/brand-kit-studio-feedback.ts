import type { BrandKitDocument, SlotAction, SlotId } from "./brand-kit-types";
import { summarizeBrandKitBoard } from "./brand-kit-board-status";
import { brandKitLocaleEs } from "./brand-kit-locale.es";
import { authoritativeSourceLabel } from "./brand-kit-source-policy";
import { BRAND_KIT_SLOT_LABELS } from "./brand-kit-types";

export type BrandKitToastTone = "neutral" | "success" | "warn" | "error";

export type BrandKitToast = {
  id: string;
  tone: BrandKitToastTone;
  title: string;
  detail?: string;
};

let toastCounter = 0;

export function createBrandKitToast(
  tone: BrandKitToastTone,
  title: string,
  detail?: string,
): BrandKitToast {
  toastCounter += 1;
  return { id: `brand-kit-toast-${toastCounter}`, tone, title, detail };
}

export function buildAnalysisCompleteToast(before: BrandKitDocument, after: BrandKitDocument): BrandKitToast {
  const prev = summarizeBrandKitBoard(before);
  const next = summarizeBrandKitBoard(after);
  const newSources = Math.max(0, next.sources - prev.sources);
  const newConflicts = Math.max(0, next.conflicts - prev.conflicts);
  const newSupplemental = Math.max(0, next.supplemental - prev.supplemental);

  if (newConflicts > 0) {
    return createBrandKitToast(
      "warn",
      brandKitLocaleEs.analysisDoneConflict(newConflicts),
      brandKitLocaleEs.analysisDoneConflictHint,
    );
  }

  if (newSupplemental > 0) {
    return createBrandKitToast(
      "neutral",
      brandKitLocaleEs.analysisDoneSupplemental(newSupplemental),
      brandKitLocaleEs.analysisDoneSupplementalHint,
    );
  }

  return createBrandKitToast(
    "success",
    newSources > 0 ? brandKitLocaleEs.analysisDoneAdded(newSources) : brandKitLocaleEs.analysisDone,
    next.needsYou > 0 ? brandKitLocaleEs.analysisDoneNeedsYou(next.needsYou) : brandKitLocaleEs.analysisDoneClean,
  );
}

export function buildSlotActionToast(slotId: SlotId, action: SlotAction): BrandKitToast | null {
  const label = BRAND_KIT_SLOT_LABELS[slotId] ?? slotId;

  switch (action.action) {
    case "lock":
      return createBrandKitToast("success", brandKitLocaleEs.slotLocked(label), brandKitLocaleEs.slotLockedHint);
    case "unlock":
      return createBrandKitToast("neutral", brandKitLocaleEs.slotUnlocked(label));
    case "choose_candidate":
      return createBrandKitToast(
        action.lock ? "success" : "neutral",
        action.lock ? brandKitLocaleEs.slotConfirmed(label) : brandKitLocaleEs.slotChosen(label),
      );
    case "merge_candidates":
      return createBrandKitToast("success", brandKitLocaleEs.slotMerged(label));
    case "dismiss_candidate":
      return createBrandKitToast("neutral", brandKitLocaleEs.slotIgnoredSource(label));
    case "revert":
      return createBrandKitToast("neutral", brandKitLocaleEs.slotReverted(label));
    default:
      return null;
  }
}

export function buildAuthoritativeToast(doc: BrandKitDocument, authoritative: boolean): BrandKitToast {
  if (!authoritative) {
    return createBrandKitToast("neutral", brandKitLocaleEs.authoritativeRemoved);
  }
  const label = authoritativeSourceLabel(doc.sources);
  return createBrandKitToast(
    "success",
    brandKitLocaleEs.authoritativeSet,
    label ? brandKitLocaleEs.authoritativeSetDetail(label) : undefined,
  );
}

export function buildLogoUploadToast(): BrandKitToast {
  return createBrandKitToast("success", brandKitLocaleEs.logoUploadSuccess, brandKitLocaleEs.logoUploadFastHint);
}
