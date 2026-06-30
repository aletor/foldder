/**
 * Populate — asigna 1 pieza por template (formulario + picks), sin iterar el Dataset.
 */

import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { MediaListOutput } from "@/app/spaces/media-list-output";

export const POPULATE_MAX_TEMPLATES = 8;

export type PopulateFieldSource =
  | { kind: "dataset"; pickId: string; columnFieldId: string; columnFieldKey?: string }
  | { kind: "manual" };

/** Una selección de fila = un desplegable en el formulario público (por entidad/registro). */
export interface PopulateRowPick {
  id: string;
  label: string;
  /** slotLabel normalizado — agrupa texto+imagen del mismo registro. */
  entityId?: string;
}

export interface PopulateTemplateBinding {
  templateNodeId: string;
  templateLabel: string;
  /** Columna del Dataset mostrada en los desplegables (nombre legible de fila). */
  labelColumnFieldId: string;
  labelColumnFieldKey?: string;
  picks: PopulateRowPick[];
  /** slotKey → fuente del valor (slot::entidad::text | slot::entidad::image). */
  sources: Record<string, PopulateFieldSource>;
  slotColumns: Record<
    string,
    { listId: string; listKey: string; fieldId: string; fieldKey: string }
  >;
  /**
   * Por entidad: columna imagen activa cuando hay varias columnas imagen en el Dataset
   * (poses en la misma fila). entityId → fieldId.
   */
  entityPoseColumnFieldId?: Record<string, string>;
  pagesSnapshot?: DesignerPageState[];
}

export interface PopulateNodeData {
  label?: string;
  listId?: string;
  /** Marca nodos Populate (assign); distingue legacy batch guardados como type populate. */
  _populateKind?: "assign";
  /** Siempre lista (1..8 templates conectados). */
  templateBindings: PopulateTemplateBinding[];
  activeTemplateNodeId?: string;
  publicShareToken?: string;
  /** Etiqueta del partido al compartir formulario (matchLabel en el share). */
  shareMatchLabel?: string;
  /**
   * Si es true, al generar se inyecta el nested space con nodos Designer editables además de las PNG.
   * Si es false (por defecto), solo se rasterizan las imágenes.
   */
  createEditablesOnGenerate?: boolean;
  value?: string;
  lastRunOutputs?: string[];
  mediaListOutput?: MediaListOutput;
  status?: "idle" | "running" | "done" | "error";
  error?: string;
}
