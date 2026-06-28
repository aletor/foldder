/**
 * Dataset Copilot — contrato del "plan de operaciones".
 *
 * El LLM nunca muta la tabla: devuelve un AssistantPlan tipado que el cliente
 * previsualiza (diff) y solo aplica tras confirmación del usuario. Fase 0/1:
 * operaciones locales, sin acceso a la web.
 */

import type { FieldType } from "./dataset-types";

export type AssistantFilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "empty"
  | "not_empty";

export interface AssistantFilterCondition {
  /** Columna por `label` o `key`; se resuelve contra el esquema real en cliente. */
  column: string;
  op: AssistantFilterOp;
  value?: string | number | boolean;
}

export interface AssistantFilter {
  /** Todas deben cumplirse (AND). */
  all?: AssistantFilterCondition[];
  /** Al menos una (OR). */
  any?: AssistantFilterCondition[];
}

export interface AssistantColumnSpec {
  label: string;
  type: FieldType;
}

/** Celda de imagen ya resuelta (Fase 2: foto traída de la web y subida a S3). */
export interface AssistantImageDraft {
  kind: "image";
  url: string;
  s3Key?: string;
  assetId?: string;
  w?: number;
  h?: number;
}

export type AssistantCellDraft = string | number | boolean | null | AssistantImageDraft;

export interface AssistantRowDraft {
  /** Valores por columna (label o key). */
  cells: Record<string, AssistantCellDraft>;
  /** Fuente (URL) del dato, para trazabilidad. */
  source?: string;
}

export type AssistantOp =
  | { kind: "create_table"; name: string; columns: AssistantColumnSpec[]; rows?: AssistantRowDraft[] }
  | { kind: "add_columns"; columns: AssistantColumnSpec[] }
  | { kind: "remove_columns"; columns: string[] }
  | { kind: "rename_column"; column: string; newLabel: string }
  | { kind: "add_rows"; rows: AssistantRowDraft[] }
  | { kind: "delete_rows"; filter: AssistantFilter }
  | { kind: "update_cells"; filter?: AssistantFilter; set: Array<{ column: string; value: AssistantCellDraft }> }
  | { kind: "dedupe_rows"; column: string };

export type AssistantOpKind = AssistantOp["kind"];

export type AssistantIntent = "edit" | "transform" | "create" | "qa" | "retrieve";

/**
 * Plan de recuperación web (Fase 2): el modelo decide qué columnas y qué buscar;
 * el cliente confirma la búsqueda y luego confirma la integración de las filas.
 */
export interface AssistantWebPlan {
  /** Consulta refinada para la búsqueda web. */
  query: string;
  columns: AssistantColumnSpec[];
  /** Label de la columna de imagen a rellenar con fotos (opcional). */
  imageColumn?: string;
  maxRows: number;
  /** Nombre sugerido para la tabla resultante. */
  targetName: string;
}

export interface AssistantPlan {
  intent: AssistantIntent;
  /** Resumen humano: "Hay 4 jugadores con más de 25 años". */
  summary: string;
  /** Pregunta de confirmación: "¿Los elimino?". */
  question: string;
  /** Respuesta directa cuando intent === "qa" (sin operaciones). */
  answer?: string;
  target: { mode: "active" | "new"; suggestedName?: string };
  ops: AssistantOp[];
  /** Presente cuando la petición necesita datos de la web (Fase 2). */
  web?: AssistantWebPlan;
  warnings?: string[];
  needsConfirmation: boolean;
}

export interface AssistantCitation {
  url: string;
  title?: string;
}

/** Cómo resolver el destino al aplicar (lo decide el usuario en el panel). */
export type AssistantTargetChoice = "new" | "append_active" | "overwrite_active";

/** Topes de seguridad — evitan tablas inmensas / bucles. */
export const ASSISTANT_CAPS = {
  maxRowsPerOp: 200,
  maxColumnsPerOp: 16,
  maxOps: 12,
  maxSampleRowsToModel: 24,
  /** Fase 2 (web): tope duro de filas a traer por búsqueda. */
  maxWebRows: 50,
  /** Fase 2 (web): tope de fotos a descargar por búsqueda. */
  maxImages: 12,
} as const;
