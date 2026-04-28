import type { BrainAnalysisOrigin, BrainEvidenceItem, SafeCreativeRules } from "./brain-creative-memory-types";
import { getBrainSignalPriority, isReliableBrainSignal, mergeBrainSignalsWithPriority } from "./brain-merge-signals";
import { mergeStringListsOrdered } from "./brain-merge-strategy-priority";

export type SafeCreativeRulesMergeSourceContext = {
  incomingOrigin?: BrainAnalysisOrigin;
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

function inferExistingRulesOrigin(rules: SafeCreativeRules | null | undefined): BrainAnalysisOrigin {
  if (!rules) return "mock";
  if (rules.evidence?.some((e) => e.sourceType === "manual")) return "manual";
  if (rules.evidence?.some((e) => e.sourceType === "document")) return "remote_ai";
  return "local_heuristic";
}

/** Listas restrictivas: nunca se pierden entradas; solo se acumulan deduplicadas (existing primero). */
function accumulateRestrictive(existing: string[], incoming: string[], max: number): string[] {
  return dedupeStringsOrdered([...(existing ?? []), ...(incoming ?? [])], max);
}

function mergeEvidencePreserve(existing: BrainEvidenceItem[], incoming: BrainEvidenceItem[]): BrainEvidenceItem[] {
  const byId = new Map<string, BrainEvidenceItem>();
  let i = 0;
  for (const e of existing) {
    const id = e.id || `ex-${i++}`;
    byId.set(id, { ...e, id });
  }
  for (const e of incoming) {
    const id = e.id || `inc-${i++}`;
    if (!byId.has(id)) byId.set(id, { ...e, id });
  }
  return [...byId.values()].slice(0, 56);
}

function filterCanUseAgainstDoNotGenerate(canUse: string[], doNot: string[]): string[] {
  return canUse.filter((c) => {
    const lc = c.trim().toLowerCase();
    if (!lc) return false;
    return !doNot.some((rule) => {
      const r = rule.trim().toLowerCase();
      if (r.length < 4) return false;
      const tokens = r.split(/\s+/).filter((t) => t.length >= 4);
      return tokens.some((t) => lc.includes(t));
    });
  });
}

/**
 * Fusiona reglas seguras: acumula restricciones, no las relaja con señal débil, y prioriza texto fuerte en políticas.
 */
export function mergeSafeCreativeRulesWithPriority(input: {
  existingSafeCreativeRules?: SafeCreativeRules | null;
  incomingSafeCreativeRules: SafeCreativeRules;
  sourceContext: SafeCreativeRulesMergeSourceContext;
}): SafeCreativeRules {
  const { incomingSafeCreativeRules, sourceContext } = input;
  const existing = input.existingSafeCreativeRules ?? undefined;
  const incomingOrigin = sourceContext.incomingOrigin ?? "remote_ai";
  const existingOrigin = sourceContext.existingOrigin ?? inferExistingRulesOrigin(existing);
  const incomingWeak = !isReliableBrainSignal(incomingOrigin, 0.88);

  const visualAbstractionRules = accumulateRestrictive(
    existing?.visualAbstractionRules ?? [],
    incomingSafeCreativeRules.visualAbstractionRules ?? [],
    24,
  );
  const imageGenerationAvoid = accumulateRestrictive(
    existing?.imageGenerationAvoid ?? [],
    incomingSafeCreativeRules.imageGenerationAvoid ?? [],
    36,
  );
  const writingClaimRules = accumulateRestrictive(
    existing?.writingClaimRules ?? [],
    incomingSafeCreativeRules.writingClaimRules ?? [],
    28,
  );
  const brandSafetyRules = accumulateRestrictive(
    existing?.brandSafetyRules ?? [],
    incomingSafeCreativeRules.brandSafetyRules ?? [],
    24,
  );
  const legalOrComplianceWarnings = accumulateRestrictive(
    existing?.legalOrComplianceWarnings ?? [],
    incomingSafeCreativeRules.legalOrComplianceWarnings ?? [],
    24,
  );
  const shouldAvoid = accumulateRestrictive(
    existing?.shouldAvoid ?? [],
    incomingSafeCreativeRules.shouldAvoid ?? [],
    36,
  );
  const doNotGenerate = accumulateRestrictive(
    existing?.doNotGenerate ?? [],
    incomingSafeCreativeRules.doNotGenerate ?? [],
    36,
  );

  const exPol = (existing?.protectedReferencePolicy ?? "").trim();
  const incPol = (incomingSafeCreativeRules.protectedReferencePolicy ?? "").trim();
  let protectedReferencePolicy: string | undefined;
  if (incomingWeak && exPol.length >= 28) {
    protectedReferencePolicy = exPol;
  } else if (!incPol) {
    protectedReferencePolicy = exPol || undefined;
  } else if (!exPol) {
    protectedReferencePolicy = incPol;
  } else {
    protectedReferencePolicy = mergeBrainSignalsWithPriority(
      exPol,
      incPol,
      getBrainSignalPriority(existingOrigin),
      getBrainSignalPriority(incomingOrigin),
    );
  }
  if (incomingWeak && incomingOrigin === "mock" && exPol.length >= 20) {
    protectedReferencePolicy = exPol;
  }

  const mergedCanUseRaw = mergeStringListsOrdered(existing?.canUse ?? [], incomingSafeCreativeRules.canUse ?? [], 32);
  const canUse = filterCanUseAgainstDoNotGenerate(mergedCanUseRaw, doNotGenerate);

  return {
    schemaVersion: incomingSafeCreativeRules.schemaVersion ?? existing?.schemaVersion ?? "1.0.0",
    visualAbstractionRules,
    imageGenerationAvoid,
    protectedReferencePolicy,
    writingClaimRules,
    brandSafetyRules,
    legalOrComplianceWarnings,
    canUse,
    shouldAvoid,
    doNotGenerate,
    evidence: mergeEvidencePreserve(existing?.evidence ?? [], incomingSafeCreativeRules.evidence ?? []),
    updatedAt: new Date().toISOString(),
  };
}
