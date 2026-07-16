import type { SlotId } from "@/lib/brandkit/brand-kit-types";
import {
  BRAND_KIT_MOSAIC_READING_ORDER,
  boardChapterLabelText,
  boardChapterNumber as chapterNumber,
  BRAND_KIT_BOARD_CHAPTER_NUMBER,
} from "@/lib/brandkit/studio/brand-kit-mosaic-order";

/** Orden canónico de capítulos = orden de lectura del mosaico. */
export const BRAND_KIT_BOARD_CHAPTER_ORDER: SlotId[] = [...BRAND_KIT_MOSAIC_READING_ORDER];

export { BRAND_KIT_BOARD_CHAPTER_NUMBER };

export const BRAND_KIT_BOARD_CHAPTER_LABEL: Record<SlotId, string> = {
  logo: boardChapterLabelText("logo"),
  essence: boardChapterLabelText("essence"),
  palette: boardChapterLabelText("palette"),
  typography: boardChapterLabelText("typography"),
  voice: boardChapterLabelText("voice"),
  visualWorld: boardChapterLabelText("visualWorld"),
  gallery: boardChapterLabelText("gallery"),
};

export function boardChapterLabel(slotId: SlotId | undefined): string | null {
  if (!slotId) return null;
  return BRAND_KIT_BOARD_CHAPTER_LABEL[slotId] ?? null;
}

export function boardChapterNumber(slotId: SlotId | undefined): string | null {
  if (!slotId) return null;
  return chapterNumber(slotId);
}
