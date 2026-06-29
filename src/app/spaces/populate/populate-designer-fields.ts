/**
 * Populate — descubrimiento de campos dinámicos de un Designer (modo `node-clone`).
 *
 * A diferencia de Image Creation (inputs orquestables estáticos y declarados en el registro), los
 * campos dinámicos de un Designer son POR INSTANCIA: dependen de qué objetos marcó el usuario.
 *
 * Cada campo puede estar en dos estados:
 * - `bound` (Modo 1): el objeto ya apunta a una columna concreta (Dataset conectado al Designer).
 * - `pending` (Modo 2): el objeto está marcado como dinámico (con su tipo) pero SIN columna; Populate
 *   debe ofrecer asignarle una columna de SU Dataset.
 */

import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  bindingKind,
  designerSlotKey,
  isPendingDesignerBinding,
  type DesignerDatasetFieldKind,
} from "@/app/spaces/designer/designer-dataset-binding";

export type DesignerDynamicFieldKind = DesignerDatasetFieldKind;

export interface DesignerDynamicField {
  /** Clave de dedup/mapeo: bound → `${listId}::${fieldId}`; pending → `designerSlotKey`. */
  key: string;
  /** Estado del campo: ya enlazado a columna, o pendiente de asignación en Populate. */
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
  /** Nº de objetos que usan este campo (informativo). */
  usageCount: number;
  /** Nombre representativo (primer objeto) para la UI. */
  sampleObjectName?: string;
}

/**
 * Recorre el árbol de objetos en profundidad, incluidos los anidados dentro de `booleanGroup`
 * (children), `groupContainer` (carpetas) y `clippingContainer` (mask + content, el "pegar dentro").
 * Debe ir en sincronía con la resolución congelada (`transformDesignerPageObjectsDeep`), que recorre
 * exactamente igual.
 */
function visitObjects(objects: FreehandObject[] | undefined, visit: (o: FreehandObject) => void): void {
  for (const o of objects ?? []) {
    visit(o);
    if (o.type === "booleanGroup" || o.type === "groupContainer") {
      visitObjects(o.children, visit);
    } else if (o.type === "clippingContainer") {
      visit(o.mask as unknown as FreehandObject);
      visitObjects(o.content, visit);
    }
  }
}

/**
 * Extrae los campos dinámicos de un conjunto de páginas Designer, deduplicados (bound por columna,
 * pending por slot). El orden es estable (primera aparición en el documento).
 */
export function extractDesignerDynamicFields(
  pages: DesignerPageState[] | undefined,
): DesignerDynamicField[] {
  const byKey = new Map<string, DesignerDynamicField>();
  for (const page of pages ?? []) {
    visitObjects(page.objects, (obj) => {
      const binding = obj._designerDatasetBinding;
      if (!binding) return;
      const kind = bindingKind(binding, obj);
      if (!kind) return;

      if (isPendingDesignerBinding(binding)) {
        const key = designerSlotKey(binding);
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
    visitObjects(page.objects, (obj) => {
      if (found) return;
      const binding = obj._designerDatasetBinding;
      if (binding && bindingKind(binding, obj)) found = true;
    });
    if (found) return true;
  }
  return false;
}

/** Solo los campos pendientes de asignar columna (para la UI de mapeo de Populate). */
export function pendingDesignerFields(
  pages: DesignerPageState[] | undefined,
): DesignerDynamicField[] {
  return extractDesignerDynamicFields(pages).filter((f) => f.status === "pending");
}
