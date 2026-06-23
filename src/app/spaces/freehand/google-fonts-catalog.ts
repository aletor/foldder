import type { GoogleFontCatalogEntry } from "./google-fonts";

export const GOOGLE_FONTS_CATALOG_CACHE_KEY = "foldder.google-fonts-catalog.v1";
export const GOOGLE_FONTS_CATALOG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GOOGLE_FONTS_INSTALL_PAGE_SIZE = 24;

/** Normaliza categorías de Fontsource / Google API al estilo del picker. */
export function normalizeGoogleFontCategory(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key === "sans-serif" || key === "sans") return "Sans";
  if (key === "serif") return "Serif";
  if (key === "display") return "Display";
  if (key === "handwriting") return "Handwriting";
  if (key === "monospace" || key === "mono") return "Mono";
  if (!key) return "Google";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function parseFontsourceCatalog(json: unknown): GoogleFontCatalogEntry[] {
  if (!Array.isArray(json)) return [];
  const out: GoogleFontCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { family?: unknown; category?: unknown; type?: unknown };
    if (rec.type !== "google") continue;
    const family = typeof rec.family === "string" ? rec.family.trim() : "";
    if (!family || seen.has(family)) continue;
    seen.add(family);
    const category =
      typeof rec.category === "string" ? normalizeGoogleFontCategory(rec.category) : "Google";
    out.push({ family, category });
  }
  out.sort((a, b) => a.family.localeCompare(b.family, "es", { sensitivity: "base" }));
  return out;
}

export function parseGoogleWebFontsApiCatalog(json: unknown): GoogleFontCatalogEntry[] {
  if (!json || typeof json !== "object") return [];
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: GoogleFontCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { family?: unknown; category?: unknown };
    const family = typeof rec.family === "string" ? rec.family.trim() : "";
    if (!family || seen.has(family)) continue;
    seen.add(family);
    const category =
      typeof rec.category === "string" ? normalizeGoogleFontCategory(rec.category) : "Google";
    out.push({ family, category });
  }
  out.sort((a, b) => a.family.localeCompare(b.family, "es", { sensitivity: "base" }));
  return out;
}

export function searchGoogleFontCatalog(
  catalog: GoogleFontCatalogEntry[],
  query: string,
): GoogleFontCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter(
    (font) =>
      font.family.toLowerCase().includes(q) || font.category.toLowerCase().includes(q),
  );
}

export function paginateGoogleFontCatalog<T>(
  items: T[],
  page: number,
  pageSize: number = GOOGLE_FONTS_INSTALL_PAGE_SIZE,
): { pageItems: T[]; page: number; totalPages: number; total: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}

export function mergeGoogleFontCatalogMaps(
  ...lists: GoogleFontCatalogEntry[][]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const list of lists) {
    for (const entry of list) {
      map.set(entry.family, entry.category);
    }
  }
  return map;
}
