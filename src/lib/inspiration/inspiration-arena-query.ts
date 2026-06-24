import type { InspirationFacet } from "./inspiration-shared";

export const ARENA_MAX_TERMS = 5;

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

const ARENA_FACET_TAGS: Record<InspirationFacet, string[]> = {
  similar: ["reference"],
  textures: ["texture", "material"],
  colors: ["color", "palette"],
  style: ["aesthetic", "editorial"],
  people: ["portrait", "figure"],
  backgrounds: ["interior", "landscape"],
};

function compactSearchText(value: string, max: number): string {
  const s = value.trim().replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, "").trim() : s;
}

function tokenizeIntent(value: string, maxTerms: number): string[] {
  const stripped = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
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
  return out;
}

export function sanitizeArenaTerms(value: string, maxTerms = ARENA_MAX_TERMS): string {
  const cleaned = value
    .replace(/[,"|+:/\\()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const terms = cleaned
    .split(/\s+/)
    .map((term) => term.replace(/^#+/, ""))
    .filter(Boolean)
    .filter((term, index, list) => list.indexOf(term) === index)
    .slice(0, maxTerms);

  return terms.join(" ");
}

export function fallbackArenaSearchTerms(
  intent: string,
  facet: InspirationFacet,
  maxTerms = ARENA_MAX_TERMS,
): string {
  const core =
    tokenizeIntent(intent, Math.max(1, maxTerms - ARENA_FACET_TAGS[facet].length)).join(" ") ||
    compactSearchText(intent, 48).toLowerCase();

  const merged = [...tokenizeIntent(core, maxTerms), ...ARENA_FACET_TAGS[facet]]
    .filter((term, index, list) => list.indexOf(term) === index)
    .slice(0, maxTerms);

  return merged.join(" ").trim() || "editorial";
}

export function parseArenaTermsFromPlanner(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const perSource = (raw as { perSource?: unknown }).perSource;
  if (!perSource || typeof perSource !== "object") return null;
  const arena = (perSource as { arena?: unknown }).arena;
  if (typeof arena === "string" && arena.trim()) return sanitizeArenaTerms(arena);
  if (Array.isArray(arena)) {
    const joined = arena
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().toLowerCase())
      .slice(0, ARENA_MAX_TERMS)
      .join(" ");
    return joined ? sanitizeArenaTerms(joined) : null;
  }
  return null;
}
