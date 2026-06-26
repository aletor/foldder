/**
 * Populate como orquestador de subgrafo — resolución de inputs por nodo y fila (F2, puro).
 *
 * Ensambla, para un nodo de la tubería, sus `PortInputs` (por handle) y los `VarOverrides`
 * de la fila, combinando tres fuentes con precedencia clara:
 *
 *   1. Override de columna del Dataset (binding de Populate)  ← máxima prioridad
 *   2. Output de un nodo upstream DENTRO de la tubería (scope de esta pasada)
 *   3. Valor fijo de una fuente externa conectada (mediaInput/promptInput…)
 *
 * Es puro: el acceso al Dataset y al grafo vivo se inyecta vía callbacks, de modo que el motor
 * y este resolutor se testean sin React/Dataset/red. El adaptador de Populate cablea los callbacks.
 */

import type { PipelineEdge } from "./discover-pipeline";
import type {
  ExecutorNode,
  NodeOutput,
  NodeOutputKind,
  PortInputs,
  PortInputValue,
  VarOverrides,
} from "./node-executor";

/** Outputs ya calculados de upstream en la pasada actual (constantes + iterados previos). */
export type PipelineScope = Record<string, NodeOutput | undefined>;

export interface InputHandleDescriptor {
  id: string;
  kind: NodeOutputKind;
}

export interface NodeInputResolution {
  inputs: PortInputs;
  overrides: VarOverrides;
}

/** Convierte un NodeOutput en un valor de input de puerto (o undefined si está vacío). */
export function portValueFromOutput(out: NodeOutput | undefined): PortInputValue | undefined {
  if (!out) return undefined;
  if (out.kind === "text") {
    return typeof out.text === "string" && out.text.length > 0 ? { kind: "text", text: out.text } : undefined;
  }
  if (out.kind === "image") {
    return out.url ? { kind: "image", url: out.url, s3Key: out.s3Key } : undefined;
  }
  if (out.kind === "video") {
    return out.url ? { kind: "video", url: out.url, s3Key: out.s3Key } : undefined;
  }
  return undefined;
}

function scalarizeOverride(v: PortInputValue): unknown {
  return v.kind === "text" ? v.text : v.url;
}

export interface ResolveNodeInputsArgs {
  node: ExecutorNode;
  /** Handles de entrada del nodo (id + tipo lógico). Derivados del registry por el adaptador. */
  inputHandles: InputHandleDescriptor[];
  edges: readonly PipelineEdge[];
  /** Ids de los nodos de la tubería (para distinguir upstream interno de fuente externa). */
  pipelineNodeIds: ReadonlySet<string>;
  scope: PipelineScope;
  /** Claves bindeables del nodo (por defecto, los ids de los handles de entrada). */
  bindableKeys?: string[];
  /** Override de la fila para una variable bindeada a columna del Dataset. */
  resolveColumnOverride?: (nodeId: string, inputKey: string) => PortInputValue | undefined;
  /** Valor fijo desde una fuente externa conectada (no pertenece a la tubería iterada). */
  resolveFixedInput?: (edge: PipelineEdge) => PortInputValue | undefined;
}

/**
 * Resuelve inputs + overrides de un nodo en una pasada. No muta nada: devuelve estructuras nuevas.
 */
export function resolveNodeInputs(args: ResolveNodeInputsArgs): NodeInputResolution {
  const { node, inputHandles, edges, pipelineNodeIds, scope } = args;
  const byHandle: Record<string, PortInputValue | undefined> = {};

  // (2)/(3) Resolver cada handle desde upstream interno o fuente externa fija.
  for (const handle of inputHandles) {
    const incoming = edges.filter(
      (e) => e.target === node.id && (e.targetHandle ?? "") === handle.id,
    );
    for (const edge of incoming) {
      let val: PortInputValue | undefined;
      if (pipelineNodeIds.has(edge.source)) {
        val = portValueFromOutput(scope[edge.source]);
      } else {
        val = args.resolveFixedInput?.(edge);
      }
      if (val) {
        byHandle[handle.id] = val;
        break; // primer valor resuelto por handle
      }
    }
  }

  // (1) Overrides de columna: máxima prioridad; pisan el handle si son media.
  const overrides: VarOverrides = {};
  const keys = args.bindableKeys ?? inputHandles.map((h) => h.id);
  for (const key of keys) {
    const val = args.resolveColumnOverride?.(node.id, key);
    if (!val) continue;
    overrides[key] = scalarizeOverride(val);
    if (val.kind === "image" || val.kind === "video") {
      byHandle[key] = val;
    }
  }

  return { inputs: { byHandle }, overrides };
}
