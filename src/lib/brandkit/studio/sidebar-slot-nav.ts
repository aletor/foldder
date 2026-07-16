import type { BrandKitDocument, SlotId, SlotState } from "../brand-kit-types";
import { getSlotAttention } from "../brand-kit-board-status";
import { isSlotVisibleInPresentation, shouldShowApplicationsInPresentation } from "./brand-kit-presentation-pending";
import {
  BRAND_KIT_BOARD_CHAPTER_NUMBER,
  BRAND_KIT_MOSAIC_READING_ORDER,
} from "./brand-kit-mosaic-order";

export type SidebarNavItemId = SlotId | "applications";

export type SidebarSlotStatusIcon = "confirmed" | "review" | "pending" | "conflict" | "analyzing" | "locked" | "empty";

export type SidebarNavItem = {
  id: SidebarNavItemId;
  number: string;
  label: string;
  status: SidebarSlotStatusIcon;
  statusSymbol: string;
  scrollTarget: string;
};

export const SLOT_NUMBERS: Record<SlotId, string> = { ...BRAND_KIT_BOARD_CHAPTER_NUMBER };

export const SLOT_LABELS_ES: Record<SlotId, string> = {
  logo: "Logo",
  essence: "Esencia",
  palette: "Color",
  typography: "Tipografía",
  voice: "Voz",
  visualWorld: "Mundo visual",
  gallery: "Galería",
};

const STATUS_SYMBOL: Record<SidebarSlotStatusIcon, string> = {
  confirmed: "●",
  review: "●",
  pending: "○",
  conflict: "●",
  analyzing: "◐",
  locked: "●",
  empty: "○",
};

export function resolveSidebarSlotStatus(
  slot: SlotState<unknown> | undefined,
  activeSlotId?: SlotId,
  slotId?: SlotId,
): SidebarSlotStatusIcon {
  if (!slot || slot.status === "empty") return "empty";
  const attention = getSlotAttention(slot, activeSlotId === slotId ? slotId : undefined);
  if (attention.kind === "analyzing") return "analyzing";
  if (attention.kind === "conflict") return "conflict";
  if (attention.kind === "candidates" || attention.kind === "supplemental") return "review";
  if (attention.kind === "pending") return "pending";
  if (slot.locked) return "locked";
  if (slot.status === "resolved") return "confirmed";
  return "pending";
}

export function buildSidebarNavItems(
  doc: BrandKitDocument,
  activeSlotId?: SlotId,
  options?: { presentationOnly?: boolean },
): SidebarNavItem[] {
  const dnaItems = BRAND_KIT_MOSAIC_READING_ORDER.map((slotId) => {
    const status = resolveSidebarSlotStatus(doc.slots[slotId], activeSlotId, slotId);
    return {
      id: slotId,
      number: BRAND_KIT_BOARD_CHAPTER_NUMBER[slotId],
      label: SLOT_LABELS_ES[slotId],
      status,
      statusSymbol: STATUS_SYMBOL[status],
      scrollTarget: slotId,
    } satisfies SidebarNavItem;
  }).filter((item) => {
    if (!options?.presentationOnly) return true;
    return isSlotVisibleInPresentation(doc.slots[item.id as SlotId]);
  });

  const paletteOk = doc.slots.palette?.locked || doc.slots.palette?.status === "resolved";
  const appsStatus: SidebarSlotStatusIcon = paletteOk ? "confirmed" : "pending";
  const showApps = options?.presentationOnly ? shouldShowApplicationsInPresentation(doc) : true;

  const items = [...dnaItems];
  if (showApps) {
    items.push({
      id: "applications",
      number: "08",
      label: "Aplicaciones de marca",
      status: appsStatus,
      statusSymbol: STATUS_SYMBOL[appsStatus],
      scrollTarget: "applications",
    });
  }
  return items;
}

export function countConfirmedSlots(doc: BrandKitDocument): number {
  return BRAND_KIT_MOSAIC_READING_ORDER.filter((id) => doc.slots[id]?.locked).length;
}

export type BrandKitSidebarStatusTone = "stable" | "analyzing" | "review" | "export";

export function resolveBrandKitSidebarStatus(
  doc: BrandKitDocument,
  isAnalyzing: boolean,
  completenessPercent: number,
  canExport: boolean,
): { tone: BrandKitSidebarStatusTone; label: string } {
  if (isAnalyzing) return { tone: "analyzing", label: "Analizando" };
  const summary = BRAND_KIT_MOSAIC_READING_ORDER.reduce(
    (acc, id) => {
      const slot = doc.slots[id];
      if (!slot) return acc;
      if (slot.reconciliation?.outcome === "contradiction" && slot.status === "candidates") acc.conflicts += 1;
      if (slot.status === "candidates" || slot.status === "pending" || slot.status === "needs_user") acc.needs += 1;
      return acc;
    },
    { conflicts: 0, needs: 0 },
  );
  if (summary.conflicts > 0 || summary.needs > 0) {
    return { tone: "review", label: "Requiere revisión" };
  }
  if (canExport && completenessPercent >= 80) {
    return { tone: "export", label: "Listo para exportar" };
  }
  if (completenessPercent >= 60) {
    return { tone: "stable", label: "BrandKit estable" };
  }
  return { tone: "review", label: "En construcción" };
}
