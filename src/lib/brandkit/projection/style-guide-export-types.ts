/** Modos de export del libro de estilo BrandKit (alineado con BrandKit B3). */
export type BrandKitStyleGuideExportMode = "operativo" | "cliente";

export const BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS: Record<BrandKitStyleGuideExportMode, string> = {
  operativo: "Borrador (con marcas)",
  cliente: "Versión final",
};

export const BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_HINTS: Record<BrandKitStyleGuideExportMode, string> = {
  operativo: "Incluye propuestas y marcas de estado — alineado con el board en edición.",
  cliente: "Solo bloques confirmados — igual que el modo presentación.",
};

export function resolveBrandKitStyleGuideSoloValidado(mode: BrandKitStyleGuideExportMode): boolean {
  return mode === "cliente";
}
