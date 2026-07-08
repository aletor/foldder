import * as cheerio from "cheerio";
import type { LegacyOnelinerValue, LegacyValuesValue, VoiceValue } from "../genoma-types";
import type { CrawlPageSnapshot } from "./types";
import { buildCopyCorpus } from "./copy-corpus";

function trimClaim(raw: string, max = 120): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length < 6) return null;
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function cleanMarketingClaim(raw: string): string | null {
  const text = trimClaim(raw);
  if (!text) return null;
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts[0].length >= 10) return parts[0];
  return text;
}

function normalizeBrand(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, " ").trim();
}

export function isGenericBrandTitle(text: string, brandName?: string): boolean {
  const claim = normalizeBrand(text);
  if (!claim) return true;
  if (brandName && claim === normalizeBrand(brandName)) return true;
  if (/^(alima|home|inicio)(\s+(films|producciones|films producciones))?$/.test(claim)) return true;
  if (claim.length < 18 && !/[?!]/.test(text)) return true;
  return false;
}

export function isWeakOneliner(text: string, brandName?: string): boolean {
  return isGenericBrandTitle(text, brandName);
}

function scoreOnelinerCandidate(text: string): number {
  let score = Math.min(text.length, 72);
  if (/^¿/.test(text)) score += 45;
  if (/[?!]/.test(text)) score += 15;
  if (/^(somos |hacemos |tu historia)/i.test(text)) score += 10;
  if (text.length > 95) score -= 35;
  if (text.length < 20) score -= 8;
  return score;
}

function questionTaglines($: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  $("p, h2, h3, [class*='hero' i] *").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.startsWith("¿") && text.length >= 12 && text.length <= 100) out.push(text);
  });
  return out;
}

function looksLikeProjectTitle(text: string): boolean {
  return /fundaci[oó]n|spot|curso|branded|premios|fellowship|metro de/i.test(text);
}

/** Preferir claims de marketing antes de LLM (spec §8.6). */
export function extractOnelinerDeterministic(
  pages: CrawlPageSnapshot[],
  brandName?: string,
): {
  value: LegacyOnelinerValue;
  sourceDetail: string;
} | null {
  if (!pages.length) return null;

  const corpus = buildCopyCorpus(pages);
  const repeated = extractRepeatedClaim(corpus);
  const home = pages.find((p) => {
    try {
      const path = new URL(p.url).pathname;
      return path === "/" || path === "";
    } catch {
      return false;
    }
  }) ?? pages[0];
  const about = pages.find((p) => /\/(about|quienes|nosotros|sobre)/i.test(p.url));

  const $home = cheerio.load(home.html);
  const $about = about ? cheerio.load(about.html) : null;

  const candidates: { text: string; source: string }[] = [];

  if (repeated) candidates.push({ text: repeated, source: "claim repetido" });

  for (const line of questionTaglines($home)) {
    candidates.push({ text: line, source: "tagline home" });
  }

  const metaDesc = cleanMarketingClaim($home('meta[name="description" i]').attr("content") ?? "");
  if (metaDesc && !isGenericBrandTitle(metaDesc, brandName)) {
    candidates.push({ text: metaDesc, source: "meta description" });
  }

  const ogDesc = cleanMarketingClaim($home('meta[property="og:description" i]').attr("content") ?? "");
  if (ogDesc && !isGenericBrandTitle(ogDesc, brandName)) {
    candidates.push({ text: ogDesc, source: "og:description" });
  }

  $home("p").each((_, el) => {
    const text = trimClaim($home(el).text());
    if (text && text.length >= 40) candidates.push({ text, source: "p home" });
  });

  if ($about) {
    $about("p").each((_, el) => {
      const text = trimClaim($about(el).text());
      if (text && text.length >= 8 && text.length <= 80) candidates.push({ text, source: "p about" });
    });
  }

  const ogTitle = cleanMarketingClaim($home('meta[property="og:title" i]').attr("content") ?? "");
  if (ogTitle && !isGenericBrandTitle(ogTitle, brandName)) {
    candidates.push({ text: ogTitle, source: "og:title" });
  }

  const h1 = trimClaim($home("h1").first().text());
  if (h1 && !looksLikeProjectTitle(h1) && !isGenericBrandTitle(h1, brandName)) {
    candidates.push({ text: h1, source: "h1 hero" });
  }

  const filtered = candidates.filter((item) => !isGenericBrandTitle(item.text, brandName));
  if (!filtered.length) return null;

  filtered.sort((a, b) => scoreOnelinerCandidate(b.text) - scoreOnelinerCandidate(a.text));
  const best = filtered[0];
  return { value: { text: best.text, origin: "extracted" }, sourceDetail: best.source };
}

export function extractRepeatedClaim(corpus: string): string | null {
  const lines = corpus
    .split("\n")
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
    .filter((line) => line.length >= 12 && line.length <= 120);

  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const line of lines) {
    const count = counts.get(line.toLowerCase()) ?? 0;
    if (count > bestCount) {
      best = line;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}

function manifestoLines(pages: CrawlPageSnapshot[]): string[] {
  const about =
    pages.find((p) => /\/(about|quienes|nosotros|sobre)/i.test(p.url)) ??
    pages.find((p) => {
      try {
        return new URL(p.url).pathname === "/";
      } catch {
        return false;
      }
    });
  if (!about) return [];
  const $ = cheerio.load(about.html);
  const lines: string[] = [];
  $("p, li, h2, h3").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 6 && text.length <= 90) lines.push(text);
  });
  return lines;
}

export function extractVoiceDeterministic(pages: CrawlPageSnapshot[], brandName?: string): VoiceValue | null {
  const lines = manifestoLines(pages);
  const corpus = buildCopyCorpus(pages);
  const longParagraph =
    corpus
      .split("\n")
      .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
      .find((line) => line.length >= 80) ?? lines.join(" ");

  if (!lines.length && !longParagraph) return null;

  const punchy = lines.filter((line) => line.length <= 70 && !/^declaraci/i.test(line));
  const descriptors = [
    punchy.some((l) => /cine|narrativa|historia/i.test(l)) ? "cinematográfico" : "narrativo",
    punchy.some((l) => /cómplices|serio|morder/i.test(l)) ? "comprometido" : "directo",
    punchy.some((l) => /publicidad|marca/i.test(l)) ? "publicitario con alma" : "emocional",
  ];

  const rules = [
    "Usar frases cortas con ritmo y seguridad.",
    "Priorizar imagen, narrativa y emoción sobre mensajes genéricos.",
    "Evitar lenguaje corporativo o de agencia tradicional.",
  ];

  const evidence = [longParagraph, ...punchy.slice(0, 2)]
    .filter(Boolean)
    .slice(0, 3)
    .map((quote) => ({ quote, sourceUrl: pages[0]?.url }));

  if (!evidence.length) return null;

  const summary = `Voz ${descriptors.slice(0, 3).join(", ")} inferida del manifiesto web; revisa la síntesis antes de confirmar.`;

  return {
    summary,
    descriptors,
    rules,
    avoid: ["jerga corporativa", "tono de agencia tradicional"],
    evidence,
  };
}

export function extractValuesDeterministic(pages: CrawlPageSnapshot[]): LegacyValuesValue | null {
  const lines = manifestoLines(pages);
  const candidates = lines
    .filter((line) => line.length >= 4 && line.length <= 48)
    .filter((line) => !/^declaraci/i.test(line) && !/^somos ·/i.test(line))
    .map((line) => line.replace(/\.$/, ""))
    .filter((line, index, arr) => arr.indexOf(line) === index);

  if (candidates.length < 3) return null;
  return {
    values: candidates.slice(0, 5).map((label) => ({ label, evidence: label })),
  };
}

export function extractOnelinerCandidatesFromPages(pages: CrawlPageSnapshot[], brandName?: string): LegacyOnelinerValue[] {
  const corpus = buildCopyCorpus(pages);
  const options: LegacyOnelinerValue[] = [];
  const primary = extractOnelinerDeterministic(pages, brandName);
  if (primary) options.push(primary.value);

  const repeated = extractRepeatedClaim(corpus);
  if (repeated && !options.some((item) => item.text === repeated)) {
    options.push({ text: repeated, origin: "extracted" });
  }

  for (const line of manifestoLines(pages).filter((text) => text.length >= 10 && text.length <= 80).slice(0, 3)) {
    if (!options.some((item) => item.text === line) && !isGenericBrandTitle(line, brandName)) {
      options.push({ text: line, origin: "extracted" });
    }
  }

  return options.slice(0, 3);
}
