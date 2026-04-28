import type { BrainAnalysisOrigin, BrainEvidenceItem, ContentDna } from "./brain-creative-memory-types";
import { getBrainSignalPriority, isReliableBrainSignal, mergeBrainSignalsWithPriority } from "./brain-merge-signals";

/** Contexto de procedencia para fusionar capas editoriales sin perder señal fuerte. */
export type ContentDnaMergeSourceContext = {
  /** Origen típico del `incomingContentDna` (p. ej. pipeline analyze). */
  incomingOrigin?: BrainAnalysisOrigin;
  /** Si se omite, se infiere desde `existingContentDna` (evidence + confidence). */
  existingOrigin?: BrainAnalysisOrigin;
};

function dedupeStringsOrdered(items: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const v = raw.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function mergeStringListsWithStrength(
  existing: string[],
  incoming: string[],
  existingStrong: boolean,
  incomingWeak: boolean,
  max: number,
  incomingOrigin: BrainAnalysisOrigin,
): string[] {
  const ex = existing.map((s) => s.trim()).filter(Boolean);
  const inc = incoming.map((s) => s.trim()).filter(Boolean);
  if (incomingWeak && existingStrong && incomingOrigin === "mock") {
    return dedupeStringsOrdered(ex, max);
  }
  if (incomingWeak && existingStrong) {
    const seen = new Set(ex.map((s) => s.toLowerCase()));
    return dedupeStringsOrdered([...ex, ...inc.filter((s) => !seen.has(s.toLowerCase()))], max);
  }
  if (!incomingWeak && existingStrong) {
    const seen = new Set(ex.map((s) => s.toLowerCase()));
    return dedupeStringsOrdered([...ex, ...inc.filter((s) => !seen.has(s.toLowerCase()))], max);
  }
  const seen = new Set(inc.map((s) => s.toLowerCase()));
  return dedupeStringsOrdered([...inc, ...ex.filter((s) => !seen.has(s.toLowerCase()))], max);
}

function inferExistingContentDnaOrigin(cd: ContentDna | null | undefined): BrainAnalysisOrigin {
  if (!cd) return "mock";
  if (cd.evidence?.some((e) => e.sourceType === "manual")) return "manual";
  if (cd.confidence >= 0.68 && cd.evidence?.some((e) => e.sourceType === "document")) return "remote_ai";
  if (cd.confidence >= 0.52) return "local_heuristic";
  return "fallback";
}

function mergeEvidencePreserve(existing: BrainEvidenceItem[], incoming: BrainEvidenceItem[]): BrainEvidenceItem[] {
  const byId = new Map<string, BrainEvidenceItem>();
  let seq = 0;
  for (const e of existing) {
    const id = e.id?.trim() || `ex-${seq++}`;
    byId.set(id, { ...e, id });
  }
  for (const e of incoming) {
    const id = e.id?.trim() || `inc-${seq++}`;
    if (!byId.has(id)) byId.set(id, { ...e, id });
  }
  return [...byId.values()].slice(0, 48);
}

function blendContentDnaConfidence(
  existingConf: number,
  incomingConf: number,
  incomingWeak: boolean,
  hadIncomingContribution: boolean,
): number {
  const a = Number.isFinite(existingConf) ? existingConf : 0;
  const b = Number.isFinite(incomingConf) ? incomingConf : 0;
  if (!hadIncomingContribution) return Math.min(0.92, Math.max(a, 0.2));
  if (incomingWeak) return Math.min(0.92, Math.max(a, Math.min(a + 0.03, b * 0.85 + a * 0.15)));
  return Math.min(0.92, Math.max(a * 0.5 + b * 0.5, Math.max(a, b) * 0.96));
}

function mergeAudienceProfiles(
  existing: unknown[] | undefined,
  incoming: unknown[] | undefined,
  preserveExistingOnly: boolean,
): unknown[] {
  if (preserveExistingOnly && (existing?.length ?? 0) > 0) return [...(existing ?? [])].slice(0, 12);
  const out: unknown[] = [...(existing ?? [])];
  const keys = new Set(out.map((p) => JSON.stringify(p)));
  for (const p of incoming ?? []) {
    const k = JSON.stringify(p);
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(p);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Fusiona Content DNA conservando manual / remoto fiable frente a mock o fallback débil.
 */
export function mergeContentDnaWithPriority(input: {
  existingContentDna?: ContentDna | null;
  incomingContentDna: ContentDna;
  sourceContext: ContentDnaMergeSourceContext;
}): ContentDna {
  const { incomingContentDna, sourceContext } = input;
  const existing = input.existingContentDna ?? undefined;
  const incomingOrigin = sourceContext.incomingOrigin ?? "remote_ai";
  const existingOrigin = sourceContext.existingOrigin ?? inferExistingContentDnaOrigin(existing);
  const incomingWeak = !isReliableBrainSignal(incomingOrigin, incomingContentDna.confidence);
  const existingStrong = isReliableBrainSignal(existingOrigin, existing?.confidence);

  const preserveAudiences = incomingWeak && existingStrong && (existing?.audienceProfiles?.length ?? 0) > 0;

  const narrativeAngles = mergeStringListsWithStrength(
    existing?.narrativeAngles ?? [],
    incomingContentDna.narrativeAngles ?? [],
    existingStrong,
    incomingWeak,
    24,
    incomingOrigin,
  );

  const forbiddenClaims = dedupeStringsOrdered(
    [...(existing?.forbiddenClaims ?? []), ...(incomingContentDna.forbiddenClaims ?? [])],
    48,
  );

  const approvedClaims = mergeStringListsWithStrength(
    existing?.approvedClaims ?? [],
    incomingContentDna.approvedClaims ?? [],
    existingStrong,
    incomingWeak,
    36,
    incomingOrigin,
  );

  const hadIncomingLists =
    (incomingContentDna.contentPillars?.length ?? 0) > 0 ||
    (incomingContentDna.topics?.length ?? 0) > 0 ||
    (incomingContentDna.approvedClaims?.length ?? 0) > 0;

  const confidence = blendContentDnaConfidence(
    existing?.confidence ?? 0,
    incomingContentDna.confidence,
    incomingWeak,
    hadIncomingLists || (incomingContentDna.evidence?.length ?? 0) > 0,
  );

  const evidence = mergeEvidencePreserve(existing?.evidence ?? [], incomingContentDna.evidence ?? []);

  const ctaExisting = (existing?.ctaStyle ?? "").trim();
  const ctaIncoming = (incomingContentDna.ctaStyle ?? "").trim();
  const ctaStyle =
    ctaIncoming && (!ctaExisting || !incomingWeak || !existingStrong)
      ? mergeBrainSignalsWithPriority(
          ctaExisting,
          ctaIncoming,
          getBrainSignalPriority(existingOrigin),
          getBrainSignalPriority(incomingOrigin),
        )
      : ctaExisting || ctaIncoming || undefined;

  const rlExisting = (existing?.readingLevel ?? "").trim();
  const rlIncoming = (incomingContentDna.readingLevel ?? "").trim();
  const readingLevel =
    rlIncoming && (!rlExisting || !incomingWeak || !existingStrong)
      ? mergeBrainSignalsWithPriority(
          rlExisting,
          rlIncoming,
          getBrainSignalPriority(existingOrigin),
          getBrainSignalPriority(incomingOrigin),
        )
      : rlExisting || rlIncoming || undefined;

  const brandVoice =
    incomingWeak && existingStrong ? (existing?.brandVoice ?? incomingContentDna.brandVoice) : incomingContentDna.brandVoice ?? existing?.brandVoice;
  const editorialTone =
    incomingWeak && existingStrong
      ? (existing?.editorialTone ?? incomingContentDna.editorialTone)
      : incomingContentDna.editorialTone ?? existing?.editorialTone;

  return {
    schemaVersion: incomingContentDna.schemaVersion ?? existing?.schemaVersion ?? "1.1.0",
    brandVoice,
    editorialTone,
    audienceProfiles: mergeAudienceProfiles(
      existing?.audienceProfiles,
      incomingContentDna.audienceProfiles,
      preserveAudiences,
    ),
    contentPillars: mergeStringListsWithStrength(
      existing?.contentPillars ?? [],
      incomingContentDna.contentPillars ?? [],
      existingStrong,
      incomingWeak,
      20,
      incomingOrigin,
    ),
    topics: mergeStringListsWithStrength(
      existing?.topics ?? [],
      incomingContentDna.topics ?? [],
      existingStrong,
      incomingWeak,
      28,
      incomingOrigin,
    ),
    trendOpportunities: mergeStringListsWithStrength(
      existing?.trendOpportunities ?? [],
      incomingContentDna.trendOpportunities ?? [],
      existingStrong,
      incomingWeak,
      20,
      incomingOrigin,
    ),
    preferredFormats: mergeStringListsWithStrength(
      existing?.preferredFormats ?? [],
      incomingContentDna.preferredFormats ?? [],
      existingStrong,
      incomingWeak,
      16,
      incomingOrigin,
    ),
    articleStructures: mergeStringListsWithStrength(
      existing?.articleStructures ?? [],
      incomingContentDna.articleStructures ?? [],
      existingStrong,
      incomingWeak,
      16,
      incomingOrigin,
    ),
    forbiddenClaims,
    approvedClaims,
    writingDo: mergeStringListsWithStrength(
      existing?.writingDo ?? [],
      incomingContentDna.writingDo ?? [],
      existingStrong,
      incomingWeak,
      20,
      incomingOrigin,
    ),
    writingAvoid: mergeStringListsWithStrength(
      existing?.writingAvoid ?? [],
      incomingContentDna.writingAvoid ?? [],
      existingStrong,
      incomingWeak,
      20,
      incomingOrigin,
    ),
    narrativeAngles,
    ctaStyle,
    readingLevel,
    evidence,
    confidence,
    updatedAt: new Date().toISOString(),
  };
}

/** Heurística: si algún documento del lote es mock/fallback, el autofill editorial se trata como señal débil. */
export function inferWeakestContentSignalOrigin(
  docs: Array<{ analysisOrigin?: BrainAnalysisOrigin }>,
): BrainAnalysisOrigin {
  const origins = docs.map((d) => d.analysisOrigin).filter((x): x is BrainAnalysisOrigin => Boolean(x));
  const set = new Set(origins);
  if (set.has("mock")) return "mock";
  if (set.has("fallback")) return "fallback";
  if (set.has("local_heuristic")) return "local_heuristic";
  if (set.has("manual")) return "manual";
  return "remote_ai";
}
