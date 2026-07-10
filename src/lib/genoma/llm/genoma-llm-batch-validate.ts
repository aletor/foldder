import { z } from "zod";
import { corpusContainsQuote } from "../crawl/copy-corpus";
import type { EssenceValue, VisualWorldValue, VoiceValue } from "../genoma-types";
import {
  type EvidenceCandidate,
  resolveEvidenceIds,
} from "../genoma-evidence-candidates";
import {
  looksLikeLiteralCorpusQuote,
  normalizeQuoteText,
  penalizeBareGenericDescriptors,
} from "../genoma-evidence";

const EvidenceSchema = z.object({
  quote: z.string().min(1),
  sourceUrl: z.string().optional(),
});

export const EssenceBatchSchema = z.object({
  summary: z.string().min(24),
  headline: z.string().optional(),
  beliefs: z
    .array(
      z.object({
        label: z.string().min(1),
        explanation: z.string().optional(),
        evidence: z.string().optional(),
        evidenceIds: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(6),
  purpose: z.string().optional(),
  promise: z.string().optional(),
  pov: z.string().optional(),
  brandContext: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(),
  evidence: z.array(EvidenceSchema).max(8).optional(),
});

export const VoiceBatchSchema = z.object({
  summary: z.string().min(24),
  descriptors: z.array(z.string().min(1)).min(2).max(6),
  rules: z.array(z.string().min(8)).min(2).max(6),
  avoid: z.array(z.string().min(1)).max(8).optional(),
  evidenceIds: z.array(z.string()).optional(),
  evidence: z.array(EvidenceSchema).max(5).optional(),
});

export const VisualWorldBatchSchema = z.object({
  summary: z.string().min(24),
  moodTags: z.array(z.string().min(1)).max(8).optional(),
  visualTraits: z.array(z.string().min(1)).min(1).max(10),
  limits: z.array(z.string().min(1)).min(1).max(12),
  evidenceIds: z.array(z.string()).optional(),
  evidence: z.array(EvidenceSchema).max(5).optional(),
  galleryRefs: z.array(z.string().min(1)).max(24).optional(),
});

export const GenomaBatchResponseSchema = z.object({
  essence: EssenceBatchSchema.optional(),
  voice: VoiceBatchSchema.optional(),
  visualWorld: VisualWorldBatchSchema.optional(),
});

export type BatchSlotKey = "essence" | "voice" | "visualWorld";

export type BatchSlotValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function resolveGroundedEvidence(
  evidenceIds: string[] | undefined,
  legacyEvidence: z.infer<typeof EvidenceSchema>[] | undefined,
  corpus: string,
  candidates: EvidenceCandidate[],
): { quote: string; sourceUrl?: string }[] {
  const fromIds = resolveEvidenceIds(evidenceIds, candidates);
  if (fromIds.length) return fromIds;

  return (legacyEvidence ?? [])
    .filter((item) => corpusContainsQuote(corpus, item.quote))
    .map((item) => ({ quote: item.quote.trim(), sourceUrl: item.sourceUrl }));
}

function groundEssence(
  corpus: string,
  raw: z.infer<typeof EssenceBatchSchema>,
  candidates: EvidenceCandidate[],
): EssenceValue | null {
  const summary = normalizeQuoteText(raw.summary);
  if (looksLikeLiteralCorpusQuote(summary, corpus)) return null;

  const beliefs = raw.beliefs
    .map((belief) => {
      let evidence = belief.evidence;
      if (belief.evidenceIds?.length) {
        const resolved = resolveEvidenceIds(belief.evidenceIds, candidates);
        evidence = resolved[0]?.quote ?? evidence;
      }
      if (evidence && !corpusContainsQuote(corpus, evidence)) {
        return { ...belief, evidence: undefined };
      }
      return belief;
    })
    .filter((belief) => belief.label.trim());

  if (!beliefs.length) return null;

  const evidence = resolveGroundedEvidence(raw.evidenceIds, raw.evidence, corpus, candidates);

  return {
    summary,
    headline: raw.headline?.trim(),
    beliefs,
    purpose: raw.purpose?.trim(),
    promise: raw.promise?.trim(),
    pov: raw.pov?.trim(),
    brandContext: raw.brandContext?.trim(),
    evidence,
  };
}

function groundVoice(
  corpus: string,
  raw: z.infer<typeof VoiceBatchSchema>,
  candidates: EvidenceCandidate[],
): VoiceValue | null {
  const summary = normalizeQuoteText(raw.summary);
  if (looksLikeLiteralCorpusQuote(summary, corpus)) return null;

  let descriptors = penalizeBareGenericDescriptors(raw.descriptors.map((item) => item.trim()));
  if (descriptors.length < 2) {
    const fallback = raw.descriptors.map((item) => item.trim()).filter((item) => item.length >= 3);
    if (fallback.length >= 2) descriptors = fallback.slice(0, 5);
  }
  if (descriptors.length < 2) return null;

  const rules = raw.rules.map((item) => item.trim()).filter(Boolean);
  if (rules.length < 2) return null;

  const evidence = resolveGroundedEvidence(raw.evidenceIds, raw.evidence, corpus, candidates);

  return {
    summary,
    descriptors: descriptors.slice(0, 5),
    rules: rules.slice(0, 6),
    avoid: raw.avoid?.map((item) => item.trim()) ?? [],
    evidence: evidence.slice(0, 5),
  };
}

function groundVisualWorld(raw: z.infer<typeof VisualWorldBatchSchema>): VisualWorldValue | null {
  const summary = normalizeQuoteText(raw.summary);
  if (!summary) return null;
  return {
    summary,
    moodTags: raw.moodTags?.map((item) => item.trim()) ?? [],
    visualTraits: raw.visualTraits.map((item) => item.trim()),
    limits: raw.limits.map((item) => item.trim()),
    evidence: (raw.evidence ?? []).map((item) => ({ quote: item.quote.trim(), sourceUrl: item.sourceUrl })),
    galleryRefs: raw.galleryRefs ?? [],
  };
}

export function validateBatchSlotKey(
  key: BatchSlotKey,
  raw: unknown,
  corpus: string,
  evidenceCandidates: EvidenceCandidate[] = [],
): BatchSlotValidation<EssenceValue | VoiceValue | VisualWorldValue> {
  if (key === "essence") {
    const parsed = EssenceBatchSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    const grounded = groundEssence(corpus, parsed.data, evidenceCandidates);
    return grounded ? { ok: true, value: grounded } : { ok: false, error: "essence sin síntesis válida" };
  }
  if (key === "voice") {
    const parsed = VoiceBatchSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    const grounded = groundVoice(corpus, parsed.data, evidenceCandidates);
    return grounded ? { ok: true, value: grounded } : { ok: false, error: "voice sin síntesis válida" };
  }
  const parsed = VisualWorldBatchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const grounded = groundVisualWorld(parsed.data);
  return grounded ? { ok: true, value: grounded } : { ok: false, error: "visualWorld sin síntesis válida" };
}

export function parseBatchResponse(raw: unknown): z.infer<typeof GenomaBatchResponseSchema> | null {
  const parsed = GenomaBatchResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function validateBatchResponse(
  raw: unknown,
  corpus: string,
  evidenceCandidates: EvidenceCandidate[] = [],
): {
  essence: BatchSlotValidation<EssenceValue>;
  voice: BatchSlotValidation<VoiceValue>;
  visualWorld: BatchSlotValidation<VisualWorldValue>;
} {
  const missing = { ok: false as const, error: "clave ausente" };
  if (!raw || typeof raw !== "object") {
    return { essence: missing, voice: missing, visualWorld: missing };
  }
  const envelope = raw as Record<string, unknown>;
  return {
    essence:
      envelope.essence !== undefined
        ? (validateBatchSlotKey("essence", envelope.essence, corpus, evidenceCandidates) as BatchSlotValidation<EssenceValue>)
        : missing,
    voice:
      envelope.voice !== undefined
        ? (validateBatchSlotKey("voice", envelope.voice, corpus, evidenceCandidates) as BatchSlotValidation<VoiceValue>)
        : missing,
    visualWorld:
      envelope.visualWorld !== undefined
        ? (validateBatchSlotKey("visualWorld", envelope.visualWorld, corpus, evidenceCandidates) as BatchSlotValidation<VisualWorldValue>)
        : missing,
  };
}

export function mergeBatchValidation<T extends EssenceValue | VoiceValue | VisualWorldValue>(
  primary: BatchSlotValidation<T>,
  retry: BatchSlotValidation<T>,
): BatchSlotValidation<T> {
  return primary.ok ? primary : retry;
}
