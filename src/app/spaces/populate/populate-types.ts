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

/** Origen de un input: valor fijo (intacto) o tomado de una columna del Dataset. */
export type PopulateInputSource = "fixed" | "column";

/** Enlace de un input concreto de un nodo creativo a una columna del Dataset. */
export interface PopulateInputBinding {
  /** Id del handle de input (p. ej. "image", "image2"). */
  inputId: string;
  source: PopulateInputSource;
  listId?: string;
  listKey?: string;
  fieldId?: string;
  fieldKey?: string;
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
export type PopulateRunStatus = "idle" | "preview" | "running" | "done" | "error";

export interface PopulateNodeData {
  label?: string;
  /** Listado del Dataset conectado a iterar. */
  listId?: string;
  /** Id del Nested Space donde se depositan los nodos generados. */
  spaceId?: string;
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
