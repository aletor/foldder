/**
 * Fase A — selección de páginas para el pase de visión estructurado.
 * Cobertura garantizada + muestreo estratificado por plantilla (phash externo).
 */

export type PageTemplateCluster = {
  clusterId: string;
  /** Páginas con la misma plantilla (hash perceptual calculado fuera). */
  pageNumbers: number[];
  phash?: string;
};

export type SelectPageVisionPassPagesInput = {
  totalPages: number;
  /** Clústeres del interior (páginas no garantizadas). */
  templateClusters?: PageTemplateCluster[];
  /** Páginas por clúster de plantilla (2–3 recomendado). */
  pagesPerCluster?: number;
};

export type PageVisionPassSelectionPlan = {
  guaranteed: number[];
  sampled: number[];
  /** Unión ordenada — páginas a enviar al LLM en Fase A. */
  selected: number[];
  estimatedCalls: number;
};

/** Ingesta v2 deck: portada + pág. 2 + cierre (máx. 3 llamadas LLM). */
export function deckLogoVisionPageNumbers(totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const picked = new Set<number>([1]);
  if (totalPages >= 2) picked.add(2);
  if (totalPages >= 3) picked.add(totalPages);
  return [...picked].sort((a, b) => a - b);
}

/** Manual de marca: todas las páginas si ≤12; si no, portada + cierre + muestra. */
export function brandManualVisionPageNumbers(totalPages: number): number[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 12) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const picked = new Set<number>([1, 2, 3, 4, totalPages]);
  if (totalPages >= 2) picked.add(totalPages - 1);
  return [...picked].sort((a, b) => a - b);
}

/** Portada, 2–4, contraportada y las dos anteriores. */
export function guaranteedVisionPageNumbers(totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const picked = new Set<number>();
  picked.add(1);
  for (let p = 2; p <= Math.min(4, totalPages); p += 1) picked.add(p);
  picked.add(totalPages);
  if (totalPages >= 2) picked.add(totalPages - 1);
  if (totalPages >= 3) picked.add(totalPages - 2);
  return [...picked].sort((a, b) => a - b);
}

function stratifiedPick(pageNumbers: number[], count: number): number[] {
  const sorted = [...pageNumbers].sort((a, b) => a - b);
  if (sorted.length <= count) return sorted;
  if (count <= 1) return [sorted[0]!];

  const out = new Set<number>();
  out.add(sorted[0]!);
  out.add(sorted[sorted.length - 1]!);
  if (count >= 3 && sorted.length >= 3) {
    out.add(sorted[Math.floor(sorted.length / 2)]!);
  }
  for (let i = 0; out.size < count && i < sorted.length; i += 1) {
    out.add(sorted[i]!);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Planifica llamadas Fase A.
 * Ej.: catálogo 130 páginas, 4 plantillas → ~garantizadas + 4×2 ≈ 15–20 llamadas.
 */
export function selectPageVisionPassPages(input: SelectPageVisionPassPagesInput): PageVisionPassSelectionPlan {
  const totalPages = Math.max(0, input.totalPages);
  const guaranteed = guaranteedVisionPageNumbers(totalPages);
  const guaranteedSet = new Set(guaranteed);
  const perCluster = Math.min(3, Math.max(2, input.pagesPerCluster ?? 2));

  const sampled = new Set<number>();
  for (const cluster of input.templateClusters ?? []) {
    const interior = cluster.pageNumbers.filter((p) => p >= 1 && p <= totalPages && !guaranteedSet.has(p));
    for (const p of stratifiedPick(interior, perCluster)) sampled.add(p);
  }

  const selected = [...new Set([...guaranteed, ...sampled])].sort((a, b) => a - b);
  return {
    guaranteed,
    sampled: [...sampled].sort((a, b) => a - b),
    selected,
    estimatedCalls: selected.length,
  };
}
