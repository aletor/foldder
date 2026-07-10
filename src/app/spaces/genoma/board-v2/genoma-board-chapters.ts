import type { SlotId } from "@/lib/genoma/genoma-types";

/** Orden canónico de capítulos del libro de estilo (independiente del layout bento). */
export const GENOMA_BOARD_CHAPTER_ORDER: SlotId[] = [
  "logo",
  "palette",
  "typography",
  "essence",
  "voice",
  "visualWorld",
  "gallery",
];

export const GENOMA_BOARD_CHAPTER_LABEL: Record<SlotId, string> = {
  logo: "01 — LOGO",
  palette: "02 — COLOR",
  typography: "03 — TIPOGRAFÍA",
  essence: "04 — ESENCIA",
  voice: "05 — VOZ",
  visualWorld: "06 — MUNDO VISUAL",
  gallery: "07 — GALERÍA",
};

export function boardChapterLabel(slotId: SlotId | undefined): string | null {
  if (!slotId) return null;
  return GENOMA_BOARD_CHAPTER_LABEL[slotId] ?? null;
}
