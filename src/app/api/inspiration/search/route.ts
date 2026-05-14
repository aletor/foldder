import { NextResponse } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

type InspirationFacet = "similar" | "textures" | "colors" | "style" | "people" | "backgrounds";
type InspirationInputKind = "prompt" | "image";

type InspirationResult = {
  id: string;
  source: "Pexels";
  imageUrl: string;
  thumbUrl: string;
  title?: string;
  author?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  color?: string;
};

class InspirationProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "InspirationProviderError";
  }
}

const FACET_QUERY_SUFFIX: Record<InspirationFacet, string> = {
  similar: "visual reference, similar mood, clear composition",
  textures: "textures, materials, surfaces, pattern details, fabric, stone, wood, metal, paper grain",
  colors: "color palette, tones, clean palette, visual color mood",
  style: "visual style, art direction, editorial moodboard, aesthetic, look and feel",
  people: "people, portrait, human figures, characters, lifestyle",
  backgrounds: "backgrounds, environments, interiors, locations, empty spaces, scenery",
};

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

function normalizeFacet(value: unknown): InspirationFacet {
  return typeof value === "string" && value in FACET_QUERY_SUFFIX
    ? (value as InspirationFacet)
    : "similar";
}

function normalizeInputKind(value: unknown): InspirationInputKind {
  return value === "image" ? "image" : "prompt";
}

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

function buildSearchQuery(baseQuery: string, facet: InspirationFacet, inputKind: InspirationInputKind): string {
  const core = baseQuery.trim().replace(/\s+/g, " ");
  const searchCore =
    inputKind === "image"
      ? normalizeImageDescriptionForSearch(core, 12) || compactSearchText(core, 96)
      : core;
  return [searchCore, FACET_QUERY_SUFFIX[facet], "realistic, clean, commercial, usable reference"]
    .filter(Boolean)
    .join(", ");
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

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as {
      query?: unknown;
      inputKind?: unknown;
      facet?: unknown;
      limit?: unknown;
    };

    const baseQuery = asString(body.query) || "";
    if (!baseQuery) {
      return NextResponse.json({ error: "query_required" }, { status: 400 });
    }

    await assertApiServiceEnabled("pexels-search");

    const facet = normalizeFacet(body.facet);
    const inputKind = normalizeInputKind(body.inputKind);
    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 40);
    const searchQuery = buildSearchQuery(baseQuery, facet, inputKind);
    const results = await searchPexels(searchQuery, limit);

    await recordApiUsage({
      provider: "pexels",
      userEmail: authState.user.email,
      serviceId: "pexels-search",
      route: "/api/inspiration/search",
      operation: "pexels_photo_search",
      costIsKnown: false,
      costUsd: 0,
      metadata: { source: "pexels", facet, inputKind, resultCount: results.length },
    });

    return NextResponse.json({
      source: "pexels",
      facet,
      provider: "pexels",
      query: searchQuery,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "inspiration_search_failed" },
      { status: error instanceof InspirationProviderError ? error.status : 500 },
    );
  }
}
