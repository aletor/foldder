/**
 * Populate — materialización de nodos generados.
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

function rowNodeId(populateId: string, rowIndex: number, role: string): string {
  return `pop_${populateId}_r${rowIndex}_${role}`;
}

/** IDs de los nodos generados por un Populate dentro de su Nested Space (para reconciliar/limpiar). */
export function isGeneratedNodeIdFor(populateId: string, nodeId: string): boolean {
  return nodeId.startsWith(`pop_${populateId}_r`);
}

/** Construye el subgrafo de una fila. `originY` desplaza verticalmente el clúster. */
export function buildRowSubgraph(
  populateId: string,
  row: MaterializedRow,
  model: MaterializeTemplateModel,
  originY: number,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const nanoId = rowNodeId(populateId, row.rowIndex, "nano");
  const promptId = rowNodeId(populateId, row.rowIndex, "prompt");

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
    const refId = rowNodeId(populateId, row.rowIndex, `ref_${ref.inputId}`);
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
    type: "nanoBanana",
    position: { x: NANO_X, y: originY },
    data: {
      label: `Fila ${row.rowIndex + 1}`,
      modelKey: model.modelKey || "flash31",
      aspect_ratio: model.aspect_ratio || "16:9",
      resolution: model.resolution || "2k",
      thinking: !!model.thinking,
      imageProvider: model.imageProvider || "gemini",
      _populateRowCardId: row.cardId,
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

/** Construye todos los subgrafos de filas, apilados verticalmente. */
export function buildGeneratedSubgraph(
  populateId: string,
  rows: MaterializedRow[],
  model: MaterializeTemplateModel,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  rows.forEach((row, index) => {
    const sub = buildRowSubgraph(populateId, row, model, 80 + index * ROW_GAP_Y);
    nodes.push(...sub.nodes);
    edges.push(...sub.edges);
  });
  return { nodes, edges };
}

/** MediaListOutput agregado a partir de las filas generadas (para Export Multimedia). */
export function buildMediaListOutput(
  populateId: string,
  label: string,
  rows: MaterializedRow[],
): MediaListOutput {
  const ready = rows.filter((row) => !!row.output).length;
  return {
    kind: "media_list",
    sourceNodeId: populateId,
    sourceNodeType: "populate",
    title: label || "Populate",
    status: ready === 0 ? "empty" : ready === rows.length ? "frames_ready" : "frames_partial",
    items: rows.map((row, index) => ({
      id: rowNodeId(populateId, row.rowIndex, "nano"),
      order: index,
      title: `Fila ${row.rowIndex + 1}`,
      mediaType: "image" as const,
      url: row.output || undefined,
      ...(row.s3Key ? { s3Key: row.s3Key } : {}),
      status: row.output ? ("generated" as const) : ("pending" as const),
      metadata: { prompt: row.prompt },
    })),
    metadata: {
      cineNodeId: populateId,
      totalFrames: rows.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
