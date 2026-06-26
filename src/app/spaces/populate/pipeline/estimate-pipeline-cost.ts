/**
 * Populate como orquestador de subgrafo — preflight de coste Σ (F2, puro).
 *
 *   estimado = Σ estimateCost(iterado) × N_filas  +  Σ estimateCost(constante)
 *
 * El coste es el MISMO en modo `assets` y `expand` (la reserva no depende del modo). El motor no
 * reserva aquí: este número alimenta el gate del wallet en la UI antes de lanzar el lote.
 */

import type { ExecutorRegistry } from "./executor-registry";
import type { ExecutorNode, VarOverrides } from "./node-executor";

export interface PipelineCostLine {
  nodeId: string;
  nodeType: string;
  label: string;
  /** Coste de UNA ejecución. */
  unitCostUsd: number;
  /** Veces que se ejecuta (iterado = N filas; constante = 1). */
  runs: number;
  /** unitCostUsd × runs. */
  costUsd: number;
  iterated: boolean;
}

export interface PipelineCostEstimate {
  totalUsd: number;
  lines: PipelineCostLine[];
  /** Tipos sin executor registrado (no estimables): bloquean el run. */
  missingExecutorTypes: string[];
}

export function estimatePipelineCost(args: {
  order: readonly string[];
  iterated: ReadonlySet<string>;
  rowCount: number;
  registry: ExecutorRegistry;
  nodeById: ReadonlyMap<string, ExecutorNode>;
  /** Overrides representativos por nodo (opcional; el coste suele depender solo de node.data). */
  overridesByNode?: (nodeId: string) => VarOverrides;
}): PipelineCostEstimate {
  const { order, iterated, rowCount, registry, nodeById } = args;
  const lines: PipelineCostLine[] = [];
  const missing = new Set<string>();
  let totalUsd = 0;

  for (const id of order) {
    const node = nodeById.get(id);
    if (!node) continue;
    const exec = registry.get(node.type);
    if (!exec) {
      missing.add(node.type);
      continue;
    }
    const overrides = args.overridesByNode?.(id) ?? {};
    const unit = exec.estimateCost({ node, overrides });
    const isIterated = iterated.has(id);
    const runs = isIterated ? rowCount : 1;
    const costUsd = unit.costUsd * runs;
    totalUsd += costUsd;
    lines.push({
      nodeId: id,
      nodeType: node.type,
      label: unit.label,
      unitCostUsd: unit.costUsd,
      runs,
      costUsd,
      iterated: isIterated,
    });
  }

  return { totalUsd, lines, missingExecutorTypes: [...missing] };
}
