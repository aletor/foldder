import type {
  Candidate,
  GalleryValue,
  LogoValue,
  Provenance,
  ProvenanceType,
  SourceRef,
} from "./genoma-types";
import { genomaLocaleEs } from "./genoma-locale.es";
import { formatReconcileSourceLabel } from "./genoma-reconcile";
import { authoritativeScoreBonus, isAuthoritativeProvenance } from "./genoma-source-policy";

const FORMAT_BONUS: Record<LogoValue["format"], number> = {
  svg: 0.12,
  png: 0.06,
  webp: 0.04,
  jpg: 0.02,
  ico: -0.06,
};

const PROVENANCE_BONUS: Partial<Record<ProvenanceType, number>> = {
  jsonld: 0.1,
  manifest: 0.08,
  header_img: 0.08,
  file_upload: 0.12,
  pdf_xobject: 0.1,
  pdf_vector_fill: 0.08,
  og_meta: 0.04,
  link_icon: -0.05,
};

const CLEAR_LEAD_DELTA = 0.08;

export type HarvestedGalleryItem = GalleryValue["harvested"][number];

function normalizeAssetKey(value?: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return value.split("?")[0]?.toLowerCase() ?? value.toLowerCase();
  }
}

function logoAssetKey(candidate: Candidate<LogoValue>): string {
  return normalizeAssetKey(candidate.value.previewUrl ?? candidate.value.assetId);
}

function provenanceSignals(provenance: Provenance): string[] {
  const signals: string[] = [];
  const source = formatReconcileSourceLabel(provenance);
  if (source) signals.push(source);

  if (provenance.type === "jsonld") signals.push("schema oficial");
  if (provenance.type === "manifest") signals.push("web app manifest");
  if (provenance.type === "header_img") {
    signals.push(/footer/i.test(provenance.detail) ? "pie de página" : "cabecera");
  }
  if (provenance.type === "file_upload") signals.push("manual de marca");
  if (provenance.type === "link_icon") signals.push("favicon");
  if (provenance.type === "pdf_xobject" || provenance.type === "pdf_vector_fill") {
    signals.push("vector en pdf");
  }

  return [...new Set(signals)];
}

function formatBonusSignals(format: LogoValue["format"]): string[] {
  if (format === "svg") return ["svg"];
  if (format === "png") return ["png transparente"];
  if (format === "ico") return ["icono pequeño"];
  return [];
}

function scoreLogoCandidate(
  candidate: Candidate<LogoValue>,
  repetition = 1,
  sources: SourceRef[] = [],
): {
  score: number;
  signals: string[];
} {
  const value = candidate.value;
  let score = candidate.score;
  const signals = [...provenanceSignals(candidate.provenance)];

  score += FORMAT_BONUS[value.format] ?? 0;
  signals.push(...formatBonusSignals(value.format));

  score += PROVENANCE_BONUS[candidate.provenance.type] ?? 0;

  if (isAuthoritativeProvenance(sources, candidate.provenance)) {
    score += authoritativeScoreBonus(sources, candidate.provenance);
    signals.push("fuente autoritativa");
  }

  const width = value.width ?? 0;
  const height = value.height ?? 0;
  if (width >= 120 && height >= 40 && width <= 900 && height <= 900) {
    score += 0.03;
    signals.push("tamaño útil");
  }

  if (repetition > 1) {
    score += Math.min(0.12, (repetition - 1) * 0.04);
    signals.push(`repetido ${repetition}×`);
  }

  return {
    score: Math.min(0.99, score),
    signals: [...new Set(signals)].slice(0, 5),
  };
}

export function consolidateLogoCandidates(
  candidates: Candidate<LogoValue>[],
): { candidate: Candidate<LogoValue>; repetition: number }[] {
  const groups = new Map<string, Candidate<LogoValue>[]>();
  for (const candidate of candidates) {
    const key = logoAssetKey(candidate) || `${candidate.score}:${candidate.provenance.detail}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(candidate);
    groups.set(key, bucket);
  }

  return [...groups.values()].map((group) => ({
    candidate: group.reduce((top, current) => (current.score > top.score ? current : top)),
    repetition: group.length,
  }));
}

export function rankLogoCandidatesMultiSource(
  candidates: Candidate<LogoValue>[],
  sources: SourceRef[] = [],
): Candidate<LogoValue>[] {
  if (!candidates.length) return [];

  const consolidated = consolidateLogoCandidates(candidates);
  const ranked = consolidated
    .map(({ candidate, repetition }) => {
      const { score, signals } = scoreLogoCandidate(candidate, repetition, sources);
      return {
        ...candidate,
        score,
        rankSignals: signals,
      };
    })
    .sort((a, b) => b.score - a.score);

  const [top, second] = ranked;
  if (top && (!second || top.score - second.score >= CLEAR_LEAD_DELTA)) {
    ranked[0] = { ...top, rankLabel: genomaLocaleEs.bestOption };
  }

  return ranked.slice(0, 8);
}

export function rankHarvestedGalleryItems(items: HarvestedGalleryItem[]): HarvestedGalleryItem[] {
  const seen = new Map<string, number>();

  const scored = items.map((item) => {
    const url = item.previewUrl ?? item.assetId;
    const key = normalizeAssetKey(url);
    const repetition = (seen.get(key) ?? 0) + 1;
    seen.set(key, repetition);

    let rankScore = 1;
    const rankSignals: string[] = [];
    const provenance = item.provenance;
    const haystack = `${url} ${provenance?.detail ?? ""}`.toLowerCase();

    if (/hero|banner|cover|portfolio|proyecto|project|photo|foto|film|video|production/i.test(haystack)) {
      rankScore += 1.4;
      rankSignals.push("fotografía de marca");
    }
    if (provenance?.type === "og_meta" || provenance?.type === "header_img") {
      rankScore += 0.5;
      rankSignals.push("imagen principal");
    }
    if (provenance?.type === "file_upload") {
      rankScore += 0.8;
      rankSignals.push("manual de marca");
    }
    if (/texture|textura|lifestyle|mood|ambiente/i.test(haystack)) {
      rankScore += 0.4;
      rankSignals.push("mood visual");
    }
    if (repetition > 1) {
      rankScore += Math.min(0.6, (repetition - 1) * 0.2);
      rankSignals.push(`repetida ${repetition}×`);
    }

    const source = formatReconcileSourceLabel(provenance);
    if (source) rankSignals.unshift(source);

    return {
      ...item,
      rankScore,
      rankSignals: [...new Set(rankSignals)].slice(0, 4),
    };
  });

  return scored.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
}

export function countGalleryRankLeaders(items: HarvestedGalleryItem[]): number {
  if (!items.length) return 0;
  const ranked = rankHarvestedGalleryItems(items);
  const topScore = ranked[0]?.rankScore ?? 0;
  return ranked.filter((item) => (item.rankScore ?? 0) >= topScore - 0.25).length;
}
