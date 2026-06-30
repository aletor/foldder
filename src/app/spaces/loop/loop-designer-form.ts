/**
 * Loop — modo FORMULARIO para plantillas Designer (una instancia manual).
 *
 * Igual que el formulario de Image Creation deriva sus campos de las variables del prompt, el de
 * Designer los deriva de los CAMPOS DINÁMICOS pendientes de la plantilla (los huecos marcados en el
 * Designer sin columna). El usuario rellena cada hueco a mano (texto) o eligiendo una imagen, y al
 * generar se congela UNA instancia con esos valores y se rasteriza: tantas imágenes como slides.
 *
 * La resolución NO depende del Dataset: las opciones de imagen ya traen su URL materializada, de modo
 * que el mismo modelo sirve tanto en el Studio (con Dataset a mano) como en el formulario público
 * (instantánea sin Dataset).
 */

import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import type { Dataset, DesignerDatasetFieldBinding, FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  fieldValueAsText,
  getListFieldImageAtRow,
  getListFieldTextAtRow,
  getListFieldValueAtRow,
} from "@/app/spaces/dataset/dataset-logic";
import {
  bindingKind,
  designerSlotKey,
  isPendingDesignerBinding,
} from "@/app/spaces/designer/designer-dataset-binding";
import { duplicateDesignerPageState, resolveSlideKey } from "@/app/spaces/designer/designer-studio-pure";
import { transformDesignerPageObjectsDeep } from "@/app/spaces/designer/designer-dataset-page";
import { computeFittingLayout } from "@/app/spaces/indesign/image-frame-layout";
import { stripDatasetBindingsFromObject } from "./loop-designer-materialize";
import type { DesignerDynamicField } from "./loop-designer-fields";
import type { DesignerSlotColumnRef } from "./loop-designer-materialize";
import { datasetListRowLabel } from "./loop-row-label";

export interface DesignerFormImageOption {
  /** Valor estable que el formulario guarda como selección (`row:<i>`). */
  value: string;
  rowIndex: number;
  label: string;
  url: string;
  w?: number;
  h?: number;
}

export interface DesignerFormRow {
  rowIndex: number;
  label: string;
  /** Miniatura de la primera columna de imagen mapeada en el formulario (si la hay). */
  previewUrl?: string;
  /** Valores por hueco para autorelleno en el formulario público (instantánea al compartir). */
  slotValues?: Record<string, string>;
}

export interface DesignerFormField {
  /** Clave del hueco (= `designerSlotKey`); el mapeo de valores se indexa por aquí. */
  slotKey: string;
  kind: "text" | "image";
  label: string;
  /** Columna del Dataset asignada en Loop Studio (para autorelleno). */
  mappedColumn?: DesignerSlotColumnRef | null;
  /** Sugerencias para campos de texto (valores distintos de la columna mapeada, si la hay). */
  suggestions: string[];
  /** Opciones para campos de imagen (filas de la columna mapeada con su URL). */
  imageOptions: DesignerFormImageOption[];
}

export interface DesignerFormModel {
  fields: DesignerFormField[];
  /** Filas del listado activo (para autorellenar desde un jugador/fila). */
  rows: DesignerFormRow[];
  /** Nº de slides (páginas) de la plantilla → nº de imágenes que devolverá. */
  slideCount: number;
  empty: boolean;
}

/** Valor resuelto de un hueco para una instancia concreta. */
export type DesignerSlotValue =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; w?: number; h?: number };

/** Mapa hueco→valor resuelto (clave = `designerSlotKey`). */
export type DesignerSlotValueMap = Record<string, DesignerSlotValue>;

function distinctColumnValues(
  dataset: Dataset,
  col: DesignerSlotColumnRef,
  rowCount: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const value = getListFieldValueAtRow(dataset, col.listId, col.fieldId, i);
    const text = fieldValueAsText(value ?? undefined).trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

function columnImageOptions(
  dataset: Dataset,
  col: DesignerSlotColumnRef,
  schema: FieldDef[],
  rowCount: number,
): DesignerFormImageOption[] {
  const list = dataset.lists.find((l) => l.id === col.listId);
  const listSchema = list?.schema ?? schema;
  const out: DesignerFormImageOption[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const image = getListFieldImageAtRow(dataset, col.listId, col.fieldId, i);
    const url = image?.url?.trim();
    if (!url) continue;
    out.push({
      value: `row:${i}`,
      rowIndex: i,
      label: datasetListRowLabel(dataset, col.listId, listSchema, i),
      url,
      w: image?.w,
      h: image?.h,
    });
  }
  return out;
}

function buildDesignerFormRows(
  dataset: Dataset,
  listId: string,
  rowCount: number,
  imageFields: DesignerFormField[],
): DesignerFormRow[] {
  const list = dataset.lists.find((l) => l.id === listId);
  if (!list) return [];
  const previewByRow = new Map<number, string>();
  for (const field of imageFields) {
    for (const opt of field.imageOptions) {
      if (!previewByRow.has(opt.rowIndex)) previewByRow.set(opt.rowIndex, opt.url);
    }
  }
  const rows: DesignerFormRow[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    rows.push({
      rowIndex: i,
      label: datasetListRowLabel(dataset, listId, list.schema, i),
      previewUrl: previewByRow.get(i),
    });
  }
  return rows;
}

/**
 * Deriva el formulario de una plantilla Designer a partir de sus campos dinámicos pendientes.
 * `slotBindings` (mapeo hueco→columna del Studio) enriquece los campos con sugerencias/opciones.
 */
export function deriveDesignerForm(args: {
  dynamicFields: DesignerDynamicField[];
  slotBindings?: Record<string, DesignerSlotColumnRef>;
  dataset?: Dataset | null;
  listId?: string | null;
  slideCount: number;
}): DesignerFormModel {
  const { dynamicFields, slotBindings, dataset, listId, slideCount } = args;
  const list = dataset && listId ? dataset.lists.find((l) => l.id === listId) : undefined;
  const rowCount = list?.cards.length ?? 0;
  const schema = list?.schema ?? [];

  const fields: DesignerFormField[] = [];
  for (const f of dynamicFields) {
    if (f.status !== "pending") continue;
    const col = slotBindings?.[f.key] ?? null;
    if (f.kind === "image") {
      const imageOptions =
        col && dataset && rowCount > 0 ? columnImageOptions(dataset, col, schema, rowCount) : [];
      fields.push({
        slotKey: f.key,
        kind: "image",
        label: f.label,
        mappedColumn: col,
        suggestions: [],
        imageOptions,
      });
    } else {
      const suggestions =
        col && dataset && rowCount > 0 ? distinctColumnValues(dataset, col, rowCount) : [];
      fields.push({
        slotKey: f.key,
        kind: "text",
        label: f.label,
        mappedColumn: col,
        suggestions,
        imageOptions: [],
      });
    }
  }

  const rows =
    dataset && listId && rowCount > 0
      ? buildDesignerFormRows(
          dataset,
          listId,
          rowCount,
          fields.filter((field) => field.kind === "image"),
        )
      : [];

  return { fields, rows, slideCount, empty: fields.length === 0 };
}

/**
 * Autorellena el formulario Designer desde una fila del listado (texto + imágenes mapeadas).
 * Devuelve un único mapa de valores listo para `formValues` del nodo Loop.
 */
export function autofillDesignerFormFromRow(
  model: DesignerFormModel,
  dataset: Dataset,
  listId: string,
  rowIndex: number,
): Record<string, string> {
  const values: Record<string, string> = {};
  const list = dataset.lists.find((l) => l.id === listId);
  if (!list) return values;

  for (const field of model.fields) {
    if (field.kind === "text" && field.mappedColumn) {
      const col = field.mappedColumn;
      const listField = list.schema.find((f) => f.id === col.fieldId);
      if (!listField) continue;
      const text =
        getListFieldTextAtRow(dataset, col.listId, col.fieldId, rowIndex) ??
        fieldValueAsText(getListFieldValueAtRow(dataset, col.listId, col.fieldId, rowIndex) ?? undefined);
      if (text) values[field.slotKey] = text;
      continue;
    }
    if (field.kind === "image") {
      const option = field.imageOptions.find((o) => o.rowIndex === rowIndex);
      if (option) values[field.slotKey] = option.value;
    }
  }
  return values;
}

/**
 * Autorellena desde un índice de fila usando el modelo materializado (formulario público o imágenes
 * sin Dataset). Si la fila trae `slotValues` (instantánea al compartir), los usa; si no, rellena
 * solo los campos de imagen cuya opción coincide con la fila.
 */
export function autofillDesignerFormFromRowIndex(
  model: DesignerFormModel,
  rowIndex: number,
): Record<string, string> {
  const row = model.rows.find((r) => r.rowIndex === rowIndex);
  if (row?.slotValues && Object.keys(row.slotValues).length > 0) {
    return { ...row.slotValues };
  }
  const values: Record<string, string> = {};
  for (const field of model.fields) {
    if (field.kind === "image") {
      const option = field.imageOptions.find((o) => o.rowIndex === rowIndex);
      if (option) values[field.slotKey] = option.value;
    }
  }
  return values;
}

/**
 * Resuelve los valores del formulario a un mapa hueco→valor. No necesita Dataset: las imágenes se
 * leen de las opciones ya materializadas en el modelo (sirve igual en local y en el público).
 */
export function resolveDesignerSlotValues(args: {
  model: DesignerFormModel;
  textValues: Record<string, string>;
  imageSelections: Record<string, string>;
}): DesignerSlotValueMap {
  const { model, textValues, imageSelections } = args;
  const out: DesignerSlotValueMap = {};
  for (const field of model.fields) {
    if (field.kind === "text") {
      const text = textValues[field.slotKey];
      if (typeof text === "string" && text.length > 0) {
        out[field.slotKey] = { kind: "text", text };
      }
      continue;
    }
    const selected = imageSelections[field.slotKey];
    if (!selected) continue;
    const option = field.imageOptions.find((o) => o.value === selected);
    if (option?.url) {
      out[field.slotKey] = { kind: "image", url: option.url, w: option.w, h: option.h };
    }
  }
  return out;
}

function slotValueForBinding(
  obj: FreehandObject,
  binding: DesignerDatasetFieldBinding,
  slotValues: DesignerSlotValueMap,
) {
  const baseKey = designerSlotKey(binding);
  if (!baseKey) return undefined;
  const kind = bindingKind(binding, obj);
  if (kind) {
    const withKind = slotValues[`${baseKey}::${kind}`];
    if (withKind) return withKind;
  }
  return slotValues[baseKey];
}

/**
 * Aplica el valor resuelto de un hueco a UN objeto (texto/imagen). Shallow a propósito: la recursión
 * en contenedores (`booleanGroup`/`clippingContainer`) la hace `transformDesignerPageObjectsDeep`,
 * que además parchea las stories de los marcos de texto anidados.
 */
function applyDesignerSlotValueToObject(
  obj: FreehandObject,
  slotValues: DesignerSlotValueMap,
): FreehandObject {
  const binding = obj._designerDatasetBinding;
  if (!binding || !isPendingDesignerBinding(binding)) return obj;
  const val = slotValueForBinding(obj, binding, slotValues);
  if (!val) return obj;

  if (val.kind === "text" && (obj.type === "text" || obj.type === "textOnPath")) {
    return {
      ...obj,
      text: val.text,
      ...(obj.type === "text" && obj.isTextFrame
        ? { _designerRichSpans: undefined, _designerOverflow: false }
        : {}),
    } as FreehandObject;
  }

  if (val.kind === "image" && val.url) {
    const iw = Math.max(1, val.w ?? 100);
    const ih = Math.max(1, val.h ?? 100);
    if (obj.type === "image") {
      return { ...obj, src: val.url, intrinsicRatio: iw / ih } as FreehandObject;
    }
    if (obj.type === "rect" && obj.isImageFrame) {
      const layout = computeFittingLayout(obj.width, obj.height, iw, ih, "fill-proportional");
      return {
        ...obj,
        imageFrameContent: {
          src: val.url,
          originalWidth: iw,
          originalHeight: ih,
          ...layout,
          fittingMode: "fill-proportional",
        },
        imageFrameAutoFit: true,
      } as FreehandObject;
    }
  }

  return obj;
}

/**
 * Aplica los valores del formulario a una página, recorriendo el árbol en profundidad (incluidos los
 * objetos "pegados dentro" de un clip) y parcheando las stories de los marcos de texto que cambien.
 */
export function applyDesignerSlotValuesToPage(
  page: DesignerPageState,
  slotValues: DesignerSlotValueMap,
): DesignerPageState {
  return transformDesignerPageObjectsDeep(page, (obj) =>
    applyDesignerSlotValueToObject(obj, slotValues),
  );
}

/**
 * Congela las páginas de la plantilla para UNA instancia de formulario:
 * clona (ids nuevos) → aplica los valores del formulario a los huecos → elimina los enlaces →
 * re-estampa `slideKey`. Los huecos sin valor quedan con el contenido de diseño.
 */
export function freezeDesignerPagesForForm(
  templatePages: DesignerPageState[],
  slotValues: DesignerSlotValueMap,
): DesignerPageState[] {
  return templatePages.map((tpl) => {
    const slideKey = resolveSlideKey(tpl);
    const slideName = tpl.slideName;
    const dup = duplicateDesignerPageState(tpl);
    const resolved = applyDesignerSlotValuesToPage(dup, slotValues);
    const objects = (resolved.objects ?? []).map(stripDatasetBindingsFromObject);
    const frozen: DesignerPageState = {
      ...resolved,
      objects,
      slideKey,
      slideName,
    };
    delete frozen.datasetLoopListId;
    delete frozen.datasetLoopCardId;
    return frozen;
  });
}
