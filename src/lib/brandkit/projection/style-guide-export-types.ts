/** Modos de export del libro de estilo BrandKit (alineado con BrandKit B3). */
export type BrandKitStyleGuideExportMode = "operativo" | "cliente";

export const BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS: Record<BrandKitStyleGuideExportMode, string> = {
  operativo: "Operativo (equipo)",
  cliente: "Cliente (solo confirmado)",
};

export function resolveBrandKitStyleGuideSoloValidado(mode: BrandKitStyleGuideExportMode): boolean {
  return mode === "cliente";
}
