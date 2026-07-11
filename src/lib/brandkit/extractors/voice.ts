/**
 * Extractor de voz (§3.5): tagline, tono y claims desde texto del PDF.
 * Heurístico puro (sin LLM): titulares grandes, léxico de tono y patrones de claims.
 */

import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import { createCandidate, signal, type Candidate, type SourceRef } from "../model/evidence";
import { textSignature } from "../model/signature";
import type { ClaimValue, TaglineValue, ToneValue } from "../model/trait-values";

const HEADLINE_SIZE = 14;

export interface PdfTextLine {
  text: string;
  size: number;
  page: number;
}

const TONE_LEXICON: Record<string, string> = {
  cercano: "cercano",
  cercana: "cercano",
  humano: "humano",
  humana: "humano",
  directo: "directo",
  directa: "directo",
  claro: "claro",
  clara: "clara",
  optimista: "optimista",
  audaz: "audaz",
  valiente: "valiente",
  riguroso: "riguroso",
  rigurosa: "riguroso",
  profesional: "profesional",
  elegante: "elegante",
  innovador: "innovador",
  innovadora: "innovador",
  accesible: "accesible",
  formal: "formal",
  informal: "informal",
  cálido: "cálido",
  calido: "cálido",
  cálida: "cálido",
  confiable: "confiable",
  auténtico: "auténtico",
  autentico: "auténtico",
  dinámico: "dinámico",
  dinamico: "dinámico",
  inspirador: "inspirador",
  inspiradora: "inspirador",
  sencillo: "sencillo",
  sencilla: "sencillo",
  premium: "premium",
  exclusivo: "exclusivo",
  exclusiva: "exclusivo",
};

const FORBIDDEN_PATTERNS = [
  /\bno\s+(decir|utilizar|usar|prometer|mencionar|escribir|publicar)\b/i,
  /\bevitar\b/i,
  /\bprohibid[oa]\b/i,
  /\btab[uú]\b/i,
  /\bno\s+usar\b/i,
];

const ABSOLUTE_PATTERNS = [
  /\breferent[ea]s?\b/i,
  /\bl[ií]der(es)?\b/i,
  /\bn[úu]mero\s+uno\b/i,
  /\b(la|el)\s+mejor\b/i,
  /\b(la|el)\s+primera\b/i,
  /\bgarantizamos\b/i,
  /\b\d+\s*(%|millones?|m\b|usuarios|clientes|años)/i,
];

function cleanLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isLikelyTagline(text: string): boolean {
  if (text.length < 4 || text.length > 120) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^\d[\d\s./-]+$/.test(text)) return false;
  if (/^\d+\s*d[ií]as?\b/i.test(text)) return false;
  if (/^(página|page|capítulo|índice|tabla de contenidos)\b/i.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 14) return false;
  return true;
}

export async function analyzePdfTextLines(buffer: Buffer, maxPages = 20): Promise<PdfTextLine[]> {
  const loaded = await loadPdfJsDocumentFromBuffer(buffer);
  const pdf = await loaded.pdf;
  const lines: PdfTextLine[] = [];
  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const text = cleanLine(String((item as { str?: unknown }).str ?? ""));
        if (!text) continue;
        const transform = (item as { transform?: number[] }).transform ?? [];
        const size = Math.abs(transform[0] ?? 0);
        lines.push({ text, size, page: pageNumber });
      }
    }
  } finally {
    await pdf.destroy();
  }
  return lines;
}

function buildTaglineCandidates(lines: PdfTextLine[], sourceId: string): Candidate<TaglineValue>[] {
  const scores = new Map<string, { text: string; score: number; size: number }>();
  for (const line of lines) {
    if (line.size < HEADLINE_SIZE || !isLikelyTagline(line.text)) continue;
    const key = textSignature(line.text);
    const score = line.size * 2 + (line.text.endsWith(".") ? 4 : 0);
    const prev = scores.get(key);
    if (!prev || score > prev.score) scores.set(key, { text: line.text, score, size: line.size });
    else if (prev) prev.score += 1;
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) =>
      createCandidate<TaglineValue>({
        value: { text: row.text },
        signals: [
          signal("headline", { detail: "titular destacado en el documento", sourceRef: sourceId, scale: Math.min(1, row.size / 24) }),
        ],
        signature: textSignature(row.text),
        sourceRefs: [sourceId],
      }),
    );
}

function buildToneCandidates(fullText: string, sourceId: string): Candidate<ToneValue>[] {
  const normalized = fullText.toLowerCase();
  const found = new Map<string, string>();
  for (const [needle, label] of Object.entries(TONE_LEXICON)) {
    if (normalized.includes(needle)) found.set(label, label);
  }
  return [...found.values()].slice(0, 6).map((text) =>
    createCandidate<ToneValue>({
      value: { text },
      signals: [signal("brand-manual", { detail: `aparece en el manual (${text})`, sourceRef: sourceId })],
      signature: textSignature(text),
      sourceRefs: [sourceId],
    }),
  );
}

function buildClaimCandidates(lines: PdfTextLine[], sourceId: string): {
  absolute: Candidate<ClaimValue>[];
  forbidden: Candidate<ClaimValue>[];
} {
  const absolute: Candidate<ClaimValue>[] = [];
  const forbidden: Candidate<ClaimValue>[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const text = line.text;
    if (text.length < 8 || text.length > 220) continue;
    const sig = textSignature(text);
    if (seen.has(sig)) continue;

    if (FORBIDDEN_PATTERNS.some((re) => re.test(text))) {
      seen.add(sig);
      forbidden.push(
        createCandidate<ClaimValue>({
          value: { text, kind: "forbidden", why: "marcado como prohibido en el documento" },
          signals: [signal("brand-manual", { detail: "patrón de prohibición", sourceRef: sourceId })],
          signature: sig,
          sourceRefs: [sourceId],
        }),
      );
      continue;
    }

    if (ABSOLUTE_PATTERNS.some((re) => re.test(text)) && line.size >= 10) {
      seen.add(sig);
      absolute.push(
        createCandidate<ClaimValue>({
          value: { text, kind: "absolute" },
          signals: [signal("brand-manual", { detail: "afirmación destacada", sourceRef: sourceId })],
          signature: sig,
          sourceRefs: [sourceId],
        }),
      );
    }
  }

  return { absolute: absolute.slice(0, 4), forbidden: forbidden.slice(0, 4) };
}

export interface VoiceExtraction {
  tagline: Candidate<TaglineValue>[];
  tone: Candidate<ToneValue>[];
  absolute: Candidate<ClaimValue>[];
  forbidden: Candidate<ClaimValue>[];
}

export async function extractVoiceFromPdf(
  buffer: Buffer,
  opts: { sources?: SourceRef[]; maxPages?: number } = {},
): Promise<VoiceExtraction> {
  const sourceId = opts.sources?.[0]?.id ?? "pdf";
  const lines = await analyzePdfTextLines(buffer, opts.maxPages ?? 20);
  const fullText = lines.map((l) => l.text).join(" ");
  return {
    tagline: buildTaglineCandidates(lines, sourceId),
    tone: buildToneCandidates(fullText, sourceId),
    ...buildClaimCandidates(lines, sourceId),
  };
}
