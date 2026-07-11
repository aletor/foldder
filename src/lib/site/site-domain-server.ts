import fs from "fs/promises";
import path from "path";
import { isAppHost } from "./site-domain";
import { ddbResolveSlugByDomain } from "./site-publish-ddb";

const LOCAL_ROOT = path.join(process.cwd(), "data", "published-sites");
const REGISTRY_PATH = path.join(LOCAL_ROOT, "registry.json");

async function resolveSlugFromLocalRegistry(host: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    const registry = JSON.parse(raw) as Record<
      string,
      { slug: string; customDomain?: string; cdnHostname?: string }
    >;
    const normalized = host.toLowerCase();
    for (const record of Object.values(registry)) {
      if (record.customDomain?.toLowerCase() === normalized) return record.slug;
      if (record.cdnHostname?.toLowerCase() === normalized) return record.slug;
      if (`${record.slug}.foldder.com` === normalized) return record.slug;
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveSiteSlugFromHost(host: string): Promise<string | null> {
  const normalized = host.trim().toLowerCase().split(":")[0] ?? "";
  if (!normalized || isAppHost(normalized)) return null;

  const fromDdb = await ddbResolveSlugByDomain(normalized);
  if (fromDdb) return fromDdb;

  return resolveSlugFromLocalRegistry(normalized);
}
