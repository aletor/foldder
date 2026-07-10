import type { GenomaIngestFileKind } from "./ingest/triage";

/** Nombres típicos de plancheta / moodboard / brand board. */
export const BRAND_BOARD_FILENAME_RE =
  /(?:brand[-_\s]?(?:board|guide|guidelines|identity|kit|style|styleguide|book|collage|system|systems|manual|frame|planche|plancheta|planchettes)|mood[-_\s]?board|identity[-_\s]?board|style[-_\s]?frame|brandbook|brand[-_\s]?book)/i;

export type BrandBoardImageSignals = {
  width: number;
  height: number;
  area: number;
  textPresenceScore: number;
  visualDensityScore: number;
};

export function isBrandBoardFilename(name: string): boolean {
  return BRAND_BOARD_FILENAME_RE.test(name.trim());
}

/** Heurística visual para collages / planchetas sin nombre explícito. */
export function isLikelyBrandBoardImage(
  fileName: string,
  signals: BrandBoardImageSignals,
): boolean {
  if (isBrandBoardFilename(fileName)) return true;

  const { area, textPresenceScore, visualDensityScore, width, height } = signals;
  if (area < 280_000) return false;

  const longEdge = Math.max(width, height);
  const collageLike =
    textPresenceScore >= 0.3 &&
    visualDensityScore >= 0.42 &&
    longEdge >= 720;

  const largeReference = area >= 650_000 && textPresenceScore >= 0.24 && longEdge >= 900;

  return collageLike || largeReference;
}

export function triageImageKind(fileName: string): Extract<GenomaIngestFileKind, "brand_board_image" | "logo_image" | "gallery_image"> {
  if (isBrandBoardFilename(fileName)) return "brand_board_image";
  if (/logo|marca|icon|favicon/i.test(fileName) && !/brand[-_\s]?(board|guide|guidelines|identity|kit|style|manual|book|collage|system|systems|frame|planche)/i.test(fileName)) {
    return "logo_image";
  }
  if (/^brand[-_\s]?logo/i.test(fileName)) return "logo_image";
  return "gallery_image";
}
