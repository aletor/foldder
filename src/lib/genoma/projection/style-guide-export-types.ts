/** Modos de export del libro de estilo Genoma (alineado con BrandKit B3). */
export type GenomaStyleGuideExportMode = "operativo" | "cliente";

export const GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS: Record<GenomaStyleGuideExportMode, string> = {
  operativo: "Operativo (equipo)",
  cliente: "Cliente (solo coronado)",
};

export function resolveGenomaStyleGuideSoloValidado(mode: GenomaStyleGuideExportMode): boolean {
  return mode === "cliente";
}
