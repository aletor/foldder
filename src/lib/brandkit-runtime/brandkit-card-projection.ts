import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { stableKnowledgeFileUrlFromMaybeUrl } from "@/lib/s3-media-hydrate";
import { buildBrandBoardView } from "./board-projection";

export const BRANDKIT_BOOK_COMPLETENESS_TOOLTIP_ES =
  "Completitud del libro de estilo: logo, paleta, voz y referencias con evidencia. Las señales ADN analizadas están en Diagnóstico.";

export type BrandKitCardView = {
  completenessPercent: number;
  review: { pending: number; conflicts: number };
  logoUrl: string | null;
  paletteDots: string[];
  toneLine: string | null;
  tagline: string | null;
};

export function buildBrandKitCardView(rawAssets: unknown): BrandKitCardView {
  const board = buildBrandBoardView(rawAssets);
  const paletteDots = board.palette.map((swatch) => swatch.hex).slice(0, 5);
  while (paletteDots.length < 5) paletteDots.push("");

  const toneLine =
    board.voice.toneChips.find((chip) => chip.text.trim())?.text.trim() ??
    board.voice.tagline?.split(/\s+/).slice(0, 5).join(" ") ??
    null;

  const logoUrl =
    stableKnowledgeFileUrlFromMaybeUrl(board.logo.primary.url) ??
    stableKnowledgeFileUrlFromMaybeUrl(board.logo.alt.url);

  return {
    completenessPercent: board.completenessPercent,
    review: board.review,
    logoUrl,
    paletteDots,
    toneLine,
    tagline: board.voice.tagline,
  };
}

export function hasBrandKitCardContent(rawAssets: unknown): boolean {
  const assets = normalizeProjectAssets(rawAssets);
  const card = buildBrandKitCardView(assets);
  if (card.completenessPercent > 0) return true;
  if (card.logoUrl) return true;
  if (card.paletteDots.some((hex) => hex)) return true;
  if (card.toneLine || card.tagline) return true;
  if (assets.knowledge.documents.length + assets.knowledge.urls.length > 0) return true;
  return false;
}
