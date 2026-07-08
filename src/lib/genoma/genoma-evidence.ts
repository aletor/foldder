import { corpusContainsQuote } from "./crawl/copy-corpus";

export interface GenomaEvidence {
  quote: string;
  sourceUrl?: string;
  fileId?: string;
}

export const GENERIC_DESCRIPTOR_RE =
  /^(innovador|innovadora|profesional|creativo|creativa|único|única|unico|unica|calidad|excelencia|líder|lider|compromiso|soluciones|dinámico|dinamica|moderno|moderna|humano|humana|cercano|cercana|premium|diferente)$/i;

/** Descriptor vacío de una sola palabra genérica (se penaliza, no bloquea si hay contexto). */
export const BARE_GENERIC_DESCRIPTOR_RE = GENERIC_DESCRIPTOR_RE;

export function normalizeQuoteText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True if text is mostly a literal substring of corpus (raw extraction, not synthesis). */
export function looksLikeLiteralCorpusQuote(text: string, corpus: string): boolean {
  const norm = normalizeQuoteText(text);
  if (!norm || norm.length < 12) return false;
  if (norm.length >= 72) return false;
  if (corpusContainsQuote(corpus, norm)) return true;
  const words = norm.split(/\s+/);
  if (words.length <= 6 && corpusContainsQuote(corpus, norm)) return true;
  return false;
}

export function looksLikeFragmentedBelief(label: string): boolean {
  const text = normalizeQuoteText(label);
  if (!text) return true;
  if (text.includes("\n")) return true;
  if (text.length < 4) return true;
  if (/^(y|o|de|la|el|en|un|una)\s/i.test(text) && text.length < 24) return true;
  if (/^[a-záéíóúñ]/.test(text) && text.split(/\s+/).length <= 3 && !/[.!?]$/.test(text)) return true;
  return false;
}

export function isGenericDescriptor(descriptor: string): boolean {
  return isBareGenericDescriptor(descriptor);
}

export function isBareGenericDescriptor(descriptor: string): boolean {
  return BARE_GENERIC_DESCRIPTOR_RE.test(normalizeQuoteText(descriptor));
}

/** Elimina descriptores de una sola palabra genérica; conserva los concretados ("creativo con lenguaje cinematográfico"). */
export function penalizeBareGenericDescriptors(descriptors: string[]): string[] {
  return descriptors
    .map((descriptor) => descriptor.trim())
    .filter((descriptor) => descriptor.length > 0 && !isBareGenericDescriptor(descriptor));
}
