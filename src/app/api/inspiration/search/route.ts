import { NextResponse } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { ArenaProviderError, searchArenaImages } from "@/lib/inspiration/arena-api";
import { planArenaSearchTerms } from "@/lib/inspiration/inspiration-query-planner";
import {
  INSPIRATION_FACET_QUERY_SUFFIX,
  type InspirationFacet,
  type InspirationInputKind,
  type InspirationProvider,
  type InspirationResult,
  inspirationProviderServiceId,
  normalizeInspirationFacet,
  normalizeInspirationInputKind,
  normalizeInspirationProvider,
} from "@/lib/inspiration/inspiration-shared";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

class InspirationProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "InspirationProviderError";
  }
}

type InspirationCacheEntry = {
  expiresAt: number;
  results: InspirationResult[];
};

const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 160;
const searchCache = new Map<string, InspirationCacheEntry>();
const inFlightSearches = new Map<string, Promise<InspirationResult[]>>();

const IMAGE_DESCRIPTION_STOPWORDS = new Set([
  "a",
  "about",
  "above",
  "across",
  "against",
  "and",
  "are",
  "around",
  "as",
  "at",
  "background",
  "be",
  "being",
  "by",
  "can",
  "center",
  "central",
  "close",
  "composition",
  "contains",
  "depicting",
  "depicts",
  "detail",
  "details",
  "elements",
  "features",
  "for",
  "foreground",
  "from",
  "has",
  "high",
  "image",
  "in",
  "including",
  "into",
  "is",
  "it",
  "its",
  "left",
  "light",
  "likely",
  "main",
  "of",
  "on",
  "or",
  "overall",
  "photo",
  "photograph",
  "positioned",
  "right",
  "scene",
  "set",
  "shows",
  "showing",
  "style",
  "subject",
  "surrounded",
  "that",
  "the",
  "this",
  "to",
  "using",
  "with",
  "within",
  "una",
  "un",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "en",
  "con",
]);

function compactSearchText(value: string, max: number): string {
  const s = value.trim().replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, "").trim() : s;
}

function normalizeImageDescriptionForSearch(value: string, maxTerms: number): string {
  const stripped = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(
      /\b(the\s+)?(image|photo|photograph|scene|picture)\s+(shows|features|depicts|captures|contains|presents|appears\s+to\s+show)\b/gi,
      " ",
    )
    .replace(/\bthis\s+(image|photo|photograph|scene|picture)\b/gi, " ")
    .replace(/\bvisual\s+(reference|description|composition)\b/gi, " ")
    .replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const out: string[] = [];
  for (const raw of stripped.split(/\s+/)) {
    const token = raw.replace(/^-+|-+$/g, "");
    if (token.length < 3) continue;
    if (/^\d+$/.test(token)) continue;
    if (IMAGE_DESCRIPTION_STOPWORDS.has(token)) continue;
    if (out.includes(token)) continue;
    out.push(token);
    if (out.length >= maxTerms) break;
  }
  return out.join(" ");
}

function buildStockSearchQuery(baseQuery: string, facet: InspirationFacet, inputKind: InspirationInputKind): string {
  const core = baseQuery.trim().replace(/\s+/g, " ");
  const searchCore =
    inputKind === "image"
      ? normalizeImageDescriptionForSearch(core, 12) || compactSearchText(core, 96)
      : core;
  return [searchCore, INSPIRATION_FACET_QUERY_SUFFIX[facet], "realistic, clean, commercial, usable reference"]
    .filter(Boolean)
    .join(", ");
}

function buildCacheKey(provider: InspirationProvider, query: string, limit: number): string {
  return `${provider}:${limit}:${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function readSearchCache(key: string, now = Date.now()): InspirationResult[] | null {
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    searchCache.delete(key);
    return null;
  }
  return cached.results;
}

function writeSearchCache(key: string, results: InspirationResult[], now = Date.now()) {
  searchCache.set(key, {
    expiresAt: now + SEARCH_CACHE_TTL_MS,
    results,
  });
  if (searchCache.size <= SEARCH_CACHE_MAX_ENTRIES) return;
  for (const cacheKey of searchCache.keys()) {
    searchCache.delete(cacheKey);
    if (searchCache.size <= SEARCH_CACHE_MAX_ENTRIES) break;
  }
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePexelsPhoto(raw: unknown): InspirationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const photo = raw as Record<string, unknown>;
  const src = photo.src && typeof photo.src === "object" ? (photo.src as Record<string, unknown>) : {};
  const id = String(photo.id ?? "");
  const imageUrl =
    asString(src.large2x) ||
    asString(src.large) ||
    asString(src.original) ||
    asString(src.medium);
  const thumbUrl = asString(src.large) || asString(src.medium) || asString(src.small) || imageUrl;
  if (!id || !imageUrl || !thumbUrl) return null;
  return {
    id: `pexels-${id}`,
    source: "Pexels",
    imageUrl,
    thumbUrl,
    title: asString(photo.alt),
    author: asString(photo.photographer),
    sourceUrl: asString(photo.url),
    width: asNumber(photo.width),
    height: asNumber(photo.height),
    color: asString(photo.avg_color),
  };
}

function normalizeUnsplashPhoto(raw: unknown): InspirationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const photo = raw as Record<string, unknown>;
  const urls = photo.urls && typeof photo.urls === "object" ? (photo.urls as Record<string, unknown>) : {};
  const links = photo.links && typeof photo.links === "object" ? (photo.links as Record<string, unknown>) : {};
  const user = photo.user && typeof photo.user === "object" ? (photo.user as Record<string, unknown>) : {};
  const id = asString(photo.id);
  const imageUrl =
    asString(urls.regular) ||
    asString(urls.full) ||
    asString(urls.raw) ||
    asString(urls.small);
  const thumbUrl = asString(urls.small) || asString(urls.thumb) || imageUrl;
  if (!id || !imageUrl || !thumbUrl) return null;
  return {
    id: `unsplash-${id}`,
    source: "Unsplash",
    imageUrl,
    thumbUrl,
    title: asString(photo.alt_description) || asString(photo.description),
    author: asString(user.name) || asString(user.username),
    sourceUrl: asString(links.html),
    width: asNumber(photo.width),
    height: asNumber(photo.height),
    color: asString(photo.color),
  };
}

async function searchPexels(query: string, limit: number): Promise<InspirationResult[]> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing PEXELS_API_KEY");
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("page", "1");
  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new InspirationProviderError(`Pexels ${res.status}: ${text.slice(0, 180)}`, res.status);
  }
  const json = JSON.parse(text) as { photos?: unknown[] };
  return (json.photos ?? []).map(normalizePexelsPhoto).filter((item): item is InspirationResult => Boolean(item));
}

async function searchUnsplash(query: string, limit: number): Promise<InspirationResult[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) throw new Error("Missing UNSPLASH_ACCESS_KEY");
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(limit, 30)));
  url.searchParams.set("page", "1");
  url.searchParams.set("order_by", "relevant");
  url.searchParams.set("content_filter", "high");
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new InspirationProviderError(`Unsplash ${res.status}: ${text.slice(0, 180)}`, res.status);
  }
  const json = JSON.parse(text) as { results?: unknown[] };
  return (json.results ?? []).map(normalizeUnsplashPhoto).filter((item): item is InspirationResult => Boolean(item));
}

async function searchProvider(
  provider: InspirationProvider,
  query: string,
  limit: number,
): Promise<InspirationResult[]> {
  if (provider === "unsplash") return searchUnsplash(query, limit);
  if (provider === "arena") return searchArenaImages(query, limit);
  return searchPexels(query, limit);
}

async function searchProviderWithCache(
  provider: InspirationProvider,
  query: string,
  limit: number,
): Promise<{ results: InspirationResult[]; cached: boolean }> {
  const cacheKey = buildCacheKey(provider, query, limit);
  const cached = readSearchCache(cacheKey);
  if (cached) return { results: cached, cached: true };

  const existing = inFlightSearches.get(cacheKey);
  if (existing) return { results: await existing, cached: true };

  const promise = searchProvider(provider, query, limit);
  inFlightSearches.set(cacheKey, promise);
  try {
    const results = await promise;
    writeSearchCache(cacheKey, results);
    return { results, cached: false };
  } finally {
    inFlightSearches.delete(cacheKey);
  }
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as {
      query?: unknown;
      inputKind?: unknown;
      facet?: unknown;
      provider?: unknown;
      limit?: unknown;
    };

    const baseQuery = asString(body.query) || "";
    if (!baseQuery) {
      return NextResponse.json({ error: "query_required" }, { status: 400 });
    }

    const facet = normalizeInspirationFacet(body.facet);
    const inputKind = normalizeInspirationInputKind(body.inputKind);
    const provider = normalizeInspirationProvider(body.provider);
    const serviceId = inspirationProviderServiceId(provider);
    await assertApiServiceEnabled(serviceId);

    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 40);

    let searchQuery = buildStockSearchQuery(baseQuery, facet, inputKind);
    let queryPlanSource: "stock" | "gemini" | "fallback" | undefined = "stock";

    if (provider === "arena") {
      const planned = await planArenaSearchTerms({
        intent: baseQuery,
        facet,
        inputKind,
        userEmail: authState.user.email,
      });
      searchQuery = planned.terms;
      queryPlanSource = planned.source;
    }

    const { results, cached } = await searchProviderWithCache(provider, searchQuery, limit);

    if (!cached) {
      await recordApiUsage({
        provider,
        userEmail: authState.user.email,
        serviceId,
        route: "/api/inspiration/search",
        operation: `${provider}_photo_search`,
        costIsKnown: false,
        costUsd: 0,
        metadata: {
          source: provider,
          facet,
          inputKind,
          resultCount: results.length,
          queryPlanSource,
          searchQuery,
        },
      });
    }

    return NextResponse.json({
      source: provider,
      facet,
      provider,
      query: searchQuery,
      queryPlanSource,
      cached,
      results,
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[inspiration/search]", error);
    const status =
      error instanceof InspirationProviderError || error instanceof ArenaProviderError
        ? error.status
        : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "inspiration_search_failed",
        code: error instanceof ArenaProviderError ? error.code : undefined,
      },
      { status },
    );
  }
}
