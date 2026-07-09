import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";

const DECK_NAME_RE = /deck|pitch|investor|presentaci[oó]n|slides|one-?pager|dossier/i;
const HEX_IN_TEXT_RE = /#([0-9a-fA-F]{6})\b/;

export type DeckPdfHeuristics = {
  pageCount: number;
  nameLooksLikeDeck: boolean;
  fewHexColorsInText: boolean;
};

export async function analyzeDeckPdfHeuristics(
  buffer: Buffer,
  fileName: string,
  textSample = "",
): Promise<DeckPdfHeuristics> {
  const pageCount = await countPdfPagesInBuffer(buffer, 200).catch(() => 0);
  const nameLooksLikeDeck = DECK_NAME_RE.test(fileName);
  const hexMatches = textSample.match(HEX_IN_TEXT_RE) ?? [];
  const fewHexColorsInText = hexMatches.length < 2;
  return { pageCount, nameLooksLikeDeck, fewHexColorsInText };
}

export async function isLikelyDeckPdf(
  buffer: Buffer,
  fileName: string,
  textSample = "",
): Promise<boolean> {
  const h = await analyzeDeckPdfHeuristics(buffer, fileName, textSample);
  if (h.nameLooksLikeDeck) return true;
  if (h.pageCount >= 6) return true;
  if (h.pageCount >= 3 && h.fewHexColorsInText) return true;
  return false;
}
