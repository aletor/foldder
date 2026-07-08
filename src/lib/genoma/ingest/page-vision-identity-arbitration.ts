/**
 * Fase B — arbitraje de identidad sobre brandNameEvidence agregada (Fase A).
 */

import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";
import type { PageVisionBrandNameEvidence } from "./page-vision-pass-schema";
import { enrichIndexBrandNameEvidenceFromTypography } from "./page-vision-pass-nivel1-schema";
import { filterProductContentTitles } from "./page-vision-content-titles";
import { createCandidate, signal } from "../model/evidence";
import { textSignature } from "../model/signature";
import type { VoiceExtraction } from "../extractors/voice";
import type { TaglineValue } from "../model/trait-values";

export type BrandEvidenceClassification =
  | "emitter_wordmark"
  | "emitter_domain"
  | "content_title"
  | "content_index"
  | "document_section"
  | "unknown";

export type ClassifiedBrandEvidence = PageVisionBrandNameEvidence & {
  pageNumber: number;
  pageKind?: string;
  classification: BrandEvidenceClassification;
};

export type EmitterArbitrationStatus = "resolved" | "conflict";

export type EmitterWordmarkStats = {
  text: string;
  count: number;
  pageNumbers: number[];
};

export type IdentityArbitrationResult = {
  /** Nombre de marca emisora propuesto (ej. "Atresmedia"). */
  emitterBrand: string | null;
  /** Nombres de producto/contenido — no son identidad emisora (ej. "Ágata y Lola"). */
  contentNames: string[];
  evidence: ClassifiedBrandEvidence[];
  arbitrationStatus: EmitterArbitrationStatus;
  arbitrationDetail?: string;
  emitterCandidates?: EmitterWordmarkStats[];
};

function classifyEvidence(
  entry: PageVisionBrandNameEvidence,
  pageKind: string | undefined,
): BrandEvidenceClassification {
  if (entry.kind === "wordmark_logo") return "emitter_wordmark";
  if (entry.kind === "dominio_pie") return "emitter_domain";
  if (entry.kind === "lista_indice") return "content_index";
  if (entry.kind === "seccion_documento") return "document_section";
  if (entry.kind === "titulo_prominente") {
    if (pageKind === "indice") return "document_section";
    if (pageKind === "ficha_contenido") return "content_title";
    return "content_title";
  }
  return "unknown";
}

function normalizeEmitterName(text: string): string {
  return text
    .replace(/\s+(SALES|TV|MEDIA|GROUP|CORP\.?)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWordmarkKey(text: string): string {
  return normalizeEmitterName(text)
    .replace(/®/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Subcadena con límite de palabra: prefijo seguido de fin o espacio, o token completo.
 * "OARO" ⊂ "OARO IDENTITY®" ✓ · "MEDIA" ⊄ "ATRESMEDIA" ✗
 */
export function isWordBoundedEmitterSubstring(shorter: string, longer: string): boolean {
  const shortKey = normalizeWordmarkKey(shorter);
  const longKey = normalizeWordmarkKey(longer);
  if (!shortKey || !longKey || shortKey === longKey) return false;
  if (shortKey.length >= longKey.length) return false;

  if (longKey.startsWith(shortKey)) {
    const rest = longKey.slice(shortKey.length);
    if (rest.length === 0 || rest.startsWith(" ")) return true;
  }

  const tokens = longKey.split(/\s+/).filter(Boolean);
  return tokens.includes(shortKey);
}

/** @deprecated alias test */
export const isStrictSubstringWordmark = isWordBoundedEmitterSubstring;

export function buildWordmarkStats(wordmarks: ClassifiedBrandEvidence[]): EmitterWordmarkStats[] {
  const byKey = new Map<string, EmitterWordmarkStats>();
  for (const entry of wordmarks) {
    const text = normalizeEmitterName(entry.text);
    if (!text) continue;
    const key = normalizeWordmarkKey(text);
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      if (!prev.pageNumbers.includes(entry.pageNumber)) prev.pageNumbers.push(entry.pageNumber);
    } else {
      byKey.set(key, { text, count: 1, pageNumbers: [entry.pageNumber] });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.text.length - b.text.length);
}

function shortDominatesLong(short: EmitterWordmarkStats, long: EmitterWordmarkStats): boolean {
  if (!isWordBoundedEmitterSubstring(short.text, long.text)) return false;
  if (short.count > long.count) return true;
  if (short.count < long.count) return false;
  return short.pageNumbers.length > long.pageNumbers.length;
}

export type SubstringDegradeDecision = {
  degradeTexts: string[];
  conflict: boolean;
  detail?: string;
};

/** Solo degrada líneas de producto si el wordmark corto domina por frecuencia o páginas. */
export function decideSubstringDegrades(stats: EmitterWordmarkStats[]): SubstringDegradeDecision {
  if (stats.length < 2) return { degradeTexts: [], conflict: false };

  const degrade = new Set<string>();
  let conflict = false;
  const conflicts: string[] = [];

  for (const shortStat of stats) {
    for (const longStat of stats) {
      if (shortStat.text === longStat.text) continue;
      if (!isWordBoundedEmitterSubstring(shortStat.text, longStat.text)) continue;

      if (shortDominatesLong(shortStat, longStat)) {
        degrade.add(longStat.text);
      } else if (
        shortStat.count === longStat.count &&
        shortStat.pageNumbers.length === longStat.pageNumbers.length
      ) {
        conflict = true;
        conflicts.push(`${shortStat.text} ↔ ${longStat.text}`);
      }
    }
  }

  return {
    degradeTexts: [...degrade],
    conflict,
    detail: conflict ? `Ámbar · empate subcadena: ${conflicts.join("; ")}` : undefined,
  };
}

export function pickEmitterWordmark(wordmarks: ClassifiedBrandEvidence[]): string | null {
  const stats = buildWordmarkStats(wordmarks);
  if (!stats.length) return null;

  const substringPairs = stats.filter((shortStat) =>
    stats.some(
      (longStat) =>
        shortStat.text !== longStat.text &&
        isWordBoundedEmitterSubstring(shortStat.text, longStat.text),
    ),
  );

  const pool = substringPairs.length ? substringPairs : stats;
  pool.sort(
    (a, b) =>
      b.count - a.count ||
      Math.min(...a.pageNumbers) - Math.min(...b.pageNumbers) ||
      b.text.length - a.text.length,
  );
  return pool[0]?.text ?? null;
}

export function degradeProductLineWordmarks(
  wordmarks: ClassifiedBrandEvidence[],
  emitterBrand: string,
  explicitDegrades?: string[],
): string[] {
  const stats = buildWordmarkStats(wordmarks);
  const decision = decideSubstringDegrades(stats);
  const degradeTexts = explicitDegrades ?? decision.degradeTexts;
  const emitterKey = normalizeWordmarkKey(emitterBrand);
  const out = new Set<string>();

  for (const text of degradeTexts) {
    if (normalizeWordmarkKey(text) !== emitterKey) out.add(text);
  }

  if (!explicitDegrades) {
    for (const entry of wordmarks) {
      const text = normalizeEmitterName(entry.text);
      if (!text) continue;
      const key = normalizeWordmarkKey(text);
      if (key === emitterKey) continue;
      if (isWordBoundedEmitterSubstring(emitterBrand, text) && decision.degradeTexts.includes(text)) {
        out.add(text);
      }
    }
  }

  return [...out];
}

const WORK_SIGNAL_PAGE_KINDS = new Set(["portada", "ficha_contenido"]);

type ContentNameCandidate = {
  text: string;
  pageNumber: number;
  pageKind: string | undefined;
};

function normalizeContentName(text: string): string {
  return text.trim();
}

function isValidContentNameCandidate(
  candidate: ContentNameCandidate,
  occurrenceCount: number,
): boolean {
  const text = normalizeContentName(candidate.text);
  if (text.length <= 1 || text.toLowerCase() === "unknown") return false;
  if (occurrenceCount >= 2) return true;
  return candidate.pageKind != null && WORK_SIGNAL_PAGE_KINDS.has(candidate.pageKind);
}

function filterValidContentNames(candidates: ContentNameCandidate[]): string[] {
  const countByText = new Map<string, number>();
  for (const candidate of candidates) {
    const text = normalizeContentName(candidate.text);
    if (text.length <= 1 || text.toLowerCase() === "unknown") continue;
    countByText.set(text, (countByText.get(text) ?? 0) + 1);
  }

  const accepted = new Set<string>();
  for (const candidate of candidates) {
    const text = normalizeContentName(candidate.text);
    const count = countByText.get(text) ?? 0;
    if (isValidContentNameCandidate(candidate, count)) accepted.add(text);
  }
  return [...accepted];
}

/** Exportado para tests — titulo_obra / contenido solo con recurrencia o pageKind portada|ficha. */
export function filterArbitratedProductContentNames(candidates: ContentNameCandidate[]): string[] {
  return filterValidContentNames(candidates);
}

function domainStem(text: string): string | null {
  const match = text.match(/(?:@|\/\/|^)([a-z0-9-]+)\./i) ?? text.match(/^([a-z0-9-]+)\./i);
  if (!match?.[1]) return null;
  const stem = match[1].replace(/-/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1).toLowerCase();
}

export function aggregateBrandNameEvidence(audit: PageVisionPassRunAudit): ClassifiedBrandEvidence[] {
  const out: ClassifiedBrandEvidence[] = [];
  for (const page of audit.pages) {
    if (!page.ok || !page.result) continue;
    let brandNameEvidence: PageVisionBrandNameEvidence[] = page.result.brandNameEvidence;
    if (!brandNameEvidence.length && page.result.typographyRoles.length > 0) {
      brandNameEvidence = enrichIndexBrandNameEvidenceFromTypography({
        pageKind: page.result.pageKind,
        brandNameEvidence,
        typographyRoles: page.result.typographyRoles,
        contentTitles: page.result.contentTitles,
      });
    }
    if (!brandNameEvidence.length) continue;
    for (const entry of brandNameEvidence) {
      out.push({
        ...entry,
        pageNumber: page.pageNumber,
        pageKind: page.result.pageKind,
        classification: classifyEvidence(entry, page.result.pageKind),
      });
    }
  }
  return out;
}

function aggregateProductContentTitleCandidates(audit: PageVisionPassRunAudit): ContentNameCandidate[] {
  const out: ContentNameCandidate[] = [];
  for (const page of audit.pages) {
    if (!page.ok || !page.result?.contentTitles?.length) continue;
    for (const text of filterProductContentTitles(page.result.contentTitles)) {
      out.push({
        text,
        pageNumber: page.pageNumber,
        pageKind: page.result.pageKind,
      });
    }
  }
  return out;
}

function contentNameCandidatesFromBrandEvidence(content: ClassifiedBrandEvidence[]): ContentNameCandidate[] {
  return content
    .filter((e) => ["content_title", "content_index"].includes(e.classification))
    .map((e) => ({
      text: e.text,
      pageNumber: e.pageNumber,
      pageKind: e.pageKind,
    }));
}

export function arbitrateBrandIdentity(audit: PageVisionPassRunAudit): IdentityArbitrationResult {
  const evidence = aggregateBrandNameEvidence(audit);
  const wordmarks = evidence.filter((e) => e.classification === "emitter_wordmark");
  const domains = evidence.filter((e) => e.classification === "emitter_domain");
  const content = evidence.filter((e) =>
    ["content_title", "content_index", "document_section"].includes(e.classification),
  );

  const stats = buildWordmarkStats(wordmarks);
  const substringDecision = decideSubstringDegrades(stats);

  let emitterBrand: string | null = null;
  if (wordmarks.length) {
    emitterBrand = pickEmitterWordmark(wordmarks);
  } else if (domains.length) {
    const top = domains[0]!;
    emitterBrand = domainStem(top.text.split(/[\s/]/)[0] ?? top.text);
  }

  const productLineNames =
    emitterBrand && !substringDecision.conflict
      ? degradeProductLineWordmarks(wordmarks, emitterBrand, substringDecision.degradeTexts)
      : [];

  const contentNameCandidates = [
    ...aggregateProductContentTitleCandidates(audit),
    ...contentNameCandidatesFromBrandEvidence(content),
  ];

  const contentNames = [
    ...new Set([...productLineNames, ...filterValidContentNames(contentNameCandidates)]),
  ];

  return {
    emitterBrand,
    contentNames,
    evidence,
    arbitrationStatus: substringDecision.conflict ? "conflict" : "resolved",
    arbitrationDetail: substringDecision.detail,
    emitterCandidates: stats,
  };
}

/** ¿Es un nombre de contenido/producto (no emisora)? */
export function isContentBrandName(name: string, arbitration: IdentityArbitrationResult): boolean {
  const normalized = name.trim().toUpperCase();
  return arbitration.contentNames.some((c) => c.trim().toUpperCase() === normalized);
}

/** Filtra taglines de contenido y prioriza la marca emisora agregada en Fase A. */
export function refineVoiceWithIdentityArbitration(
  voice: VoiceExtraction,
  arbitration: IdentityArbitrationResult,
  sourceId: string,
): VoiceExtraction {
  const tagline = voice.tagline.filter((t) => {
    if (isContentBrandName(t.value.text, arbitration)) return false;
    if (!arbitration.emitterBrand) return true;
    const text = t.value.text.trim().toUpperCase();
    const emitter = arbitration.emitterBrand.trim().toUpperCase();
    if (text === emitter || text.includes(emitter)) return true;
    if (t.signals.some((s) => s.kind === "headline")) return false;
    return true;
  });
  if (arbitration.emitterBrand) {
    const emitter = arbitration.emitterBrand.trim();
    const emitterLower = emitter.toLowerCase();
    const hasEmitter = tagline.some((t) => {
      const text = t.value.text.trim().toLowerCase();
      return text === emitterLower || text.includes(emitterLower) || emitterLower.includes(text);
    });
    if (!hasEmitter) {
      tagline.unshift(
        createCandidate<TaglineValue>({
          value: { text: emitter },
          signals: [
            signal("brand-manual", {
              detail: "marca emisora · Fase B · brandNameEvidence",
              sourceRef: sourceId,
            }),
          ],
          signature: textSignature(emitter),
          sourceRefs: [sourceId],
        }),
      );
    }
  }
  return { ...voice, tagline };
}
