/**
 * Dataset node — modelo de datos.
 *
 * Un Dataset contiene N listados independientes (cada uno con schema + cards propios)
 * más un bloque de constantes compartidas en todo el Dataset.
 */

export type FieldType =
  | "text"
  | "number"
  | "image"
  | "video"
  | "color"
  | "boolean"
  | "select"
  | "url";

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
}

export type FieldValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "color"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "select"; value: string }
  | { type: "url"; value: string }
  | { type: "image"; assetId: string; url: string; w?: number; h?: number; hasAlpha?: boolean }
  | { type: "video"; assetId: string; url: string; durationMs?: number; w?: number; h?: number };

export interface Card {
  id: string;
  values: Record<string /* fieldId */, FieldValue>;
}

/** Listado tipado dentro de un Dataset (p.ej. jugadores, fotos recurso). */
export interface DatasetList {
  id: string;
  name: string;
  /** Clave estable para binding del consumidor (listado + fieldKey). */
  key: string;
  schema: FieldDef[];
  cards: Card[];
}

export interface Constants {
  fields: FieldDef[];
  values: Record<string /* fieldId */, FieldValue>;
}

export type DatasetScope = "local" | "global";

export interface Dataset {
  id: string;
  name: string;
  scope: DatasetScope;
  projectId?: string;
  /** Listados independientes; cada uno itera por separado en el destino. */
  lists: DatasetList[];
  constants: Constants;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Contrato de consumo para un listado concreto + constantes compartidas.
 */
export interface DatasetBinding {
  listId: string;
  listKey: string;
  listName: string;
  rows: Array<Record<string /* fieldKey */, FieldValue>>;
  constants: Record<string /* fieldKey */, FieldValue>;
  schema: FieldDef[];
  rowCount: number;
}

export interface Gap {
  kind: "required-missing" | "broken-asset" | "invalid-select";
  listId: string | null;
  cardId: string | null;
  fieldId: string;
  fieldKey: string;
  fieldLabel: string;
  message: string;
}

export interface ValidationResult {
  complete: boolean;
  gaps: Gap[];
}

export interface DatasetListPreview {
  id: string;
  name: string;
  key: string;
  cardCount: number;
  schemaKeys: string[];
}

export interface DatasetPreview {
  id: string;
  name: string;
  scope: DatasetScope;
  version: number;
  listCount: number;
  cardCount: number;
  constantCount: number;
  lists: DatasetListPreview[];
  complete: boolean;
  gapCount: number;
}

/** Enlace de un objeto del Designer a un campo de un listado del Dataset conectado. */
export interface DesignerDatasetFieldBinding {
  listId: string;
  listKey: string;
  fieldId: string;
  fieldKey: string;
}

/** @deprecated Usar `DesignerDatasetFieldBinding`. */
export type DesignerDatasetTextBinding = DesignerDatasetFieldBinding;

export type DesignerDatasetPropertySource = "list" | "constant";

/** Enlace de una propiedad concreta del objeto (x, fill, etc.) al Dataset. */
export interface DesignerDatasetPropertyBinding {
  propertyKey: string;
  source: DesignerDatasetPropertySource;
  listId?: string;
  listKey?: string;
  fieldId: string;
  fieldKey: string;
}

export interface DatasetNodeData {
  label?: string;
  dataset?: Dataset;
  datasetRef?: { datasetId: string; version: number };
  datasetPreview?: DatasetPreview;
  datasetRemoteVersion?: number;
  _foldderStudioTouched?: boolean;
  _datasetShowChooser?: boolean;
}
