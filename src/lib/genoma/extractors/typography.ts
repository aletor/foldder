/**
 * Extractor de tipografía (§3.1).
 *
 * Adaptador sobre la maquinaria ya probada de BrandKit (pdf.js con ObjStm, no
 * regex sobre bytes crudos; normalización de subset; stopwords de sistema).
 * Reutiliza las utilidades PURAS de `@/lib/brain/pdf-font-extract` y produce
 * `Candidate<TypographyValue>[]` para el núcleo de Genoma.
 *
 * Puntúa por CONTEXTO de aparición, no por conteo de documentos:
 *  +  titulares grandes · fuente embebida · recurrencia en páginas.
 *  −  pies de página · aparición única · solo cuerpo de anexos.
 * `primary` = mayor peso en titulares; `secondary` = mayor peso en cuerpo.
 * Especimen: tras detectar la familia, `enrichTypographySpecimen` busca Google Fonts;
 * si no está, `specimenAvailable=false` hasta subir woff2 — jamás se finge la fuente.
 */

import {
  isBrandFontStopword,
  parsePdfFontResourceName,
} from "@/lib/brain/pdf-font-extract";
import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import { createCandidate, signal, type Candidate, type EvidenceSignal, type SourceRef } from "../model/evidence";
import { fontFamilySignature } from "../model/signature";
import { enrichTypographySpecimen } from "../specimen/typography-specimen";
import type { TypographyValue } from "../model/trait-values";
import {
  extractEmbeddedFontBinaries,
  mergeFontBinariesIntoUsage,
  type ExtractedFontBinary,
} from "./font-binary-extract";

export type { TypographyValue };

const SUBSET_PREFIX_RE = /^[A-Z]{6}\+/;
/** Tamaño (pt aprox, |transform[0]|) a partir del cual contamos glifos como titular. */
const HEADLINE_SIZE = 14;
/** Score por debajo del cual una familia con contexto ambiguo cae a "dudosas". */
const DOUBTFUL_SCORE = 0.5;
/** Nº de familias de marca a partir del cual activamos la lista de dudosas. */
const DOUBTFUL_MIN_FAMILIES = 3;

/** Uso agregado por familia dentro de un documento (salida de `analyzeFontUsage`). */
export interface FontUsage {
  family: string;
  weights: string[];
  headlineGlyphs: number;
  bodyGlyphs: number;
  footerGlyphs: number;
  pageCount: number;
  embedded: boolean;
  totalGlyphs: number;
}

export interface TypographyExtraction {
  /** Candidatos para `typography.primary`, ordenados por evidencia (top = propuesta). */
  primary: Candidate<TypographyValue>[];
  /** Candidatos para `typography.secondary`. */
  secondary: Candidate<TypographyValue>[];
  /** Lista de dudosas: peso pequeño; la cara ofrece «promover a primaria/secundaria». */
  doubtful: Candidate<TypographyValue>[];
}

type PdfFontResource = { name?: string; loadedName?: string; fallbackName?: string };

/**
 * Recorre el PDF con pdf.js (ObjStm descomprimidos) y agrega, POR FAMILIA, el
 * contexto de aparición: glifos en titulares vs cuerpo, glifos en pie de página,
 * páginas distintas, pesos y si la fuente está embebida (subset).
 */
export async function analyzeFontUsage(buffer: Buffer, maxPages = 30): Promise<FontUsage[]> {
  const loaded = await loadPdfJsDocumentFromBuffer(buffer);
  const pdf = await loaded.pdf;
  const byFamily = new Map<
    string,
    {
      family: string;
      weights: Set<string>;
      headline: number;
      body: number;
      footer: number;
      pages: Set<number>;
      embedded: boolean;
      total: number;
    }
  >();

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      // Fuerza la resolución de fuentes en commonObjs antes de leerlas.
      await page.getOperatorList();

      const view = (page as { view?: number[] }).view;
      const yBottom = view?.[1] ?? 0;
      const yTop = view?.[3] ?? 792;
      const pageHeight = Math.abs(yTop - yBottom) || 792;
      const footerBand = yBottom + pageHeight * 0.1;

      const resolved = new Map<string, { family: string; weight: string; embedded: boolean } | null>();
      const resolveFont = async (fontId: string) => {
        const cached = resolved.get(fontId);
        if (cached !== undefined) return cached;
        let resource: PdfFontResource | null = null;
        try {
          resource = (await page.commonObjs.get(fontId)) as PdfFontResource;
        } catch {
          try {
            resource = (await page.objs.get(fontId)) as PdfFontResource;
          } catch {
            resource = null;
          }
        }
        const rawName = resource?.name || resource?.loadedName || resource?.fallbackName || "";
        const parsed = parsePdfFontResourceName(rawName);
        const out = parsed
          ? { family: parsed.family, weight: parsed.weight, embedded: SUBSET_PREFIX_RE.test(rawName) }
          : null;
        resolved.set(fontId, out);
        return out;
      };

      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("str" in item) || !("fontName" in item)) continue;
        const fontId = (item as { fontName?: unknown }).fontName;
        if (typeof fontId !== "string" || !fontId) continue;
        const glyphs = String((item as { str?: unknown }).str ?? "").trim().length;
        if (!glyphs) continue;

        const font = await resolveFont(fontId);
        if (!font) continue;

        const transform = (item as { transform?: number[] }).transform ?? [];
        const size = Math.abs(transform[0] ?? 0);
        const y = transform[5] ?? pageHeight;

        let usage = byFamily.get(font.family);
        if (!usage) {
          usage = {
            family: font.family,
            weights: new Set(),
            headline: 0,
            body: 0,
            footer: 0,
            pages: new Set(),
            embedded: false,
            total: 0,
          };
          byFamily.set(font.family, usage);
        }
        usage.weights.add(font.weight);
        usage.pages.add(pageNumber);
        usage.embedded = usage.embedded || font.embedded;
        usage.total += glyphs;
        if (size >= HEADLINE_SIZE) usage.headline += glyphs;
        else usage.body += glyphs;
        if (y <= footerBand) usage.footer += glyphs;
      }
    }
  } finally {
    await pdf.destroy();
  }

  return [...byFamily.values()].map((u) => ({
    family: u.family,
    weights: sortWeights([...u.weights]),
    headlineGlyphs: u.headline,
    bodyGlyphs: u.body,
    footerGlyphs: u.footer,
    pageCount: u.pages.size,
    embedded: u.embedded,
    totalGlyphs: u.total,
  }));
}

const WEIGHT_ORDER = ["Thin", "Light", "Regular", "Italic", "Medium", "SemiBold", "Bold", "Bold Italic", "Black"];
function sortWeights(weights: string[]): string[] {
  return [...new Set(weights)].sort((a, b) => {
    const ia = WEIGHT_ORDER.indexOf(a);
    const ib = WEIGHT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function guessFallback(family: string): TypographyValue["fallback"] {
  const f = family.toLowerCase();
  if (/mono|courier|consol/.test(f)) return "monospace";
  if (/serif/.test(f) && !/sans/.test(f)) return "serif";
  if (/(times|georgia|garamond|minion|playfair|merriweather|lora)/.test(f)) return "serif";
  return "sans-serif";
}

function typographyValue(u: FontUsage, binaries: Map<string, ExtractedFontBinary>): TypographyValue {
  const merged = mergeFontBinariesIntoUsage(u.family, u.weights, binaries);
  return enrichTypographySpecimen({
    family: u.family,
    weights: u.weights,
    embedStatus: merged.embedStatus,
    extractedWeights: merged.extractedWeights,
    specimenFontFaces: merged.specimenFontFaces,
    specimenAvailable: merged.embedStatus === "embedded_extracted",
    fallback: guessFallback(u.family),
  });
}

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

function recurrenceOrSinglenessSignals(u: FontUsage, maxTotal: number, refs: string[]): EvidenceSignal[] {
  const out: EvidenceSignal[] = [];
  if (u.pageCount >= 2) {
    // Recurrencia + dominancia de uso: la familia más usada puntúa más alto.
    const dominance = maxTotal > 0 ? u.totalGlyphs / maxTotal : 0;
    out.push(
      signal("repeated-independent", {
        scale: clamp(0.4 + 0.8 * dominance, 0.4, 1.2),
        detail: `presente en ${u.pageCount} páginas`,
        sourceRef: refs[0],
      }),
    );
  } else if (u.totalGlyphs < 40) {
    out.push(signal("single-appearance", { detail: "aparición única", sourceRef: refs[0] }));
  }
  if (u.footerGlyphs / (u.totalGlyphs || 1) > 0.5) {
    out.push(signal("footer", { detail: "sobre todo en pie de página", sourceRef: refs[0] }));
  }
  return out;
}

function primarySignals(u: FontUsage, maxHeadline: number, maxTotal: number, refs: string[]): EvidenceSignal[] {
  const out: EvidenceSignal[] = [];
  if (u.embedded) out.push(signal("embedded-file", { detail: "fuente embebida (subset)", sourceRef: refs[0] }));
  if (u.headlineGlyphs > 0) {
    out.push(
      signal("headline", {
        scale: clamp(0.5 + u.headlineGlyphs / maxHeadline, 0.5, 1.5),
        detail: `en titulares (${u.headlineGlyphs} glifos)`,
        sourceRef: refs[0],
      }),
    );
  } else if (u.bodyGlyphs > 0 && u.pageCount <= 2) {
    out.push(signal("body-annex", { detail: "solo en cuerpo, poca recurrencia", sourceRef: refs[0] }));
  }
  out.push(...recurrenceOrSinglenessSignals(u, maxTotal, refs));
  return out;
}

function secondarySignals(u: FontUsage, maxBody: number, maxTotal: number, refs: string[]): EvidenceSignal[] {
  const out: EvidenceSignal[] = [];
  if (u.embedded) out.push(signal("embedded-file", { detail: "fuente embebida (subset)", sourceRef: refs[0] }));
  if (u.bodyGlyphs > 0) {
    out.push(
      signal("body-text", {
        scale: clamp(0.5 + u.bodyGlyphs / maxBody, 0.5, 1.5),
        detail: `en texto de cuerpo (${u.bodyGlyphs} glifos)`,
        sourceRef: refs[0],
      }),
    );
  }
  out.push(...recurrenceOrSinglenessSignals(u, maxTotal, refs));
  return out;
}

function byScoreDesc(a: Candidate<TypographyValue>, b: Candidate<TypographyValue>): number {
  return b.evidenceScore - a.evidenceScore;
}

const HEADLINE_WEIGHT_RE = /\b(bold|black|extrabold|semibold|medium|heavy|demi)\b/i;
const BODY_WEIGHT_RE = /\b(light|thin|regular|book|normal|italic|oblique)\b/i;

/** Reparte pesos entre titular (primaria) y cuerpo (secundaria) cuando solo hay una familia. */
export function splitTypographyWeightsForRoles(weights: string[]): { headline: string[]; body: string[] } {
  const sorted = sortWeights(weights);
  const headline = sorted.filter((w) => HEADLINE_WEIGHT_RE.test(w));
  const body = sorted.filter((w) => BODY_WEIGHT_RE.test(w) && !HEADLINE_WEIGHT_RE.test(w));

  if (headline.length > 0 && body.length > 0) {
    return { headline, body };
  }

  if (sorted.length >= 2) {
    const mid = Math.ceil(sorted.length / 2);
    return { headline: sorted.slice(mid), body: sorted.slice(0, mid) };
  }

  const only = sorted[0] ?? "Regular";
  if (HEADLINE_WEIGHT_RE.test(only)) {
    return { headline: [only], body: ["Regular"] };
  }
  const headlineFallback = sorted.find((w) => HEADLINE_WEIGHT_RE.test(w)) ?? "Medium";
  return { headline: [headlineFallback], body: [only] };
}

/**
 * Puro: de los usos agregados produce candidatos rankeados para primaria y
 * secundaria + la lista de dudosas. Descarta fuentes de sistema (stopwords).
 */
export function buildTypographyCandidates(
  usages: FontUsage[],
  opts: { sources?: SourceRef[]; binaries?: Map<string, ExtractedFontBinary> } = {},
): TypographyExtraction {
  const binaries = opts.binaries ?? new Map<string, ExtractedFontBinary>();
  const refs = (opts.sources ?? []).map((s) => s.id);
  const brand = usages.filter((u) => u.totalGlyphs > 0 && !isBrandFontStopword(u.family));
  if (brand.length === 0) return { primary: [], secondary: [], doubtful: [] };

  const maxHeadline = Math.max(1, ...brand.map((u) => u.headlineGlyphs));
  const maxBody = Math.max(1, ...brand.map((u) => u.bodyGlyphs));
  const maxTotal = Math.max(1, ...brand.map((u) => u.totalGlyphs));

  // Familia dominante en titulares → propuesta de primaria (fallback: más glifos).
  const primaryTop = [...brand].sort(
    (a, b) => b.headlineGlyphs - a.headlineGlyphs || b.totalGlyphs - a.totalGlyphs,
  )[0];

  const primaryOf = (u: FontUsage) =>
    createCandidate<TypographyValue>({
      value: typographyValue(u, binaries),
      signals: primarySignals(u, maxHeadline, maxTotal, refs),
      signature: fontFamilySignature(u.family),
      sourceRefs: refs,
    });

  const secondaryOf = (u: FontUsage) =>
    createCandidate<TypographyValue>({
      value: typographyValue(u, binaries),
      signals: secondarySignals(u, maxBody, maxTotal, refs),
      signature: fontFamilySignature(u.family),
      sourceRefs: refs,
    });

  // Dudosas: solo si hay bastantes familias y su evidencia como primaria es baja.
  const doubtfulFamilies = new Set<string>();
  if (brand.length > DOUBTFUL_MIN_FAMILIES) {
    for (const u of brand) {
      if (u.family === primaryTop.family) continue;
      if (primaryOf(u).evidenceScore < DOUBTFUL_SCORE) doubtfulFamilies.add(u.family);
    }
  }

  const primary = brand
    .filter((u) => !doubtfulFamilies.has(u.family))
    .map(primaryOf)
    .sort(byScoreDesc);

  const secondary = brand
    .filter((u) => u.family !== primaryTop.family && !doubtfulFamilies.has(u.family))
    .map(secondaryOf)
    .sort(byScoreDesc);

  const doubtful = brand
    .filter((u) => doubtfulFamilies.has(u.family))
    .map(primaryOf)
    .sort(byScoreDesc);

  let primaryOut = primary;
  let secondaryOut = secondary;

  // Una sola familia de marca → secundaria = misma familia en pesos de cuerpo.
  if (secondaryOut.length === 0 && primaryTop) {
    const { headline, body } = splitTypographyWeightsForRoles(primaryTop.weights);
    if (body.length > 0) {
      secondaryOut = [
        secondaryOf({
          ...primaryTop,
          weights: body,
          headlineGlyphs: 0,
          bodyGlyphs: Math.max(primaryTop.bodyGlyphs, 1),
        }),
      ];
      if (headline.length > 0) {
        const refinedPrimary = primaryOf({ ...primaryTop, weights: headline });
        primaryOut = primaryOut.map((c) => (c.value.family === primaryTop.family ? refinedPrimary : c));
        if (!primaryOut.some((c) => c.value.family === primaryTop.family)) {
          primaryOut = [refinedPrimary, ...primaryOut];
        }
      }
    }
  }

  return { primary: primaryOut, secondary: secondaryOut, doubtful };
}

/** Guess mínimo que devuelve el fallback de visión (familia + pesos + confianza). */
export interface TypographyVisionGuess {
  primary?: { family: string; weights?: string[] };
  secondary?: { family: string; weights?: string[] };
  confidence?: number;
}

export interface ExtractTypographyOptions {
  sources?: SourceRef[];
  maxPages?: number;
  /** Resultado del pase de visión unificado — evita una segunda llamada LLM. */
  visionGuess?: TypographyVisionGuess | null;
  /**
   * Fallback multimodal: solo se invoca si NO hay fuentes embebidas de marca
   * y no se pasó visionGuess.
   */
  vision?: () => Promise<TypographyVisionGuess | null>;
}

function visionCandidate(
  slot: { family: string; weights?: string[] },
  confidence: number,
  refs: string[],
): Candidate<TypographyValue> {
  // Confianza baja explícita: una sola señal de visión, sin embebido.
  const s = signal("llm-vision", {
    detail: "inferida por visión sobre renders",
    scale: clamp(confidence / 0.3, 0.3, 1.2),
    sourceRef: refs[0],
  });
  return createCandidate<TypographyValue>({
    value: enrichTypographySpecimen({
      family: slot.family,
      weights: sortWeights(slot.weights?.length ? slot.weights : ["Regular"]),
      embedStatus: "substituted",
      specimenAvailable: false,
      fallback: guessFallback(slot.family),
    }),
    signals: [s],
    signature: fontFamilySignature(slot.family),
    sourceRefs: refs,
  });
}

/** Puro: convierte un guess de visión en candidatos `proposed` de confianza baja. */
export function buildVisionTypographyCandidates(
  guess: TypographyVisionGuess,
  sources: SourceRef[] = [],
): TypographyExtraction {
  if (!guess.primary) return { primary: [], secondary: [], doubtful: [] };
  const refs = sources.map((s) => s.id);
  const confidence = guess.confidence ?? 0.3;
  const primary = [visionCandidate(guess.primary, confidence, refs)];
  let secondary = guess.secondary ? [visionCandidate(guess.secondary, confidence, refs)] : [];
  if (secondary.length === 0 && guess.primary.weights?.length) {
    const { body } = splitTypographyWeightsForRoles(guess.primary.weights);
    if (body.length > 0) {
      secondary = [visionCandidate({ family: guess.primary.family, weights: body }, confidence * 0.9, refs)];
    }
  }
  return {
    primary,
    secondary,
    doubtful: [],
  };
}

/**
 * Orquesta el extractor: intenta fuentes embebidas; si el PDF no trae ninguna de
 * marca y se pasó `vision`, cae al pase multimodal (candidatos `proposed`,
 * confianza baja). Nunca inventa: sin evidencia devuelve listas vacías.
 */
export async function extractTypographyFromPdf(
  buffer: Buffer,
  opts: ExtractTypographyOptions = {},
): Promise<TypographyExtraction> {
  const maxPages = opts.maxPages ?? 30;
  const binaries = await extractEmbeddedFontBinaries(buffer, maxPages);
  const usages = await analyzeFontUsage(buffer, maxPages);
  const brand = usages.filter((u) => u.totalGlyphs > 0 && !isBrandFontStopword(u.family));
  if (brand.length > 0) return buildTypographyCandidates(usages, { sources: opts.sources, binaries });

  if (opts.visionGuess?.primary) {
    return buildVisionTypographyCandidates(opts.visionGuess, opts.sources ?? []);
  }

  if (opts.vision) {
    const guess = await opts.vision();
    if (guess?.primary) return buildVisionTypographyCandidates(guess, opts.sources ?? []);
  }

  return { primary: [], secondary: [], doubtful: [] };
}
