import type { InspirationResult } from "./inspiration-shared";
import { normalizeArenaImageBlock } from "./arena-normalize";

class ArenaProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: "rate_limited" | "provider_error",
  ) {
    super(message);
    this.name = "ArenaProviderError";
  }
}

const ARENA_V2_SEARCH_URL = "https://api.are.na/v2/search";
const ARENA_USER_AGENT = "Foldder Inspiration/1.0 (+https://foldder.com)";
const ARENA_PAGE_DELAY_MS = 250;
const ARENA_MAX_PAGES = 3;

type ArenaV2SearchResponse = {
  blocks?: unknown[];
  current_page?: number;
  total_pages?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchArenaV2SearchPage(
  query: string,
  page: number,
  per: number,
): Promise<ArenaV2SearchResponse> {
  const url = new URL(ARENA_V2_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per", String(per));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": ARENA_USER_AGENT,
    },
    next: { revalidate: 300 },
  });

  if (res.status === 429) {
    throw new ArenaProviderError(
      "Are.na is rate-limiting requests. Try again in a few minutes.",
      res.status,
      "rate_limited",
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ArenaProviderError(`Are.na ${res.status}: ${text.slice(0, 220)}`, res.status, "provider_error");
  }

  return JSON.parse(text) as ArenaV2SearchResponse;
}

export { normalizeArenaImageBlock } from "./arena-normalize";

/** Public Are.na v2 search — no user OAuth required. */
export async function searchArenaImages(query: string, limit: number): Promise<InspirationResult[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 40);
  const perPage = Math.min(20, safeLimit);
  const results: InspirationResult[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= ARENA_MAX_PAGES && results.length < safeLimit; page += 1) {
    if (page > 1) await sleep(ARENA_PAGE_DELAY_MS);

    const json = await fetchArenaV2SearchPage(query, page, perPage);
    const blocks = Array.isArray(json.blocks) ? json.blocks : [];

    for (const block of blocks) {
      const normalized = normalizeArenaImageBlock(block);
      if (!normalized || seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      results.push(normalized);
      if (results.length >= safeLimit) break;
    }

    const totalPages = Number(json.total_pages) || 1;
    const currentPage = Number(json.current_page) || page;
    if (currentPage >= totalPages || blocks.length === 0) break;
  }

  return results;
}

export { ArenaProviderError };
