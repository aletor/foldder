import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { isLikelyBrandManualPdf } from "./genoma-pdf-brand-manual-detect";
import {
  buildDeckPdfHeuristicsFromMetadata,
  isLikelyDeckPdfFromHeuristics,
  type DeckPdfHeuristics,
} from "./genoma-pdf-deck-detect";

export type { DeckPdfHeuristics } from "./genoma-pdf-deck-detect";
export { isLikelyDeckPdfFromHeuristics } from "./genoma-pdf-deck-detect";

export async function analyzeDeckPdfHeuristics(
  buffer: Buffer,
  fileName: string,
  textSample = "",
): Promise<DeckPdfHeuristics> {
  const pageCount = await countPdfPagesInBuffer(buffer, 200).catch(() => 0);
  return buildDeckPdfHeuristicsFromMetadata(pageCount, fileName, textSample);
}

export async function isLikelyDeckPdf(
  buffer: Buffer,
  fileName: string,
  textSample = "",
): Promise<boolean> {
  if (isLikelyBrandManualPdf(fileName, textSample)) return false;
  const h = await analyzeDeckPdfHeuristics(buffer, fileName, textSample);
  return isLikelyDeckPdfFromHeuristics(h);
}
