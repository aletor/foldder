"use client";

/**
 * Integración PopulateNode ↔ motor de tubería (F0–F2).
 * Traduce grafo vivo, bindings legacy y resultados del motor al modelo existente de Populate.
 */

import type { Edge, Node } from "@xyflow/react";
import { resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
import { resolveMediaUrlFromEdgeSource } from "../resolve-connected-media-url";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PopulateBindings, PopulateInputBinding } from "./populate-types";
import { creativeInputKindFromHandleType } from "./populate-types";
import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import type { ActiveImageRef } from "./populate-active-refs";
import { resolveImageBindingForRow, resolvePromptForRow } from "./populate-resolve";
import type { MaterializedRow } from "./populate-materialize";
import { analyzePipeline, type PipelineAnalysis, type PipelineEdge } from "./pipeline/discover-pipeline";
import { estimatePipelineCost } from "./pipeline/estimate-pipeline-cost";
import { executorNodeMap } from "./pipeline/pipeline-adapter";
import {
  datasetBoundNodeIdsFromBindings,
  namespacedBindingKey,
} from "./pipeline/pipeline-bindings";
import { defaultExecutorRegistry } from "./pipeline/executor-registry";
import { registerDefaultPopulateExecutors } from "./pipeline/register-default-executors";
import type { ExecutorNode, PortInputValue } from "./pipeline/node-executor";
import { POPULATE_PIPELINE_EXECUTABLE_TYPES } from "./pipeline/populate-pipeline-sink-types";

import type { RowResult } from "./pipeline/run-pipeline";

let executorsReady = false;

export function ensurePopulatePipelineExecutors(): void {
  if (executorsReady) return;
  registerDefaultPopulateExecutors(defaultExecutorRegistry);
  executorsReady = true;
}

/** Nodo creativo cuya plantilla/prompt edita Populate (puede no ser el sink de la tubería). */
export function findPopulateCreativeTemplateNodeId(
  populateId: string,
  nodes: { id: string; type?: string }[],
  edges: Edge[],
  bindings?: Record<string, PopulateInputBinding>,
): string | null {
  const link = edges.find(
    (e) =>
      e.target === populateId &&
      e.targetHandle === "template" &&
      POPULATE_PIPELINE_EXECUTABLE_TYPES.has(
        nodes.find((n) => n.id === e.source)?.type ?? "",
      ),
  );
  if (!link) return null;

  const pre = analyzePipeline({
    populateId,
    nodes,
    edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings),
  });
  const analysis = analyzePipeline({
    populateId,
    nodes,
    edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings, pre.sinkId ?? undefined),
  });

  const primary =
    analysis.order.find((id) => {
      const t = nodes.find((n) => n.id === id)?.type;
      return t === "nanoBanana" || t === "enhancer";
    }) ?? analysis.sinkId;

  return primary ?? link.source;
}

export function adaptPopulateBindingsForPipeline(
  bindings: Record<string, PopulateInputBinding> | undefined,
  analysis: PipelineAnalysis,
  nodeById: Map<string, ExecutorNode>,
): Record<string, PopulateInputBinding> {
  if (!bindings) return {};
  const out: Record<string, PopulateInputBinding> = { ...bindings };
  const primaryId =
    analysis.order.find((id) => {
      const t = nodeById.get(id)?.type;
      return t === "nanoBanana" || t === "enhancer";
    }) ?? analysis.sinkId;

  if (!primaryId || primaryId === analysis.sinkId) return out;

  for (const [key, binding] of Object.entries(bindings)) {
    if (key.includes(".")) continue;
    const ns = namespacedBindingKey(primaryId, key);
    if (!(ns in out)) out[ns] = binding;
  }
  return out;
}

export function buildPromptTemplatesByNodeId(args: {
  analysis: PipelineAnalysis;
  templatePrompt?: string;
  nodeById: Map<string, ExecutorNode>;
}): Record<string, string> | undefined {
  const trimmed = args.templatePrompt?.trim();
  if (!trimmed) return undefined;

  const primaryId =
    args.analysis.order.find((id) => {
      const t = args.nodeById.get(id)?.type;
      return t === "nanoBanana" || t === "enhancer";
    }) ?? args.analysis.sinkId;

  if (!primaryId) return undefined;
  return { [primaryId]: trimmed };
}

export function createResolveFixedExternal(
  nodes: Node[],
  edges: Edge[],
): (edge: PipelineEdge) => PortInputValue | undefined {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  return (edge: PipelineEdge): PortInputValue | undefined => {
    const targetHandle = edge.targetHandle ?? "";
    const targetNode = nodesById.get(edge.target);
    const targetType = targetNode?.type ?? "";
    const inputDef = NODE_REGISTRY[targetType]?.inputs?.find((i) => i.id === targetHandle);
    const kind = inputDef?.type ? creativeInputKindFromHandleType(inputDef.type) : null;

    if (kind === "text" || targetHandle === "prompt") {
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
  bindings: PopulateBindings;
  activeImageRefs: ActiveImageRef[];
  fixedRefUrls: Record<string, string>;
  cardIdsByRow: (string | undefined)[];
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

    let output: string | undefined;
    let s3Key: string | undefined;
    if (row.status === "ok" && row.final) {
      if (row.final.kind === "image") {
        output = row.final.url;
        s3Key = row.final.s3Key;
      } else if (row.final.kind === "text") {
        output = row.final.text;
      }
    }

    return {
      rowIndex: row.rowIndex,
      cardId: cardIdsByRow[row.rowIndex],
      prompt: resolvePromptForRow(templatePrompt, dataset, listId, row.rowIndex),
      refs,
      output,
      s3Key,
    };
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

export function analyzePopulatePipeline(
  populateId: string,
  nodes: ExecutorNode[],
  edges: readonly PipelineEdge[],
  bindings?: Record<string, PopulateInputBinding>,
): PipelineAnalysis {
  ensurePopulatePipelineExecutors();
  const pre = analyzePipeline({
    populateId,
    nodes,
    edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings),
  });
  return analyzePipeline({
    populateId,
    nodes,
    edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings, pre.sinkId ?? undefined),
  });
}
