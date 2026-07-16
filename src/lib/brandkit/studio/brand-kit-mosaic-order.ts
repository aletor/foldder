import type { SlotId } from "../brand-kit-types";

/**
 * Orden de lectura del mosaico (arriba→abajo, izq→der).
 * B: logo | essence → C: palette → D: typography | voice → E: visual → F: gallery
 */
export const BRAND_KIT_MOSAIC_READING_ORDER: SlotId[] = [
  "logo",
  "essence",
  "palette",
  "typography",
  "voice",
  "visualWorld",
  "gallery",
];

export const BRAND_KIT_BOARD_CHAPTER_NUMBER: Record<SlotId, string> = {
  logo: "01",
  essence: "02",
  palette: "03",
  typography: "04",
  voice: "05",
  visualWorld: "06",
  gallery: "07",
};

export const BRAND_KIT_BOARD_CHAPTER_TITLE: Record<SlotId, string> = {
  logo: "LOGO",
  essence: "ESENCIA",
  palette: "COLOR",
  typography: "TIPOGRAFÍA",
  voice: "VOZ",
  visualWorld: "MUNDO VISUAL",
  gallery: "BIBLIOTECA VISUAL",
};

export function boardChapterNumber(slotId: SlotId): string {
  return BRAND_KIT_BOARD_CHAPTER_NUMBER[slotId];
}

export function boardChapterLabelText(slotId: SlotId): string {
  return `${BRAND_KIT_BOARD_CHAPTER_NUMBER[slotId]} — ${BRAND_KIT_BOARD_CHAPTER_TITLE[slotId]}`;
}
