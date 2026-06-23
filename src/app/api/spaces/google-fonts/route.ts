import { NextResponse } from "next/server";
import {
  parseFontsourceCatalog,
  parseGoogleWebFontsApiCatalog,
} from "@/app/spaces/freehand/google-fonts-catalog";
import type { GoogleFontCatalogEntry } from "@/app/spaces/freehand/google-fonts";

export const runtime = "nodejs";

const FONTsource_URL = "https://api.fontsource.org/v1/fonts";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedCatalog: GoogleFontCatalogEntry[] | null = null;
let cachedAt = 0;

async function fetchFromGoogleWebFontsApi(apiKey: string): Promise<GoogleFontCatalogEntry[]> {
  const url = new URL("https://www.googleapis.com/webfonts/v1/webfonts");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("sort", "alpha");
  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Google Web Fonts API ${res.status}`);
  const json = await res.json();
  const parsed = parseGoogleWebFontsApiCatalog(json);
  if (parsed.length === 0) throw new Error("Google Web Fonts API returned empty catalog");
  return parsed;
}

async function fetchFromFontsource(): Promise<GoogleFontCatalogEntry[]> {
  const res = await fetch(FONTsource_URL, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Fontsource API ${res.status}`);
  const json = await res.json();
  const parsed = parseFontsourceCatalog(json);
  if (parsed.length === 0) throw new Error("Fontsource returned empty catalog");
  return parsed;
}

async function loadCatalog(): Promise<GoogleFontCatalogEntry[]> {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) return cachedCatalog;

  const apiKey =
    process.env.GOOGLE_FONTS_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";

  let catalog: GoogleFontCatalogEntry[] = [];
  if (apiKey) {
    try {
      catalog = await fetchFromGoogleWebFontsApi(apiKey);
    } catch {
      catalog = [];
    }
  }
  if (catalog.length === 0) {
    catalog = await fetchFromFontsource();
  }

  cachedCatalog = catalog;
  cachedAt = now;
  return catalog;
}

export async function GET() {
  try {
    const catalog = await loadCatalog();
    return NextResponse.json(
      { catalog, count: catalog.length, cachedAt },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load Google Fonts catalog";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
