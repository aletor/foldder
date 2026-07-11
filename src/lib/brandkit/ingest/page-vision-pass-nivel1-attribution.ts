/**
 * Atribución batch Nivel 1 — solo por pageTag ecoado (quemado en PNG).
 * Prohibido emparejar por índice del array o inyectar tags ausentes.
 */

export type Nivel1BatchPageLookupError = "missing" | "duplicate_tag";

export function indexNivel1BatchPagesByTag(pages: unknown[] | undefined): {
  byTag: Map<string, Record<string, unknown>>;
  duplicateTags: Set<string>;
} {
  const byTag = new Map<string, Record<string, unknown>>();
  const duplicateTags = new Set<string>();
  for (const entry of pages ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const tagRaw = (entry as { pageTag?: unknown }).pageTag;
    if (typeof tagRaw !== "string") continue;
    const tag = tagRaw.trim();
    if (!tag) continue;
    if (byTag.has(tag)) {
      duplicateTags.add(tag);
      continue;
    }
    byTag.set(tag, entry as Record<string, unknown>);
  }
  return { byTag, duplicateTags };
}

export function resolveNivel1BatchPageByEchoedTag(input: {
  pages: unknown[] | undefined;
  expectedTag: string;
}): { page: Record<string, unknown> | null; error?: Nivel1BatchPageLookupError } {
  const expected = input.expectedTag.trim();
  const { byTag, duplicateTags } = indexNivel1BatchPagesByTag(input.pages);
  if (duplicateTags.has(expected)) {
    return { page: null, error: "duplicate_tag" };
  }
  const page = byTag.get(expected) ?? null;
  if (!page) return { page: null, error: "missing" };
  return { page };
}
