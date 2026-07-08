import type { LogoLabDocumentHarvest } from "@/lib/genoma/logo-lab/harvest-types";

type HarvestCacheGlobal = typeof globalThis & {
  __logoLabHarvestCache?: Map<string, LogoLabDocumentHarvest>;
};

function harvestCache(): Map<string, LogoLabDocumentHarvest> {
  const g = globalThis as HarvestCacheGlobal;
  g.__logoLabHarvestCache ??= new Map();
  return g.__logoLabHarvestCache;
}

export function getCachedLogoLabHarvest(cacheKey: string): LogoLabDocumentHarvest | null {
  return harvestCache().get(cacheKey) ?? null;
}

export function setCachedLogoLabHarvest(cacheKey: string, harvest: LogoLabDocumentHarvest): void {
  harvestCache().set(cacheKey, harvest);
}

export function logoLabFixtureHarvestCacheKey(fixtureId: string, contentSha256: string): string {
  return `fixture:${fixtureId}:${contentSha256}`;
}
