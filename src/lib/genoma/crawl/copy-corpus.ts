import * as cheerio from "cheerio";
import type { CrawlPageSnapshot } from "./types";

const DEFAULT_MAX_CHARS = 32_000;

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function stripNextJsPayload(text: string): string {
  const idx = text.indexOf("(self.__next_f");
  return idx >= 0 ? text.slice(0, idx).trim() : text;
}

function pageCopyPriority(url: string): number {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\/(about|quienes|nosotros|sobre|filosofia|manifesto|equipo|team)(\/|$)/.test(path)) return 100;
    if (/\/(contact|contacto)(\/|$)/.test(path)) return 90;
    if (path === "/" || path === "") return 85;
    if (/\/portfolio\/?$/.test(path)) return 70;
    if (/\/portfolio\//.test(path)) return 35;
    return 50;
  } catch {
    return 0;
  }
}

function pushUnique(chunks: string[], seen: Set<string>, text: string, source: string, minLen = 8): void {
  const value = cleanText(text);
  if (!value || value.length < minLen) return;
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  chunks.push(`[${source}] ${value}`);
}

function extractPageCopy(page: CrawlPageSnapshot, maxParagraphs: number): string[] {
  const $ = cheerio.load(page.html);
  const path = (() => {
    try {
      return new URL(page.url).pathname || "/";
    } catch {
      return page.url;
    }
  })();

  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (text: string, source: string, minLen = 8) => {
    const before = lines.length;
    pushUnique(lines, seen, text, source, minLen);
    if (lines.length > before && lines.length >= maxParagraphs * 3) return true;
    return false;
  };

  push($('meta[property="og:description" i]').attr("content") ?? "", `${path} og:description`, 16);
  push($('meta[name="description" i]').attr("content") ?? "", `${path} meta description`, 16);
  push($("h1").first().text(), `${path} h1`, 6);

  $("h2, h3").each((_, el) => {
    push($(el).text(), `${path} heading`);
  });

  $("main p, article p, section p, .hero p, [class*='hero' i] p, p").each((_, el) => {
    if (lines.length >= maxParagraphs * 2) return false;
    push($(el).text(), `${path} p`, 12);
  });

  $("li, blockquote, [class*='text' i], [class*='desc' i], [class*='lead' i]").each((_, el) => {
    if (lines.length >= maxParagraphs * 2) return false;
    push($(el).text(), `${path} copy`, 10);
  });

  if (lines.length < 6) {
    $("script, style, nav, footer, noscript").remove();
    const body = stripNextJsPayload($("body").text());
    push(body.slice(0, 6000), `${path} body`, 20);
  }

  return lines;
}

/** Corpus priorizado para síntesis LLM — páginas About/Contact primero. */
export function buildCopyCorpus(pages: CrawlPageSnapshot[], maxChars = DEFAULT_MAX_CHARS): string {
  const sorted = [...pages].sort((a, b) => pageCopyPriority(b.url) - pageCopyPriority(a.url));
  const chunks: string[] = [];
  const seen = new Set<string>();

  for (const page of sorted) {
    const priority = pageCopyPriority(page.url);
    const maxParagraphs = priority >= 90 ? 24 : priority >= 70 ? 14 : 8;
    for (const line of extractPageCopy(page, maxParagraphs)) {
      const value = line.replace(/^\[[^\]]+\]\s*/, "");
      pushUnique(chunks, seen, value, line.match(/^\[([^\]]+)\]/)?.[1] ?? page.url);
      if (chunks.join("\n").length >= maxChars) break;
    }
    if (chunks.join("\n").length >= maxChars) break;
  }

  return chunks.join("\n\n").slice(0, maxChars);
}

export function corpusContainsQuote(corpus: string, quote: string): boolean {
  const norm = (value: string) =>
    value
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .replace(/[""«»„]/g, '"')
      .replace(/[''‛]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\u00ad/g, "")
      .replace(/…/g, "...")
      .trim()
      .toLowerCase();
  const haystack = norm(corpus);
  const needle = norm(quote);
  if (!needle || needle.length < 8) return false;
  if (haystack.includes(needle)) return true;

  const minLen = Math.max(12, Math.floor(needle.length * 0.55));
  for (let start = 0; start <= needle.length - minLen; start += 4) {
    const slice = needle.slice(start, start + minLen);
    if (slice.length >= minLen && haystack.includes(slice)) return true;
  }

  return false;
}

export function cheapCopySignals(corpus: string): {
  usesTuteo: boolean;
  usesUsted: boolean;
  avgSentenceLength: number;
  exclamations: number;
} {
  const sample = corpus.slice(0, 8000);
  const sentences = sample.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = sample.split(/\s+/).filter(Boolean);
  const avgSentenceLength = sentences.length ? words.length / sentences.length : 0;
  return {
    usesTuteo: /\b(tú|tu|tus|ti|contigo)\b/i.test(sample),
    usesUsted: /\b(usted|su|sus|le|les)\b/i.test(sample),
    avgSentenceLength,
    exclamations: (sample.match(/!/g) ?? []).length,
  };
}
