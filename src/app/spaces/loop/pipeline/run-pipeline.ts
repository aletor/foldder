/**
 * Loop como orquestador de subgrafo — motor de ejecución (F2).
 *
 * Ejecuta la tubería N veces (una por fila), con dos optimizaciones del spec:
 *  - Constantes: se evalúan UNA vez y se cachean para las N pasadas (no se re-ejecuta un Brain).
 *  - Fallo por fila aislado: si un nodo peta en una fila, esa fila se marca `failed` y el lote sigue.
 *
 * El motor no conoce tipos de nodo (opera sobre el registro de executors) ni el Dataset: la
 * resolución de inputs/overrides se inyecta vía `buildInputs`, que el adaptador de Loop cablea
 * a `resolveNodeInputs` + dataset-logic. El wallet NO se reserva aquí: cada `execute()` pasa por su
 * ruta `/api/*` (reserve/capture/release); el preflight Σ vive en estimate-pipeline-cost.
 */

import type { ExecutorRegistry } from "./executor-registry";
import type { ExecCapabilities, ExecutorNode, NodeOutput } from "./node-executor";
import type { NodeInputResolution, PipelineScope } from "./resolve-node-inputs";

export interface RowResult {
  rowIndex: number;
  status: "ok" | "failed";
  /** Output del sink primario de la tubería para esta fila (camino legacy de 1 canal). */
  final?: NodeOutput;
  /**
   * Output de CADA sink (canal de salida) para esta fila, mapeado por `sinkId`.
   * Con un único sink contiene una sola entrada (≡ `final`).
   */
  finals?: Record<string, NodeOutput | undefined>;
  /** Outputs de TODOS los nodos de la pasada (incluye intermedios; útil para expand). */
  intermediates: PipelineScope;
  error?: string;
}

export interface RunPipelineDeps {
  registry: ExecutorRegistry;
  nodeById: ReadonlyMap<string, ExecutorNode>;
  /** Construye inputs+overrides de un nodo en una pasada (constante o fila). */
  buildInputs: (args: {
    node: ExecutorNode;
    rowIndex: number;
    scope: PipelineScope;
    constantPass: boolean;
  }) => NodeInputResolution;
  ctxBase: {
    ownerEmail: string;
    capabilities?: ExecCapabilities;
    signal?: AbortSignal;
  };
}

export interface RunPipelineInput {
  order: readonly string[];
  iterated: ReadonlySet<string>;
  constant: ReadonlySet<string>;
  /** Sink primario (camino legacy de 1 canal). */
  sinkId: string | null;
  /** Todos los sinks (canales de salida). Si se omite, se usa `[sinkId]`. */
  sinkIds?: readonly string[];
  rowCount: number;
  onProgress?: (done: number, total: number) => void;
  onRowResult?: (result: RowResult) => void;
}

export interface RunPipelineResult {
  rows: RowResult[];
  constantCache: PipelineScope;
  okCount: number;
  failedCount: number;
}

/** Tipos de nodo de la tubería sin executor registrado (bloquean el run). */
export function findMissingExecutors(
  order: readonly string[],
  nodeById: ReadonlyMap<string, ExecutorNode>,
  registry: ExecutorRegistry,
): string[] {
  const missing = new Set<string>();
  for (const id of order) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (!registry.isPipelineExecutable(node.type)) missing.add(node.type);
  }
  return [...missing];
}

const CONSTANT_PASS_ROW_INDEX = -1;

export async function runPipeline(
  deps: RunPipelineDeps,
  input: RunPipelineInput,
): Promise<RunPipelineResult> {
  const { registry, nodeById, buildInputs, ctxBase } = deps;

  const missing = findMissingExecutors(input.order, nodeById, registry);
  if (missing.length > 0) {
    throw new Error(
      `La tubería tiene nodos sin executor registrado: ${missing.join(", ")}. ` +
        "Conéctala solo a nodos soportados por Loop.",
    );
  }

  const totalUnits = input.constant.size + input.iterated.size * input.rowCount;
  let done = 0;
  const tick = () => {
    done += 1;
    input.onProgress?.(done, totalUnits);
  };

  // (a) Constantes: una sola vez.
  const constantCache: PipelineScope = {};
  for (const id of input.order) {
    if (!input.constant.has(id)) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    const exec = registry.get(node.type)!;
    const { inputs, overrides } = buildInputs({
      node,
      rowIndex: CONSTANT_PASS_ROW_INDEX,
      scope: constantCache,
      constantPass: true,
    });
    constantCache[id] = await exec.execute({
      node,
      inputs,
      overrides,
      ctx: { ...ctxBase, rowIndex: CONSTANT_PASS_ROW_INDEX },
    });
    tick();
  }

  // (b) Filas: bucle con scope propio (parte de las constantes cacheadas).
  const rows: RowResult[] = [];
  let okCount = 0;
  let failedCount = 0;

  for (let r = 0; r < input.rowCount; r++) {
    const scope: PipelineScope = { ...constantCache };
    let status: "ok" | "failed" = "ok";
    let error: string | undefined;
    let ticksConsumed = 0;

    try {
      for (const id of input.order) {
        if (input.constant.has(id)) continue;
        if (ctxBase.signal?.aborted) throw new Error("Ejecución cancelada.");
        const node = nodeById.get(id);
        if (!node) continue;
        const exec = registry.get(node.type)!;
        const { inputs, overrides } = buildInputs({
          node,
          rowIndex: r,
          scope,
          constantPass: false,
        });
        scope[id] = await exec.execute({
          node,
          inputs,
          overrides,
          ctx: { ...ctxBase, rowIndex: r },
        });
        tick();
        ticksConsumed += 1;
      }
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
      // Libera el progreso de los sub-pasos no ejecutados de esta fila.
      const remaining = input.iterated.size - ticksConsumed;
      for (let k = 0; k < remaining; k++) tick();
    }

    const sinkIds =
      input.sinkIds && input.sinkIds.length > 0
        ? input.sinkIds
        : input.sinkId
          ? [input.sinkId]
          : [];
    const finals: Record<string, NodeOutput | undefined> = {};
    for (const sid of sinkIds) finals[sid] = scope[sid];
    // `final` (legacy): sink primario si existe; si no, el primer canal.
    const final = input.sinkId ? scope[input.sinkId] : sinkIds.length > 0 ? scope[sinkIds[0]!] : undefined;
    const result: RowResult = { rowIndex: r, status, final, finals, intermediates: scope, error };
    rows.push(result);
    input.onRowResult?.(result);
    if (status === "ok") okCount += 1;
    else failedCount += 1;
  }

  return { rows, constantCache, okCount, failedCount };
}
