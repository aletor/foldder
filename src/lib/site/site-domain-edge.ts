import { isAppHost } from "./site-domain";

function cdnBase(): string {
  return process.env.FOLDDER_SITE_CDN_BASE?.trim() || "foldder.com";
}

/** Resuelve slug desde subdominio CDN `{slug}.foldder.com` (sin Node.js). */
export function resolveSlugFromCdnHost(host: string): string | null {
  const normalized = host.trim().toLowerCase().split(":")[0] ?? "";
  const base = cdnBase();
  const suffix = `.${base}`;
  if (!normalized.endsWith(suffix)) return null;

  const slug = normalized.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

/**
 * Resolución de host → slug en Edge (middleware).
 * CDN subdomains se resuelven localmente; dominios custom vía API interna Node.js.
 */
export async function resolveSiteSlugFromHostEdge(
  host: string,
  requestUrl: string,
): Promise<string | null> {
  const normalized = host.trim().toLowerCase().split(":")[0] ?? "";
  if (!normalized || isAppHost(normalized)) return null;

  const fromCdn = resolveSlugFromCdnHost(normalized);
  if (fromCdn) return fromCdn;

  try {
    const lookupUrl = new URL("/api/site/resolve-host", requestUrl);
    lookupUrl.searchParams.set("host", normalized);
    const response = await fetch(lookupUrl, {
      headers: { "x-foldder-site-resolve": "1" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { slug?: string | null };
    return typeof payload.slug === "string" && payload.slug.trim() ? payload.slug.trim() : null;
  } catch {
    return null;
  }
}
