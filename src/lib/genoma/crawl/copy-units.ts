import * as cheerio from "cheerio";
import type { CrawlPageSnapshot } from "./types";

export type CopyUnitRole = "hero" | "headline" | "claim" | "about" | "cta" | "meta" | "body";

export type CopyUnit = {
  text: string;
  role: CopyUnitRole;
  sourceUrl?: string;
  weight: number;
};

const ROLE_WEIGHT: Record<CopyUnitRole, number> = {
  hero: 1,
  headline: 1,
  claim: 1,
  about: 0.9,
  cta: 0.7,
  meta: 0.5,
  body: 0.4,
};

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function pathRole(pathname: string): CopyUnitRole {
  const path = pathname.toLowerCase();
  if (/\/(about|quienes|nosotros|sobre|filosofia|manifesto|equipo|team)(\/|$)/.test(path)) return "about";
  if (/\/(contact|contacto)(\/|$)/.test(path)) return "body";
  if (/\/portfolio\//.test(path)) return "body";
  if (/\/portfolio\/?$/.test(path)) return "body";
  return "body";
}

function pushUnit(units: CopyUnit[], seen: Set<string>, text: string, role: CopyUnitRole, sourceUrl: string, minLen = 8): void {
  const value = cleanText(text);
  if (!value || value.length < minLen) return;
  if (/cookie|privacidad|legal|términos|terms|gdpr|copyright|©/i.test(value) && value.length < 200) return;
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  units.push({ text: value, role, sourceUrl, weight: ROLE_WEIGHT[role] });
}

/** Corpus estructurado con roles y pesos para el batch LLM. */
export function buildCopyUnits(pages: CrawlPageSnapshot[], maxUnits = 80): CopyUnit[] {
  const units: CopyUnit[] = [];
  const seen = new Set<string>();

  const sorted = [...pages].sort((a, b) => {
    const score = (url: string) => {
      try {
        const path = new URL(url).pathname.toLowerCase();
        if (/\/(about|quienes|nosotros|sobre)/.test(path)) return 100;
        if (path === "/" || path === "") return 85;
        if (/\/portfolio\//.test(path)) return 35;
        return 50;
      } catch {
        return 0;
      }
    };
    return score(b.url) - score(a.url);
  });

  for (const page of sorted) {
    const $ = cheerio.load(page.html);
    const pathname = (() => {
      try {
        return new URL(page.url).pathname || "/";
      } catch {
        return page.url;
      }
    })();
    const pageRole = pathRole(pathname);
    const isHome = pathname === "/" || pathname === "";

    pushUnit(units, seen, $('meta[property="og:description" i]').attr("content") ?? "", "meta", page.url, 16);
    pushUnit(units, seen, $('meta[name="description" i]').attr("content") ?? "", "meta", page.url, 16);
    pushUnit(units, seen, $("h1").first().text(), isHome ? "headline" : "headline", page.url, 6);

    $("h2, h3").each((_, el) => {
      pushUnit(units, seen, $(el).text(), pageRole === "about" ? "about" : "headline", page.url);
    });

    $("[class*='hero' i] p, .hero p").each((_, el) => {
      pushUnit(units, seen, $(el).text(), "hero", page.url, 12);
    });

    $("main p, article p, section p, p").each((_, el) => {
      if (units.length >= maxUnits * 2) return false;
      const text = $(el).text();
      const role: CopyUnitRole =
        text.startsWith("¿") && text.length < 100 ? "claim" : pageRole === "about" ? "about" : "body";
      pushUnit(units, seen, text, role, page.url, 12);
    });

    $("li, blockquote").each((_, el) => {
      if (units.length >= maxUnits * 2) return false;
      pushUnit(units, seen, $(el).text(), pageRole === "about" ? "about" : "body", page.url, 10);
    });

    $('a[class*="cta" i], button').each((_, el) => {
      pushUnit(units, seen, $(el).text(), "cta", page.url, 6);
    });

    if (units.length >= maxUnits) break;
  }

  return units
    .filter((unit) => unit.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxUnits);
}

export function formatCopyUnitsForLlm(units: CopyUnit[]): string {
  return units
    .map((unit) => `[${unit.role} w=${unit.weight}] ${unit.text}${unit.sourceUrl ? ` (${unit.sourceUrl})` : ""}`)
    .join("\n");
}

/** Texto plano para grounding de citas (compat con corpusContainsQuote). */
export function copyUnitsToCorpus(units: CopyUnit[], maxChars = 32_000): string {
  return units
    .map((unit) => unit.text)
    .join("\n\n")
    .slice(0, maxChars);
}

/** Unidades de copy desde texto de documento/PDF (ingesta por archivos). */
export function buildCopyUnitsFromPlainCorpus(
  corpus: string,
  sourceRef = "document",
  extraLines: string[] = [],
  maxUnits = 40,
): CopyUnit[] {
  const units: CopyUnit[] = [];
  const seen = new Set<string>();

  for (const line of extraLines) {
    const trimmed = cleanText(line);
    if (!trimmed) continue;
    const role: CopyUnitRole =
      trimmed.endsWith("?") ? "claim" : trimmed.length < 72 ? "headline" : "about";
    pushUnit(units, seen, trimmed, role, sourceRef, 8);
  }

  for (const chunk of corpus.split(/\n\n+/)) {
    const trimmed = cleanText(chunk);
    if (!trimmed) continue;
    if (trimmed.length < 140) {
      const role: CopyUnitRole =
        trimmed.endsWith("?") ? "claim" : trimmed.length < 72 ? "headline" : "about";
      pushUnit(units, seen, trimmed, role, sourceRef, 8);
    } else {
      for (const sentence of trimmed.split(/(?<=[.!?])\s+/)) {
        pushUnit(units, seen, sentence, "body", sourceRef, 16);
        if (units.length >= maxUnits) break;
      }
    }
    if (units.length >= maxUnits) break;
  }

  return units.slice(0, maxUnits);
}
