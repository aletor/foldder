import { NextResponse } from 'next/server';
import { MAX_CANDIDATES, filterImageUrlsByIntent } from '@/lib/gemini-image-intent-verify';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import gis from "g-i-s";

type GisResult = { url?: string };

const searchGoogleImages = (query: string): Promise<GisResult[]> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[Search API] Search timeout for: "${query}"`);
      resolve([]);
    }, 8000);

    gis(query, (error: unknown, results: unknown[]) => {
      clearTimeout(timer);
      if (error) {
        console.error(`[Search API] GIS Error for "${query}":`, error);
        resolve([]);
      } else {
        resolve((results || []) as GisResult[]);
      }
    });
  });
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
    }

    const poolCap = useVision
      ? Math.min(Math.max(limit * 5, 24), MAX_CANDIDATES)
      : Math.max(limit, 1);

    console.log(
      `[Search API] Searching for: "${query}" (limit: ${limit}, vision: ${useVision})`
    );

    const normalizeUrls = (raw: GisResult[]) =>
      raw
        .map((r) => r.url)
        .filter((u): u is string => {
          if (!u || typeof u !== 'string') return false;
          return u.startsWith('http') && !u.includes('lookaside.fbsbx.com');
        })
        .slice(0, poolCap);

    let gisUrls: string[] = [];
    try {
      const searchResults = await searchGoogleImages(query);
      gisUrls = normalizeUrls(searchResults);
    } catch {
      console.warn('[Search API] GIS failed, falling back to Wikipedia');
    }

    let wikiCache: string[] | null = null;
    const getWikiPool = async (): Promise<string[]> => {
      if (!wikiCache) {
        wikiCache = await searchWikipediaImage(query);
      }
      return wikiCache.slice(0, poolCap);
    };

    // Sin visión: mismo comportamiento que antes (GIS, si no hay nada → Wikipedia).
    const urls: string[] =
      gisUrls.length > 0 ? gisUrls : await getWikiPool();

    const tryVisionFilter = async (candidateUrls: string[]) => {
      if (!useVision || candidateUrls.length === 0) return candidateUrls;
      return filterImageUrlsByIntent(candidateUrls, intentForVision, apiKey!, {
        targetCount: limit,
        relaxedFallback: true,
        usageUserEmail,
      });
    };

    if (useVision) {
      let filtered = await tryVisionFilter(gisUrls.length > 0 ? gisUrls : urls);
      if (filtered.length > 0) {
        return NextResponse.json({ urls: filtered, verified: true });
      }
      // Si había resultados GIS pero ninguno pasó, probar Wikipedia (suele acertar en astro/personas).
      if (gisUrls.length > 0) {
        console.log(`[Search API] Vision rejected GIS pool; trying Wikipedia for: "${query}"`);
        const wikiPool = await getWikiPool();
        filtered = await tryVisionFilter(wikiPool);
        if (filtered.length > 0) {
          return NextResponse.json({ urls: filtered, verified: true });
        }
      }
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
    console.error('Search API Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
