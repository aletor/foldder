import type { BrainFactEvidence, BrainFunnelMessage, BrainMessageBlueprint, BrainVoiceExample } from "@/app/spaces/project-assets-metadata";
import type { BrainAnalysisOrigin } from "./brain-creative-memory-types";
import { isReliableBrainSignal } from "./brain-merge-signals";

function strengthRank(s: BrainFactEvidence["strength"]): number {
  if (s === "fuerte") return 3;
  if (s === "media") return 2;
  return 1;
}

/**
 * Hechos: no sustituir verificados por inferidos débiles; preferir evidencia más fuerte.
 * No elimina claims previos por omisión del autofill (el autofill es subconjunto típico).
 */
export function mergeFactsAndEvidenceWithPriority(
  previous: BrainFactEvidence[],
  autofill: BrainFactEvidence[],
): BrainFactEvidence[] {
  const byKey = new Map<string, BrainFactEvidence>();
  for (const f of previous) {
    const k = f.claim.trim().toLowerCase();
    if (k) byKey.set(k, f);
  }
  for (const f of autofill) {
    const k = f.claim.trim().toLowerCase();
    if (!k) continue;
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, f);
      continue;
    }
    if (existing.verified && !f.verified) continue;
    if (!existing.verified && f.verified) {
      byKey.set(k, f);
      continue;
    }
    if (strengthRank(f.strength) > strengthRank(existing.strength)) {
      byKey.set(k, f);
      continue;
    }
    if (strengthRank(f.strength) === strengthRank(existing.strength) && f.evidence.length > existing.evidence.length) {
      byKey.set(k, f);
    }
  }
  return [...byKey.values()].slice(0, 80);
}

/** Listas de texto: prioriza entradas previas (manual / consolidado) y completa con autofill. */
export function mergeStringListsPreferPrevious(autofill: string[], previous: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of [previous, autofill]) {
    for (const raw of list) {
      const v = raw.trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Igual que `mergeStringListsPreferPrevious(autofill, previous, limit)` — la lista del proyecto va primero. */
export function mergeStringListsOrdered(previous: string[], autofill: string[], limit: number): string[] {
  return mergeStringListsPreferPrevious(autofill, previous, limit);
}

export function mergeVoiceExamplesPreferPrevious(autofill: BrainVoiceExample[], previous: BrainVoiceExample[]): BrainVoiceExample[] {
  const voiceByKey = new Map<string, BrainVoiceExample>();
  for (const item of [...previous, ...autofill]) {
    const key = `${item.kind}:${item.text.trim().toLowerCase()}`;
    if (!item.text.trim() || voiceByKey.has(key)) continue;
    voiceByKey.set(key, item);
  }
  return [...voiceByKey.values()].slice(0, 24);
}

export function mergeFunnelMessagesPreferPrevious(autofill: BrainFunnelMessage[], previous: BrainFunnelMessage[]): BrainFunnelMessage[] {
  const msgByKey = new Map<string, BrainFunnelMessage>();
  for (const item of [...previous, ...autofill]) {
    const key = `${item.stage}:${item.text.trim().toLowerCase()}`;
    if (!item.text.trim() || msgByKey.has(key)) continue;
    msgByKey.set(key, item);
  }
  return [...msgByKey.values()].slice(0, 20);
}

export function mergeBlueprintsPreferPrevious(
  autofill: BrainMessageBlueprint[],
  previous: BrainMessageBlueprint[],
): BrainMessageBlueprint[] {
  const blueprintByKey = new Map<string, BrainMessageBlueprint>();
  for (const item of [...previous, ...autofill]) {
    const key = `${item.claim.trim().toLowerCase()}|${item.channel.trim().toLowerCase()}|${item.stage}`;
    if (!item.claim.trim() || blueprintByKey.has(key)) continue;
    blueprintByKey.set(key, item);
  }
  return [...blueprintByKey.values()].slice(0, 40);
}

/**
 * Si el autofill viene de señal poco fiable (mock), no debe vaciar ni sustituir listas fuertes del usuario.
 */
export function shouldTreatAutofillAsWeak(autofillOrigin?: BrainAnalysisOrigin): boolean {
  return !isReliableBrainSignal(autofillOrigin ?? "remote_ai", 0.9);
}
