"use client";

/**
 * Integración LoopNode ↔ motor de tubería (F0–F2).
 * Traduce grafo vivo, bindings legacy y resultados del motor al modelo existente de Loop.
 */

import type { Edge, Node } from "@xyflow/react";
import { resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
import { resolveMediaUrlFromEdgeSource } from "../resolve-connected-media-url";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { LoopBindings, LoopInputBinding } from "./loop-types";
import { creativeInputKindFromHandleType } from "./loop-types";
import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import type { ActiveImageRef } from "./loop-active-refs";
import { resolveImageBindingForRow, resolvePromptForRow } from "./loop-resolve";
import type { MaterializedRow, PipelineMaterializeStep } from "./loop-materialize";
import { analyzePipeline, type PipelineAnalysis, type PipelineEdge } from "./pipeline/discover-pipeline";
import { estimatePipelineCost } from "./pipeline/estimate-pipeline-cost";
import { executorNodeMap } from "./pipeline/pipeline-adapter";
import { computeDatasetBoundNodeIds } from "./loop-dataset-bound";
import {
  datasetBoundNodeIdsFromBindings,
} from "./pipeline/pipeline-bindings";
import { defaultExecutorRegistry } from "./pipeline/executor-registry";
import { registerDefaultLoopExecutors } from "./pipeline/register-default-executors";
import {
  NUMBERED_PROMPT_NODE_TYPES,
  PROMPT_SLOT_HANDLES,
  type ExecutorNode,
  type NodeOutput,
  type PortInputValue,
} from "./pipeline/node-executor";
import { LOOP_PIPELINE_EXECUTABLE_TYPES } from "./pipeline/loop-pipeline-sink-types";
import { expandSpacePortalTemplateForPipeline } from "../space-portal-loop-link";
import {
  adaptLoopBindingsForPipeline,
  buildMultiChannelPipelinePromptTemplates,
  buildPromptTemplatesByNodeId,
  findPromptTemplateTargetNodeId,
} from "./loop-pipeline-prompt-target";

export {
  adaptLoopBindingsForPipeline,
  buildMultiChannelPipelinePromptTemplates,
  buildPromptTemplatesByNodeId,
  findPromptTemplateTargetNodeId,
};

import type { RowResult } from "./pipeline/run-pipeline";

let executorsReady = false;

export function ensureLoopPipelineExecutors(): void {
  if (executorsReady) return;
  registerDefaultLoopExecutors(defaultExecutorRegistry);
  executorsReady = true;
}

/** Nodo creativo cuya plantilla/prompt edita Loop (puede no ser el sink de la tubería). */
export function findLoopCreativeTemplateNodeId(
  loopId: string,
  nodes: { id: string; type?: string }[],
  edges: Edge[],
  bindings?: Record<string, LoopInputBinding>,
): string | null {
  const expanded = expandSpacePortalTemplateForPipeline(nodes as Node[], edges as Edge[]);
  const link = expanded.edges.find(
    (e) =>
      e.target === loopId &&
      e.targetHandle === "template" &&
      LOOP_PIPELINE_EXECUTABLE_TYPES.has(
        expanded.nodes.find((n) => n.id === e.source)?.type ?? "",
      ),
  );
  if (!link) return null;

  const pre = analyzePipeline({
    loopId,
    nodes: expanded.nodes,
    edges: expanded.edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings),
  });
  const analysis = analyzePipeline({
    loopId,
    nodes: expanded.nodes,
    edges: expanded.edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings, pre.sinkId ?? undefined),
  });

  const primary =
    analysis.order.find((id) => {
      const t = expanded.nodes.find((n) => n.id === id)?.type;
      return t === "nanoBanana" || t === "enhancer";
    }) ?? analysis.sinkId;

  return primary ?? link.source;
}

export function createResolveFixedExternal(
  nodes: Node[],
  edges: Edge[],
): (edge: PipelineEdge) => PortInputValue | undefined {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const numberedPromptSlots = new Set<string>(PROMPT_SLOT_HANDLES);

  return (edge: PipelineEdge): PortInputValue | undefined => {
    const targetHandle = edge.targetHandle ?? "";
    const targetNode = nodesById.get(edge.target);
    const targetType = targetNode?.type ?? "";
    const inputDef = NODE_REGISTRY[targetType]?.inputs?.find((i) => i.id === targetHandle);
    const kind = inputDef?.type ? creativeInputKindFromHandleType(inputDef.type) : null;
    const isNumberedPromptSlot =
      NUMBERED_PROMPT_NODE_TYPES.has(targetType) && numberedPromptSlots.has(targetHandle);

    if (kind === "text" || targetHandle === "prompt" || isNumberedPromptSlot) {
      const text = resolvePromptValueFromEdgeSourceMap(edge, nodesById)?.trim();
      return text ? { kind: "text", text } : undefined;
    }

    if (kind === "image" || kind === "video" || targetHandle === "media") {
      const rawUrl = resolveMediaUrlFromEdgeSource(edge, nodes, edges)?.trim();
      const sourceData = (nodesById.get(edge.source)?.data ?? {}) as Record<string, unknown>;
      const s3Key = typeof sourceData.s3Key === "string" ? sourceData.s3Key : undefined;
      const fullUrl = resolveFullQualityMediaUrl(rawUrl, s3Key) ?? rawUrl;
      if (!fullUrl) return undefined;
      const stableKey = resolveKnowledgeFilesS3Key(s3Key, fullUrl);
      const url = stableKey ?? fullUrl;
      if (kind === "video" || targetHandle === "video") {
        return { kind: "video", url, s3Key: stableKey ?? s3Key };
      }
      return { kind: "image", url, s3Key: stableKey ?? s3Key };
    }

    return undefined;
  };
}

export function materializedRowsFromPipeline(args: {
  rows: RowResult[];
  templatePrompt: string;
  dataset: Dataset;
  listId: string;
  bindings: LoopBindings;
  activeImageRefs: ActiveImageRef[];
  fixedRefUrls: Record<string, string>;
  cardIdsByRow: (string | undefined)[];
  manualTokenValues?: Record<string, string>;
  /**
   * Multi-canal: si se indica, toma el output de ESE sink (`row.finals[sinkId]`) en vez del
   * sink primario (`row.final`). Sin él, comportamiento legacy de 1 canal.
   */
  sinkId?: string;
}): MaterializedRow[] {
  const {
    rows,
    templatePrompt,
    dataset,
    listId,
    bindings,
    activeImageRefs,
    fixedRefUrls,
    cardIdsByRow,
    manualTokenValues,
    sinkId,
  } = args;

  return rows.map((row) => {
    const refs: MaterializedRow["refs"] = [];
    for (const slot of activeImageRefs) {
      const binding = bindings[slot.inputId];
      let url: string | null = null;
      let label = slot.label;
      if (binding?.source === "column") {
        url = resolveImageBindingForRow(binding, dataset, row.rowIndex);
        label = binding.fieldKey ?? slot.label;
      } else {
        url = fixedRefUrls[slot.inputId] ?? null;
      }
      if (url) refs.push({ inputId: slot.inputId, url, label });
    }

    const finalOutput = sinkId ? row.finals?.[sinkId] : row.final;

    let output: string | undefined;
    let s3Key: string | undefined;
    if (row.status === "ok" && finalOutput) {
      if (finalOutput.kind === "image") {
        output = finalOutput.url;
        s3Key = finalOutput.s3Key;
      } else if (finalOutput.kind === "text") {
        output = finalOutput.text;
      }
    }

    return {
      rowIndex: row.rowIndex,
      cardId: cardIdsByRow[row.rowIndex],
      prompt: resolvePromptForRow(templatePrompt, dataset, listId, row.rowIndex, manualTokenValues),
      refs,
      output,
      s3Key,
    };
  });
}

export function buildPipelineStepsPerRow(args: {
  order: readonly string[];
  nodeById: Map<string, ExecutorNode>;
  pipelineRows: RowResult[];
}): PipelineMaterializeStep[][] {
  const { order, nodeById, pipelineRows } = args;
  return pipelineRows.map((row) => {
    if (row.status !== "ok") return [];
    return order.map((nodeId) => {
      const node = nodeById.get(nodeId);
      const out = row.intermediates[nodeId] as NodeOutput | undefined;
      let output: string | undefined;
      if (out?.kind === "image") output = out.url;
      else if (out?.kind === "text") output = out.text;
      return {
        nodeType: node?.type ?? "nanoBanana",
        nodeData: node?.data,
        output,
        s3Key: out?.s3Key,
      };
    });
  });
}

export function formatPipelineCostConfirm(args: {
  rowCount: number;
  cost: ReturnType<typeof estimatePipelineCost>;
  sinkLabel: string;
}): string {
  const { rowCount, cost, sinkLabel } = args;
  const costLine =
    cost.totalUsd > 0
      ? ` Coste estimado: ~$${cost.totalUsd.toFixed(2)}.`
      : "";
  return (
    `Vas a ejecutar la tubería (${sinkLabel}) sobre ${rowCount} fila${rowCount === 1 ? "" : "s"}.` +
    `${costLine} Esto puede consumir wallet. ¿Continuar?`
  );
}

export function analyzeLoopPipeline(
  loopId: string,
  nodes: ExecutorNode[],
  edges: readonly PipelineEdge[],
  bindings?: Record<string, LoopInputBinding>,
  opts?: {
    templatePrompt?: string;
    promptTemplatesByNodeId?: Record<string, string>;
    listFieldKeys?: readonly string[];
    manualTokenValues?: Record<string, string>;
  },
): PipelineAnalysis {
  ensureLoopPipelineExecutors();
  const expanded = expandSpacePortalTemplateForPipeline(
    nodes as Node[],
    edges as Edge[],
  );
  const pre = analyzePipeline({
    loopId,
    nodes: expanded.nodes,
    edges: expanded.edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings),
  });
  const nodeById = executorNodeMap(expanded.nodes as ExecutorNode[]);
  const promptTargetNodeId = findPromptTemplateTargetNodeId(pre, nodeById);
  const datasetBoundNodeIds = computeDatasetBoundNodeIds({
    bindings,
    legacySinkNodeId: pre.sinkId ?? undefined,
    promptTargetNodeId,
    templatePrompt: opts?.templatePrompt,
    promptTemplatesByNodeId: opts?.promptTemplatesByNodeId,
    listFieldKeys: opts?.listFieldKeys ?? [],
    manualTokenValues: opts?.manualTokenValues,
  });
  return analyzePipeline({
    loopId,
    nodes: expanded.nodes,
    edges: expanded.edges,
    datasetBoundNodeIds,
  });
}
