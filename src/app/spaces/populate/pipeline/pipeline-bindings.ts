/**
 * Populate subgrafo — reglas del SINK (último nodo → Populate) y bindings namespaced.
 *
 * MODELO DE CONEXIONES (resumen):
 *
 * 1) DENTRO de la tubería: aristas normales del canvas según NODE_REGISTRY
 *    (image→image, prompt→prompt, image_layout→image_layout, brain→brain…).
 *
 * 2) SINK → Populate: el último nodo conecta su salida primaria al handle `template`
 *    de Populate (`populate.template`). El tipo lógico del cable es el de la salida
 *    del sink (image, prompt, image_layout, document…), NO un tipo "template" especial.
 *
 * 3) Dataset → Populate: frontera del iterador (`populate.dataset`), no forma parte
 *    de la tubería ejecutada.
 *
 * Ejemplo Image → Layerizer → Populate:
 *    nanoBanana.image ──► layerizer.image
 *    layerizer.layout ──► populate.template   ← sink = Layerizer
 *    dataset.dataset  ──► populate.dataset
 */

import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  fieldValueAsText,
  getListFieldValueAtRow,
} from "@/app/spaces/dataset/dataset-logic";
import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import type { PopulateInputBinding } from "../populate-types";
import {
  resolveImageBindingForRow,
  resolvePromptForRow,
} from "../populate-resolve";
import type { PortInputValue } from "./node-executor";

/** Handle de entrada de Populate donde entra el sink de la tubería. */
export const POPULATE_SINK_TARGET_HANDLE = "template" as const;

/**
 * Handles de salida del sink que pueden cablear a Populate.template.
 * Se amplía a medida que hay executor (p. ej. `layout` para Layerizer, `prompt` para Describer).
 */
export const POPULATE_SINK_SOURCE_HANDLES = new Set([
  "image",
  "document",
  "template", // legacy
  "prompt",
  "layout", // Layerizer → image_layout
  "rgba", // Background Remover → cutout
  "video",
]);

/** Salida primaria recomendada como sink hacia Populate (por convención de producto). */
export function primarySinkSourceHandle(nodeType: string | undefined | null): string | null {
  if (!nodeType) return null;
  if (nodeType === "designer") return "document";
  if (nodeType === "nanoBanana") return "image";
  if (nodeType === "mediaDescriber") return "prompt";
  if (nodeType === "concatenator") return "prompt";
  if (nodeType === "enhancer") return "prompt";
  if (nodeType === "layerizer") return "layout";
  if (nodeType === "backgroundRemover") return "rgba";
  const meta = NODE_REGISTRY[nodeType];
  if (!meta?.outputs?.length) return null;
  const first = meta.outputs[0]!.id;
  return POPULATE_SINK_SOURCE_HANDLES.has(first) ? first : null;
}

export function isValidPopulateSinkEdge(args: {
  sourceNodeType: string | undefined | null;
  sourceHandle?: string | null;
  isPipelineExecutable: (type: string | undefined | null) => boolean;
}): boolean {
  if (!args.isPipelineExecutable(args.sourceNodeType)) return false;
  const handle = args.sourceHandle ?? primarySinkSourceHandle(args.sourceNodeType) ?? "image";
  return POPULATE_SINK_SOURCE_HANDLES.has(handle);
}

// ── Bindings namespaced `<nodeId>.<inputKey>` (spec §12) ─────────────────────

export function namespacedBindingKey(nodeId: string, inputKey: string): string {
  return `${nodeId}.${inputKey}`;
}

export function parseNamespacedBindingKey(key: string): { nodeId?: string; inputKey: string } {
  const dot = key.indexOf(".");
  if (dot === -1) return { inputKey: key };
  return { nodeId: key.slice(0, dot), inputKey: key.slice(dot + 1) };
}

/** Nodos con al menos un binding a columna del Dataset (para classifyConstantIterated). */
export function datasetBoundNodeIdsFromBindings(
  bindings: Record<string, PopulateInputBinding> | undefined,
  legacySinkNodeId?: string,
): Set<string> {
  const ids = new Set<string>();
  if (!bindings) return ids;
  for (const [key, b] of Object.entries(bindings)) {
    if (b.source !== "column" || !b.fieldId) continue;
    const parsed = parseNamespacedBindingKey(key);
    if (parsed.nodeId) ids.add(parsed.nodeId);
    else if (legacySinkNodeId) ids.add(legacySinkNodeId);
  }
  return ids;
}

/** Resuelve el binding de un input concreto (namespaced o legacy con sinkId). */
export function resolveBindingForNodeInput(
  bindings: Record<string, PopulateInputBinding> | undefined,
  nodeId: string,
  inputKey: string,
  legacySinkNodeId?: string,
): PopulateInputBinding | undefined {
  if (!bindings) return undefined;
  const ns = namespacedBindingKey(nodeId, inputKey);
  if (bindings[ns]) return bindings[ns];
  if (legacySinkNodeId && nodeId === legacySinkNodeId && bindings[inputKey]) {
    return bindings[inputKey];
  }
  return undefined;
}

/** Override de columna → valor de puerto para una fila. */
export function columnOverrideForRow(args: {
  binding: PopulateInputBinding | undefined;
  dataset: Dataset;
  listId: string;
  rowIndex: number;
  /** Plantilla de prompt con tokens (solo inputs de texto con binding). */
  promptTemplate?: string;
  /** Tokens del prompt marcados como manuales (constantes en todas las filas). */
  manualTokenValues?: Record<string, string>;
  inputKind: "text" | "image" | "video";
}): PortInputValue | undefined {
  const { binding, dataset, listId, rowIndex, inputKind } = args;

  // Texto fijo del Studio (sin binding de columna): plantilla Populate sin tokens.
  if (!binding) {
    if (inputKind === "text" && args.promptTemplate?.trim()) {
      const text = resolvePromptForRow(
        args.promptTemplate,
        dataset,
        listId,
        rowIndex,
        args.manualTokenValues,
      );
      return text ? { kind: "text", text } : undefined;
    }
    return undefined;
  }

  // Entrada manual: valor único introducido en el formulario, constante para todas las filas.
  if (binding.source === "manual") {
    const value = (binding.manualValue ?? "").trim();
    if (!value) return undefined;
    if (inputKind === "text") return { kind: "text", text: value };
    if (inputKind === "image") return { kind: "image", url: value };
    if (inputKind === "video") return { kind: "video", url: value };
    return undefined;
  }

  if (binding.source !== "column") return undefined;

  if (inputKind === "text") {
    if (args.promptTemplate) {
      const text = resolvePromptForRow(args.promptTemplate, dataset, listId, rowIndex, args.manualTokenValues);
      return text ? { kind: "text", text } : undefined;
    }
    // Sin plantilla: valor directo de la columna enlazada.
    if (binding.listId && binding.fieldId) {
      const raw = getListFieldValueAtRow(dataset, binding.listId, binding.fieldId, rowIndex);
      const text = fieldValueAsText(raw ?? undefined);
      return text ? { kind: "text", text } : undefined;
    }
    return undefined;
  }

  if (inputKind === "image" || inputKind === "video") {
    const url = resolveImageBindingForRow(binding, dataset, rowIndex);
    if (!url) return undefined;
    let s3Key: string | undefined;
    if (binding.listId && binding.fieldId) {
      const list = dataset.lists.find((l) => l.id === binding.listId);
      const card = list?.cards[rowIndex];
      const cell = card?.values[binding.fieldId];
      if (cell?.type === "image" && typeof cell.s3Key === "string") {
        s3Key = cell.s3Key;
      }
    }
    const fullUrl = resolveFullQualityMediaUrl(url, s3Key) ?? url;
    const stableKey = resolveKnowledgeFilesS3Key(s3Key, fullUrl);
    const resolvedUrl = stableKey ?? fullUrl;
    return inputKind === "video"
      ? { kind: "video", url: resolvedUrl, s3Key: stableKey ?? s3Key }
      : { kind: "image", url: resolvedUrl, s3Key: stableKey ?? s3Key };
  }

  return undefined;
}
