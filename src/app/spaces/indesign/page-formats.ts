export type IndesignPageFormatId = "a4v" | "a4h" | "web169" | "story916";

export type IndesignPageFormat = {
  id: IndesignPageFormatId;
  label: string;
  width: number;
  height: number;
};

/** Dimensiones en px (96 dpi aprox.) para el lienzo Fabric */
export const INDESIGN_PAGE_FORMATS: IndesignPageFormat[] = [
  { id: "a4v", label: "A4 vertical", width: 595, height: 842 },
  { id: "a4h", label: "A4 horizontal", width: 842, height: 595 },
  { id: "web169", label: "Web 16:9", width: 960, height: 540 },
  { id: "story916", label: "Story 9:16", width: 540, height: 960 },
];

export const INDESIGN_PAD = 48;

export function formatById(id: IndesignPageFormatId): IndesignPageFormat {
  return INDESIGN_PAGE_FORMATS.find((f) => f.id === id) ?? INDESIGN_PAGE_FORMATS[0];
}

const DIM_MIN = 32;
const DIM_MAX = 8192;

/** Dimensiones efectivas de pliego (preset o personalizado). */
export function getPageDimensions(p: {
  format: IndesignPageFormatId;
  customWidth?: number;
  customHeight?: number;
}): { width: number; height: number } {
  const f = formatById(p.format);
  const width = Math.min(DIM_MAX, Math.max(DIM_MIN, Math.round(p.customWidth ?? f.width)));
  const height = Math.min(DIM_MAX, Math.max(DIM_MIN, Math.round(p.customHeight ?? f.height)));
  return { width, height };
}
