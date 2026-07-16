import type {
  EssenceValue,
  GalleryValue,
  LogoValue,
  PaletteValue,
  SlotId,
  SlotState,
  TypographyValue,
  VoiceValue,
  VisualWorldValue,
  BrandKitDocument,
} from "../brand-kit-types";
import { getSlotAttention } from "../brand-kit-board-status";
import { brandKitLocaleEs } from "../brand-kit-locale.es";
import { computeGalleryLibraryStats } from "../brand-kit-gallery-image-state";
import { SLOT_NUMBERS, SLOT_LABELS_ES } from "./sidebar-slot-nav";

export type SlotNavPreview = {
  headline: string;
  lines: string[];
};

function slotStatusLabel(slot: SlotState<unknown>): string {
  if (slot.locked) return brandKitLocaleEs.locked;
  const attention = getSlotAttention(slot);
  if (attention.kind === "conflict") return brandKitLocaleEs.conflictChip;
  if (attention.kind === "candidates") return brandKitLocaleEs.reviewChip;
  if (attention.kind === "analyzing") return brandKitLocaleEs.slotAnalyzing;
  if (slot.status === "resolved") return brandKitLocaleEs.confirmedStatus;
  return brandKitLocaleEs.pendingChip;
}

export function buildSlotNavPreview(doc: BrandKitDocument, slotId: SlotId): SlotNavPreview | null {
  const slot = doc.slots[slotId];
  if (!slot || slot.status === "empty") return null;
  const label = SLOT_LABELS_ES[slotId];
  const status = slotStatusLabel(slot);

  switch (slotId) {
    case "logo": {
      const logo = slot.value as LogoValue | undefined;
      return {
        headline: label,
        lines: [
          status,
          logo?.format ? `Formato ${logo.format}` : "Sin logo confirmado",
          logo?.sourceDocName ? `Fuente: ${logo.sourceDocName}` : "",
        ].filter(Boolean),
      };
    }
    case "palette": {
      const palette = slot.value as PaletteValue | undefined;
      const roles = palette?.colors?.map((c) => c.role).join(" · ") ?? "";
      return { headline: label, lines: [status, roles || "Sin paleta"] };
    }
    case "typography": {
      const typo = slot.value as TypographyValue | undefined;
      const families = typo?.families?.map((f) => f.family).slice(0, 2).join(" · ") ?? "";
      return { headline: label, lines: [status, families || "Sin tipografía"] };
    }
    case "essence": {
      const essence = slot.value as EssenceValue | undefined;
      return {
        headline: label,
        lines: [
          status,
          essence?.headline?.trim() || essence?.summary?.slice(0, 72) || "Sin esencia",
        ],
      };
    }
    case "voice": {
      const voice = slot.value as VoiceValue | undefined;
      return {
        headline: label,
        lines: [
          status,
          voice?.descriptors?.slice(0, 3).join(" · ") || voice?.summary?.slice(0, 72) || "Sin voz",
        ],
      };
    }
    case "visualWorld": {
      const visual = slot.value as VisualWorldValue | undefined;
      return {
        headline: label,
        lines: [status, visual?.summary?.slice(0, 72) || visual?.moodTags?.slice(0, 3).join(" · ") || "Sin dirección"],
      };
    }
    case "gallery": {
      const gallery = slot.value as GalleryValue | undefined;
      const stats = computeGalleryLibraryStats(gallery, Boolean(slot?.locked));
      return {
        headline: label,
        lines: [status, brandKitLocaleEs.galleryStats(stats.approved, stats.proposals, stats.errors)],
      };
    }
    default:
      return { headline: label, lines: [status] };
  }
}

export function slotDetailMeta(doc: BrandKitDocument, slotId: SlotId) {
  const slot = doc.slots[slotId];
  return {
    slotNumber: SLOT_NUMBERS[slotId],
    blockLabel: SLOT_LABELS_ES[slotId].toUpperCase(),
    brandName: doc.brandName?.value?.trim(),
    statusLabel: slot ? slotStatusLabel(slot) : undefined,
    sourceLabel: slot?.provenance?.detail ? `Fuente principal: ${slot.provenance.detail}` : undefined,
    initialTabId:
      slot?.reconciliation?.outcome === "contradiction"
        ? "evidence"
        : slot?.status === "candidates"
          ? "alternatives"
          : undefined,
  };
}

export function buildSlotDetailSummaryText(doc: BrandKitDocument, slotId: SlotId): string {
  const preview = buildSlotNavPreview(doc, slotId);
  if (!preview) return "";
  return preview.lines[1] ?? preview.lines[0] ?? "";
}
