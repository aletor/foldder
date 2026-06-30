/**
 * Loop — materialización de nodos generados.
 *
 * Construye, por fila, un subgrafo AUTÓNOMO y autocontenido equivalente a lo que
 * montaría un usuario a mano:
 *   [promptInput (texto resuelto)] ─► prompt
 *   [mediaInput (ref fija/columna)] ─► image / image2 / ...
 *                                       └─► [Image Creation] (con su salida ya generada)
 *
 * Tras generarse, el nodo no depende del Dataset ni del orden de filas: sus
 * referencias quedan como nodos propios (instantánea independiente).
 */

import type { Edge, Node } from "@xyflow/react";
import type { MediaListOutput } from "@/app/spaces/media-list-output";
import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import { inferMediaListImageMimeType } from "../media-list-download";
import { primarySinkSourceHandle } from "./pipeline/pipeline-bindings";

export function isPersistableImageUrl(url?: string | null): boolean {
  const u = url?.trim();
  if (!u) return false;
  return u.startsWith("http") || u.startsWith("/") || u.startsWith("data:image/");
}

export interface MaterializedRefInput {
  /** Handle del Image Creation: "image" | "image2" | "image3" | "image4". */
  inputId: string;
  /** URL ya resuelta (ref fija o imagen de la columna en esta fila). */
  url: string;
  /** Etiqueta legible (p. ej. nombre de la columna o "Fondo"). */
  label?: string;
}

export interface MaterializedRow {
  rowIndex: number;
  cardId?: string;
  /** Prompt final con los tokens ya sustituidos. */
  prompt: string;
  refs: MaterializedRefInput[];
  /** Imagen generada (si ya se generó). */
  output?: string;
  s3Key?: string;
}

export interface MaterializeTemplateModel {
  modelKey?: string;
  aspect_ratio?: string;
  resolution?: string;
  thinking?: boolean;
  imageProvider?: string;
}

const ROW_GAP_Y = 560;
const NANO_X = 520;
const INPUT_X = 60;
const INPUT_GAP_Y = 120;

function rowNodeId(loopId: string, rowKey: string, role: string): string {
  return `loop_${loopId}_${rowKey}_${role}`;
}

/** IDs de los nodos generados por un Loop dentro de su Nested Space (para reconciliar/limpiar). */
export function isGeneratedNodeIdFor(loopId: string, nodeId: string): boolean {
  return (
    nodeId.startsWith(`loop_${loopId}_r`) ||
    nodeId.startsWith(`pop_${loopId}_r`)
  );
}

/**
 * Construye el subgrafo de una fila. `originY` desplaza verticalmente el clúster.
 *
 * `templateType` es el tipo del nodo creativo plantilla (por defecto Image
 * Creation). El cableado prompt + referencias por handle es genérico, así que
 * otros nodos creativos (Video Creation, etc.) funcionarán declarando sus inputs;
 * solo los campos de `model` son específicos de generación de imagen y se ignoran
 * sin efecto en nodos que no los usan.
 */
export function buildRowSubgraph(
  loopId: string,
  row: MaterializedRow,
  model: MaterializeTemplateModel,
  originY: number,
  templateType: string = "nanoBanana",
  rowKey: string = `r${row.rowIndex}`,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const nanoId = rowNodeId(loopId, rowKey, "nano");
  const promptId = rowNodeId(loopId, rowKey, "prompt");

  nodes.push({
    id: promptId,
    type: "promptInput",
    position: { x: INPUT_X, y: originY },
    data: { label: `Fila ${row.rowIndex + 1}`, value: row.prompt },
  });
  edges.push({
    id: `${promptId}__${nanoId}`,
    source: promptId,
    sourceHandle: "prompt",
    target: nanoId,
    targetHandle: "prompt",
    type: "buttonEdge",
  });

  row.refs.forEach((ref, index) => {
    if (!ref.url) return;
    const refId = rowNodeId(loopId, rowKey, `ref_${ref.inputId}`);
    nodes.push({
      id: refId,
      type: "mediaInput",
      position: { x: INPUT_X, y: originY + (index + 1) * INPUT_GAP_Y },
      data: { label: ref.label || ref.inputId, value: ref.url, type: "image" },
    });
    edges.push({
      id: `${refId}__${nanoId}`,
      source: refId,
      sourceHandle: "media",
      target: nanoId,
      targetHandle: ref.inputId,
      type: "buttonEdge",
    });
  });

  nodes.push({
    id: nanoId,
    type: templateType,
    position: { x: NANO_X, y: originY },
    data: {
      label: `Fila ${row.rowIndex + 1}`,
      modelKey: model.modelKey || "flash31",
      aspect_ratio: model.aspect_ratio || "16:9",
      resolution: model.resolution || "2k",
      thinking: !!model.thinking,
      imageProvider: model.imageProvider || "gemini",
      _loopRowCardId: row.cardId,
      ...(row.output
        ? {
            value: row.output,
            type: "image",
            generatedByAi: true,
            ...(row.s3Key ? { s3Key: row.s3Key } : {}),
          }
        : {}),
    },
  });

  return { nodes, edges };
}

export interface PipelineMaterializeStep {
  nodeType: string;
  nodeData?: Record<string, unknown>;
  output?: string;
  s3Key?: string;
}

const PIPELINE_STEP_GAP_X = 400;

function primaryInputHandleForNodeType(nodeType: string): string {
  const meta = NODE_REGISTRY[nodeType];
  return meta?.inputs?.[0]?.id ?? "media";
}

function nodeOutputData(
  nodeType: string,
  output: string | undefined,
  s3Key: string | undefined,
): Record<string, unknown> {
  if (!output?.trim()) return {};
  const base = {
    value: output,
    type: "image",
    generatedByAi: true,
    ...(s3Key ? { s3Key } : {}),
  };
  if (nodeType === "backgroundRemover") {
    return { ...base, result_rgba: output, result_mask: undefined };
  }
  return base;
}

/**
 * Subgrafo de una fila para tuberías de varios nodos (p. ej. Image Creation → Background Remover).
 * Con un solo paso `nanoBanana`, delega en `buildRowSubgraph`.
 */
export function buildPipelineRowSubgraph(
  loopId: string,
  row: MaterializedRow,
  model: MaterializeTemplateModel,
  originY: number,
  steps: PipelineMaterializeStep[],
  rowKey: string = `r${row.rowIndex}`,
): { nodes: Node[]; edges: Edge[] } {
  if (steps.length === 0) return { nodes: [], edges: [] };
  if (steps.length === 1 && steps[0]!.nodeType === "nanoBanana") {
    return buildRowSubgraph(
      loopId,
      { ...row, output: steps[0]!.output, s3Key: steps[0]!.s3Key },
      model,
      originY,
      "nanoBanana",
      rowKey,
    );
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const firstType = steps[0]!.nodeType;
  const promptId = rowNodeId(loopId, rowKey, "prompt");

  nodes.push({
    id: promptId,
    type: "promptInput",
    position: { x: INPUT_X, y: originY },
    data: { label: `Fila ${row.rowIndex + 1}`, value: row.prompt },
  });

  row.refs.forEach((ref, index) => {
    if (!ref.url) return;
    const refId = rowNodeId(loopId, rowKey, `ref_${ref.inputId}`);
    nodes.push({
      id: refId,
      type: "mediaInput",
      position: { x: INPUT_X, y: originY + (index + 1) * INPUT_GAP_Y },
      data: { label: ref.label || ref.inputId, value: ref.url, type: "image" },
    });
  });

  let prevId: string | null = null;
  let prevOutputHandle: string | null = null;

  steps.forEach((step, stepIndex) => {
    const role = stepIndex === 0 && firstType === "nanoBanana" ? "nano" : `step_${stepIndex}`;
    const nodeId = rowNodeId(loopId, rowKey, role);
    const x = NANO_X + stepIndex * PIPELINE_STEP_GAP_X;
    const output = step.output;

    const data: Record<string, unknown> = {
      label: `Fila ${row.rowIndex + 1}`,
      ...(step.nodeData ?? {}),
      ...(output ? nodeOutputData(step.nodeType, output, step.s3Key) : {}),
    };

    if (step.nodeType === "nanoBanana") {
      Object.assign(data, {
        modelKey: model.modelKey || "flash31",
        aspect_ratio: model.aspect_ratio || "16:9",
        resolution: model.resolution || "2k",
        thinking: !!model.thinking,
        imageProvider: model.imageProvider || "gemini",
        _loopRowCardId: row.cardId,
      });
    }

    nodes.push({
      id: nodeId,
      type: step.nodeType,
      position: { x, y: originY },
      data,
    });

    if (stepIndex === 0 && firstType === "nanoBanana") {
      edges.push({
        id: `${promptId}__${nodeId}`,
        source: promptId,
        sourceHandle: "prompt",
        target: nodeId,
        targetHandle: "prompt",
        type: "buttonEdge",
      });
      row.refs.forEach((ref) => {
        if (!ref.url) return;
        const refId = rowNodeId(loopId, rowKey, `ref_${ref.inputId}`);
        edges.push({
          id: `${refId}__${nodeId}`,
          source: refId,
          sourceHandle: "media",
          target: nodeId,
          targetHandle: ref.inputId,
          type: "buttonEdge",
        });
      });
    } else if (prevId && prevOutputHandle) {
      const inputHandle = primaryInputHandleForNodeType(step.nodeType);
      edges.push({
        id: `${prevId}__${nodeId}`,
        source: prevId,
        sourceHandle: prevOutputHandle,
        target: nodeId,
        targetHandle: inputHandle,
        type: "buttonEdge",
      });
    }

    prevId = nodeId;
    prevOutputHandle = primarySinkSourceHandle(step.nodeType) ?? "image";
  });

  return { nodes, edges };
}

export function buildPipelineGeneratedSubgraph(
  loopId: string,
  rows: MaterializedRow[],
  model: MaterializeTemplateModel,
  stepsPerRow: PipelineMaterializeStep[][],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  rows.forEach((row, index) => {
    const steps = stepsPerRow[index] ?? [];
    const sub = buildPipelineRowSubgraph(
      loopId,
      row,
      model,
      80 + index * ROW_GAP_Y,
      steps,
    );
    nodes.push(...sub.nodes);
    edges.push(...sub.edges);
  });
  return { nodes, edges };
}

/** Construye todos los subgrafos de filas, apilados verticalmente. */
export function buildGeneratedSubgraph(
  loopId: string,
  rows: MaterializedRow[],
  model: MaterializeTemplateModel,
  templateType: string = "nanoBanana",
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  rows.forEach((row, index) => {
    const sub = buildRowSubgraph(loopId, row, model, 80 + index * ROW_GAP_Y, templateType);
    nodes.push(...sub.nodes);
    edges.push(...sub.edges);
  });
  return { nodes, edges };
}

/** Separación horizontal entre carriles de canal en el nested space multi-canal. */
const CHANNEL_LANE_GAP_X = 1200;

/** Un canal de salida materializado (un creador conectado a la plantilla) y sus filas. */
export interface MaterializedChannel {
  /** Id estable del canal (normalmente el `sinkId`). */
  channelId: string;
  label?: string;
  /** Tipo de nodo del sink (por defecto Image Creation). */
  templateType: string;
  model: MaterializeTemplateModel;
  rows: MaterializedRow[];
}

/**
 * Nested space multi-canal: cada canal ocupa un carril horizontal (eje X) y dentro de él las filas
 * del Dataset se apilan verticalmente (eje Y). Así las variantes de una misma fila quedan alineadas
 * a la misma altura, una por carril. Las IDs incluyen el índice de canal para no colisionar.
 */
export function buildMultiChannelGeneratedSubgraph(
  loopId: string,
  channels: MaterializedChannel[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  channels.forEach((channel, ci) => {
    const laneX = ci * CHANNEL_LANE_GAP_X;
    channel.rows.forEach((row, ri) => {
      const sub = buildRowSubgraph(
        loopId,
        row,
        channel.model,
        80 + ri * ROW_GAP_Y,
        channel.templateType,
        `r${row.rowIndex}_c${ci}`,
      );
      for (const n of sub.nodes) {
        n.position = { ...n.position, x: n.position.x + laneX };
      }
      nodes.push(...sub.nodes);
      edges.push(...sub.edges);
    });
  });
  return { nodes, edges };
}

/** MediaListOutput agregado a partir de las filas generadas (para Export Multimedia). */
export function buildMediaListOutput(
  loopId: string,
  label: string,
  rows: MaterializedRow[],
): MediaListOutput {
  const ready = rows.filter((row) => !!row.output).length;
  return {
    kind: "media_list",
    sourceNodeId: loopId,
    sourceNodeType: "loop",
    title: label || "Loop",
    status: ready === 0 ? "empty" : ready === rows.length ? "frames_ready" : "frames_partial",
    items: rows.map((row, index) => ({
      id: rowNodeId(loopId, `r${row.rowIndex}`, "nano"),
      order: index,
      title: `Fila ${row.rowIndex + 1}`,
      mediaType: "image" as const,
      url: row.output || undefined,
      ...(row.s3Key ? { s3Key: row.s3Key } : {}),
      ...(row.output || row.s3Key
        ? { mimeType: inferMediaListImageMimeType({
            id: "",
            order: index,
            title: "",
            mediaType: "image",
            status: "generated",
            url: row.output,
            s3Key: row.s3Key,
          }) }
        : {}),
      status: row.output ? ("generated" as const) : ("pending" as const),
      metadata: { prompt: row.prompt },
    })),
    metadata: {
      cineNodeId: loopId,
      totalFrames: rows.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * MediaListOutput multi-canal: concatena los items de todos los canales con IDs/títulos únicos por
 * canal (para que Export Multimedia reciba todas las variantes sin colisiones).
 */
export function buildMultiChannelMediaListOutput(
  loopId: string,
  label: string,
  channels: MaterializedChannel[],
): MediaListOutput {
  const items: MediaListOutput["items"] = [];
  let totalReady = 0;
  let totalRows = 0;
  let order = 0;
  channels.forEach((channel, ci) => {
    const chLabel = channel.label || `Canal ${ci + 1}`;
    channel.rows.forEach((row) => {
      totalRows += 1;
      if (row.output) totalReady += 1;
      items.push({
        id: rowNodeId(loopId, `r${row.rowIndex}_c${ci}`, "nano"),
        order: order++,
        title: `${chLabel} · Fila ${row.rowIndex + 1}`,
        mediaType: "image",
        url: row.output || undefined,
        ...(row.s3Key ? { s3Key: row.s3Key } : {}),
        ...(row.output || row.s3Key
          ? { mimeType: inferMediaListImageMimeType({
              id: "",
              order: 0,
              title: "",
              mediaType: "image",
              status: "generated",
              url: row.output,
              s3Key: row.s3Key,
            }) }
          : {}),
        status: row.output ? "generated" : "pending",
        metadata: { prompt: row.prompt },
      });
    });
  });
  return {
    kind: "media_list",
    sourceNodeId: loopId,
    sourceNodeType: "loop",
    title: label || "Loop",
    status: totalReady === 0 ? "empty" : totalReady === totalRows ? "frames_ready" : "frames_partial",
    items,
    metadata: {
      cineNodeId: loopId,
      totalFrames: totalRows,
      generatedAt: new Date().toISOString(),
    },
  };
}
