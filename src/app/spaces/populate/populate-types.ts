/**
 * Populate — modelo compartido para orquestar nodos creativos sobre un Dataset.
 *
 * Idea central: cada input de un nodo creativo puede ser "fijo" (comportamiento
 * actual, valor por edge o inline) o "columna del Dataset" (se resuelve por fila).
 * No hay un "modo Populate" en el nodo: solo se añaden bindings opcionales.
 */

import type { FieldType } from "@/app/spaces/dataset/dataset-types";
import type { HandleType } from "@/app/spaces/nodeRegistry";

/** Clave en node.data de un nodo creativo donde viven los bindings por input. */
export const POPULATE_BINDINGS_KEY = "_populateBindings" as const;

/**
 * Origen de un input de un nodo creativo gobernado por Populate:
 * - `fixed`: valor fijo (edge o inline del nodo), comportamiento histórico.
 * - `column`: columna del Dataset, se resuelve por fila (itera).
 * - `manual`: el usuario lo teclea/elige en el panel de Populate antes de generar
 *   (formulario). Igual para todas las filas. Si `optionsFrom`, combobox con
 *   sugerencias del Dataset + texto libre.
 */
export type PopulateInputSource = "fixed" | "column" | "manual";

/** Combobox de sugerencias para un campo manual (valores distintos de una columna). */
export interface PopulateManualOptionsFrom {
  listId: string;
  fieldId: string;
}

/** Enlace de un input concreto de un nodo creativo a una columna del Dataset o a entrada manual. */
export interface PopulateInputBinding {
  /** Id del handle de input (p. ej. "image", "image2"). */
  inputId: string;
  source: PopulateInputSource;
  listId?: string;
  listKey?: string;
  fieldId?: string;
  fieldKey?: string;
  /** Solo `source === "manual"`: etiqueta y placeholder del campo en el formulario. */
  manualLabel?: string;
  manualPlaceholder?: string;
  /**
   * Solo `source === "manual"`: valor introducido por el usuario en "Rellenar antes de generar".
   * Es constante para todas las filas (el formulario se rellena una vez antes de generar).
   */
  manualValue?: string;
  /** Solo `source === "manual"`: sugerencias de una columna del Dataset (combobox + texto libre). */
  optionsFrom?: PopulateManualOptionsFrom;
}

/** Mapa inputId → binding, guardado en node.data[POPULATE_BINDINGS_KEY]. */
export type PopulateBindings = Record<string, PopulateInputBinding>;

/** Tipo lógico de un input creativo de cara a Populate. */
export type CreativeInputKind = "text" | "image" | "video";

/** Descriptor de un input orquestable, derivado de NODE_REGISTRY. */
export interface CreativeInputDescriptor {
  inputId: string;
  label: string;
  kind: CreativeInputKind;
}

/** Estado de una ejecución de Populate (preview o lote). */
export type PopulateRunStatus = "idle" | "preview" | "running" | "done" | "partial" | "error";

export interface PopulateNodeData {
  label?: string;
  /** Listado del Dataset conectado a iterar. */
  listId?: string;
  /** Id del Nested Space donde se depositan los nodos generados. */
  spaceId?: string;
  /**
   * Plantilla gobernada por Populate (no por el nodo creativo):
   * prompt con tokens {campo} editable dentro de Populate. `undefined` = aún no
   * sembrado desde el nodo creativo conectado (el editor lo inicializa una vez).
   */
  templatePrompt?: string;
  /** Bindings por input (fijo / columna del Dataset), gobernados por Populate. */
  templateBindings?: PopulateBindings;
  /**
   * Tokens del prompt marcados como "manuales" (clave de token → valor constante).
   * En lote se rellenan una vez antes de generar y son iguales para todas las filas;
   * tienen prioridad sobre la columna/constante del Dataset.
   */
  templateManualTokens?: Record<string, string>;
  /** Modo de ejecución: lote por Dataset o formulario (un resultado manual). */
  mode?: "batch" | "form";
  /** Modo formulario: valores tecleados/elegidos por token. */
  formValues?: Record<string, string>;
  /** Modo formulario: fila elegida por input de imagen (inputId → rowIndex). */
  formImageRows?: Record<string, number>;
  /** Token del enlace público del formulario (URL /f/[token]). */
  publicFormShareToken?: string;
  /** Última firma datasetId:version materializada (evita regenerar en vano). */
  lastSyncKey?: string;
  status?: PopulateRunStatus;
  /** Progreso del lote (filas completadas / total). */
  progressDone?: number;
  progressTotal?: number;
  error?: string;
  /** Salida agregada para Export Multimedia. */
  value?: string;
  mediaListOutput?: unknown;
  /** URLs de la última ejecución (thumbnails en Studio). */
  lastRunOutputs?: string[];
  /** Filas que fallaron en la última ejecución (índice + mensaje). */
  lastRunFailures?: Array<{ rowIndex: number; error: string }>;
  /** Contadores de la última ejecución por lote. */
  lastRunOkCount?: number;
  lastRunFailedCount?: number;
  /** Escribir resultados de vuelta al Dataset conectado (canal primario / legacy de 1 sink). */
  datasetOutput?: PopulateDatasetOutputSettings;
  /**
   * Multi-canal: ajustes de salida al Dataset por canal (sink), clave = `sinkId`.
   * Cada canal (creador conectado a la plantilla) escribe en su propia columna.
   * Si está vacío/ausente se usa `datasetOutput` (compatibilidad con 1 sink).
   */
  datasetOutputsByChannel?: Record<string, PopulateDatasetOutputSettings>;
  /** Etiquetas legibles por canal (sinkId → nombre mostrado), para la UI de columnas. */
  channelLabels?: Record<string, string>;
  /**
   * Multi-canal: delta de prompt fijo por canal (sinkId → texto), concatenado tras el prompt
   * del nodo Image Creator. Sin tokens; idéntico para todas las filas (p. ej. pose).
   */
  channelPrompts?: Record<string, string>;
  /** Resumen de la última escritura al Dataset. */
  lastDatasetWriteSummary?: string;
  /**
   * Modo 2 (plantilla Designer): mapeo hueco→columna del Dataset de Populate.
   * Clave = `designerSlotKey` (slot del binding pendiente); valor = columna asignada.
   */
  designerSlotBindings?: Record<
    string,
    { listId: string; listKey: string; fieldId: string; fieldKey: string }
  >;
}

/** Opciones de salida Populate → columna del Dataset de entrada. */
export interface PopulateDatasetOutputSettings {
  enabled: boolean;
  columnLabel: string;
  /** Campo imagen existente cuando se regenera sobre la misma columna. */
  existingFieldId?: string;
  /** Si la columna ya existe: crear versionada o actualizar in situ. */
  conflictStrategy: "versioned" | "update";
  /** Por defecto solo celdas vacías; overwrite_all fuerza todas las filas generadas. */
  fillMode: "empty_only" | "overwrite_all";
}

/** Traduce el tipo de handle de un input a su tipo lógico para Populate. */
export function creativeInputKindFromHandleType(type: HandleType): CreativeInputKind | null {
  switch (type) {
    case "prompt":
    case "txt":
      return "text";
    case "image":
      return "image";
    case "video":
      return "video";
    default:
      return null;
  }
}

/** Tipos de columna del Dataset compatibles con un input de un tipo dado. */
export function datasetFieldTypesForInputKind(kind: CreativeInputKind): FieldType[] {
  switch (kind) {
    case "text":
      // Cualquier campo coercible a texto puede inyectarse como token/valor.
      return ["text", "number", "select", "url", "color", "boolean"];
    case "image":
      return ["image"];
    case "video":
      return ["video"];
    default:
      return [];
  }
}
