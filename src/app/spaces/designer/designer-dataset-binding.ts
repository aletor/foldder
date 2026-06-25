/**
 * Helpers compartidos del enlace dinámico de Designer (`_designerDatasetBinding`).
 *
 * Soporta los dos estados del binding:
 * - RESUELTO (Modo 1): tiene `listId` + `fieldId` (columna real del Dataset conectado al Designer).
 * - PENDIENTE (Modo 2): marcado como dinámico con `kind` + `slotLabel`, sin columna. Populate le
 *   asignará una columna de SU Dataset y, al congelar, se rellenará el hueco.
 */

import type { FreehandObject } from "../FreehandStudio";
import type { DesignerDatasetFieldBinding } from "@/app/spaces/dataset/dataset-types";

export type DesignerDatasetFieldKind = "text" | "image";

/** Tipo lógico que un objeto puede enlazar al Dataset (o null si no es enlazable). */
export function datasetFieldKindForObject(
  obj: Pick<FreehandObject, "type"> & { isImageFrame?: boolean },
): DesignerDatasetFieldKind | null {
  if (obj.type === "text" || obj.type === "textOnPath") return "text";
  if (obj.type === "image") return "image";
  if (obj.type === "rect" && obj.isImageFrame) return "image";
  return null;
}

/** ¿El binding está PENDIENTE (marcado como dinámico pero sin columna asignada)? */
export function isPendingDesignerBinding(
  binding: DesignerDatasetFieldBinding | undefined | null,
): boolean {
  if (!binding) return false;
  return !binding.fieldId || !binding.listId;
}

/** Tipo efectivo del hueco: el del binding (PENDIENTE) o inferido del objeto. */
export function bindingKind(
  binding: DesignerDatasetFieldBinding | undefined | null,
  obj?: Pick<FreehandObject, "type"> & { isImageFrame?: boolean },
): DesignerDatasetFieldKind | null {
  if (binding?.kind) return binding.kind;
  return obj ? datasetFieldKindForObject(obj) : null;
}

/**
 * Identidad del hueco para el mapeo en Populate (estilo token de prompt): se agrupan los objetos
 * con la misma `slotLabel` normalizada. Devuelve "" si no hay etiqueta utilizable.
 */
export function designerSlotKey(binding: DesignerDatasetFieldBinding | undefined | null): string {
  const label = (binding?.slotLabel ?? "").trim().toLowerCase();
  return label ? `slot::${label}` : "";
}

/** Crea un binding PENDIENTE (Modo 2) con su tipo y etiqueta. */
export function makePendingDesignerBinding(
  kind: DesignerDatasetFieldKind,
  slotLabel: string,
): DesignerDatasetFieldBinding {
  return { listId: "", listKey: "", fieldId: "", fieldKey: "", kind, slotLabel };
}
