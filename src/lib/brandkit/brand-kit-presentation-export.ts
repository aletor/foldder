import type { BrandKitDocument, SlotId } from "./brand-kit-types";
import { BRAND_KIT_SLOT_IDS, BRAND_KIT_SLOT_LABELS } from "./brand-kit-types";
import { buildBrandKitShowcaseData } from "@/app/spaces/brandKit/board-v2/showcase/brand-kit-showcase-data";
import { showcaseRequirementsMet } from "./brand-kit-showcase-requirements";
import { stationeryRequirementsMet, buildBrandKitStationeryView } from "./brand-kit-stationery";
import type { BrandKitStyleGuideExportMode } from "./projection/style-guide-export-types";
import { resolveBrandKitStyleGuideSoloValidado } from "./projection/style-guide-export-types";

export type StyleGuideChapterId =
  | "cover"
  | "index"
  | "logo"
  | "palette"
  | "typography"
  | "voice"
  | "visual"
  | "gallery"
  | "applications"
  | "stationery"
  | "closing"
  | "sources";

export type StyleGuideChapterMeta = {
  id: StyleGuideChapterId;
  title: string;
  pageHint?: string;
  included: boolean;
};

function slotHasContent(doc: BrandKitDocument, slotId: SlotId): boolean {
  const slot = doc.slots[slotId];
  if (!slot) return false;
  if (slot.value) return true;
  return slot.status !== "empty" && slot.status !== "pending";
}

function slotIncludedInFinal(doc: BrandKitDocument, slotId: SlotId): boolean {
  const slot = doc.slots[slotId];
  return Boolean(slot?.locked && slot.value);
}

export function countUnlockedSlotsWithContent(doc: BrandKitDocument): number {
  return BRAND_KIT_SLOT_IDS.filter((id) => slotHasContent(doc, id) && !doc.slots[id]?.locked).length;
}

export function unlockedSlotLabels(doc: BrandKitDocument): string[] {
  return BRAND_KIT_SLOT_IDS.filter((id) => slotHasContent(doc, id) && !doc.slots[id]?.locked).map(
    (id) => BRAND_KIT_SLOT_LABELS[id] ?? id,
  );
}

export function buildStyleGuideChapterPlan(
  doc: BrandKitDocument,
  soloValidado: boolean,
): StyleGuideChapterMeta[] {
  const slotIncluded = (slotId: SlotId) => (soloValidado ? slotIncludedInFinal(doc, slotId) : slotHasContent(doc, slotId));

  const showcase = buildBrandKitShowcaseData(doc, soloValidado);
  const applicationsIncluded =
    Boolean(showcase) && (soloValidado ? showcaseRequirementsMet(showcase.requirements) : true);
  const stationeryIncluded =
    Boolean(showcase) &&
    (soloValidado ? stationeryRequirementsMet(doc, true) : stationeryRequirementsMet(doc, false));
  const stationeryView =
    showcase && stationeryIncluded
      ? buildBrandKitStationeryView(doc, {
          brandName: showcase.brandName,
          monogram: showcase.monogram,
          logoUrl: showcase.logoUrl,
          tagline: showcase.tagline,
          contactEmail: showcase.contactEmail,
        })
      : null;

  const chapters: StyleGuideChapterMeta[] = [
    { id: "cover", title: "Portada", included: true },
    { id: "index", title: "Índice", included: true },
    { id: "logo", title: "Logo", included: slotIncluded("logo") },
    { id: "palette", title: "Paleta", included: slotIncluded("palette") },
    { id: "typography", title: "Tipografía", included: slotIncluded("typography") },
    {
      id: "voice",
      title: "Voz y esencia",
      included: slotIncluded("voice") || slotIncluded("essence"),
    },
    {
      id: "visual",
      title: "Dirección visual",
      included: slotIncluded("visualWorld"),
    },
    { id: "gallery", title: "Biblioteca visual", included: slotIncluded("gallery") },
    {
      id: "applications",
      title: "Aplicaciones de marca",
      included: applicationsIncluded,
    },
    {
      id: "stationery",
      title: "Papelería",
      included: Boolean(stationeryView) && stationeryIncluded,
    },
    { id: "closing", title: "Cierre", included: true },
    { id: "sources", title: "Apéndice · Fuentes", included: !soloValidado && doc.sources.length > 0 },
  ];

  return chapters;
}

export function includedStyleGuideChapters(plan: StyleGuideChapterMeta[]): StyleGuideChapterMeta[] {
  return plan.filter((chapter) => chapter.included && chapter.id !== "cover");
}

export type FinalStyleGuideExportPreflight = {
  unlockedCount: number;
  unlockedLabels: string[];
  shouldWarn: boolean;
  message: string;
};

export function evaluateFinalStyleGuideExport(doc: BrandKitDocument): FinalStyleGuideExportPreflight {
  const unlockedLabels = unlockedSlotLabels(doc);
  const unlockedCount = unlockedLabels.length;
  const shouldWarn = unlockedCount > 0;
  const message = shouldWarn
    ? `La versión final solo incluye bloques confirmados. Aún hay ${unlockedCount} bloque(s) sin confirmar: ${unlockedLabels.join(", ")}.\n\n¿Exportar igualmente?`
    : "";

  return { unlockedCount, unlockedLabels, shouldWarn, message };
}

export function resolvePresentationAlignedExport(
  exportMode: BrandKitStyleGuideExportMode,
): { soloValidado: boolean; modeLabel: string } {
  const soloValidado = resolveBrandKitStyleGuideSoloValidado(exportMode);
  return {
    soloValidado,
    modeLabel: soloValidado ? "versión final" : "borrador",
  };
}
