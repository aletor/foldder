/**
 * Helpers compartidos del enlace dinámico de Designer (`_designerDatasetBinding`).
 *
 * Soporta los dos estados del binding:
 * - RESUELTO (Modo 1): tiene `listId` + `fieldId` (columna real del Dataset conectado al Designer).
 * - PENDIENTE (Modo 2): marcado como dinámico con `kind` + `slotLabel`, sin columna. Loop le
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

export function newDesignerSlotId(): string {
  return `slot_${Math.random().toString(36).slice(2, 10)}`;
}

/** Identidad estable de entidad (Populate/Loop): el nombre del campo agrupa texto e imagen. */
export function designerEntityId(binding: DesignerDatasetFieldBinding | undefined | null): string {
  const label = (binding?.slotLabel ?? "").trim().toLowerCase();
  if (label) return label;
  if (binding?.slotId?.trim()) return binding.slotId.trim();
  return "campo";
}

/**
 * Clave del hueco para mapeo en Loop/Populate (estilo token).
 * Mismo `slotLabel` → misma entidad; el tipo (texto/imagen) va en el sufijo `::kind`.
 */
export function designerSlotKey(binding: DesignerDatasetFieldBinding | undefined | null): string {
  const label = (binding?.slotLabel ?? "").trim().toLowerCase();
  if (label) return `slot::${label}`;
  if (binding?.slotId?.trim()) return `slot::${binding.slotId.trim()}`;
  return "";
}

/** Nombre de carpeta (groupContainer) → id de entidad Populate (fila compartida). */
export function normalizeDesignerFolderEntityId(name: string | undefined | null): string {
  const t = (name ?? "").trim().toLowerCase();
  return t || "carpeta";
}

/**
 * Clave de hueco pendiente para Populate/Loop.
 * Con carpeta: `folder::jugador1::slot::nombre::text`; sin carpeta: `slot::jugador::text`.
 */
export function populatePendingSlotKey(
  binding: DesignerDatasetFieldBinding,
  kind: DesignerDatasetFieldKind,
  folderEntityId?: string | null,
): string {
  const slot = designerSlotKey(binding);
  if (!slot) return "";
  const base = `${slot}::${kind}`;
  const fid = folderEntityId?.trim();
  if (fid) return `folder::${fid}::${base}`;
  return base;
}

/** Crea un binding PENDIENTE (Modo 2) con su tipo, etiqueta e id estable. */
export function makePendingDesignerBinding(
  kind: DesignerDatasetFieldKind,
  slotLabel: string,
  slotId?: string,
): DesignerDatasetFieldBinding {
  return {
    listId: "",
    listKey: "",
    fieldId: "",
    fieldKey: "",
    kind,
    slotLabel,
    slotId: slotId?.trim() || newDesignerSlotId(),
  };
}

/** Asegura que un binding pendiente tenga `slotId` (migración in-memory de documentos legacy). */
export function ensureDesignerSlotId(
  binding: DesignerDatasetFieldBinding,
): DesignerDatasetFieldBinding {
  if (binding.slotId?.trim()) return binding;
  if (!isPendingDesignerBinding(binding)) return binding;
  return { ...binding, slotId: newDesignerSlotId() };
}
