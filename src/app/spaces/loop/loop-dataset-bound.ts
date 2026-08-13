/**
 * Quién itera en Loop: bindings de columna + tokens de prompt ligados al listado.
 *
 * Meter `{columna}` en la plantilla debe marcar el nodo que consume el prompt como
 * dependiente del Dataset (misma regla que un binding `source: "column"`), para que
 * el motor no lo trate como constante con rowIndex -1.
 */

import { extractPromptTokens } from "./loop-tokens";
import type { LoopInputBinding } from "./loop-types";
import { datasetBoundNodeIdsFromBindings } from "./pipeline/pipeline-bindings";

function toKeySet(keys: Iterable<string>): Set<string> {
  return keys instanceof Set ? keys : new Set(keys);
}

/**
 * True si la plantilla referencia al menos una columna del listado que no está
 * cubierta por un valor manual no vacío (los manuales son constantes en todas las filas).
 */
export function promptDependsOnListColumns(
  template: string | undefined | null,
  listFieldKeys: Iterable<string>,
  manualTokenValues?: Record<string, string>,
): boolean {
  if (!template?.trim()) return false;
  const listKeys = toKeySet(listFieldKeys);
  if (listKeys.size === 0) return false;
  for (const key of extractPromptTokens(template)) {
    if (!listKeys.has(key)) continue;
    const manual = manualTokenValues?.[key];
    if (typeof manual === "string" && manual.trim() !== "") continue;
    return true;
  }
  return false;
}

/** Claves de tokens del prompt que sí dependen del listado (para UI / resumen). */
export function listColumnTokensInPrompt(
  template: string | undefined | null,
  listFieldKeys: Iterable<string>,
  manualTokenValues?: Record<string, string>,
): string[] {
  if (!template?.trim()) return [];
  const listKeys = toKeySet(listFieldKeys);
  const out: string[] = [];
  for (const key of extractPromptTokens(template)) {
    if (!listKeys.has(key)) continue;
    const manual = manualTokenValues?.[key];
    if (typeof manual === "string" && manual.trim() !== "") continue;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Une bindings de columna con nodos cuyo prompt de plantilla lee columnas del listado.
 */
export function computeDatasetBoundNodeIds(args: {
  bindings?: Record<string, LoopInputBinding>;
  legacySinkNodeId?: string;
  /** Nodo que recibe `templatePrompt` (concat/enhancer/image). */
  promptTargetNodeId?: string | null;
  templatePrompt?: string;
  promptTemplatesByNodeId?: Record<string, string>;
  listFieldKeys: Iterable<string>;
  manualTokenValues?: Record<string, string>;
}): Set<string> {
  const ids = datasetBoundNodeIdsFromBindings(args.bindings, args.legacySinkNodeId);
  const { listFieldKeys, manualTokenValues } = args;

  if (
    args.promptTargetNodeId &&
    promptDependsOnListColumns(args.templatePrompt, listFieldKeys, manualTokenValues)
  ) {
    ids.add(args.promptTargetNodeId);
  }

  if (args.promptTemplatesByNodeId) {
    for (const [nodeId, template] of Object.entries(args.promptTemplatesByNodeId)) {
      if (promptDependsOnListColumns(template, listFieldKeys, manualTokenValues)) {
        ids.add(nodeId);
      }
    }
  }

  return ids;
}

/**
 * ¿El lote debe iterar por filas del listado? (bindings de columna o tokens de listado).
 * Aproximación de Studio sin análisis completo de tubería.
 */
export function loopWillIteratePerRow(args: {
  promptText: string;
  bindings: Record<string, LoopInputBinding>;
  listFieldKeys: Iterable<string>;
  manualTokenValues?: Record<string, string>;
}): boolean {
  if (promptDependsOnListColumns(args.promptText, args.listFieldKeys, args.manualTokenValues)) {
    return true;
  }
  for (const b of Object.values(args.bindings)) {
    if (b.source === "column" && (b.fieldId || b.fieldKey)) return true;
  }
  return false;
}

/**
 * Generaciones de imagen esperadas para el resumen (API calls), no filas materializadas.
 * Iterado → 1 por fila; solo constante → 1 si hay filas/plantilla.
 */
export function estimateExpectedImageGenerations(args: {
  rowCount: number;
  willIterate: boolean;
  hasTemplate: boolean;
}): number {
  if (!args.hasTemplate || args.rowCount <= 0) return 0;
  return args.willIterate ? args.rowCount : 1;
}
