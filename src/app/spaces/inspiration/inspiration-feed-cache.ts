"use client";

/**
 * Caché de cliente (memoria + localStorage) del feed unificado de Inspiration.
 *
 * Objetivos pedidos por producto:
 *  - Las 3 librerías (Pexels, Unsplash, Are.na) salen juntas, no en pestañas.
 *  - Se cargan en orden / progresivamente (cada fuente aparece al resolverse).
 *  - Quedan cacheadas entre sesiones: al reabrir el studio siguen ahí sin re-buscar.
 *
 * Patrón calcado de `brain-image-suggestions-cache`: hidratación perezosa, dedup de peticiones
 * en vuelo, persistencia best-effort y eventos para que la UI se re-renderice.
 */

import { readJsonWithHttpError } from "@/lib/read-response-json";
import {
  INSPIRATION_PROVIDERS,
  createEmptyFeedEntry,
  type InspirationFacet,
  type InspirationFeedEntry,
  type InspirationInputKind,
  type InspirationProvider,
  type InspirationResult,
} from "./inspiration-feed";

const STORAGE_KEY = "foldder_inspiration_feed_v1";
const MAX_FEED_KEYS = 24;
const PER_PROVIDER_LIMIT = 40;
const FEED_EVENT = "foldder-inspiration-feed-updated";

const cache = new Map<string, InspirationFeedEntry>();
const inFlight = new Map<string, Promise<void>>();
let hydrated = false;

function hydrateFromStorage(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, InspirationFeedEntry>;
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      cache.set(key, normalizeEntry(value));
    }
  } catch {
    // almacenamiento corrupto: ignorar
  }
}

function normalizeEntry(value: InspirationFeedEntry): InspirationFeedEntry {
  const base = createEmptyFeedEntry(
    typeof value.query === "string" ? value.query : "",
    (value.facet ?? "similar") as InspirationFacet,
    (value.inputKind ?? "prompt") as InspirationInputKind,
  );
  const bySource: InspirationFeedEntry["bySource"] = {};
  for (const provider of INSPIRATION_PROVIDERS) {
    const list = value.bySource?.[provider];
    if (Array.isArray(list)) bySource[provider] = list.filter(isRenderableResult);
  }
  // Tras recargar, ninguna fuente está "loading": las que tenían datos quedan como "done".
  const sourceState: InspirationFeedEntry["sourceState"] = { ...base.sourceState };
  for (const provider of INSPIRATION_PROVIDERS) {
    if ((bySource[provider]?.length ?? 0) > 0) sourceState[provider] = "done";
  }
  return {
    ...base,
    bySource,
    sourceState,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : Date.now(),
  };
}

function isRenderableResult(result: unknown): result is InspirationResult {
  if (!result || typeof result !== "object") return false;
  const r = result as InspirationResult;
  return typeof r.id === "string" && (typeof r.imageUrl === "string" || typeof r.thumbUrl === "string");
}

function persistToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    // Conserva las últimas N claves (por updatedAt) para no inflar localStorage.
    const entries = [...cache.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const kept = entries.slice(0, MAX_FEED_KEYS);
    for (const [key] of entries.slice(MAX_FEED_KEYS)) cache.delete(key);
    const obj: Record<string, InspirationFeedEntry> = {};
    for (const [key, value] of kept) obj[key] = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // cuota llena o no disponible
  }
}

function emitUpdate(key: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FEED_EVENT, { detail: { key } }));
}

function setEntry(key: string, entry: InspirationFeedEntry): void {
  cache.set(key, { ...entry, updatedAt: Date.now() });
  persistToStorage();
  emitUpdate(key);
}

export function getInspirationFeedEntry(key: string): InspirationFeedEntry | undefined {
  hydrateFromStorage();
  return cache.get(key);
}

export function subscribeInspirationFeed(key: string, callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string }>).detail;
    if (detail?.key === key) callback();
  };
  window.addEventListener(FEED_EVENT, handler);
  return () => window.removeEventListener(FEED_EVENT, handler);
}

async function fetchProvider(
  provider: InspirationProvider,
  args: { query: string; facet: InspirationFacet; inputKind: InspirationInputKind },
): Promise<InspirationResult[]> {
  const res = await fetch("/api/inspiration/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: args.query,
      inputKind: args.inputKind,
      facet: args.facet,
      provider,
      limit: PER_PROVIDER_LIMIT,
    }),
  });
  const json = await readJsonWithHttpError<{ results?: InspirationResult[]; error?: string }>(
    res,
    "/api/inspiration/search",
  );
  return Array.isArray(json.results) ? json.results.filter(isRenderableResult) : [];
}

export type EnsureFeedArgs = {
  key: string;
  query: string;
  facet: InspirationFacet;
  inputKind: InspirationInputKind;
  providers?: InspirationProvider[];
  force?: boolean;
};

/**
 * Lanza (sin bloquear) la búsqueda en las fuentes activas. Cada fuente se resuelve por su cuenta
 * y actualiza la caché + emite evento, de modo que la UI las va pintando en orden de llegada.
 */
export function ensureInspirationFeed(args: EnsureFeedArgs): void {
  hydrateFromStorage();
  const query = args.query.trim();
  if (!query) return;
  const providers =
    args.providers && args.providers.length > 0 ? args.providers : INSPIRATION_PROVIDERS;

  let entry = cache.get(args.key);
  if (!entry || args.force) {
    entry = createEmptyFeedEntry(query, args.facet, args.inputKind);
    setEntry(args.key, entry);
  }

  for (const provider of providers) {
    const current = cache.get(args.key);
    const state = current?.sourceState[provider];
    const hasData = (current?.bySource[provider]?.length ?? 0) > 0;
    if (!args.force && (state === "loading" || (state === "done" && hasData))) continue;

    const flightKey = `${args.key}::${provider}`;
    if (!args.force && inFlight.has(flightKey)) continue;

    // marca loading
    {
      const base = cache.get(args.key) ?? createEmptyFeedEntry(query, args.facet, args.inputKind);
      setEntry(args.key, {
        ...base,
        sourceState: { ...base.sourceState, [provider]: "loading" },
        sourceError: { ...base.sourceError, [provider]: undefined },
      });
    }

    const promise = fetchProvider(provider, { query, facet: args.facet, inputKind: args.inputKind })
      .then((results) => {
        const base = cache.get(args.key) ?? createEmptyFeedEntry(query, args.facet, args.inputKind);
        setEntry(args.key, {
          ...base,
          bySource: { ...base.bySource, [provider]: results },
          sourceState: { ...base.sourceState, [provider]: "done" },
        });
      })
      .catch((error) => {
        const base = cache.get(args.key) ?? createEmptyFeedEntry(query, args.facet, args.inputKind);
        setEntry(args.key, {
          ...base,
          sourceState: { ...base.sourceState, [provider]: "error" },
          sourceError: {
            ...base.sourceError,
            [provider]: error instanceof Error ? error.message : "No se pudo cargar.",
          },
        });
      })
      .finally(() => {
        inFlight.delete(flightKey);
      });

    inFlight.set(flightKey, promise);
  }
}
