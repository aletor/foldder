import type { Candidate, LogoValue } from "./genoma-types";
import { buildHeuristicLogoCandidatesFromPage } from "./ingest/ingest-logo-heuristic";

export { rankBrandBoardLogoRegions, scoreBrandBoardLogoRegion } from "./genoma-brand-board-logo-regions";

export async function buildBrandBoardLogoFallbackCandidates(input: {
  pngBuffer: Buffer;
  width: number;
  height: number;
  fileName: string;
  contentSha256: string;
  userEmail: string;
  limit?: number;
}): Promise<Candidate<LogoValue>[]> {
  return buildHeuristicLogoCandidatesFromPage({
    pagePng: input.pngBuffer,
    pageWidth: input.width,
    pageHeight: input.height,
    fileName: input.fileName,
    contentSha256: input.contentSha256,
    userEmail: input.userEmail,
    sourcePageNumber: 1,
    totalDocPages: 1,
    limit: input.limit ?? 2,
  });
}
