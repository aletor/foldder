/**
 * Ordena ids de ejecución respetando aristas (fuentes antes que destinos).
 */

export function orderExecuteNodeIds(
  requested: string[],
  edges: { source: string; target: string }[]
): string[] {
  if (requested.length === 0) return [];
  const want = new Set(requested);
  const filteredEdges = edges.filter((e) => want.has(e.source) && want.has(e.target));

  const incoming = new Map<string, number>();
  for (const id of requested) incoming.set(id, 0);
  for (const e of filteredEdges) {
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const id of requested) {
    if ((incoming.get(id) || 0) === 0) queue.push(id);
  }

  const seen = new Set<string>();
  const out: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);

    for (const e of filteredEdges) {
      if (e.source !== id) continue;
      const t = e.target;
      if (!want.has(t)) continue;
      const next = (incoming.get(t) || 0) - 1;
      incoming.set(t, next);
      if (next === 0) queue.push(t);
    }
  }

  for (const id of requested) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

const RUNNABLE_TYPES = new Set([
  "urlImage",
  "nanoBanana",
  "backgroundRemover",
  "geminiVideo",
  "vfxGenerator",
  "grokProcessor",
  "imageExport",
  "mediaDescriber",
]);

/** Si el modelo no envía executeNodeIds, inferir candidatos cuando el usuario pide generar/ejecutar. */
export function tryInferExecuteNodeIds(
  prompt: string,
  nodes: { id: string; type?: string }[],
  edges: { source: string; target: string }[]
): string[] {
  const p = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const optOut =
    /\b(solo|solamente|unicamente|only|just)\s+(el\s+)?(grafo|graph|nodos|nodes|estructura|layout)\b/.test(
      p
    ) || /\bno\s+(ejecutes|ejecutar|generes|generar|corras|correr)\b/.test(p);
  if (optOut) return [];

  const wantsDescribe =
    /\b(describ|descripci|describer|descripcion|descripción|vision describer|analiz\w*\s+(la\s+)?(imagen|foto|salida|media))\b/.test(
      p
    ) || /\b(nodo\s+(de\s+)?descri)/.test(p) || /\b(ejecut\w*\s+(el\s+)?(descri|vision))\b/.test(p);

  if (wantsDescribe) {
    const descIds = nodes
      .filter((n) => n.type === "mediaDescriber")
      .map((n) => n.id);
    if (descIds.length > 0) {
      return orderExecuteNodeIds(descIds, edges);
    }
  }

  const wantsRun =
    /\b(ejecuta|ejecutar|run|execute|procesa el|hazlo correr|hazlo)\b/.test(p) ||
    /\b(genera|generar)\s+(la\s+)?(imagen|image|foto|video)\b/.test(p) ||
    /\b(crea|crear)\s+(una\s+)?(imagen|image|foto|video)\b/.test(p) ||
    /\b(quita el fondo|remove background|sin fondo)\b/.test(p) ||
    /\b(guardar|save|exporta|descarga|descargar)\b/.test(p) ||
    /\b(dame|quiero)\s+(la\s+)?(imagen|image|video|foto)\b/.test(p) ||
    (/\b(crea|generar|genera|haz|monta|construye)\b/.test(p) &&
      /\b(nano\s*banana|gemini\s*video|\bveo\b|grok\s*imagine)\b/.test(p));

  if (!wantsRun) return [];

  const candidates = nodes
    .filter((n) => RUNNABLE_TYPES.has(n.type || ""))
    .map((n) => n.id);
  if (candidates.length === 0) return [];

  return orderExecuteNodeIds(candidates, edges);
}
