/**
 * Registro consolidado y actividad de ingesta para BrandKit Studio (modelo slots v2).
 */

import type { BrandKitIngestSectionId, BrandKitSectionPreview } from "../ingest/types";
import { BRAND_KIT_INGEST_SECTION_ORDER } from "../ingest/types";
import type { ConsolidatedRowState } from "../ingest/consolidated-registry";
import { voiceTraitsForFace } from "../ingest/consolidated-registry";
import type { BrandKitCrawlProgressState } from "@/app/spaces/brandKit/BrandKitCrawlProgress";
import type {
  EssenceValue,
  GalleryValue,
  BrandKitDocument,
  LogoValue,
  PaletteValue,
  SlotId,
  TypographyValue,
  VoiceValue,
  VisualWorldValue,
} from "../brand-kit-types";

export type StudioSectionRowState = {
  status: "pending" | "running" | "resolved" | "error";
  runningLabel?: string;
  preview?: BrandKitSectionPreview;
};

export type BrandKitStudioIngestFeedback = {
  consolidated: Record<BrandKitIngestSectionId, ConsolidatedRowState>;
  activity: {
    active: boolean;
    statusLine: string | null;
    sections: Record<BrandKitIngestSectionId, StudioSectionRowState>;
    llmSkippedReason?: string;
  } | null;
};

const SLOT_TO_SECTION: Partial<Record<SlotId, BrandKitIngestSectionId>> = {
  palette: "palette",
  logo: "logo",
  typography: "typography",
  voice: "voice",
  essence: "voice",
  visualWorld: "visual",
  gallery: "visual",
};

function slotValue<T>(doc: BrandKitDocument, id: SlotId): T | undefined {
  const slot = doc.slots[id];
  if (!slot?.value || slot.status === "empty" || slot.status === "pending") return undefined;
  return slot.value as T;
}

function previewForSection(doc: BrandKitDocument, section: BrandKitIngestSectionId): BrandKitSectionPreview | undefined {
  if (section === "palette") {
    const palette = slotValue<PaletteValue>(doc, "palette");
    const swatches = palette?.colors?.map((c) => c.hex).filter(Boolean).slice(0, 5) ?? [];
    return swatches.length ? { kind: "palette", swatches } : undefined;
  }
  if (section === "logo") {
    const logo = slotValue<LogoValue>(doc, "logo");
    const imageUrl = logo?.previewUrl ?? logo?.assetId;
    return imageUrl ? { kind: "logo", imageUrl } : undefined;
  }
  if (section === "typography") {
    const typo = slotValue<TypographyValue>(doc, "typography");
    const family = typo?.families?.[0]?.family;
    return family ? { kind: "typography", family, weights: typo.families[0].weights.map(String) } : undefined;
  }
  if (section === "visual") {
    const gallery = slotValue<GalleryValue>(doc, "gallery");
    const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
    const harvested = gallery?.harvested?.filter((h) => h.included !== false).length ?? 0;
    const count = harvested + (visual?.moodTags?.length ? 1 : 0);
    return count > 0 ? { kind: "visual", count } : undefined;
  }
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const traits = voiceTraitsForFace([
    ...(essence?.headline ? [essence.headline] : []),
    ...(voice?.descriptors ?? []),
  ]).slice(0, 3);
  return traits.length ? { kind: "voice", traits } : undefined;
}

function consolidatedStatus(doc: BrandKitDocument, section: BrandKitIngestSectionId): ConsolidatedRowState["status"] {
  const preview = previewForSection(doc, section);
  if (!preview) return "empty";

  const slotIds = (Object.keys(SLOT_TO_SECTION) as SlotId[]).filter((id) => SLOT_TO_SECTION[id] === section);
  const locked = slotIds.some((id) => doc.slots[id]?.locked);
  return locked ? "crowned" : "proposed";
}

export function buildStudioConsolidated(doc: BrandKitDocument): Record<BrandKitIngestSectionId, ConsolidatedRowState> {
  const rows = Object.fromEntries(
    BRAND_KIT_INGEST_SECTION_ORDER.map((id) => {
      const status = consolidatedStatus(doc, id);
      const preview = status === "empty" ? undefined : previewForSection(doc, id);
      return [id, { status, preview }];
    }),
  ) as Record<BrandKitIngestSectionId, ConsolidatedRowState>;
  return rows;
}

function emptyActivitySections(): Record<BrandKitIngestSectionId, StudioSectionRowState> {
  return Object.fromEntries(
    BRAND_KIT_INGEST_SECTION_ORDER.map((id) => [id, { status: "pending" as const }]),
  ) as Record<BrandKitIngestSectionId, StudioSectionRowState>;
}

export function buildStudioIngestFeedback(
  doc: BrandKitDocument,
  options: { isAnalyzing: boolean; crawlProgress: BrandKitCrawlProgressState | null },
): BrandKitStudioIngestFeedback {
  const consolidated = buildStudioConsolidated(doc);

  if (!options.isAnalyzing || !options.crawlProgress) {
    return { consolidated, activity: null };
  }

  const progress = options.crawlProgress;
  const sections = emptyActivitySections();

  for (const sectionId of BRAND_KIT_INGEST_SECTION_ORDER) {
    const slotIds = (Object.keys(SLOT_TO_SECTION) as SlotId[]).filter((id) => SLOT_TO_SECTION[id] === sectionId);
    const isActive = slotIds.some((id) => progress.activeSlot === id);
    const isResolved = slotIds.some((id) => progress.resolvedSlots.has(id));
    const preview = previewForSection(doc, sectionId);

    if (isActive) {
      sections[sectionId] = {
        status: "running",
        runningLabel: progress.message,
        preview,
      };
    } else if (isResolved) {
      sections[sectionId] = { status: "resolved", preview };
    } else if (preview) {
      sections[sectionId] = { status: "resolved", preview };
    }
  }

  return {
    consolidated,
    activity: {
      active: true,
      statusLine: progress.message,
      sections,
      llmSkippedReason: progress.llmStatus === "skipped" ? progress.llmReason : undefined,
    },
  };
}

export function shouldShowStudioConsolidated(feedback: BrandKitStudioIngestFeedback): boolean {
  return BRAND_KIT_INGEST_SECTION_ORDER.some((id) => feedback.consolidated[id].status !== "empty");
}

export const STUDIO_INGEST_SECTION_LABELS: Record<BrandKitIngestSectionId, string> = {
  palette: "paleta",
  logo: "logo",
  typography: "tipografía",
  visual: "universo visual",
  voice: "voz",
};
