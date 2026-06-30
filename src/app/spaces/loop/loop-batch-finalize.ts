"use client";

import type { Edge, Node } from "@xyflow/react";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { LoopDatasetOutputSettings, LoopRunStatus } from "./loop-types";
import type { RowResult } from "./pipeline/run-pipeline";
import type { ExecutorNode } from "./pipeline/node-executor";
import {
  buildGeneratedSubgraph,
  buildMediaListOutput,
  buildMultiChannelGeneratedSubgraph,
  buildMultiChannelMediaListOutput,
  buildPipelineGeneratedSubgraph,
  isPersistableImageUrl,
  type MaterializedChannel,
  type MaterializedRow,
  type MaterializeTemplateModel,
} from "./loop-materialize";
import { ensureMaterializedRowsHaveStableUrls } from "./loop-designer-raster";
import {
  buildPipelineStepsPerRow,
  materializedRowsFromPipeline,
} from "./loop-pipeline-integration";
import { composeChannelEffectivePrompt } from "./loop-channel-prompt";
import type { LoopChannelOutput } from "./loop-dataset-output";
import {
  persistLoopChannelsDatasetOutput,
  persistLoopDatasetOutput,
} from "./persist-loop-dataset-output";

export interface LoopRunFailure {
  /** Índice 0-based de la fila del Dataset. */
  rowIndex: number;
  error: string;
}

/** Un canal de salida (un creador conectado a la plantilla) para la finalización multi-canal. */
export interface FinalizeLoopChannelInput {
  /** Id estable del canal (sinkId del nodo creativo). */
  channelId: string;
  label: string;
  templateModel: MaterializeTemplateModel;
  templateType: string;
  /** Prompt del nodo Image Creator (identidad compartida). */
  nodePrompt: string;
  /** Delta fijo de Loop (p. ej. pose); opcional. */
  channelPrompt?: string;
  /** Ajustes de volcado al Dataset para este canal (columna destino). */
  settings?: LoopDatasetOutputSettings;
}

export interface FinalizeLoopBatchInput {
  loopId: string;
  label: string;
  projectId: string | null;
  pipelineRows: RowResult[];
  totalRows: number;
  templatePrompt: string;
  connectedDataset: Dataset;
  listId: string;
  bindings: import("./loop-types").LoopBindings;
  activeImageRefs: import("./loop-active-refs").ActiveImageRef[];
  fixedRefUrls: Record<string, string>;
  cardIdsByRow: (string | undefined)[];
  manualTokenValues?: Record<string, string>;
  analysisOrder: readonly string[];
  nodeById: Map<string, ExecutorNode>;
  templateModel: MaterializeTemplateModel;
  templateType: string;
  soleNanoSink: boolean;
  datasetOutput?: LoopDatasetOutputSettings;
  /**
   * Multi-canal: si hay 2+ creadores conectados a la plantilla, un canal por sink. Cuando se
   * indica (≥2), se usa el camino multi-canal (rejilla en el nested space + columna por canal).
   */
  channels?: FinalizeLoopChannelInput[];
  flowNodes: Node[];
  flowEdges: Edge[];
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  /** Si false, solo persiste resultados con salida (commit incremental). */
  writeDataset: boolean;
  /** Error fatal externo (crash del cliente, excepción del lote). */
  abortError?: string;
}

export interface FinalizeLoopBatchResult {
  status: LoopRunStatus;
  materializedRows: MaterializedRow[];
  okCount: number;
  failedCount: number;
  failures: LoopRunFailure[];
  lastRunOutputs: string[];
  firstOutput: string;
  mediaList: ReturnType<typeof buildMediaListOutput>;
  subgraph: { nodes: Node[]; edges: Edge[] };
  summaryError?: string;
  lastDatasetWriteSummary?: string;
}

export function collectLoopFailures(rows: RowResult[]): LoopRunFailure[] {
  return rows
    .filter((r) => r.status === "failed")
    .map((r) => ({ rowIndex: r.rowIndex, error: (r.error ?? "Error desconocido").trim() }));
}

export function resolveLoopRunStatus(args: {
  okCount: number;
  failedCount: number;
  totalRows: number;
  abortError?: string;
}): LoopRunStatus {
  const { okCount, failedCount, abortError } = args;
  if (okCount === 0) return "error";
  if (failedCount > 0 || abortError) return "partial";
  return "done";
}

export function formatLoopRunErrorMessage(args: {
  okCount: number;
  failedCount: number;
  totalRows: number;
  failures: LoopRunFailure[];
  abortError?: string;
}): string | undefined {
  const { okCount, failedCount, totalRows, failures, abortError } = args;
  const parts: string[] = [];

  if (abortError) {
    parts.push(`Ejecución interrumpida: ${abortError}`);
  }

  if (failedCount > 0) {
    const first = failures[0];
    if (first) {
      parts.push(
        `${failedCount} fila${failedCount === 1 ? "" : "s"} fallaron de ${totalRows}. Primera en fila ${first.rowIndex + 1}: ${first.error}`,
      );
    } else {
      parts.push(`${failedCount} fila${failedCount === 1 ? "" : "s"} fallaron de ${totalRows}.`);
    }
  }

  if (okCount > 0 && (failedCount > 0 || abortError)) {
    parts.push(`${okCount} resultado${okCount === 1 ? "" : "s"} guardado${okCount === 1 ? "" : "s"}.`);
  }

  if (parts.length === 0 && failedCount > 0 && okCount === 0) {
    const first = failures[0];
    return first?.error ?? `Fallaron las ${failedCount} filas.`;
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
}

export async function finalizeLoopBatchRun(
  input: FinalizeLoopBatchInput,
): Promise<FinalizeLoopBatchResult> {
  const failures = collectLoopFailures(input.pipelineRows);
  const failedCount = failures.length;

  if (input.channels && input.channels.length > 1) {
    return finalizeMultiChannelBatchRun(input, failures, failedCount);
  }

  let materialized = materializedRowsFromPipeline({
    rows: input.pipelineRows,
    templatePrompt: input.templatePrompt,
    dataset: input.connectedDataset,
    listId: input.listId,
    bindings: input.bindings,
    activeImageRefs: input.activeImageRefs,
    fixedRefUrls: input.fixedRefUrls,
    cardIdsByRow: input.cardIdsByRow,
    manualTokenValues: input.manualTokenValues,
  });

  materialized = await ensureMaterializedRowsHaveStableUrls(materialized, input.projectId, input.loopId);

  const rowsForSpace = materialized.filter((r) => isPersistableImageUrl(r.output));
  const stepsPerRow = buildPipelineStepsPerRow({
    order: input.analysisOrder,
    nodeById: input.nodeById,
    pipelineRows: input.pipelineRows,
  });
  const paired = materialized
    .map((row, i) => ({ row, steps: stepsPerRow[i] ?? [] }))
    .filter((p) => isPersistableImageUrl(p.row.output));

  const sub = input.soleNanoSink
    ? buildGeneratedSubgraph(input.loopId, paired.map((p) => p.row), input.templateModel, input.templateType)
    : buildPipelineGeneratedSubgraph(
        input.loopId,
        paired.map((p) => p.row),
        input.templateModel,
        paired.map((p) => p.steps),
      );

  const mediaList = buildMediaListOutput(input.loopId, input.label, materialized);
  const lastRunOutputs = rowsForSpace.map((r) => r.output!).filter(Boolean);
  const firstOutput = lastRunOutputs[0] ?? "";

  let lastDatasetWriteSummary: string | undefined;
  if (input.writeDataset && input.datasetOutput?.enabled && rowsForSpace.length > 0) {
    try {
      const writeResult = await persistLoopDatasetOutput({
        loopNodeId: input.loopId,
        nodes: input.flowNodes,
        edges: input.flowEdges,
        dataset: input.connectedDataset,
        listId: input.listId,
        rows: rowsForSpace,
        settings: input.datasetOutput,
        setNodes: input.setNodes,
      });
      const skipped = writeResult.skippedCount > 0 ? ` · ${writeResult.skippedCount} omitidas` : "";
      lastDatasetWriteSummary = `${writeResult.writtenCount} celdas → «${writeResult.fieldLabel}»${skipped}`;
    } catch (writeErr) {
      console.error("[Loop] dataset output", writeErr);
      failures.push({
        rowIndex: -1,
        error:
          writeErr instanceof Error ? writeErr.message : "Error al guardar resultados en el Dataset.",
      });
    }
  }

  const status = resolveLoopRunStatus({
    okCount: lastRunOutputs.length,
    failedCount,
    totalRows: input.totalRows,
    abortError: input.abortError,
  });

  const summaryError = formatLoopRunErrorMessage({
    okCount: lastRunOutputs.length,
    failedCount,
    totalRows: input.totalRows,
    failures: failures.filter((f) => f.rowIndex >= 0),
    abortError: input.abortError,
  });

  return {
    status,
    materializedRows: materialized,
    okCount: lastRunOutputs.length,
    failedCount,
    failures: failures.filter((f) => f.rowIndex >= 0),
    lastRunOutputs,
    firstOutput,
    mediaList,
    subgraph: sub,
    summaryError,
    lastDatasetWriteSummary,
  };
}

/**
 * Finalización multi-canal: materializa cada canal por separado (su sink), los dispone en una
 * rejilla (carriles por canal) en el nested space y vuelca cada canal a su columna del Dataset.
 * Comparte el modelo de fallo por fila con el camino legacy.
 */
async function finalizeMultiChannelBatchRun(
  input: FinalizeLoopBatchInput,
  failures: LoopRunFailure[],
  failedCount: number,
): Promise<FinalizeLoopBatchResult> {
  const channels = input.channels ?? [];

  const resolvedChannels: MaterializedChannel[] = [];
  const writeChannels: LoopChannelOutput[] = [];
  const allOutputs: string[] = [];
  const allMaterialized: MaterializedRow[] = [];

  for (const ch of channels) {
    const effectivePrompt = composeChannelEffectivePrompt(ch.nodePrompt, ch.channelPrompt);
    let mat = materializedRowsFromPipeline({
      rows: input.pipelineRows,
      templatePrompt: effectivePrompt,
      dataset: input.connectedDataset,
      listId: input.listId,
      bindings: input.bindings,
      activeImageRefs: input.activeImageRefs,
      fixedRefUrls: input.fixedRefUrls,
      cardIdsByRow: input.cardIdsByRow,
      manualTokenValues: input.manualTokenValues,
      sinkId: ch.channelId,
    });
    mat = await ensureMaterializedRowsHaveStableUrls(
      mat,
      input.projectId,
      `${input.loopId}_${ch.channelId}`,
    );

    resolvedChannels.push({
      channelId: ch.channelId,
      label: ch.label,
      templateType: ch.templateType,
      model: ch.templateModel,
      rows: mat,
    });
    allMaterialized.push(...mat);

    const persistable = mat.filter((r) => isPersistableImageUrl(r.output));
    for (const r of persistable) allOutputs.push(r.output!);

    if (ch.settings?.enabled) {
      writeChannels.push({ channelId: ch.channelId, settings: ch.settings, rows: persistable });
    }
  }

  const sub = buildMultiChannelGeneratedSubgraph(input.loopId, resolvedChannels);
  const mediaList = buildMultiChannelMediaListOutput(input.loopId, input.label, resolvedChannels);
  const lastRunOutputs = allOutputs;
  const firstOutput = lastRunOutputs[0] ?? "";

  let lastDatasetWriteSummary: string | undefined;
  if (input.writeDataset && writeChannels.some((c) => c.rows.length > 0)) {
    try {
      const writeResult = await persistLoopChannelsDatasetOutput({
        loopNodeId: input.loopId,
        nodes: input.flowNodes,
        edges: input.flowEdges,
        dataset: input.connectedDataset,
        listId: input.listId,
        channels: writeChannels,
        setNodes: input.setNodes,
      });
      const cols = writeResult.channels.map((c) => `«${c.fieldLabel}»`).join(", ");
      lastDatasetWriteSummary = `${writeResult.totalWritten} celdas → ${cols}`;
    } catch (writeErr) {
      console.error("[Loop] dataset output (multi-canal)", writeErr);
      failures.push({
        rowIndex: -1,
        error:
          writeErr instanceof Error ? writeErr.message : "Error al guardar resultados en el Dataset.",
      });
    }
  }

  const status = resolveLoopRunStatus({
    okCount: lastRunOutputs.length,
    failedCount,
    totalRows: input.totalRows,
    abortError: input.abortError,
  });

  const summaryError = formatLoopRunErrorMessage({
    okCount: lastRunOutputs.length,
    failedCount,
    totalRows: input.totalRows,
    failures: failures.filter((f) => f.rowIndex >= 0),
    abortError: input.abortError,
  });

  return {
    status,
    materializedRows: allMaterialized,
    okCount: lastRunOutputs.length,
    failedCount,
    failures: failures.filter((f) => f.rowIndex >= 0),
    lastRunOutputs,
    firstOutput,
    mediaList,
    subgraph: sub,
    summaryError,
    lastDatasetWriteSummary,
  };
}
