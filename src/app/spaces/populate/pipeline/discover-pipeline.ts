/**
 * Populate como orquestador de SUBGRAFO — capa de grafo pura (F0).
 *
 * Populate deja de envolver "un nodo" y pasa a envolver la tubería transitiva de
 * nodos que desemboca en su handle de entrada de plantilla. Este módulo resuelve,
 * de forma puramente algorítmica (sin React/React Flow), las cuatro preguntas base:
 *
 *   1. ¿Qué nodos forman la tubería?            → discoverPipeline (recorrido hacia atrás)
 *   2. ¿En qué orden se ejecutan?               → topoSortPipeline (DAG)
 *   3. ¿Cuáles se re-ejecutan por fila?         → classifyConstantIterated (cono del Dataset)
 *   4. ¿Es una configuración válida?            → validatePipeline (sink único, sin ciclos…)
 *
 * Frontera del recorrido: Dataset (iterador), inputs pasivos del canvas (`mediaInput`,
 * `promptInput`) y el propio Populate. Otras fuentes externas con lógica propia (p. ej. Brain)
 * SÍ entran en la tubería y se clasifican como constante (una evaluación para todas las filas).
 *
 * Principio rector: un nodo simple conectado es una tubería de longitud 1. No hay un
 * code path especial para "un nodo"; el mismo descubrimiento sirve para 1 o para N.
 */

/** Handle de entrada de Populate por el que llega la PLANTILLA / sink de la tubería. */
export const POPULATE_PIPELINE_INPUT_HANDLE = "template" as const;
/** Handle de entrada de Populate por el que llega el Dataset (iterador, frontera). */
export const POPULATE_DATASET_INPUT_HANDLE = "dataset" as const;
/** Tipo de nodo Dataset (frontera del recorrido). */
export const DATASET_NODE_TYPE = "dataset" as const;
/** Tipo de nodo Populate (para prohibir Populate anidado en v1). */
export const POPULATE_NODE_TYPE = "populate" as const;

/**
 * Tipos que actúan como frontera del recorrido: no se ejecutan ni entran en `order`.
 * Sus valores se resuelven como inputs fijos vía `resolveFixedExternal` en el adaptador.
 */
export const PIPELINE_FRONTIER_NODE_TYPES = new Set<string>([
  DATASET_NODE_TYPE,
  "mediaInput",
  "promptInput",
]);

const DEFAULT_FRONTIER = PIPELINE_FRONTIER_NODE_TYPES;

export interface PipelineEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface PipelineNodeRef {
  id: string;
  type?: string | null;
}

interface DiscoverOptions {
  /** Handle de entrada que define el sink de la tubería (por defecto `template`). */
  pipelineInputHandle?: string;
  /** Tipos de nodo que actúan como frontera (no entran en la tubería). Por defecto el Dataset. */
  frontierNodeTypes?: ReadonlySet<string>;
}

function nodesById<N extends PipelineNodeRef>(nodes: readonly N[]): Map<string, N> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** IDs únicos de los nodos cuyo output entra a `nodeId` por CUALQUIER handle de entrada. */
function inputProducerIds(nodeId: string, edges: readonly PipelineEdge[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    if (seen.has(e.source)) continue;
    seen.add(e.source);
    out.push(e.source);
  }
  return out;
}

/**
 * IDs de los nodos que alimentan el handle de PLANTILLA de Populate (candidatos a sink).
 * En una configuración válida hay exactamente uno (ver validatePipeline).
 */
export function pipelineInputProducerIds(
  populateId: string,
  edges: readonly PipelineEdge[],
  pipelineInputHandle: string = POPULATE_PIPELINE_INPUT_HANDLE,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.target !== populateId) continue;
    if (e.targetHandle !== pipelineInputHandle) continue;
    if (seen.has(e.source)) continue;
    seen.add(e.source);
    out.push(e.source);
  }
  return out;
}

/**
 * El sink de la tubería: el único nodo cuyo output entra al handle de plantilla de Populate.
 * Devuelve `null` si no hay exactamente uno (cero o múltiples → inválido, ver validatePipeline).
 */
export function findPipelineSinkId(
  populateId: string,
  edges: readonly PipelineEdge[],
  pipelineInputHandle: string = POPULATE_PIPELINE_INPUT_HANDLE,
): string | null {
  const producers = pipelineInputProducerIds(populateId, edges, pipelineInputHandle);
  return producers.length === 1 ? producers[0] : null;
}

/**
 * IDs de todos los nodos de la tubería (recorrido hacia atrás desde el sink de Populate).
 * Excluye el propio Populate y los nodos frontera (Dataset). El orden es de descubrimiento,
 * NO topológico (usa topoSortPipeline para el orden de ejecución).
 */
export function discoverPipelineNodeIds<N extends PipelineNodeRef>(
  populateId: string,
  nodes: readonly N[],
  edges: readonly PipelineEdge[],
  opts: DiscoverOptions = {},
): string[] {
  const pipelineInputHandle = opts.pipelineInputHandle ?? POPULATE_PIPELINE_INPUT_HANDLE;
  const frontier = opts.frontierNodeTypes ?? DEFAULT_FRONTIER;
  const byId = nodesById(nodes);

  const isFrontier = (id: string): boolean => {
    const t = byId.get(id)?.type ?? undefined;
    return t != null && frontier.has(t);
  };

  const visited = new Set<string>();
  const ordered: string[] = [];
  // Semilla: solo los productores del handle de PLANTILLA (el Dataset entra por otro handle).
  const stack = pipelineInputProducerIds(populateId, edges, pipelineInputHandle).filter(
    (id) => id !== populateId && byId.has(id) && !isFrontier(id),
  );

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    ordered.push(id);
    for (const producer of inputProducerIds(id, edges)) {
      if (producer === populateId) continue;
      if (!byId.has(producer)) continue; // arista colgante
      if (isFrontier(producer)) continue; // el Dataset es frontera, no entra
      if (!visited.has(producer)) stack.push(producer);
    }
  }

  return ordered;
}

/** Igual que discoverPipelineNodeIds pero devuelve los objetos de nodo. */
export function discoverPipeline<N extends PipelineNodeRef>(
  populateId: string,
  nodes: readonly N[],
  edges: readonly PipelineEdge[],
  opts: DiscoverOptions = {},
): N[] {
  const ids = new Set(discoverPipelineNodeIds(populateId, nodes, edges, opts));
  return nodes.filter((n) => ids.has(n.id));
}

export interface TopoSortResult {
  ok: boolean;
  /** Orden topológico (productores antes que consumidores). Vacío parcial si hay ciclo. */
  order: string[];
  /** Nodos que quedaron en un ciclo (no ordenables). */
  cyclic: string[];
}

/**
 * Orden topológico del subgrafo inducido por `nodeIds` (aristas internas).
 * Determinista: ante empates, respeta el orden de `nodeIds`. Detecta ciclos.
 */
export function topoSortPipeline(
  nodeIds: readonly string[],
  edges: readonly PipelineEdge[],
): TopoSortResult {
  const inSet = new Set(nodeIds);
  const index = new Map<string, number>();
  nodeIds.forEach((id, i) => index.set(id, i));

  const adjacency = new Map<string, Set<string>>(); // source → targets (internos)
  const indegree = new Map<string, number>();
  for (const id of nodeIds) {
    adjacency.set(id, new Set());
    indegree.set(id, 0);
  }
  for (const e of edges) {
    if (!inSet.has(e.source) || !inSet.has(e.target)) continue;
    if (e.source === e.target) continue; // auto-arista: ignorada para el orden
    const targets = adjacency.get(e.source)!;
    if (!targets.has(e.target)) {
      targets.add(e.target);
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
  }

  const order: string[] = [];
  const ready = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  // Cola determinista por índice original.
  const pick = (): string | undefined => {
    if (ready.length === 0) return undefined;
    ready.sort((a, b) => (index.get(a)! - index.get(b)!));
    return ready.shift();
  };

  let current = pick();
  while (current != null) {
    order.push(current);
    for (const target of adjacency.get(current)!) {
      const d = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, d);
      if (d === 0) ready.push(target);
    }
    current = pick();
  }

  const cyclic = nodeIds.filter((id) => !order.includes(id));
  return { ok: cyclic.length === 0, order, cyclic };
}

export interface ClassifyResult {
  /** Nodos que se re-ejecutan por fila (dependen del Dataset). */
  iterated: Set<string>;
  /** Nodos que se evalúan una sola vez y se cachean para las N pasadas. */
  constant: Set<string>;
}

/**
 * Clasifica cada nodo como ITERADO o CONSTANTE (cono de dependencia del Dataset, §4 spec):
 * un nodo es iterado si alguna de sus variables lee una columna del Dataset
 * (`datasetBoundNodeIds`) o si algún productor upstream (dentro de la tubería) es iterado.
 *
 * `order` debe venir de topoSortPipeline para que la propagación upstream→downstream funcione.
 */
export function classifyConstantIterated(args: {
  order: readonly string[];
  edges: readonly PipelineEdge[];
  datasetBoundNodeIds: ReadonlySet<string>;
}): ClassifyResult {
  const { order, edges, datasetBoundNodeIds } = args;
  const inSet = new Set(order);
  const iterated = new Set<string>();

  for (const id of order) {
    const boundToDataset = datasetBoundNodeIds.has(id);
    let upstreamIterated = false;
    if (!boundToDataset) {
      for (const e of edges) {
        if (e.target !== id) continue;
        if (!inSet.has(e.source)) continue;
        if (iterated.has(e.source)) {
          upstreamIterated = true;
          break;
        }
      }
    }
    if (boundToDataset || upstreamIterated) iterated.add(id);
  }

  const constant = new Set<string>(order.filter((id) => !iterated.has(id)));
  return { iterated, constant };
}

export interface PipelineValidation {
  ok: boolean;
  errors: string[];
  /** Sink resuelto (null si no hay exactamente uno). */
  sinkId: string | null;
}

/**
 * Reglas de validez (§11 spec):
 *  - DAG con SINK ÚNICO (una sola conexión entra al handle de plantilla de Populate).
 *  - Sin ciclos en la tubería.
 *  - Populate anidado dentro de la tubería: prohibido en v1.
 */
export function validatePipeline<N extends PipelineNodeRef>(args: {
  populateId: string;
  nodes: readonly N[];
  edges: readonly PipelineEdge[];
  pipelineInputHandle?: string;
}): PipelineValidation {
  const { populateId, nodes, edges } = args;
  const pipelineInputHandle = args.pipelineInputHandle ?? POPULATE_PIPELINE_INPUT_HANDLE;
  const errors: string[] = [];

  const sinkProducers = pipelineInputProducerIds(populateId, edges, pipelineInputHandle);
  if (sinkProducers.length === 0) {
    errors.push("La tubería no tiene plantilla: conecta un nodo al handle de Populate.");
  } else if (sinkProducers.length > 1) {
    errors.push(
      "La tubería debe tener un único sink: hay varias conexiones entrando a la plantilla de Populate.",
    );
  }
  const sinkId = sinkProducers.length === 1 ? sinkProducers[0] : null;

  const pipelineIds = discoverPipelineNodeIds(populateId, nodes, edges, { pipelineInputHandle });

  const byId = nodesById(nodes);
  const nested = pipelineIds.filter((id) => byId.get(id)?.type === POPULATE_NODE_TYPE);
  if (nested.length > 0) {
    errors.push("Populate anidado dentro de la tubería no está soportado en v1.");
  }

  const topo = topoSortPipeline(pipelineIds, edges);
  if (!topo.ok) {
    errors.push("La tubería contiene un ciclo: debe ser un grafo acíclico (DAG).");
  }

  return { ok: errors.length === 0, errors, sinkId };
}

export interface PipelineAnalysis {
  /** IDs de la tubería en orden de descubrimiento. */
  pipelineNodeIds: string[];
  /** Orden topológico de ejecución. */
  order: string[];
  /** Sink único (null si inválido). */
  sinkId: string | null;
  iterated: Set<string>;
  constant: Set<string>;
  validation: PipelineValidation;
}

/**
 * Análisis completo de una tubería de Populate: descubrimiento + orden + clasificación + validación.
 * `datasetBoundNodeIds` lo aporta el caller a partir de los bindings namespaced de Populate
 * (un nodo está bound al Dataset si alguno de sus inputs mapea a una columna).
 */
export function analyzePipeline<N extends PipelineNodeRef>(args: {
  populateId: string;
  nodes: readonly N[];
  edges: readonly PipelineEdge[];
  datasetBoundNodeIds?: ReadonlySet<string>;
  pipelineInputHandle?: string;
}): PipelineAnalysis {
  const { populateId, nodes, edges } = args;
  const pipelineInputHandle = args.pipelineInputHandle ?? POPULATE_PIPELINE_INPUT_HANDLE;
  const datasetBoundNodeIds = args.datasetBoundNodeIds ?? new Set<string>();

  const pipelineNodeIds = discoverPipelineNodeIds(populateId, nodes, edges, { pipelineInputHandle });
  const topo = topoSortPipeline(pipelineNodeIds, edges);
  const { iterated, constant } = classifyConstantIterated({
    order: topo.order,
    edges,
    datasetBoundNodeIds,
  });
  const validation = validatePipeline({ populateId, nodes, edges, pipelineInputHandle });

  return {
    pipelineNodeIds,
    order: topo.order,
    sinkId: validation.sinkId,
    iterated,
    constant,
    validation,
  };
}
