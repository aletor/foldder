const APP_HOSTS = new Set(
  [
    "localhost",
    "127.0.0.1",
    "foldder.com",
    "www.foldder.com",
    process.env.NEXT_PUBLIC_APP_HOST?.trim().toLowerCase(),
    process.env.VERCEL_URL?.trim().toLowerCase(),
  ].filter(Boolean) as string[],
);

export function isAppHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().split(":")[0] ?? "";
  return APP_HOSTS.has(normalized) || normalized.endsWith(".vercel.app");
}

export function foldderCdnHostname(slug: string): string {
  const base = process.env.FOLDDER_SITE_CDN_BASE?.trim() || "foldder.com";
  return `${slug}.${base}`;
}

export function normalizeCustomDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function validateCustomDomain(raw: string): { ok: true; domain: string } | { ok: false; error: string } {
  const domain = normalizeCustomDomain(raw);
  if (!domain) return { ok: false, error: "Dominio vacío." };
  if (domain.includes("/") || domain.includes(" ")) {
    return { ok: false, error: "Dominio inválido." };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return { ok: false, error: "Usa un dominio válido (ej. www.marca.com)." };
  }
  if (domain.endsWith(".foldder.com")) {
    return { ok: false, error: "Usa el slug del sitio para subdominios foldder.com." };
  }
  return { ok: true, domain };
}
