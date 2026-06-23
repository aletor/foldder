"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GOOGLE_FONTS_CATALOG_CACHE_KEY,
  GOOGLE_FONTS_CATALOG_CACHE_TTL_MS,
} from "../freehand/google-fonts-catalog";
import type { GoogleFontCatalogEntry } from "../freehand/google-fonts";
import { GOOGLE_FONTS_LIBRARY } from "../freehand/google-fonts";

type CatalogCachePayload = {
  cachedAt: number;
  catalog: GoogleFontCatalogEntry[];
};

function readSessionCache(): GoogleFontCatalogEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_FONTS_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogCachePayload;
    if (!parsed?.catalog?.length || typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt > GOOGLE_FONTS_CATALOG_CACHE_TTL_MS) return null;
    return parsed.catalog;
  } catch {
    return null;
  }
}

function writeSessionCache(catalog: GoogleFontCatalogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: CatalogCachePayload = { cachedAt: Date.now(), catalog };
    window.sessionStorage.setItem(GOOGLE_FONTS_CATALOG_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function useGoogleFontsCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<GoogleFontCatalogEntry[]>(() => readSessionCache() ?? GOOGLE_FONTS_LIBRARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchStartedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spaces/google-fonts");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const next = Array.isArray(json.catalog) ? (json.catalog as GoogleFontCatalogEntry[]) : [];
      if (next.length === 0) throw new Error("Catálogo vacío");
      setCatalog(next);
      writeSessionCache(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      const cached = readSessionCache();
      if (cached?.length) setCatalog(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (fetchStartedRef.current) return;
    const cached = readSessionCache();
    if (cached && cached.length > GOOGLE_FONTS_LIBRARY.length) {
      setCatalog(cached);
      return;
    }
    fetchStartedRef.current = true;
    void refresh();
  }, [enabled, refresh]);

  return { catalog, loading, error, refresh };
}
