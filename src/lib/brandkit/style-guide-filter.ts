import type { InterpretationMeta } from "./types";

/** Libro default: validated + proposed. Ghost y conflict quedan fuera. */
export function shouldIncludeInStyleGuide(meta: InterpretationMeta, soloValidado: boolean): boolean {
  if (meta.status === "ghost" || meta.status === "conflict") return false;
  if (soloValidado) return meta.status === "validated";
  return meta.status === "validated" || meta.status === "proposed";
}

export function styleGuideStatusLabel(meta: InterpretationMeta): string {
  if (meta.status === "validated") return "Validado";
  if (meta.status === "proposed") return "Propuesto";
  if (meta.status === "conflict") return "Conflicto";
  if (meta.status === "rejected") return "Descartado";
  return "Pendiente";
}
