import type { SlotState } from "../brand-kit-types";
import { getSlotAttention } from "../brand-kit-board-status";
import { brandKitLocaleEs } from "../brand-kit-locale.es";
import type { BrandKitInspectorTab } from "./brand-kit-studio-mode";

export const INSPECTOR_EVIDENCE_PANEL_IDS = new Set([
  "evidence",
  "alternatives",
  "sources",
  "provenance",
  "conflict",
  "supplemental",
]);

export const INSPECTOR_HISTORY_PANEL_IDS = new Set(["history"]);

export type InspectorFooterVariant = "locked" | "confirmable" | "review" | "idle";

export type InspectorPanelInput = {
  id: string;
  label: string;
  count?: number;
  content: unknown;
};

export function mapDetailTabToInspectorTab(tabId?: string): BrandKitInspectorTab {
  if (!tabId) return "synthesis";
  if (tabId === "evidence" || INSPECTOR_EVIDENCE_PANEL_IDS.has(tabId)) return "evidence";
  if (tabId === "history" || INSPECTOR_HISTORY_PANEL_IDS.has(tabId)) return "history";
  if (tabId === "attributes" || tabId === "beliefs" || tabId === "detail") return "attributes";
  if (tabId === "synthesis" || tabId === "content") return "synthesis";
  return "synthesis";
}

export function partitionInspectorPanels<T extends InspectorPanelInput>(panels: T[]): {
  content: T[];
  evidence: T[];
  history: T[];
} {
  const content: T[] = [];
  const evidence: T[] = [];
  const history: T[] = [];

  for (const panel of panels) {
    if (!panel.content) continue;
    if (INSPECTOR_HISTORY_PANEL_IDS.has(panel.id)) {
      history.push(panel);
    } else if (INSPECTOR_EVIDENCE_PANEL_IDS.has(panel.id)) {
      evidence.push(panel);
    } else {
      content.push(panel);
    }
  }

  return { content, evidence, history };
}

export function resolveInspectorFooterVariant(slot: SlotState<unknown>): InspectorFooterVariant {
  if (slot.locked) return "locked";
  const attention = getSlotAttention(slot);
  if (attention.kind === "conflict" || slot.status === "candidates") return "review";
  if (slot.status === "resolved") return "confirmable";
  return "idle";
}

export function inspectorSubtitleForSlot(slot: SlotState<unknown> | undefined): string | undefined {
  if (!slot || slot.status === "empty") return undefined;

  const status =
    slot.locked || slot.status === "resolved"
      ? brandKitLocaleEs.confirmedStatusFemale
      : brandKitLocaleEs.pendingChip;

  const pdf = slot.locked ? brandKitLocaleEs.atelierExportIncluded : brandKitLocaleEs.atelierExportPending;
  return `${status} · ${pdf}`;
}

export function inspectorFooterShowsRevert(slot: SlotState<unknown>, variant: InspectorFooterVariant): boolean {
  return variant !== "locked" && slot.history.length > 0;
}
