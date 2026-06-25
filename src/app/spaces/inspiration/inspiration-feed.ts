/**
 * Lógica pura (sin DOM) del feed unificado de Inspiration.
 *
 * El nodo Inspiration busca en 3 librerías (Pexels, Unsplash, Are.na). Antes se mostraban en
 * pestañas exclusivas; ahora se combinan en un único feed. Este módulo concentra el merge,
 * el dedup, el filtro de calidad heurístico y el interleave por fuente, de forma testeable.
 */

import type {
  InspirationFacet,
  InspirationInputKind,
  InspirationProvider,
  InspirationResult,
} from "@/lib/inspiration/inspiration-shared";

export type { InspirationFacet, InspirationInputKind, InspirationProvider, InspirationResult };

export const INSPIRATION_PROVIDERS: InspirationProvider[] = ["pexels", "unsplash", "arena"];

export type InspirationSourceState = "idle" | "loading" | "done" | "error";

/** Estado en caché de un feed: resultados crudos por fuente + estado de carga por fuente. */
export type InspirationFeedEntry = {
  query: string;
  facet: InspirationFacet;
  inputKind: InspirationInputKind;
  bySource: Partial<Record<InspirationProvider, InspirationResult[]>>;
  sourceState: Record<InspirationProvider, InspirationSourceState>;
  sourceError: Partial<Record<InspirationProvider, string>>;
  updatedAt: number;
};

export function createEmptyFeedEntry(
  query: string,
  facet: InspirationFacet,
  inputKind: InspirationInputKind,
): InspirationFeedEntry {
  return {
    query,
    facet,
    inputKind,
    bySource: {},
    sourceState: { pexels: "idle", unsplash: "idle", arena: "idle" },
    sourceError: {},
    updatedAt: Date.now(),
  };
}

// --- Clave estable de feed --------------------------------------------------

function fnv1a32Hex(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Clave de caché por consulta+faceta+tipo de entrada (independiente de qué fuentes estén activas). */
export function inspirationFeedKey(args: {
  query: string;
  facet: InspirationFacet;
  inputKind: InspirationInputKind;
}): string {
  const normQuery = args.query.trim().toLowerCase().replace(/\s+/g, " ");
  return `${args.facet}:${args.inputKind}:${fnv1a32Hex(normQuery)}`;
}

// --- Dedup + calidad --------------------------------------------------------

/** Normaliza una URL para detectar duplicados entre tamaños/parámetros del mismo proveedor. */
export function dedupeKeyForResult(result: InspirationResult): string {
  const raw = (result.imageUrl || result.thumbUrl || result.id || "").trim().toLowerCase();
  // Quita la query string (los proveedores varían `w`, `h`, `auto`, `fit`… por la misma foto).
  const noQuery = raw.split("?")[0] ?? raw;
  return noQuery || result.id;
}

const QUALITY_MIN_SHORT_SIDE = 500;
const QUALITY_MIN_LONG_SIDE = 800;
const QUALITY_MAX_RATIO = 3.2;

/**
 * Heurística "solo las buenas": descarta imágenes claramente pequeñas o con proporciones
 * extremas (banners/tiras). Si no hay dimensiones fiables, se acepta (no penalizamos a Are.na).
 */
export function passesQuality(result: InspirationResult): boolean {
  if (!result.imageUrl && !result.thumbUrl) return false;
  const w = Number(result.width);
  const h = Number(result.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return true;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  if (shortSide < QUALITY_MIN_SHORT_SIDE) return false;
  if (longSide < QUALITY_MIN_LONG_SIDE) return false;
  const ratio = longSide / shortSide;
  if (ratio > QUALITY_MAX_RATIO) return false;
  return true;
}

/** Reparte los resultados por fuente en round-robin, para un grid visualmente mezclado. */
function interleaveBySource(
  lists: InspirationResult[][],
): InspirationResult[] {
  const out: InspirationResult[] = [];
  const max = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item) out.push(item);
    }
  }
  return out;
}

export type BuildFeedOptions = {
  /** Fuentes activadas por el usuario (toggles). Si vacío → todas. */
  providers?: InspirationProvider[];
  /** "Solo las mejores" activo. */
  qualityOnly?: boolean;
};

/**
 * Construye la lista final mostrada en el grid a partir del estado crudo en caché:
 * filtra por fuente activa, aplica calidad, deduplica y mezcla por fuente.
 */
export function buildInspirationFeed(
  entry: InspirationFeedEntry | null | undefined,
  options: BuildFeedOptions = {},
): InspirationResult[] {
  if (!entry) return [];
  const activeProviders =
    options.providers && options.providers.length > 0 ? options.providers : INSPIRATION_PROVIDERS;
  const qualityOnly = options.qualityOnly !== false;

  const seen = new Set<string>();
  const perSource: InspirationResult[][] = [];
  for (const provider of INSPIRATION_PROVIDERS) {
    if (!activeProviders.includes(provider)) continue;
    const raw = entry.bySource[provider] ?? [];
    const kept: InspirationResult[] = [];
    for (const result of raw) {
      if (qualityOnly && !passesQuality(result)) continue;
      const key = dedupeKeyForResult(result);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(result);
    }
    if (kept.length > 0) perSource.push(kept);
  }
  return interleaveBySource(perSource);
}

/** ¿Hay alguna fuente todavía cargando? */
export function isFeedLoading(
  entry: InspirationFeedEntry | null | undefined,
  providers?: InspirationProvider[],
): boolean {
  if (!entry) return false;
  const active = providers && providers.length > 0 ? providers : INSPIRATION_PROVIDERS;
  return active.some((p) => entry.sourceState[p] === "loading");
}

/** ¿El feed ya tiene resultados crudos de alguna fuente (para hidratar al reabrir)? */
export function feedHasAnyResults(entry: InspirationFeedEntry | null | undefined): boolean {
  if (!entry) return false;
  return INSPIRATION_PROVIDERS.some((p) => (entry.bySource[p]?.length ?? 0) > 0);
}
