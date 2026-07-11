export function absoluteUrl(raw: string | undefined, base: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

export function normalizeHttpUrl(raw: string): URL | null {
  const parsed = normalizeBrandKitUrlInput(raw);
  if (!parsed.ok) return null;
  try {
    return new URL(parsed.url);
  } catch {
    return null;
  }
}

export type NormalizedBrandKitUrl =
  | { ok: true; url: string; displayUrl: string }
  | { ok: false; message: string };

/** Acepta dominio (`coca-cola.com/es/es`), URL sin esquema o URL completa. */
export function normalizeBrandKitUrlInput(raw: string): NormalizedBrandKitUrl {
  let value = raw.trim();
  if (!value) return { ok: false, message: "Introduce una URL o dominio" };
  if (!/^https?:\/\//i.test(value)) value = `https://${value.replace(/^\/\//, "")}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "URL no válida" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Solo se admiten URLs http(s)" };
  }
  if (!url.hostname || !url.hostname.includes(".")) {
    return { ok: false, message: "Dominio no válido" };
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  const normalized = url.toString();
  return { ok: true, url: normalized, displayUrl: url.hostname + url.pathname.replace(/\/$/, "") };
}

const LOCALE_SEGMENT_RE = /^[a-z]{2}(-[a-z]{2})?$/i;
const CRAWL_BLOCKLIST_RE =
  /\/(country-selector|terms-of-service|privacy-policy|cookie-notice|legal|sitemap|login|signin|signup|register|cart|checkout)(\/|$)/i;

/** Limita el crawl al prefijo local del sitio (p. ej. `/es/es`). */
export function crawlPathPrefix(rootUrl: string): string | null {
  try {
    const parts = new URL(rootUrl).pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && LOCALE_SEGMENT_RE.test(parts[0] ?? "")) {
      return `/${parts.slice(0, 2).join("/")}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function isAllowedCrawlUrl(candidateUrl: string, rootUrl: string): boolean {
  try {
    const root = new URL(rootUrl);
    const candidate = new URL(candidateUrl);
    if (root.origin !== candidate.origin) return false;
    if (CRAWL_BLOCKLIST_RE.test(candidate.pathname)) return false;

    const prefix = crawlPathPrefix(rootUrl);
    if (prefix && !candidate.pathname.startsWith(prefix)) return false;
    return true;
  } catch {
    return false;
  }
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin;
  } catch {
    return false;
  }
}

const PRIORITY_PATH_RE =
  /\/(about|nosotros|quienes-somos|empresa|contacto|contact|servicios|services|portfolio|portafolio|proyectos|projects|trabajos|work|galeria|gallery|equipo|team|producciones|film|video|photo|fotografia|blog|noticias|news)(\/|$)/i;

const SKIP_PATH_RE = /\.(pdf|zip|jpg|jpeg|png|gif|webp|svg|mp4|mov|avi|xml|rss|json)(\?|$)/i;

export function scorePagePriority(url: string, isRoot: boolean, rootUrl?: string): number {
  if (isRoot) return 100;
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (CRAWL_BLOCKLIST_RE.test(path)) return -100;
    if (PRIORITY_PATH_RE.test(path)) return 80;
    if (path === "/" || path === "") return 100;
    const prefix = rootUrl ? crawlPathPrefix(rootUrl) : null;
    if (prefix && path.startsWith(prefix.toLowerCase())) return 70;
    const depth = path.split("/").filter(Boolean).length;
    return Math.max(10, 50 - depth * 8);
  } catch {
    return 0;
  }
}

export function discoverSameOriginLinks(html: string, baseUrl: string, limit: number, rootUrl = baseUrl): string[] {
  const hrefRe = /href=["']([^"'#?]+[^"']*)["']/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    const abs = absoluteUrl(match[1], baseUrl);
    if (!abs || !isAllowedCrawlUrl(abs, rootUrl)) continue;
    const normalized = abs.split("#")[0]?.replace(/\/$/, "") || abs.split("#")[0];
    if (!normalized || SKIP_PATH_RE.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit * 4) break;
  }
  return out
    .sort((a, b) => scorePagePriority(b, false, rootUrl) - scorePagePriority(a, false, rootUrl))
    .slice(0, limit);
}

export function extractLinkedStylesheets(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const linkRe = /<link[^>]+>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const asAttr = /as=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    const abs = hrefMatch ? absoluteUrl(hrefMatch[1], baseUrl) : null;
    if (!abs || seen.has(abs)) continue;

    const isStylesheet =
      rel.includes("stylesheet") || (asAttr === "style" && /\.css(\?|$)/i.test(abs)) || /\.css(\?|$)/i.test(abs);
    if (!isStylesheet) continue;

    seen.add(abs);
    out.push(abs);
  }

  return out
    .sort((a, b) => {
      const score = (url: string) => {
        if (/theme\.css/i.test(url)) return 100;
        if (/onexp-theme/i.test(url)) return 90;
        if (/clientlib/i.test(url)) return 20;
        return 50;
      };
      return score(b) - score(a);
    })
    .slice(0, 12);
}

export function extractInlineStyles(html: string): string[] {
  const out: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(html)) !== null) {
    const css = match[1]?.trim();
    if (css && css.length > 20) out.push(css);
  }
  return out.slice(0, 4);
}

export function inferImageFormat(url: string, contentType?: string): "svg" | "png" | "jpg" | "webp" | "ico" {
  const mime = (contentType ?? "").toLowerCase();
  if (mime.includes("svg") || url.toLowerCase().includes(".svg")) return "svg";
  if (mime.includes("webp") || url.toLowerCase().includes(".webp")) return "webp";
  if (mime.includes("png") || url.toLowerCase().includes(".png")) return "png";
  if (mime.includes("icon") || url.toLowerCase().includes(".ico")) return "ico";
  return "jpg";
}

export function parseSizeHint(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function hexNormalize(raw: string): string | null {
  const value = raw.trim();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const h = value.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  return null;
}

export function extractCssColorTokens(css: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const varRe = /--([a-z0-9-]*(color|brand|primary|accent|secondary)[a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/gi;
  const hexRe = /(#[0-9a-fA-F]{3,8})\b/g;
  for (const re of [varRe, hexRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(css)) !== null) {
      const token = match[match.length - 1];
      const hex = token.startsWith("#") ? hexNormalize(token) : null;
      if (hex && !seen.has(hex)) {
        seen.add(hex);
        out.push(hex);
      }
    }
  }
  return out;
}
