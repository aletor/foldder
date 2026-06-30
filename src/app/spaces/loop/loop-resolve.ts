/**
 * Loop — resolución de inputs por fila.
 *
 * Dada la plantilla (prompt con tokens + bindings de imagen) y una fila del
 * Dataset, produce los valores ya resueltos que se "estampan" en cada nodo
 * generado. El pipeline de generación no cambia: solo cambia de dónde sale el
 * valor de cada input.
 */

import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  fieldValueAsText,
  getConstantFieldValue,
  getListFieldImageAtRow,
  getListFieldValueAtRow,
} from "@/app/spaces/dataset/dataset-logic";
import { substitutePromptTokens } from "./loop-tokens";
import type { LoopBindings, LoopInputBinding } from "./loop-types";

/**
 * Resuelve el prompt de una fila: sustituye `{fieldKey}` por el valor de la fila
 * en el listado indicado; si la clave no está en el listado, prueba en constantes.
 *
 * `manualValues` (opcional): tokens marcados como "manuales" en Loop. Tienen
 * MÁXIMA prioridad y son constantes para todas las filas (se rellenan una vez en
 * "Rellenar antes de generar"). Un valor manual vacío se ignora (cae a columna/constante).
 */
export function resolvePromptForRow(
  template: string,
  dataset: Dataset,
  listId: string,
  rowIndex: number,
  manualValues?: Record<string, string>,
): string {
  const list = dataset.lists.find((row) => row.id === listId) ?? null;
  return substitutePromptTokens(template, (fieldKey) => {
    if (manualValues) {
      const manual = manualValues[fieldKey];
      if (typeof manual === "string" && manual.trim() !== "") return manual;
    }
    if (list) {
      const field = list.schema.find((f) => f.key === fieldKey);
      if (field) {
        const value = getListFieldValueAtRow(dataset, listId, field.id, rowIndex);
        return fieldValueAsText(value ?? undefined);
      }
    }
    const constField = dataset.constants.fields.find((f) => f.key === fieldKey);
    if (constField) {
      return fieldValueAsText(getConstantFieldValue(dataset, constField.id) ?? undefined);
    }
    return null;
  });
}

/**
 * Resuelve la URL de una imagen para un input enlazado a columna en una fila.
 * Devuelve null si el binding no es de columna o no hay imagen.
 */
export function resolveImageBindingForRow(
  binding: LoopInputBinding | undefined,
  dataset: Dataset,
  rowIndex: number,
): string | null {
  if (!binding || binding.source !== "column" || !binding.listId || !binding.fieldId) {
    return null;
  }
  const image = getListFieldImageAtRow(dataset, binding.listId, binding.fieldId, rowIndex);
  const url = image?.url?.trim();
  return url ? url : null;
}

/**
 * Resuelve todas las imágenes mapeadas a columna para una fila.
 * Devuelve un mapa inputId → url (solo inputs con binding de columna válido).
 */
export function resolveColumnImageInputsForRow(
  bindings: LoopBindings | undefined,
  dataset: Dataset,
  rowIndex: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!bindings) return out;
  for (const binding of Object.values(bindings)) {
    if (binding.source !== "column") continue;
    const url = resolveImageBindingForRow(binding, dataset, rowIndex);
    if (url) out[binding.inputId] = url;
  }
  return out;
}

/** ¿Hay algún binding de columna activo? (define si el nodo es orquestable por fila) */
export function hasColumnBindings(bindings: LoopBindings | undefined): boolean {
  if (!bindings) return false;
  return Object.values(bindings).some((b) => b.source === "column" && !!b.fieldId);
}
