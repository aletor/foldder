/**
 * Heurística: el usuario pide un bloque NUEVO (otro listado, otro flujo…) y el modelo no debe
 * sobrescribir ids existentes. Si coincide, reasignamos ids del delta antes del merge.
 */
export function shouldTreatAssistantDeltaAsAdditiveOnly(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  if (/\[clarification_reply\]/i.test(p)) return false;

  if (
    /\b(sin tocar|no toques|no modifiques|intacto|leave|don't touch|dont touch)\b/i.test(p) &&
    /\b(crea|crear|añade|add|make|build|genera)\b/i.test(p)
  ) {
    return true;
  }

  if (/\b(nuevo|nueva|nuevos|nuevas|otro|otra|otros|otras)\b/.test(p)) {
    if (/\b(listado|lista|selector)\b/.test(p)) return true;
    if (/\b(grafo|flujo|pipeline|grupo|conjunto|bloque)\b/.test(p)) return true;
  }

  if (/\b(another|new)\s+(list|listado|selector|pipeline|group)\b/i.test(p)) return true;

  if (
    /\b(separate|independiente|adicional|additional|duplicate)\b/i.test(p) &&
    /\b(listado|lista)\b/.test(p)
  ) {
    return true;
  }

  if (/\b(segundo|second|tercer|third)\b/.test(p) && /\b(listado|lista)\b/.test(p)) {
    return true;
  }

  return false;
}

/**
 * ¿Debemos renombrar ids del delta que chocan con el lienzo? Sí casi siempre que se "crea" un
 * listado/flujo nuevo; no si el usuario parece editar nodos ya seleccionados.
 */
export function shouldRemapAssistantDeltaCollisions(
  prompt: string,
  selectedCount: number
): boolean {
  const p = prompt.trim().toLowerCase();
  if (/\[clarification_reply\]/i.test(prompt)) return false;

  const creatingListado =
    /\blistado\b/i.test(p) &&
    (/\b(crea|crear|añade|añadir|add|make|build|genera|diseña|monta|prepare)\b/i.test(p) ||
      /\b(con|with)\s*\d+/i.test(p) ||
      /\d+\s*(tipos|opciones|choices|items)\b/i.test(p) ||
      /\b(un|a)\s+listado\b/i.test(p));

  // Selección + verbo de edición (y no es crear otro listado): permitir merge por id
  if (selectedCount > 0) {
    const editOnly =
      /\b(cambia|modifica|actualiza|edit|update|replace|renombra|rename|ajusta|ponme|set|mueve|move|elimina|delete|borra)\b/i.test(
        p
      ) && !creatingListado;
    if (editOnly) return false;
  }

  if (shouldTreatAssistantDeltaAsAdditiveOnly(prompt)) return true;

  if (creatingListado) return true;

  if (
    /\b(crea|crear|añade|añadir|add|make|build|genera)\b/i.test(p) &&
    /\b(listado|lista)\b/i.test(p)
  ) {
    return true;
  }

  return false;
}

function collectStringIds<T extends { id?: string }>(arr: T[]): Set<string> {
  const s = new Set<string>();
  for (const x of arr) {
    if (typeof x.id === "string" && x.id) s.add(x.id);
  }
  return s;
}

/**
 * Si el delta reutiliza ids que ya existen en el lienzo, renombra esos nodos (y aristas que
 * referencian esos ids) para que el merge sea ADD-only y no machaque prompts/listados previos.
 */
export function remapCollidingAssistantDelta(
  existingNodes: unknown[],
  existingEdges: unknown[],
  deltaNodes: unknown[],
  deltaEdges: unknown[]
): {
  nodes: unknown[];
  edges: unknown[];
  /** Solo entradas donde el id del delta cambió */
  nodeIdRemap: Map<string, string>;
} {
  const existingNodeIds = collectStringIds((existingNodes ?? []) as { id?: string }[]);
  const existingEdgeIds = collectStringIds((existingEdges ?? []) as { id?: string }[]);
  const nodeIdRemap = new Map<string, string>();
  let serial = 0;

  const uniqueNodeId = (type: unknown) => {
    serial += 1;
    const t =
      typeof type === "string" && type
        ? String(type).replace(/[^a-zA-Z0-9_]/g, "_")
        : "node";
    return `asst_${t}_${Date.now()}_${serial}_${Math.random().toString(36).slice(2, 8)}`;
  };

  const uniqueEdgeId = () => {
    serial += 1;
    return `asst_e_${Date.now()}_${serial}_${Math.random().toString(36).slice(2, 6)}`;
  };

  const newNodes = (Array.isArray(deltaNodes) ? deltaNodes : []).map((raw) => {
    const n = raw as { id?: string; type?: string };
    const id = n?.id;
    if (typeof id !== "string" || !id) return raw;
    if (!existingNodeIds.has(id)) return raw;
    const newId = uniqueNodeId(n.type);
    nodeIdRemap.set(id, newId);
    return { ...n, id: newId };
  });

  const applyNodeRemap = (id: string) => nodeIdRemap.get(id) ?? id;

  const newEdges = (Array.isArray(deltaEdges) ? deltaEdges : []).map((raw) => {
    const e = raw as {
      id?: string;
      source?: string;
      target?: string;
      sourceHandle?: string;
      targetHandle?: string;
    };
    const out = { ...e };
    if (typeof e.source === "string") out.source = applyNodeRemap(e.source);
    if (typeof e.target === "string") out.target = applyNodeRemap(e.target);
    if (typeof e.id === "string" && e.id && existingEdgeIds.has(e.id)) {
      out.id = uniqueEdgeId();
    }
    return out;
  });

  return { nodes: newNodes, edges: newEdges, nodeIdRemap };
}

/**
 * Fusiona la respuesta del modelo con el grafo actual sin borrar nodos/aristas
 * que el modelo no haya mencionado (merge por id).
 *
 * Así, si el usuario pide "añade un prompt" y el modelo solo devuelve ese nodo,
 * no se pierde el resto del lienzo.
 */

export function mergeAssistantDeltaIntoWorkspace(
  existingNodes: unknown[],
  existingEdges: unknown[],
  deltaNodes: unknown[],
  deltaEdges: unknown[]
): { nodes: unknown[]; edges: unknown[] } {
  const safeExistingN = Array.isArray(existingNodes) ? existingNodes : [];
  const safeExistingE = Array.isArray(existingEdges) ? existingEdges : [];
  const safeDeltaN = Array.isArray(deltaNodes) ? deltaNodes : [];
  const safeDeltaE = Array.isArray(deltaEdges) ? deltaEdges : [];

  const byNodeId = new Map<string, unknown>();
  for (const n of safeExistingN) {
    const id = (n as { id?: string })?.id;
    if (typeof id === "string" && id) byNodeId.set(id, n);
  }
  for (const n of safeDeltaN) {
    const id = (n as { id?: string })?.id;
    if (typeof id === "string" && id) byNodeId.set(id, n);
  }

  const nodes = Array.from(byNodeId.values());

  const nodeIds = new Set(
    nodes.map((n) => (n as { id?: string }).id).filter((x): x is string => typeof x === "string")
  );

  const byEdgeId = new Map<string, unknown>();
  for (const e of safeExistingE) {
    const id = (e as { id?: string })?.id;
    if (typeof id === "string" && id) byEdgeId.set(id, e);
  }
  for (const e of safeDeltaE) {
    const id = (e as { id?: string })?.id;
    if (typeof id === "string" && id) byEdgeId.set(id, e);
  }

  const edges = Array.from(byEdgeId.values()).filter((e) => {
    const s = (e as { source?: string }).source;
    const t = (e as { target?: string }).target;
    return typeof s === "string" && typeof t === "string" && nodeIds.has(s) && nodeIds.has(t);
  });

  return { nodes, edges };
}
