import type { CopyUnit } from "./crawl/copy-units";
import type { BrandKitEvidence } from "./brand-kit-evidence";

export type EvidenceCandidate = {
  id: string;
  quote: string;
  role: CopyUnit["role"];
  sourceUrl?: string;
  weight: number;
};

function idForIndex(index: number): string {
  return `ev_${String(index + 1).padStart(2, "0")}`;
}

/** Selecciona 10–20 evidencias reales del corpus para grounding por ID (sin copia literal por el LLM). */
export function selectEvidenceCandidates(units: CopyUnit[], max = 20, min = 10): EvidenceCandidate[] {
  const sorted = [...units]
    .filter((unit) => unit.text.trim().length >= 12)
    .sort((a, b) => b.weight - a.weight || b.text.length - a.text.length);

  const picked: EvidenceCandidate[] = [];
  const seen = new Set<string>();

  for (const unit of sorted) {
    const key = unit.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({
      id: idForIndex(picked.length),
      quote: unit.text.trim(),
      role: unit.role,
      sourceUrl: unit.sourceUrl,
      weight: unit.weight,
    });
    if (picked.length >= max) break;
  }

  return picked.length >= min ? picked : picked;
}

export function formatEvidenceCandidatesForLlm(candidates: EvidenceCandidate[]): string {
  return candidates
    .map(
      (candidate) =>
        `${candidate.id} [${candidate.role} w=${candidate.weight}] "${candidate.quote}"${
          candidate.sourceUrl ? ` (${candidate.sourceUrl})` : ""
        }`,
    )
    .join("\n");
}

export function resolveEvidenceIds(
  ids: string[] | undefined,
  candidates: EvidenceCandidate[],
): BrandKitEvidence[] {
  if (!ids?.length || !candidates.length) return [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const resolved: BrandKitEvidence[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const candidate = byId.get(id);
    if (!candidate) continue;
    const key = candidate.quote.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({ quote: candidate.quote, sourceUrl: candidate.sourceUrl });
  }

  return resolved;
}

export function evidenceCandidatesFromQuotes(
  quotes: BrandKitEvidence[],
  candidates: EvidenceCandidate[],
): string[] {
  const ids: string[] = [];
  for (const item of quotes) {
    const match = candidates.find((candidate) => candidate.quote === item.quote);
    if (match) ids.push(match.id);
  }
  return ids;
}
