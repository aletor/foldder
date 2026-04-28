import type { VisualDnaLayer, VisualDnaSlot } from "./types";

export type VisualDnaSlotRuntimeSummary = {
  id: string;
  label: string;
  status: VisualDnaSlot["status"];
  sourceDocumentId?: string;
  hasMosaic: boolean;
  dominantColors: string[];
  confidence?: number;
  updatedAt?: string;
};

export function summarizeVisualDnaSlots(slots: VisualDnaSlot[] | undefined): VisualDnaSlotRuntimeSummary[] {
  if (!slots?.length) return [];
  return slots.map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    sourceDocumentId: s.sourceDocumentId,
    hasMosaic: Boolean(s.mosaic?.imageUrl?.trim()),
    dominantColors: s.palette.dominantColors.slice(0, 6),
    confidence: s.confidence,
    updatedAt: s.updatedAt,
  }));
}

function pickLayerText(slot: VisualDnaSlot, layer: VisualDnaLayer): Record<string, unknown> {
  switch (layer) {
    case "palette":
      return {
        layer: "palette",
        dominantColors: slot.palette.dominantColors,
        colorNotes: slot.palette.colorNotes,
      };
    case "people":
      return { layer: "people", people: slot.people, notes: slot.people.notes };
    case "objects":
      return { layer: "objects", objects: slot.objects, notes: slot.objects.notes };
    case "environments":
      return { layer: "environments", environments: slot.environments, notes: slot.environments.notes };
    case "textures":
      return { layer: "textures", textures: slot.textures, notes: slot.textures.notes };
    case "general":
    default:
      return {
        layer: "general",
        hero: slot.hero,
        generalStyle: slot.generalStyle,
        conclusion: slot.hero.conclusion ?? slot.generalStyle.summary,
      };
  }
}

/**
 * Recorte del slot para runtime según capa (Designer / generadores futuros).
 */
export function buildSelectedVisualDnaSlotRuntimeView(
  slot: VisualDnaSlot | undefined,
  layer: VisualDnaLayer | undefined,
): Record<string, unknown> | undefined {
  if (!slot) return undefined;
  if (!layer || layer === "general") {
    return {
      slotId: slot.id,
      label: slot.label,
      ...pickLayerText(slot, "general"),
      safeGenerationRules: slot.generalStyle.safeGenerationRules,
      mosaicAvailable: Boolean(slot.mosaic?.imageUrl),
    };
  }
  return {
    slotId: slot.id,
    label: slot.label,
    ...pickLayerText(slot, layer),
    mosaicAvailable: Boolean(slot.mosaic?.imageUrl),
  };
}
