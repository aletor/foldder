import type { Candidate, LogoValue } from "./genoma-types";
import { bboxIoU, logoSourceBboxToTuple } from "./genoma-bbox-iou";

const DEFAULT_IOU_THRESHOLD = 0.45;

function candidateBboxTuple(candidate: Candidate<LogoValue>): [number, number, number, number] | null {
  return logoSourceBboxToTuple(candidate.value.sourceBbox);
}

function candidateDedupeKey(candidate: Candidate<LogoValue>): string {
  const page = candidate.value.sourcePageNumber ?? 0;
  const sha = candidate.value.sourcePdfSha256 ?? "";
  const bbox = candidateBboxTuple(candidate);
  if (bbox && sha) {
    return `${sha}:${page}:${bbox.map((v) => v.toFixed(3)).join(",")}`;
  }
  const url = candidate.value.previewUrl ?? candidate.value.assetId;
  return url || `${candidate.score}:${candidate.provenance.detail}`;
}

function mergeRankSignals(a?: string[], b?: string[]): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])].slice(0, 6);
}

function pickPreferredCandidate(
  a: Candidate<LogoValue>,
  b: Candidate<LogoValue>,
): Candidate<LogoValue> {
  const methodRank: Record<string, number> = {
    adjusted: 5,
    vision_bbox: 4,
    upload: 3,
    heuristic: 2,
    web: 1,
  };
  const rankA = methodRank[a.value.detectionMethod ?? ""] ?? 0;
  const rankB = methodRank[b.value.detectionMethod ?? ""] ?? 0;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (rankA !== rankB) return rankA > rankB ? a : b;
  return a;
}

/**
 * Fusiona candidatos de distintos backends (logo-intake, page-vision, heurística)
 * deduplicando por IoU en la misma página y reforzando score cuando coinciden.
 */
export function mergeLogoCandidatesByIoU(
  candidates: Candidate<LogoValue>[],
  iouThreshold = DEFAULT_IOU_THRESHOLD,
): Candidate<LogoValue>[] {
  if (!candidates.length) return [];

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const merged: Candidate<LogoValue>[] = [];

  for (const candidate of sorted) {
    const bbox = candidateBboxTuple(candidate);
    const page = candidate.value.sourcePageNumber ?? 0;
    const sha = candidate.value.sourcePdfSha256 ?? "";

    let absorbed = false;
    for (let index = 0; index < merged.length; index += 1) {
      const existing = merged[index]!;
      const existingBbox = candidateBboxTuple(existing);
      const samePage = (existing.value.sourcePageNumber ?? 0) === page;
      const sameDoc = (existing.value.sourcePdfSha256 ?? "") === sha;

      const urlMatch =
        candidateDedupeKey(candidate) === candidateDedupeKey(existing) &&
        !bbox &&
        !existingBbox;

      const bboxMatch =
        bbox &&
        existingBbox &&
        samePage &&
        sameDoc &&
        bboxIoU(bbox, existingBbox) >= iouThreshold;

      if (!urlMatch && !bboxMatch) continue;

      const preferred = pickPreferredCandidate(existing, candidate);
      const other = preferred === existing ? candidate : existing;
      merged[index] = {
        ...preferred,
        score: Math.min(0.99, preferred.score + 0.04),
        rankSignals: mergeRankSignals(preferred.rankSignals, [
          ...(other.rankSignals ?? []),
          "varios métodos coinciden",
        ]),
      };
      absorbed = true;
      break;
    }

    if (!absorbed) merged.push(candidate);
  }

  return merged.sort((a, b) => b.score - a.score);
}
