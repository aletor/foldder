/**
 * Dataset node — modelo de datos.
 *
 * Un Dataset contiene N listados independientes (cada uno con schema + cards propios)
 * más un bloque de constantes compartidas en todo el Dataset.
 */

import type { ImageGenerationHistoryEntry } from "./dataset-image-history";

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
  /**
   * Procedencia Populate-Designer: id estable del grupo de columnas (un grupo por Populate-Designer).
   * Agrupa las M columnas (una por slide) bajo una identidad común.
   */
  populateGroupId?: string;
  /**
   * Procedencia Populate-Designer: `slideKey` de la slide de origen. Permite re-emparejar la columna
   * en re-ejecuciones de forma estable, independiente del nombre o del orden de las slides.
   */
  populateSlideKey?: string;
  /**
   * La slide de origen ya no existe en la plantilla. La columna se conserva (con su historial) y se
   * marca visualmente como huérfana; el borrado lo decide el usuario (nunca automático).
   */
  orphaned?: boolean;
}

export type FieldValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "color"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "select"; value: string }
  | { type: "url"; value: string }
  | {
      type: "image";
      assetId: string;
      url: string;
      w?: number;
      h?: number;
      hasAlpha?: boolean;
      /** Clave S3 cuando la imagen viene de generación Populate. */
      s3Key?: string;
      /** ISO timestamp de la última escritura Populate en esta celda. */
      populatedAt?: string;
      /** Versiones anteriores de esta celda (solo celdas generadas). */
      generationHistory?: ImageGenerationHistoryEntry[];
    }
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

/**
 * Enlace de un objeto del Designer a un campo del Dataset.
 *
 * Dos estados:
 * - RESUELTO (Modo 1, Dataset conectado al Designer): `listId`/`fieldId` apuntan a una columna real.
 * - PENDIENTE (Modo 2, Designer como plantilla de Populate): el objeto está marcado como dinámico
 *   con su `kind` y una `slotLabel`, pero SIN columna (`listId`/`fieldId` vacíos). Populate asigna
 *   la columna después en su UI de mapeo y, al congelar, rellena el hueco.
 */
export interface DesignerDatasetFieldBinding {
  listId: string;
  listKey: string;
  fieldId: string;
  fieldKey: string;
  /** Tipo del hueco dinámico. Imprescindible en estado PENDIENTE (sin columna que lo infiera). */
  kind?: "text" | "image";
  /** Etiqueta legible del hueco (identidad para el mapeo en Populate, estilo token de prompt). */
  slotLabel?: string;
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
