/**
 * Estima qué APIs de pago implican los nodos nuevos o la ejecución automática del asistente.
 * Valores en EUR orientativos (rangos amplios).
 */

export type PaidApiLine = {
  id: string;
  name: string;
  count: number;
  eurMin: number;
  eurMax: number;
};

const PAID_NODE_TYPES: Record<
  string,
  { id: string; name: string; eurMin: number; eurMax: number }
> = {
  nanoBanana: {
    id: "gemini-nano",
    name: "Gemini · Imagen (Nano Banana)",
    eurMin: 0.02,
    eurMax: 0.12,
  },
  geminiVideo: {
    id: "gemini-veo",
    name: "Video Generator (Veo / Seedance)",
    eurMin: 0.4,
    eurMax: 2.5,
  },
  backgroundRemover: {
    id: "replicate-bg",
    name: "Replicate · Quitar fondo",
    eurMin: 0.015,
    eurMax: 0.06,
  },
  mediaDescriber: {
    id: "openai-describe",
    name: "OpenAI · Describir imagen (Vision)",
    eurMin: 0.004,
    eurMax: 0.03,
  },
  urlImage: {
    id: "search-images",
    name: "Búsqueda de imágenes (Google)",
    eurMin: 0.0,
    eurMax: 0.02,
  },
  enhancer: {
    id: "openai-enhance",
    name: "OpenAI · Mejorar prompt",
    eurMin: 0.002,
    eurMax: 0.02,
  },
  grokProcessor: {
    id: "grok-video",
    name: "xAI Grok · Imagine (vídeo)",
    eurMin: 0.08,
    eurMax: 0.8,
  },
  imageExport: {
    id: "compose-export",
    name: "Composición / exportación (servidor)",
    eurMin: 0.001,
    eurMax: 0.02,
  },
};

function addType(
  map: Map<string, { def: (typeof PAID_NODE_TYPES)[string]; count: number }>,
  type: string | undefined
): void {
  if (!type) return;
  const def = PAID_NODE_TYPES[type];
  if (!def) return;
  const cur = map.get(type);
  if (cur) cur.count += 1;
  else map.set(type, { def, count: 1 });
}

/**
 * rawDeltaNodes: nodos devueltos por el modelo en esta petición (antes del merge).
 * mergedNodes: grafo ya fusionado (para resolver executeNodeIds).
 */
export function estimatePaidApisForAssistantPlan(args: {
  rawDeltaNodes: { id?: string; type?: string }[];
  mergedNodes: { id?: string; type?: string }[];
  executeNodeIds: string[];
}): { lines: PaidApiLine[]; totalEurMin: number; totalEurMax: number; summary: string } | null {
  const { rawDeltaNodes, mergedNodes, executeNodeIds } = args;
  const byType = new Map<string, { def: (typeof PAID_NODE_TYPES)[string]; count: number }>();
  const seenExec = new Set<string>();

  for (const n of rawDeltaNodes) {
    if (n?.id) seenExec.add(n.id);
    addType(byType, n?.type);
  }

  const byId = new Map(mergedNodes.map((n) => [n.id, n]));
  for (const id of executeNodeIds) {
    if (seenExec.has(id)) continue;
    const n = byId.get(id);
    addType(byType, n?.type);
  }

  if (byType.size === 0) return null;

  const lines: PaidApiLine[] = [];
  let totalEurMin = 0;
  let totalEurMax = 0;

  for (const [, { def, count }] of byType) {
    const eurMin = def.eurMin * count;
    const eurMax = def.eurMax * count;
    totalEurMin += eurMin;
    totalEurMax += eurMax;
    lines.push({
      id: def.id,
      name: def.name,
      count,
      eurMin,
      eurMax,
    });
  }

  const summary = lines.map((l) => l.name + (l.count > 1 ? ` (${l.count}×)` : "")).join(", ");

  return {
    lines,
    totalEurMin,
    totalEurMax,
    summary,
  };
}

export function buildCostApprovalMessage(est: {
  lines: PaidApiLine[];
  totalEurMin: number;
  totalEurMax: number;
  summary: string;
}): string {
  const apiPart = est.lines
    .map((l) => `${l.name}${l.count > 1 ? ` (${l.count} llamadas)` : ""}`)
    .join(", ");
  const lo = est.totalEurMin.toFixed(2);
  const hi = est.totalEurMax.toFixed(2);
  return `Voy a usar las APIs: ${apiPart}. Coste aproximado: €${lo} – €${hi} (orientativo). ¿Confirmamos?`;
}
