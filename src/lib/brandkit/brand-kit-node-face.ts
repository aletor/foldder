import type { BrandKitDocument, GalleryValue, PaletteValue, TypographyValue } from "./brand-kit-types";
import { buildFontStack, normalizeFontDisplayName } from "./normalize-font-display-name";

export type BrandKitNodeFaceTypeSpecimen = {
  familyName: string;
  fontFamily: string;
  fontWeight: number;
  source: TypographyValue["families"][number]["source"];
};

/** Columnas para que N swatches formen una rejilla compacta de cuadrados. */
export function brandKitFaceSwatchColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  if (count <= 12) return 4;
  return Math.min(5, Math.ceil(Math.sqrt(count)));
}

export function extractPrimaryPaletteHex(doc: BrandKitDocument | undefined): string | null {
  const palette = doc?.slots.palette?.value as PaletteValue | undefined;
  if (!palette?.colors?.length) return null;
  const primary = palette.colors.find((color) => color.role === "primary");
  const hex = (primary?.hex ?? palette.colors[0]?.hex)?.trim().toUpperCase();
  return hex || null;
}

/**
 * Hasta 4 previews de la primera generación de galería (snapshot congelado).
 * Vacío si aún no hay generación — la franja del nodo no se reserva.
 */
export function extractNodeFaceGalleryStripUrls(doc: BrandKitDocument | undefined): string[] {
  const gallery = doc?.slots.gallery?.value as GalleryValue | undefined;
  const frozen = gallery?.nodeFaceStripUrls?.map((url) => url.trim()).filter(Boolean) ?? [];
  if (frozen.length) return frozen.slice(0, 4);
  // Docs antiguos sin snapshot: primeras 4 con URL (se congelarán en la próxima generación).
  return (gallery?.generated ?? [])
    .map((item) => item.previewUrl?.trim())
    .filter((url): url is string => Boolean(url))
    .slice(0, 4);
}

/** Tipografía principal (display/heading) para la cara del nodo. */
export function extractPrimaryTypeSpecimen(
  doc: BrandKitDocument | undefined,
): BrandKitNodeFaceTypeSpecimen | null {
  const typography = doc?.slots.typography?.value as TypographyValue | undefined;
  const families = typography?.families ?? [];
  if (!families.length) return null;
  const primary =
    families.find((family) => family.role === "heading" || family.role === "display") ?? families[0];
  if (!primary?.family?.trim()) return null;
  const familyName = normalizeFontDisplayName(primary.family) ?? primary.family.trim();
  const weights = [...(primary.weights ?? [])].sort((a, b) => a - b);
  const fontWeight = weights.includes(700)
    ? 700
    : weights[weights.length - 1] ?? 700;
  return {
    familyName,
    fontFamily: buildFontStack(familyName, primary.fallbacks ?? ["sans-serif"]),
    fontWeight,
    source: primary.source,
  };
}
