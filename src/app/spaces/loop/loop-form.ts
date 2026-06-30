/**
 * Loop — modo FORMULARIO (relleno manual, un resultado al instante).
 *
 * El formulario NO se diseña: se deriva de las variables ya mapeadas en la
 * plantilla (tokens del prompt + referencias de imagen ligadas a columnas).
 * Si la plantilla tiene tres variables, el formulario tiene tres campos.
 *
 * Cada campo puede rellenarse a mano (texto libre) o elegirse del Dataset
 * (sugerencias de la columna / fila con su imagen asociada). Lo persistente sale
 * del Dataset como selector; lo efímero se teclea.
 */

import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  fieldValueAsText,
  getConstantFieldValue,
  getListFieldImageAtRow,
  getListFieldTextAtRow,
  getListFieldValueAtRow,
} from "@/app/spaces/dataset/dataset-logic";
import { extractPromptTokens, substitutePromptTokens } from "./loop-tokens";
import type { CreativeInputDescriptor, LoopBindings } from "./loop-types";
import { datasetListRowLabel } from "./loop-row-label";

export interface LoopFormTextField {
  kind: "text" | "constant";
  /** Clave del token (= key de la columna/constante). */
  fieldKey: string;
  label: string;
  /** Valor de la constante (solo kind=constant). */
  constantValue?: string;
  /** Sugerencias (valores distintos de la columna) para kind=text. */
  suggestions: string[];
}

export interface LoopFormImageOption {
  rowIndex: number;
  label: string;
  url: string;
}

export interface LoopFormImageField {
  inputId: string;
  label: string;
  listId: string;
  fieldId: string;
  options: LoopFormImageOption[];
}

export interface LoopFormRow {
  rowIndex: number;
  label: string;
}

export interface LoopFormModel {
  textFields: LoopFormTextField[];
  imageFields: LoopFormImageField[];
  rows: LoopFormRow[];
  /** No hay ninguna variable que rellenar. */
  empty: boolean;
}

function distinctColumnValues(
  dataset: Dataset,
  listId: string,
  field: FieldDef,
  rowCount: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const value = getListFieldValueAtRow(dataset, listId, field.id, i);
    const text = fieldValueAsText(value ?? undefined).trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

/**
 * Deriva el modelo de formulario de la plantilla activa.
 * `imageInputs` son los slots de imagen declarados por el nodo creativo.
 */
export function deriveLoopForm(args: {
  promptTemplate: string;
  bindings: LoopBindings;
  imageInputs: CreativeInputDescriptor[];
  dataset: Dataset | null;
  listId: string | null;
}): LoopFormModel {
  const { promptTemplate, bindings, imageInputs, dataset, listId } = args;
  const empty: LoopFormModel = { textFields: [], imageFields: [], rows: [], empty: true };
  if (!dataset || !listId) return empty;

  const list = dataset.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  const rowCount = list?.cards.length ?? 0;
  const fieldByKey = new Map(schema.map((f) => [f.key, f]));
  const constByKey = new Map(dataset.constants.fields.map((f) => [f.key, f]));

  // Campos de texto: un campo por token único del prompt.
  const textFields: LoopFormTextField[] = [];
  for (const key of extractPromptTokens(promptTemplate)) {
    const listField = fieldByKey.get(key);
    if (listField) {
      textFields.push({
        kind: "text",
        fieldKey: key,
        label: listField.label,
        suggestions: distinctColumnValues(dataset, listId, listField, rowCount),
      });
      continue;
    }
    const constField = constByKey.get(key);
    if (constField) {
      const value = fieldValueAsText(getConstantFieldValue(dataset, constField.id) ?? undefined);
      textFields.push({
        kind: "constant",
        fieldKey: key,
        label: constField.label,
        constantValue: value,
        suggestions: [],
      });
      continue;
    }
    // Token sin columna (chip inválido): texto libre.
    textFields.push({ kind: "text", fieldKey: key, label: key, suggestions: [] });
  }

  // Campos de imagen: por cada ref ligada a una columna.
  const imageFields: LoopFormImageField[] = [];
  for (const slot of imageInputs) {
    const binding = bindings[slot.inputId];
    if (binding?.source !== "column" || !binding.fieldId) continue;
    const fieldId = binding.fieldId;
    const options: LoopFormImageOption[] = [];
    for (let i = 0; i < rowCount; i += 1) {
      const image = getListFieldImageAtRow(dataset, listId, fieldId, i);
      const url = image?.url?.trim();
      if (!url) continue;
      options.push({ rowIndex: i, label: datasetListRowLabel(dataset, listId, schema, i), url });
    }
    const fieldLabel = schema.find((f) => f.id === fieldId)?.label ?? slot.label;
    imageFields.push({ inputId: slot.inputId, label: fieldLabel, listId, fieldId, options });
  }

  const rows: LoopFormRow[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    rows.push({ rowIndex: i, label: datasetListRowLabel(dataset, listId, schema, i) });
  }

  return {
    textFields,
    imageFields,
    rows,
    empty: textFields.length === 0 && imageFields.length === 0,
  };
}

/**
 * Valores del formulario auto-rellenados desde una fila del Dataset (para el
 * selector "Autorellenar desde fila"). Devuelve texto por token y rowIndex por
 * input de imagen.
 */
export function autofillFormFromRow(
  model: LoopFormModel,
  dataset: Dataset,
  listId: string,
  rowIndex: number,
): { textValues: Record<string, string>; imageRows: Record<string, number> } {
  const textValues: Record<string, string> = {};
  const list = dataset.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  const fieldByKey = new Map(schema.map((f) => [f.key, f]));
  for (const field of model.textFields) {
    if (field.kind === "constant") continue;
    const listField = fieldByKey.get(field.fieldKey);
    if (!listField) continue;
    const value = getListFieldTextAtRow(dataset, listId, listField.id, rowIndex);
    const text = value ?? fieldValueAsText(getListFieldValueAtRow(dataset, listId, listField.id, rowIndex) ?? undefined);
    textValues[field.fieldKey] = text ?? "";
  }
  const imageRows: Record<string, number> = {};
  for (const field of model.imageFields) {
    if (field.options.some((o) => o.rowIndex === rowIndex)) {
      imageRows[field.inputId] = rowIndex;
    }
  }
  return { textValues, imageRows };
}

/**
 * Resuelve el prompt final del formulario sustituyendo cada token por el valor
 * tecleado/elegido; las constantes se auto-rellenan; lo no resuelto se deja igual.
 */
export function resolveFormPrompt(
  model: LoopFormModel,
  promptTemplate: string,
  textValues: Record<string, string>,
): string {
  const constByKey = new Map(
    model.textFields.filter((f) => f.kind === "constant").map((f) => [f.fieldKey, f.constantValue ?? ""]),
  );
  return substitutePromptTokens(promptTemplate, (key) => {
    if (key in textValues && textValues[key] !== undefined) return textValues[key];
    if (constByKey.has(key)) return constByKey.get(key) ?? "";
    return null;
  });
}

/** Resuelve las URLs de imagen del formulario (refs por columna + fijas). */
export function resolveFormImages(args: {
  model: LoopFormModel;
  imageInputs: CreativeInputDescriptor[];
  fixedRefUrls: Record<string, string>;
  imageRows: Record<string, number>;
  dataset: Dataset | null;
  listId: string | null;
}): { inputId: string; url: string; label: string }[] {
  const { model, imageInputs, fixedRefUrls, imageRows, dataset, listId } = args;
  const columnByInput = new Map(model.imageFields.map((f) => [f.inputId, f]));
  const refs: { inputId: string; url: string; label: string }[] = [];
  for (const slot of imageInputs) {
    const imageField = columnByInput.get(slot.inputId);
    if (imageField && dataset && listId) {
      const rowIndex = imageRows[slot.inputId];
      if (rowIndex == null) continue;
      const image = getListFieldImageAtRow(dataset, listId, imageField.fieldId, rowIndex);
      const url = image?.url?.trim();
      if (url) refs.push({ inputId: slot.inputId, url, label: imageField.label });
      continue;
    }
    const fixed = fixedRefUrls[slot.inputId];
    if (fixed) refs.push({ inputId: slot.inputId, url: fixed, label: slot.label });
  }
  return refs;
}

/**
 * Resuelve imágenes del formulario desde la instantánea pública (sin Dataset).
 * Usa las opciones ya materializadas en `formModel.imageFields`.
 */
export function resolvePublicFormImages(args: {
  model: LoopFormModel;
  imageInputs: CreativeInputDescriptor[];
  fixedRefUrls: Record<string, string>;
  imageRows: Record<string, number>;
}): { inputId: string; url: string; label: string }[] {
  const { model, imageInputs, fixedRefUrls, imageRows } = args;
  const columnByInput = new Map(model.imageFields.map((f) => [f.inputId, f]));
  const refs: { inputId: string; url: string; label: string }[] = [];
  for (const slot of imageInputs) {
    const imageField = columnByInput.get(slot.inputId);
    if (imageField) {
      const rowIndex = imageRows[slot.inputId];
      if (rowIndex == null) continue;
      const option = imageField.options.find((o) => o.rowIndex === rowIndex);
      const url = option?.url?.trim();
      if (url) refs.push({ inputId: slot.inputId, url, label: imageField.label });
      continue;
    }
    const fixed = fixedRefUrls[slot.inputId];
    if (fixed) refs.push({ inputId: slot.inputId, url: fixed, label: slot.label });
  }
  return refs;
}
