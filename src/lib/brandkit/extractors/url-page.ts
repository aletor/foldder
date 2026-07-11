/**
 * Extractores heurísticos de páginas web (HTML) para ingesta URL acumulativa.
 */

import sharp from "sharp";
import { createCandidate, signal, type Candidate, type SourceRef } from "../model/evidence";
import { measureLogoNess, visualTiebreakScore } from "./logo-ness";
import { textSignature } from "../model/signature";
import type { ColorRole } from "../model/trait-ids";
import type { ColorValue, LogoValue, TaglineValue, ToneValue } from "../model/trait-values";
import { buildTypographyCandidates, type TypographyExtraction } from "./typography";
import { isBrandFontStopword } from "@/lib/brain/pdf-font-extract";
import type { VoiceExtraction } from "./voice";

const COLOR_ROLE_ORDER: ColorRole[] = ["primary", "accent", "secondary", "background", "text"];
const COLOR_ROLE_LABEL: Record<ColorRole, string> = {
  primary: "primario",
  secondary: "secundario",
  accent: "acento",
  background: "fondo",
  text: "soporte",
};

export function normalizePageUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(normalizePageUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

export function resolvePageUrl(base: string, href: string): string | null {
  try {
    return new URL(href, normalizePageUrl(base)).href;
  } catch {
    return null;
  }
}

export function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i");
  const alt = re2.exec(html);
  return alt?.[1] ? decodeHtmlEntities(alt[1].trim()) : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function titleFromHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() ? decodeHtmlEntities(m[1].trim()) : null;
}

function parseColorToHex(raw: string): string | null {
  const value = raw.trim();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const h = value.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return null;
}

function collectHexColors(html: string): string[] {
  const found = new Set<string>();
  const metaKeys = ["theme-color", "msapplication-TileColor", "tile-color"];
  for (const key of metaKeys) {
    const raw = metaContent(html, key);
    const hex = raw ? parseColorToHex(raw) : null;
    if (hex) found.add(hex);
  }
  for (const m of html.matchAll(/--(?:brand|primary|accent|secondary)[^:]*:\s*(#[0-9a-f]{3,6}|rgb\([^)]+\))/gi)) {
    const hex = parseColorToHex(m[1]);
    if (hex) found.add(hex);
  }
  for (const m of html.matchAll(/#[0-9a-f]{6}\b/gi)) {
    found.add(m[0].toLowerCase());
  }
  return [...found].slice(0, 8);
}

export function extractPaletteFromHtml(html: string, sourceId: string): Candidate<ColorValue>[] {
  const hexes = collectHexColors(html);
  const out: Candidate<ColorValue>[] = [];
  for (let i = 0; i < Math.min(hexes.length, COLOR_ROLE_ORDER.length); i += 1) {
    const role = COLOR_ROLE_ORDER[i];
    const hex = hexes[i];
    out.push(
      createCandidate<ColorValue>({
        value: { hex, role, name: COLOR_ROLE_LABEL[role] },
        signals: [signal("operator-color", { detail: "meta web", sourceRef: sourceId, scale: 0.55 })],
        signature: hex.toLowerCase(),
        sourceRefs: [sourceId],
      }),
    );
  }
  return out;
}

function decodeGoogleFamily(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, " ").trim());
}

export function discoverFontFamilies(html: string): string[] {
  const families = new Set<string>();
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'>\s]+/gi)) {
    const chunk = m[0];
    for (const fm of chunk.matchAll(/family=([^&"'>\s]+)/gi)) {
      const name = decodeGoogleFamily(fm[1].split(":")[0]);
      if (name && !isBrandFontStopword(name)) families.add(name);
    }
  }
  for (const m of html.matchAll(/font-family\s*:\s*['"]?([^;'"]+)/gi)) {
    const primary = m[1].split(",")[0].replace(/['"]/g, "").trim();
    if (primary && !isBrandFontStopword(primary) && primary.length > 2) families.add(primary);
  }
  return [...families].slice(0, 4);
}

export function extractTypographyFromHtml(html: string, sources: SourceRef[]): TypographyExtraction {
  const families = discoverFontFamilies(html);
  if (families.length === 0) return { primary: [], secondary: [], doubtful: [] };
  const usages = families.map((family, index) => ({
    family,
    weights: ["Regular"],
    headlineGlyphs: index === 0 ? 120 : 0,
    bodyGlyphs: index === 1 ? 120 : index === 0 ? 40 : 0,
    footerGlyphs: 0,
    pageCount: 1,
    embedded: false,
    totalGlyphs: 120,
  }));
  return buildTypographyCandidates(usages, { sources });
}

export function extractVoiceFromHtml(html: string, sourceId: string): VoiceExtraction {
  const lower = html.toLowerCase();
  const lexicon = ["cercano", "profesional", "innovador", "premium", "humano", "directo", "elegante", "optimista"];
  const tone = lexicon
    .filter((w) => lower.includes(w))
    .slice(0, 4)
    .map((text) =>
      createCandidate<ToneValue>({
        value: { text },
        signals: [signal("brand-manual", { detail: "en la web", sourceRef: sourceId })],
        signature: textSignature(text),
        sourceRefs: [sourceId],
      }),
    );
  const taglineRaw = metaContent(html, "og:description") ?? metaContent(html, "description");
  const tagline = taglineRaw
    ? [
        createCandidate<TaglineValue>({
          value: { text: taglineRaw.slice(0, 120) },
          signals: [signal("headline", { sourceRef: sourceId })],
          signature: textSignature(taglineRaw),
          sourceRefs: [sourceId],
        }),
      ]
    : [];
  return { tagline, tone, absolute: [], forbidden: [] };
}

const LOGO_URL_HINT = /logo|logotipo|marca|brand|isotipo|icon/i;
const LOGO_URL_AVOID = /hero|banner|cover|photo|avatar|profile|thumb|screenshot|social-share/i;

export function scoreUrlLogoUrl(url: string, opts: { fromMeta?: boolean } = {}): number {
  const lower = url.toLowerCase();
  let score = 0.35;
  if (lower.endsWith(".svg") || lower.includes(".svg?")) score += 0.35;
  if (LOGO_URL_HINT.test(lower)) score += 0.25;
  if (/favicon|apple-touch|icon-/.test(lower)) score += 0.12;
  if (opts.fromMeta) score += 0.08;
  if (LOGO_URL_AVOID.test(lower)) score -= 0.35;
  return Math.max(0, Math.min(1, score));
}

export function scaleSubordinationFromPixelArea(width: number, height: number): number {
  const area = width * height;
  if (area <= 0) return 0;
  const idealMin = 2_500;
  const idealMax = 80_000;
  if (area >= idealMin && area <= idealMax) return 1;
  if (area < idealMin) return 0.7 + 0.3 * (area / idealMin);
  return Math.max(0, Math.min(0.6, (idealMax / area) * 2));
}

export function discoverLogoUrls(html: string, pageUrl: string): string[] {
  const scored = new Map<string, number>();
  const add = (href: string | null | undefined, fromMeta = false) => {
    if (!href) return;
    const resolved = resolvePageUrl(pageUrl, href);
    if (!resolved || resolved.includes("data:")) return;
    const next = scoreUrlLogoUrl(resolved, { fromMeta });
    scored.set(resolved, Math.max(scored.get(resolved) ?? 0, next));
  };

  add(metaContent(html, "og:image"), true);
  add(metaContent(html, "og:image:secure_url"), true);
  add(metaContent(html, "twitter:image"), true);
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.svg[^"']*)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1]);

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 10);
}

export function discoverImageUrls(html: string, pageUrl: string): string[] {
  return discoverLogoUrls(html, pageUrl).slice(0, 8);
}

export const URL_RASTER_LOGO_MIN_SCORE = 0.35;

export async function scoreUrlRasterLogo(
  url: string,
  buffer: Buffer,
  urlScore = scoreUrlLogoUrl(url),
): Promise<{ total: number; trimmed: Buffer; urlScore: number } | null> {
  const trimmed = await sharp(buffer).trim({ threshold: 1 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const metrics = await measureLogoNess(trimmed);
  if (metrics.containsFace) return null;

  const scale = scaleSubordinationFromPixelArea(meta.width ?? 0, meta.height ?? 0);
  const visual = visualTiebreakScore(metrics);
  const total = urlScore * 0.35 + scale * 0.35 + visual * 0.3;
  return { total, trimmed, urlScore };
}

export function buildLogoCandidateFromBuffer(
  buffer: Buffer,
  mime: string,
  source: SourceRef,
  domain: string,
  logoPHash: string,
): { candidate: Candidate<LogoValue>; imageUrl: string; signature: string } {
  const imageUrl = `data:${mime.split(";")[0]};base64,${buffer.toString("base64")}`;
  const candidate = createCandidate<LogoValue>({
    value: { imageUrl, variant: "positive", label: domain },
    signals: [signal("recurrence", { detail: "imagen de marca en la web", sourceRef: source.id })],
    signature: logoPHash,
    sourceRefs: [source.id],
  });
  return { candidate, imageUrl, signature: logoPHash };
}

export function sourceRefForUrl(url: string): SourceRef {
  return {
    id: `src_url_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind: "url",
    label: normalizePageUrl(url),
    addedAt: new Date().toISOString(),
  };
}

export function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(normalizePageUrl(url));
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function findExistingUrlSource(genome: { sources: SourceRef[] }, url: string): SourceRef | undefined {
  const norm = normalizeUrlForCompare(url);
  return genome.sources.find((s) => s.kind === "url" && normalizeUrlForCompare(s.label) === norm);
}
