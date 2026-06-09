import { NextResponse } from 'next/server';
import { MAX_CANDIDATES, filterImageUrlsByIntent } from '@/lib/gemini-image-intent-verify';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

type ImageSearchResult = { url?: string };
type OpenverseImage = {
  thumbnail?: string;
  url?: string;
};
type OpenverseImageSearchResponse = {
  results?: OpenverseImage[];
};

const SEARCH_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Foldder-SpaceAI/1.0 (contact: info@ai-spaces.studio)",
};

function httpImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.hostname.includes("lookaside.fbsbx.com")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: SEARCH_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const searchOpenverseImages = async (query: string, pageSize: number): Promise<ImageSearchResult[]> => {
  try {
    const params = new URLSearchParams({
      mature: "false",
      page_size: String(Math.min(Math.max(pageSize, 1), 50)),
      q: query,
    });
    const data = await fetchJsonWithTimeout<OpenverseImageSearchResponse>(
      `https://api.openverse.engineering/v1/images/?${params.toString()}`,
    );
    return (data.results || [])
      .map((result) => ({
        url: httpImageUrl(result.url) || httpImageUrl(result.thumbnail) || undefined,
      }))
      .filter((result) => !!result.url);
  } catch (error) {
    console.warn(`[Search API] Openverse failed for "${query}":`, error);
    return [];
  }
};

const searchWikipediaImage = async (query: string): Promise<string[]> => {
  try {
    const headers = { 'User-Agent': 'SpaceAI-ContentEngine/1.0 (contact: info@ai-spaces.studio)' };
    
    // 1. Search for the page title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { headers });
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;
    
    if (!title) return [];

    // 2. Get images from that page
    const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=images&format=json&origin=*`;
    const imagesRes = await fetch(imagesUrl, { headers });
    const imagesData = (await imagesRes.json()) as {
      query?: { pages?: Record<string, { images?: Array<{ title?: string }> }> };
    };
    const pages = imagesData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const images = pageId ? pages[pageId]?.images : undefined;

    if (!images) return [];

    // 3. Filter for likely good images (JPG, PNG)
    const validImages = images.filter((img: { title?: string }) => {
      const t = (img.title || "").toLowerCase();
      return (t.endsWith('.jpg') || t.endsWith('.jpeg') || t.endsWith('.png')) && 
             !t.includes('increase') && !t.includes('decrease') && !t.includes('stub') && !t.includes('icon');
    }).slice(0, 5);

    // 4. Get the actual URLs
    const urls: string[] = [];
    for (const img of validImages) {
      const imageTitle = img.title;
      if (!imageTitle) continue;
      const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(imageTitle)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const infoRes = await fetch(infoUrl, { headers });
      const infoData = (await infoRes.json()) as {
        query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> };
      };
      const infoPages = infoData.query?.pages || {};
      const infoPageId = Object.keys(infoPages)[0];
      const url = infoPageId ? infoPages[infoPageId]?.imageinfo?.[0]?.url : undefined;
      if (url) urls.push(url);
    }

    return urls;
  } catch (err) {
    console.error('[Search API] Wikipedia Error:', err);
    return [];
  }
};

export async function POST(req: Request) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const body = await req.json();
    const query = body.query as string;
    const limit = typeof body.limit === 'number' ? body.limit : 5;
    const verifyIntentRaw = body.verifyIntent as string | undefined;
    const verify =
      body.verify === false ? false : true;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const usageUserEmail = authState.user.email;
    const intentForVision =
      typeof verifyIntentRaw === 'string' && verifyIntentRaw.trim()
        ? verifyIntentRaw.trim()
        : query.trim();
    const useVision = verify && !!apiKey && intentForVision.length > 0;

    if (useVision) {
      await assertApiServiceEnabled("gemini-search-verify");
      walletCharge = await reserveApiWalletCharge({
        req,
        userEmail: usageUserEmail,
        serviceId: "gemini-search-verify",
        provider: "gemini",
        route: "/api/spaces/search",
        maxCostMicros: reserveUsdToMicros(0.01, { multiplier: 1.5 }),
        metadata: { query: query.slice(0, 160), limit, intent: intentForVision.slice(0, 160) },
      });
    }

    const poolCap = useVision
      ? Math.min(Math.max(limit * 5, 24), MAX_CANDIDATES)
      : Math.max(limit, 1);

    console.log(
      `[Search API] Searching for: "${query}" (limit: ${limit}, vision: ${useVision})`
    );

    const normalizeUrls = (raw: ImageSearchResult[]) =>
      raw
        .map((r) => r.url)
        .filter((u): u is string => {
          if (!u || typeof u !== 'string') return false;
          return u.startsWith('http') && !u.includes('lookaside.fbsbx.com');
        })
        .slice(0, poolCap);

    let searchUrls: string[] = [];
    try {
      const searchResults = await searchOpenverseImages(query, poolCap);
      searchUrls = normalizeUrls(searchResults);
    } catch {
      console.warn('[Search API] Openverse failed, falling back to Wikipedia');
    }

    let wikiCache: string[] | null = null;
    const getWikiPool = async (): Promise<string[]> => {
      if (!wikiCache) {
        wikiCache = await searchWikipediaImage(query);
      }
      return wikiCache.slice(0, poolCap);
    };

    // Sin visión: mismo comportamiento funcional (búsqueda externa, si no hay nada → Wikipedia).
    const urls: string[] =
      searchUrls.length > 0 ? searchUrls : await getWikiPool();

    let visionFilterCalls = 0;
    const tryVisionFilter = async (candidateUrls: string[]) => {
      if (!useVision || candidateUrls.length === 0) return candidateUrls;
      visionFilterCalls += 1;
      return filterImageUrlsByIntent(candidateUrls, intentForVision, apiKey!, {
        targetCount: limit,
        relaxedFallback: true,
        usageUserEmail,
      });
    };

    if (useVision) {
      const settleVisionWallet = async (resultCount: number) => {
        releaseWalletOnError = false;
        if (visionFilterCalls <= 0) {
          await walletCharge?.release({ reason: "no_vision_candidates" });
          return;
        }
        await walletCharge?.capture({
          actualCostUsd: 0.01 * visionFilterCalls,
          metadata: { visionFilterCalls, resultCount },
        });
      };

      let filtered = await tryVisionFilter(searchUrls.length > 0 ? searchUrls : urls);
      if (filtered.length > 0) {
        await settleVisionWallet(filtered.length);
        return NextResponse.json({ urls: filtered, verified: true });
      }
      // Si había resultados externos pero ninguno pasó, probar Wikipedia (suele acertar en astro/personas).
      if (searchUrls.length > 0) {
        console.log(`[Search API] Vision rejected search pool; trying Wikipedia for: "${query}"`);
        const wikiPool = await getWikiPool();
        filtered = await tryVisionFilter(wikiPool);
        if (filtered.length > 0) {
          await settleVisionWallet(filtered.length);
          return NextResponse.json({ urls: filtered, verified: true });
        }
      }
      await settleVisionWallet(0);
      return NextResponse.json({
        urls: [],
        verified: true,
        noMatch: true,
      });
    }

    return NextResponse.json({
      urls: urls.slice(0, limit),
      verified: false,
    });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    console.error('Search API Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
