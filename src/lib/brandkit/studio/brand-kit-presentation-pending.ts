import type { BrandKitDocument, SlotId, SlotState, LogoValue } from "../brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "../brand-kit-types";
import { SLOT_LABELS_ES, SLOT_NUMBERS } from "./sidebar-slot-nav";

export function isSlotVisibleInPresentation(slot: SlotState<unknown> | undefined): boolean {
  if (!slot || slot.status === "empty") return false;
  return slot.locked;
}

export function shouldShowApplicationsInPresentation(doc: BrandKitDocument): boolean {
  const palette = doc.slots.palette;
  if (!isSlotVisibleInPresentation(palette) || !palette.value) return false;
  const logo = doc.slots.logo.value as LogoValue | undefined;
  const hasLogo = Boolean(logo?.previewUrl?.trim());
  const hasName = Boolean(doc.brandName?.value?.trim());
  return hasLogo || hasName;
}

export function countPresentationPendingSlots(doc: BrandKitDocument): number {
  return BRAND_KIT_SLOT_IDS.filter((slotId) => {
    const slot = doc.slots[slotId];
    return Boolean(slot && slot.status !== "empty" && !slot.locked);
  }).length;
}

export function listPresentationPendingSlots(doc: BrandKitDocument): Array<{ slotId: SlotId; number: string; label: string }> {
  return BRAND_KIT_SLOT_IDS.filter((slotId) => {
    const slot = doc.slots[slotId];
    return Boolean(slot && slot.status !== "empty" && !slot.locked);
  }).map((slotId) => ({
    slotId,
    number: SLOT_NUMBERS[slotId],
    label: SLOT_LABELS_ES[slotId],
  }));
}
