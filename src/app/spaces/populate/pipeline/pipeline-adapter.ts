/**
 * Adaptador Populate: cablea el grafo vivo + Dataset a `resolveNodeInputs` / `runPipeline`.
 *
 * Traduce NODE_REGISTRY → handles de entrada, bindings namespaced → overrides por fila,
 * y fuentes externas → valores fijos vía callbacks inyectados (para no acoplar tests al DOM).
 */

import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PipelineEdge } from "./discover-pipeline";
import {
  columnOverrideForRow,
  resolveBindingForNodeInput,
} from "./pipeline-bindings";
import type { PopulateInputBinding } from "../populate-types";
import { creativeInputKindFromHandleType } from "../populate-types";
import {
  NUMBERED_PROMPT_NODE_TYPES,
  PROMPT_SLOT_HANDLES,
  type ExecutorNode,
  type NodeOutputKind,
  type PortInputValue,
} from "./node-executor";
import {
  resolveNodeInputs,
  type NodeInputResolution,
  type PipelineScope,
} from "./resolve-node-inputs";
import type { RunPipelineDeps } from "./run-pipeline";

export interface PipelineAdapterContext {
  nodes: ExecutorNode[];
  edges: readonly PipelineEdge[];
  pipelineNodeIds: ReadonlySet<string>;
  dataset: Dataset;
  listId: string;
  /** Bindings de Populate (namespaced o legacy para el sink). */
  bindings?: Record<string, PopulateInputBinding>;
  /** Id del sink (para migrar bindings legacy sin namespace). */
  sinkNodeId?: string | null;
  /** Plantilla de prompt del sink legacy (Image Creation directo). */
  templatePrompt?: string;
  /** Plantillas con tokens por nodo de la tubería (`img1` → "foto de {nombre}"). */
  promptTemplatesByNodeId?: Record<string, string>;
  /** Tokens del prompt marcados como manuales (clave de token → valor constante para todas las filas). */
  manualTokenValues?: Record<string, string>;
  /** Resuelve valor fijo de un nodo externo conectado (mediaInput, promptInput…). */
  resolveFixedExternal?: (edge: PipelineEdge) => PortInputValue | undefined;
}

export function inputHandlesForNodeType(nodeType: string): Array<{ id: string; kind: NodeOutputKind }> {
  if (NUMBERED_PROMPT_NODE_TYPES.has(nodeType)) {
    return PROMPT_SLOT_HANDLES.map((id) => ({ id, kind: "text" as NodeOutputKind }));
  }
  const meta = NODE_REGISTRY[nodeType];
  if (!meta) return [];
  return (meta.inputs ?? [])
    .map((inp) => {
      const kind = creativeInputKindFromHandleType(inp.type);
      if (!kind) return null;
      return { id: inp.id, kind };
    })
    .filter((x): x is { id: string; kind: NodeOutputKind } => x != null);
}

export function resolveNodeInputsForPipeline(
  ctx: PipelineAdapterContext,
  args: {
    node: ExecutorNode;
    rowIndex: number;
    scope: PipelineScope;
  },
): NodeInputResolution {
  const handles = inputHandlesForNodeType(args.node.type);
  const bindableKeys = handles.map((h) => h.id);

  return resolveNodeInputs({
    node: args.node,
    inputHandles: handles,
    edges: ctx.edges,
    pipelineNodeIds: ctx.pipelineNodeIds,
    scope: args.scope,
    bindableKeys,
    resolveColumnOverride: (nodeId, inputKey) => {
      const handle = handles.find((h) => h.id === inputKey);
      if (!handle) return undefined;
      const binding = resolveBindingForNodeInput(
        ctx.bindings,
        nodeId,
        inputKey,
        ctx.sinkNodeId ?? undefined,
      );
      const usesPromptTemplate =
        inputKey === "prompt" ||
        (NUMBERED_PROMPT_NODE_TYPES.has(args.node.type) && inputKey === "p0");
      const promptTemplate = usesPromptTemplate
        ? (ctx.promptTemplatesByNodeId?.[nodeId] ??
          (nodeId === ctx.sinkNodeId ? ctx.templatePrompt : undefined))
        : undefined;
      return columnOverrideForRow({
        binding,
        dataset: ctx.dataset,
        listId: ctx.listId,
        rowIndex: args.rowIndex,
        promptTemplate,
        manualTokenValues: usesPromptTemplate ? ctx.manualTokenValues : undefined,
        inputKind: handle.kind,
      });
    },
    resolveFixedInput: (edge) => ctx.resolveFixedExternal?.(edge),
  });
}

/** Factory de `buildInputs` para `runPipeline`. */
export function createPipelineBuildInputs(
  ctx: PipelineAdapterContext,
): RunPipelineDeps["buildInputs"] {
  return ({ node, rowIndex, scope }) =>
    resolveNodeInputsForPipeline(ctx, { node, rowIndex, scope });
}

/** Mapa id → nodo para el motor. */
export function executorNodeMap(nodes: ExecutorNode[]): Map<string, ExecutorNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
