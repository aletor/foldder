/** Heurísticas deck PDF — sin dependencias Node (seguro en cliente). */

export const DECK_PDF_NAME_RE = /deck|pitch|investor|presentaci[oó]n|slides|one-?pager|dossier/i;
export const DECK_PDF_HEX_IN_TEXT_RE = /#([0-9a-fA-F]{6})\b/;

export type DeckPdfHeuristics = {
  pageCount: number;
  nameLooksLikeDeck: boolean;
  fewHexColorsInText: boolean;
};

export function deckPdfNameLooksLikeDeck(fileName: string): boolean {
  return DECK_PDF_NAME_RE.test(fileName);
}

export function deckPdfFewHexColorsInText(textSample: string): boolean {
  const hexMatches = textSample.match(DECK_PDF_HEX_IN_TEXT_RE) ?? [];
  return hexMatches.length < 2;
}

export function buildDeckPdfHeuristicsFromMetadata(
  pageCount: number,
  fileName: string,
  textSample = "",
): DeckPdfHeuristics {
  return {
    pageCount,
    nameLooksLikeDeck: deckPdfNameLooksLikeDeck(fileName),
    fewHexColorsInText: deckPdfFewHexColorsInText(textSample),
  };
}

/** Misma regla que `isLikelyDeckPdf` sin leer el buffer (preflight con metadatos). */
export function isLikelyDeckPdfFromHeuristics(h: DeckPdfHeuristics): boolean {
  if (h.nameLooksLikeDeck) return true;
  if (h.pageCount >= 6) return true;
  if (h.pageCount >= 3 && h.fewHexColorsInText) return true;
  return false;
}
