import type { InterpretationStatus, RefCategory } from "./types";

const REF_CATEGORY_LABELS_ES: Record<RefCategory, string> = {
  people: "Personas",
  textures: "Texturas",
  objects: "Objetos",
  environment: "Entornos",
  protagonist: "Protagonista",
};

const STATUS_LABELS_ES: Record<InterpretationStatus, string> = {
  ghost: "Pendiente de síntesis",
  proposed: "Propuesto",
  validated: "Validado",
  conflict: "Conflicto",
  rejected: "Descartado",
};

const PALETTE_ROLE_LABELS_ES: Record<string, string> = {
  colorPrimary: "Primario",
  colorSecondary: "Secundario",
  colorAccent: "Acento",
};

export function refCategoryLabelEs(category: RefCategory): string {
  return REF_CATEGORY_LABELS_ES[category];
}

export function interpretationStatusLabelEs(status: InterpretationStatus): string {
  return STATUS_LABELS_ES[status];
}

export function paletteRoleLabelEs(id: string): string {
  return PALETTE_ROLE_LABELS_ES[id] ?? id;
}
