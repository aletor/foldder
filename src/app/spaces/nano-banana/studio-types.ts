export const STUDIO_CHANGE_PALETTE = [
  { name: "azul", hex: "#1D4ED8" },
  { name: "rojo", hex: "#DC2626" },
  { name: "verde", hex: "#16A34A" },
  { name: "naranja", hex: "#EA580C" },
  { name: "amarillo", hex: "#CA8A04" },
  { name: "violeta", hex: "#7C3AED" },
  { name: "marrón", hex: "#92400E" },
  { name: "blanco", hex: "#F9FAFB" },
  { name: "negro", hex: "#111827" },
] as const;

export const STUDIO_MAX_REFS_PER_CARD = 4;
export const STUDIO_MAX_GRID_CELLS = 16;
/** Same alpha gate as today's color-map / marked-base / spatial scan. */
export const STUDIO_PAINT_ALPHA_THRESHOLD = 30;

export type StudioPoint = { x: number; y: number };

export type StudioPaletteColor = (typeof STUDIO_CHANGE_PALETTE)[number];

export type StudioCard = {
  assignedColor: StudioPaletteColor;
  description: string;
  id: string;
  lassoPoints: StudioPoint[];
  paintData: string | null;
  references: string[];
};

export type StudioGlobal = {
  promptDraft: string;
  schemaData: string | null;
  text: string;
};

export type StudioHistoryBrief = {
  baseUrl: string | null;
  cards: StudioCard[];
  global: StudioGlobal;
  outputUrl: string;
};

export function paletteColorForCardIndex(index: number): StudioPaletteColor {
  return STUDIO_CHANGE_PALETTE[index % STUDIO_CHANGE_PALETTE.length]!;
}

export function emptyStudioGlobal(): StudioGlobal {
  return { promptDraft: "", schemaData: null, text: "" };
}

export function createStudioCard(index: number): StudioCard {
  return {
    assignedColor: paletteColorForCardIndex(index),
    description: "",
    id: `card_${Date.now()}_${index}`,
    lassoPoints: [],
    paintData: null,
    references: [],
  };
}

export function studioGridCellId(cardIndex1: number, refIndex0: number): string {
  const letter = String.fromCharCode(65 + refIndex0);
  return `${cardIndex1}${letter}`;
}

export function cardHasZonePaint(card: StudioCard): boolean {
  return Boolean(card.paintData);
}

export function cardIsSendable(card: StudioCard): boolean {
  return Boolean(card.description.trim() || card.references.length > 0);
}

export function globalIsSendable(global: StudioGlobal): boolean {
  return Boolean(global.text.trim() || global.schemaData);
}

export function cardHasStartedChange(card: StudioCard): boolean {
  return Boolean(
    card.description.trim() || card.references.length > 0 || card.lassoPoints.length > 2 || card.paintData,
  );
}
