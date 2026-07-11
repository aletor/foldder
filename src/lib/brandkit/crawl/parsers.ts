import type { CheerioAPI } from "cheerio";
import type { Provenance } from "../brand-kit-types";
import type { LogoCandidateSignal } from "./types";
import { isBoilerplateCssVarName, isNearNeutralHex, parseColorToHex, sanitizeFontFamily } from "./color-utils";
import { absoluteUrl, inferImageFormat, parseSizeHint } from "./url-utils";

function prov(type: Provenance["type"], detail: string, sourceUrl?: string): Provenance {
  return { type, detail, sourceUrl };
}

export function iconsFromHead($: CheerioAPI, pageUrl: string): LogoCandidateSignal[] {
  const out: LogoCandidateSignal[] = [];
  $('link[rel*="icon" i], link[rel="apple-touch-icon" i]').each((_, el) => {
    const href = $(el).attr("href");
    const abs = absoluteUrl(href, pageUrl);
    if (!abs) return;
    const rel = String($(el).attr("rel") ?? "").toLowerCase();
    const sizes = parseSizeHint($(el).attr("sizes")?.split(/\s+/)[0]);
    const isApple = rel.includes("apple-touch-icon");
    const score = isApple ? (sizes && sizes >= 180 ? 0.55 : 0.45) : sizes && sizes >= 32 ? 0.35 : 0.3;
    out.push({
      url: abs,
      score,
      provenance: prov("link_icon", isApple ? `apple-touch-icon ${sizes ?? "?"}px` : "favicon", pageUrl),
      format: inferImageFormat(abs),
      widthHint: sizes,
      heightHint: sizes,
    });
  });
  return out;
}

export function logoFromJsonLd($: CheerioAPI, pageUrl: string): LogoCandidateSignal[] {
  const out: LogoCandidateSignal[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const record = node as Record<string, unknown>;
        const logo = record.logo ?? (record.organization as Record<string, unknown> | undefined)?.logo;
        const logoUrl =
          typeof logo === "string"
            ? logo
            : typeof (logo as { url?: string } | undefined)?.url === "string"
              ? (logo as { url: string }).url
              : null;
        const abs = logoUrl ? absoluteUrl(logoUrl, pageUrl) : null;
        if (!abs) continue;
        out.push({
          url: abs,
          score: 0.95,
          provenance: prov("jsonld", "Organization.logo", pageUrl),
          format: inferImageFormat(abs),
        });
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });
  return out;
}

export function headerLogoHeuristic($: CheerioAPI, pageUrl: string): LogoCandidateSignal[] {
  const out: LogoCandidateSignal[] = [];
  $("header img, header svg, nav img, .logo img, #logo img, [class*='logo' i] img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    const alt = ($(el).attr("alt") ?? "").toLowerCase();
    const cls = ($(el).attr("class") ?? "").toLowerCase();
    const abs = src ? absoluteUrl(src, pageUrl) : null;
    if (!abs) return;
    const brandish = /logo|brand|marca/.test(`${alt} ${cls} ${abs}`);
    out.push({
      url: abs,
      score: brandish ? 0.8 : 0.65,
      provenance: prov("header_img", brandish ? "header logo img" : "header img", pageUrl),
      format: inferImageFormat(abs),
    });
  });
  return out;
}

export function themeColorMeta($: CheerioAPI, pageUrl: string): { hex: string; provenance: Provenance } | null {
  const theme = $('meta[name="theme-color" i]').attr("content")?.trim();
  if (!theme) return null;
  const hex = parseColorToHex(theme);
  if (!hex) return null;
  return { hex, provenance: prov("og_meta", "theme-color", pageUrl) };
}

export function cssVarColors(
  cssCorpus: string,
  pageUrl: string,
): { hex: string; provenance: Provenance; varName?: string }[] {
  const varRe = /--([a-z0-9-]+)\s*:\s*([^;}{]+)/gi;
  const out: { hex: string; provenance: Provenance; varName?: string }[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = varRe.exec(cssCorpus)) !== null) {
    const varName = match[1] ?? "";
    if (isBoilerplateCssVarName(varName)) continue;
    if (!/(color|brand|primary|accent|secondary|highlight|cta|main)/i.test(varName)) continue;

    const rawValue = match[2]?.trim() ?? "";
    const hex = parseColorToHex(rawValue);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push({ hex, varName, provenance: prov("css_var", `--${varName}`, pageUrl) });
  }

  return out;
}

/** Extrae colores hex frecuentes del CSS (temas sin variables de marca). */
export function hexColorsFromCss(
  cssCorpus: string,
  pageUrl: string,
): { hex: string; provenance: Provenance; weight?: number }[] {
  const counts = new Map<string, number>();
  const hexRe = /#([0-9a-fA-F]{6})\b/g;
  let match: RegExpExecArray | null;
  while ((match = hexRe.exec(cssCorpus)) !== null) {
    const hex = parseColorToHex(`#${match[1]}`);
    if (!hex || isNearNeutralHex(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex, count]) => ({
      hex,
      weight: count / 4,
      provenance: prov("css_var", `theme.css · ${hex}`, pageUrl),
    }));
}

export function logoFromAltText($: CheerioAPI, pageUrl: string): LogoCandidateSignal[] {
  const out: LogoCandidateSignal[] = [];
  $('img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i]').each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    const abs = src ? absoluteUrl(src, pageUrl) : null;
    if (!abs) return;
    const alt = ($(el).attr("alt") ?? "").toLowerCase();
    const srcLower = abs.toLowerCase();
    const inFooter = $(el).closest("footer").length > 0;
    const isBrandLogo = /logo/i.test(alt) || /\/logo[^/]*\.(png|svg|webp|jpg)/i.test(srcLower);
    out.push({
      url: abs,
      score: isBrandLogo ? 0.94 : inFooter ? 0.82 : alt.includes("logo") ? 0.88 : 0.75,
      provenance: prov("header_img", inFooter ? "footer logo" : "logo img", pageUrl),
      format: inferImageFormat(abs),
      widthHint: parseSizeHint($(el).attr("width") ?? undefined),
      heightHint: parseSizeHint($(el).attr("height") ?? undefined),
    });
  });
  return out;
}

export function fontLinks($: CheerioAPI, pageUrl: string): string[] {
  const families: string[] = [];
  $('link[href*="fonts.googleapis.com" i], link[href*="fonts.bunny.net" i]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = absoluteUrl(href, pageUrl) ?? href;
    const familyMatch = /family=([^&;]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = familyMatch.exec(abs)) !== null) {
      const raw = m[1]?.split(":")[0] ?? "";
      const family = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
      const sanitized = sanitizeFontFamily(family);
      if (sanitized) families.push(sanitized);
    }
  });
  return [...new Set(families)];
}

export function fontFaceFamilies(cssCorpus: string): string[] {
  const out: string[] = [];
  const blockRe = /@font-face\s*\{([^}]+)\}/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(cssCorpus)) !== null) {
    const familyMatch = /font-family\s*:\s*["']?([^;"'}]+)/i.exec(block[1] ?? "");
    const family = sanitizeFontFamily(familyMatch?.[1]?.split(",")[0] ?? "");
    if (family) out.push(family);
  }
  return [...new Set(out)];
}

export function inlineFontFamilies($: CheerioAPI): string[] {
  const out: string[] = [];
  const selectors = ["h1", "h2", "h3", ".hero", "[class*='hero' i]", "header", "body"];
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const style = $(el).attr("style") ?? "";
      const match = /font-family\s*:\s*([^;]+)/i.exec(style);
      if (!match) return;
      for (const part of match[1].split(",")) {
        const family = sanitizeFontFamily(part);
        if (family) out.push(family);
      }
    });
  }
  return [...new Set(out)];
}

export function fontFaces(cssCorpus: string): string[] {
  const out: string[] = [];
  const re = /font-family\s*:\s*["']?([^;"'}]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cssCorpus)) !== null) {
    const family = sanitizeFontFamily(match[1]?.split(",")[0] ?? "");
    if (family) out.push(family);
  }
  return [...new Set(out)];
}

export type HarvestedImage = {
  url: string;
  provenance: Provenance;
  widthHint?: number;
  score?: number;
};

function largestSrcFromSrcset(srcset?: string | null): { url: string; width?: number } | null {
  if (!srcset) return null;
  let bestUrl = "";
  let bestWidth = 0;
  for (const part of srcset.split(",")) {
    const bits = part.trim().split(/\s+/);
    const url = bits[0];
    const width = parseSizeHint(bits[1]?.replace(/w$/i, ""));
    if (!url) continue;
    if (!bestUrl || (width ?? 0) > bestWidth) {
      bestUrl = url;
      bestWidth = width ?? bestWidth;
    }
  }
  return bestUrl ? { url: bestUrl, width: bestWidth || undefined } : null;
}

export function imageHarvester($: CheerioAPI, pageUrl: string, isHomePage = false): HarvestedImage[] {
  const out: HarvestedImage[] = [];
  const seen = new Set<string>();

  const pushImage = (rawUrl: string | undefined, meta: { alt?: string; width?: number; source: string }) => {
    const abs = absoluteUrl(rawUrl, pageUrl);
    if (!abs || seen.has(abs)) return;
    const lower = abs.toLowerCase();
    if (/favicon|sprite|pixel|tracking|analytics|1x1|spacer|blank\.(gif|png)/.test(lower)) return;
    if (/logo|icon|avatar|badge|mark/.test(`${meta.alt ?? ""} ${lower}`) && (meta.width ?? 999) < 420) return;

    const width = meta.width;
    if (width && width < 240) return;

    seen.add(abs);
    let score = Math.min((width ?? 480) / 120, 6);
    if (!isHomePage) score += 1.2;
    if (/hero|banner|cover|gallery|portfolio|proyecto|project|photo|foto|film|video|production/i.test(`${meta.alt ?? ""} ${meta.source}`)) {
      score += 1.5;
    }

    out.push({
      url: abs,
      widthHint: width,
      score,
      provenance: prov("header_img", meta.alt?.trim() || meta.source, pageUrl),
    });
  };

  $("img[src], img[srcset], picture source[srcset], picture source[src]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    const fromSet = largestSrcFromSrcset(srcset);
    const src = fromSet?.url || $(el).attr("src") || $(el).attr("data-src");
    const width = fromSet?.width ?? parseSizeHint($(el).attr("width") ?? undefined);
    pushImage(src, { alt: $(el).attr("alt") ?? undefined, width, source: "img" });
  });

  $("[style*='background-image']").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const match = /background-image\s*:\s*url\(['"]?([^'")]+)/i.exec(style);
    pushImage(match?.[1], { source: "background-image", width: 800 });
  });

  $('meta[property="og:image" i]').each((_, el) => {
    pushImage($(el).attr("content") ?? undefined, { source: "og:image", width: 1200 });
  });

  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 16);
}

export function brandNameFromPage($: CheerioAPI, pageUrl: string): { value: string; provenance: Provenance } | null {
  const ogSite = $('meta[property="og:site_name" i]').attr("content")?.trim();
  if (ogSite) return { value: ogSite, provenance: prov("og_meta", "og:site_name", pageUrl) };

  let fromJsonLd: { value: string; provenance: Provenance } | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (fromJsonLd) return;
    try {
      const parsed = JSON.parse($(el).text()) as Record<string, unknown>;
      const name = typeof parsed.name === "string" ? parsed.name : null;
      if (name) fromJsonLd = { value: name, provenance: prov("jsonld", "Organization.name", pageUrl) };
    } catch {
      // ignore
    }
  });
  if (fromJsonLd) return fromJsonLd;

  const title = $("title").text().trim().split("|")[0]?.trim();
  if (title) return { value: title, provenance: prov("og_meta", "document title", pageUrl) };
  return null;
}
