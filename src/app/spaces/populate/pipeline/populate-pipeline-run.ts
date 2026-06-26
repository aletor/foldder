/**
 * Orquestación de alto nivel: F0 descubrimiento + F2 motor + adaptador Dataset/grafos.
 * Punto de entrada para el PoC y, más adelante, para PopulateNode.tsx.
 */

import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PopulateInputBinding } from "../populate-types";
import { analyzePipeline } from "./discover-pipeline";
import type { PipelineEdge } from "./discover-pipeline";
import { estimatePipelineCost } from "./estimate-pipeline-cost";
import type { ExecutorRegistry } from "./executor-registry";
import type { ExecCapabilities, ExecutorNode, NodeOutput } from "./node-executor";
import {
  createPipelineBuildInputs,
  executorNodeMap,
  type PipelineAdapterContext,
} from "./pipeline-adapter";
import { datasetBoundNodeIdsFromBindings } from "./pipeline-bindings";
import { runPipeline, type RowResult } from "./run-pipeline";

export type { RowResult };

export interface RunPopulatePipelineInput {
  populateId: string;
  nodes: ExecutorNode[];
  edges: readonly PipelineEdge[];
  dataset: Dataset;
  listId: string;
  bindings?: Record<string, PopulateInputBinding>;
  templatePrompt?: string;
  promptTemplatesByNodeId?: Record<string, string>;
  registry: ExecutorRegistry;
  ownerEmail: string;
  capabilities?: ExecCapabilities;
  resolveFixedExternal?: PipelineAdapterContext["resolveFixedExternal"];
  onProgress?: (done: number, total: number) => void;
  onRowResult?: (result: RowResult) => void;
  signal?: AbortSignal;
}

export interface RunPopulatePipelineResult {
  analysis: ReturnType<typeof analyzePipeline>;
  cost: ReturnType<typeof estimatePipelineCost>;
  rows: RowResult[];
  constantCache: Record<string, NodeOutput | undefined>;
  okCount: number;
  failedCount: number;
}

export async function runPopulatePipeline(
  input: RunPopulatePipelineInput,
): Promise<RunPopulatePipelineResult> {
  // Pasada previa para resolver sinkId (bindings legacy sin namespace).
  const pre = analyzePipeline({
    populateId: input.populateId,
    nodes: input.nodes,
    edges: input.edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(input.bindings),
  });

  const analysis = analyzePipeline({
    populateId: input.populateId,
    nodes: input.nodes,
    edges: input.edges,
    datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(
      input.bindings,
      pre.sinkId ?? undefined,
    ),
  });

  if (!analysis.validation.ok) {
    throw new Error(analysis.validation.errors.join(" "));
  }

  const list = input.dataset.lists.find((l) => l.id === input.listId);
  const rowCount = list?.cards.length ?? 0;

  const nodeById = executorNodeMap(input.nodes);
  const adapterCtx: PipelineAdapterContext = {
    nodes: input.nodes,
    edges: input.edges,
    pipelineNodeIds: new Set(analysis.pipelineNodeIds),
    dataset: input.dataset,
    listId: input.listId,
    bindings: input.bindings,
    sinkNodeId: analysis.sinkId,
    templatePrompt: input.templatePrompt,
    promptTemplatesByNodeId: input.promptTemplatesByNodeId,
    resolveFixedExternal: input.resolveFixedExternal,
  };

  const cost = estimatePipelineCost({
    order: analysis.order,
    iterated: analysis.iterated,
    rowCount,
    registry: input.registry,
    nodeById,
  });

  const run = await runPipeline(
    {
      registry: input.registry,
      nodeById,
      buildInputs: createPipelineBuildInputs(adapterCtx),
      ctxBase: {
        ownerEmail: input.ownerEmail,
        capabilities: input.capabilities,
        signal: input.signal,
      },
    },
    {
      order: analysis.order,
      iterated: analysis.iterated,
      constant: analysis.constant,
      sinkId: analysis.sinkId,
      rowCount,
      onProgress: input.onProgress,
      onRowResult: input.onRowResult,
    },
  );

  return { analysis, cost, ...run };
}
