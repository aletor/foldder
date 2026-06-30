import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  bindingKind,
  isPendingDesignerBinding,
  populatePendingSlotKey,
  type DesignerDatasetFieldKind,
} from "@/app/spaces/designer/designer-dataset-binding";
import {
  type DesignerFolderContext,
  walkDesignerObjectTree,
} from "@/app/spaces/designer/designer-object-tree";

export type DesignerDynamicFieldKind = DesignerDatasetFieldKind;

export interface DesignerDynamicField {
  /** Clave de dedup/mapeo: bound → `${listId}::${fieldId}`; pending → populatePendingSlotKey. */
  key: string;
  /** Estado del campo: ya enlazado a columna, o pendiente de asignación en Loop. */
  status: "bound" | "pending";
  kind: DesignerDynamicFieldKind;
  /** Etiqueta legible para la UI (columna o nombre del hueco). */
  label: string;
  /** Solo `bound`: columna del Dataset enlazada en el propio Designer. */
  listId?: string;
  listKey?: string;
  fieldId?: string;
  fieldKey?: string;
  /** Solo `pending`: etiqueta original del hueco (identidad del slot). */
  slotLabel?: string;
  /** Solo `pending`: id estable del hueco (agrupa texto+imagen aunque cambie el nombre). */
  slotId?: string;
  /** Carpeta contenedora con nombre (`groupContainer`): agrupa fila en Populate. */
  folderLabel?: string;
  folderEntityId?: string;
  /** Nº de objetos que usan este campo (informativo). */
  usageCount: number;
  /** Nombre representativo (primer objeto) para la UI. */
  sampleObjectName?: string;
}

/**
 * Extrae los campos dinámicos de un conjunto de páginas Designer, deduplicados (bound por columna,
 * pending por carpeta+slot+tipo). Orden: primera aparición en el documento.
 */
export function extractDesignerDynamicFields(
  pages: DesignerPageState[] | undefined,
): DesignerDynamicField[] {
  const byKey = new Map<string, DesignerDynamicField>();
  for (const page of pages ?? []) {
    walkDesignerObjectTree(page.objects, (obj, ctx) => {
      const binding = obj._designerDatasetBinding;
      if (!binding) return;
      const kind = bindingKind(binding, obj);
      if (!kind) return;

      if (isPendingDesignerBinding(binding)) {
        const key = populatePendingSlotKey(binding, kind, ctx.folderEntityId);
        if (!key) return;
        const existing = byKey.get(key);
        if (existing) {
          existing.usageCount += 1;
          return;
        }
        byKey.set(key, {
          key,
          status: "pending",
          kind,
          label: binding.slotLabel?.trim() || "Campo",
          slotLabel: binding.slotLabel?.trim() || "Campo",
          slotId: binding.slotId?.trim() || undefined,
          folderLabel: ctx.folderLabel,
          folderEntityId: ctx.folderEntityId,
          usageCount: 1,
          sampleObjectName: obj.name?.trim() || undefined,
        });
        return;
      }

      const key = `${binding.listId}::${binding.fieldId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.usageCount += 1;
        return;
      }
      byKey.set(key, {
        key,
        status: "bound",
        kind,
        label: binding.fieldKey || binding.fieldId,
        listId: binding.listId,
        listKey: binding.listKey,
        fieldId: binding.fieldId,
        fieldKey: binding.fieldKey,
        folderLabel: ctx.folderLabel,
        folderEntityId: ctx.folderEntityId,
        usageCount: 1,
        sampleObjectName: obj.name?.trim() || undefined,
      });
    });
  }
  return Array.from(byKey.values());
}

/** ¿El documento tiene al menos un objeto marcado como dinámico (bound o pending)? */
export function designerHasDynamicFields(pages: DesignerPageState[] | undefined): boolean {
  for (const page of pages ?? []) {
    let found = false;
    walkDesignerObjectTree(page.objects, (obj) => {
      if (found) return;
      const binding = obj._designerDatasetBinding;
      if (binding && bindingKind(binding, obj)) found = true;
    });
    if (found) return true;
  }
  return false;
}

/** Solo los campos pendientes de asignar columna (para la UI de mapeo de Loop). */
export function pendingDesignerFields(
  pages: DesignerPageState[] | undefined,
): DesignerDynamicField[] {
  return extractDesignerDynamicFields(pages).filter((f) => f.status === "pending");
}

export type { DesignerFolderContext };
