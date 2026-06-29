/** Identificadores de color organizativo para carpetas en el panel de capas (solo UI). */
export type FolderPanelColorId = "slate" | "rose" | "sage" | "lavender" | "sand";

export interface FolderPanelColorOption {
  id: FolderPanelColorId;
  label: string;
  /** Tinte de fondo de la fila de la carpeta. */
  rowBg: string;
  /** Borde sutil de la fila de la carpeta. */
  rowBorder: string;
  /** Barra vertical en capas contenidas. */
  stripe: string;
}

/** Cinco presets poco saturados + opción «sin color» en la UI. */
export const FOLDER_PANEL_COLOR_OPTIONS: readonly FolderPanelColorOption[] = [
  {
    id: "slate",
    label: "Pizarra",
    rowBg: "rgba(100, 116, 139, 0.18)",
    rowBorder: "rgba(100, 116, 139, 0.28)",
    stripe: "rgba(148, 163, 184, 0.72)",
  },
  {
    id: "rose",
    label: "Rosa apagado",
    rowBg: "rgba(168, 140, 140, 0.16)",
    rowBorder: "rgba(168, 140, 140, 0.26)",
    stripe: "rgba(180, 150, 150, 0.72)",
  },
  {
    id: "sage",
    label: "Salvia",
    rowBg: "rgba(107, 127, 110, 0.16)",
    rowBorder: "rgba(107, 127, 110, 0.26)",
    stripe: "rgba(134, 155, 137, 0.72)",
  },
  {
    id: "lavender",
    label: "Lavanda",
    rowBg: "rgba(122, 114, 137, 0.16)",
    rowBorder: "rgba(122, 114, 137, 0.26)",
    stripe: "rgba(150, 142, 165, 0.72)",
  },
  {
    id: "sand",
    label: "Arena",
    rowBg: "rgba(138, 130, 120, 0.16)",
    rowBorder: "rgba(138, 130, 120, 0.26)",
    stripe: "rgba(165, 157, 147, 0.72)",
  },
] as const;

const byId = new Map(FOLDER_PANEL_COLOR_OPTIONS.map((o) => [o.id, o]));

export function folderPanelColorOption(id: FolderPanelColorId | null | undefined): FolderPanelColorOption | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

export function folderPanelStripeColor(id: FolderPanelColorId | null | undefined): string | null {
  return folderPanelColorOption(id)?.stripe ?? null;
}
