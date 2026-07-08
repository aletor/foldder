/** Modos de export del libro de estilo (B3). */
export type StyleGuideExportMode = "operativo" | "cliente";

export type StyleGuideChapterOrigin = "cosechado" | "derivado" | "sintetizado";

export type StyleGuideChapterId =
  | "cover"
  | "identity"
  | "palette"
  | "color-system"
  | "typography"
  | "voice"
  | "visual-references"
  | "logo-usage";

export type StyleGuideChapterMeta = {
  id: StyleGuideChapterId;
  title: string;
  origin: StyleGuideChapterOrigin;
  included: boolean;
};

export const STYLE_GUIDE_EXPORT_MODE_LABELS: Record<StyleGuideExportMode, string> = {
  operativo: "Operativo (equipo)",
  cliente: "Cliente (solo validado)",
};

export function resolveStyleGuideSoloValidado(exportMode: StyleGuideExportMode): boolean {
  return exportMode === "cliente";
}
