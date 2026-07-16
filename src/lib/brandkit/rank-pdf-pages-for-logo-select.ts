export function guaranteedLogoPages(totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const picked = new Set<number>([1]);
  if (totalPages >= 2) picked.add(2);
  if (totalPages >= 3) picked.add(totalPages);
  return [...picked].sort((a, b) => a - b);
}

/**
 * Aplica el tope de páginas sin soltar portada/cierre (páginas garantizadas).
 * El slice ascendente antiguo descartaba la última página cuando keywords llenaban el cupo.
 */
export function capLogoVisionPages(
  picked: Iterable<number>,
  totalPages: number,
  cap: number,
): number[] {
  const guaranteed = guaranteedLogoPages(totalPages);
  const guaranteedSet = new Set(guaranteed);
  const extras = [...new Set(picked)]
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= totalPages && !guaranteedSet.has(page))
    .sort((a, b) => a - b);
  const room = Math.max(0, cap - guaranteed.length);
  return [...guaranteed, ...extras.slice(0, room)].sort((a, b) => a - b);
}
