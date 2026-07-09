import type {
  Candidate,
  LogoVariantKind,
  LogoValue,
  Provenance,
  SlotState,
  SourceRef,
} from "./genoma-types";
import { genomaLocaleEs } from "./genoma-locale.es";
import { consolidateLogoCandidates, rankLogoCandidatesMultiSource } from "./genoma-visual-rank";

const MIN_LOGO_SCORE = 0.26;
const CLEAR_LEAD_DELTA = 0.12;
const MAX_LOGO_PICKER = 3;
const MAX_LOGO_DISPLAY = 4;

const LOGO_KIND_SIGNAL_PREFIX = "variante:";

const STRONG_PROVENANCE_TYPES = new Set<Provenance["type"]>([
  "jsonld",
  "manifest",
  "file_upload",
  "pdf_vector_fill",
]);

const EXPLICIT_LOGO_NAME = /logo|logotipo|wordmark|marca|brand|isotipo|imagotipo|symbol/i;

export type LogoVisionLabel = {
  index: number;
  isLikelyLogo: boolean;
  kind?: string;
  background?: string;
};

export function isExplicitPdfLogoAsset(name: string): boolean {
  return EXPLICIT_LOGO_NAME.test(name);
}

export function isStrongLogoProvenance(provenance: Provenance): boolean {
  if (STRONG_PROVENANCE_TYPES.has(provenance.type)) {
    if (provenance.type === "file_upload") return true;
    if (provenance.type === "pdf_vector_fill") return true;
    return true;
  }
  if (provenance.type === "pdf_xobject") {
    return isExplicitPdfLogoAsset(provenance.detail);
  }
  return false;
}

function normalizeLogoKind(kind?: string): LogoVariantKind | undefined {
  if (!kind) return undefined;
  const normalized = kind.toLowerCase().trim();
  if (normalized === "principal") return "principal";
  if (normalized === "mono" || normalized === "monocromo") return "mono";
  if (normalized === "negativo") return "negativo";
  if (normalized === "icono" || normalized === "icon" || normalized === "favicon") return "icono";
  return undefined;
}

export function logoKindFromCandidate(candidate: Candidate<LogoValue>): LogoVariantKind | undefined {
  const signal = candidate.rankSignals?.find((row) => row.startsWith(LOGO_KIND_SIGNAL_PREFIX));
  if (!signal) return undefined;
  return normalizeLogoKind(signal.slice(LOGO_KIND_SIGNAL_PREFIX.length));
}

function withLogoKindSignal(candidate: Candidate<LogoValue>, kind?: LogoVariantKind): Candidate<LogoValue> {
  if (!kind) return candidate;
  const withoutKind = (candidate.rankSignals ?? []).filter((row) => !row.startsWith(LOGO_KIND_SIGNAL_PREFIX));
  return {
    ...candidate,
    rankSignals: [...withoutKind, `${LOGO_KIND_SIGNAL_PREFIX}${kind}`],
  };
}

export function applyLogoVisionLabels(
  candidates: Candidate<LogoValue>[],
  labels: LogoVisionLabel[],
): Candidate<LogoValue>[] {
  if (!labels.length) return candidates;

  return candidates
    .map((candidate, index) => {
      const label = labels.find((row) => row.index === index);
      if (!label) return candidate;

      let next = candidate;
      if (!label.isLikelyLogo) {
        next = { ...next, score: Math.min(next.score, 0.22) };
      }

      const kind = normalizeLogoKind(label.kind);
      if (kind) next = withLogoKindSignal(next, kind);

      if (label.background === "transparent" || label.background === "solid") {
        next = {
          ...next,
          value: { ...next.value, background: label.background },
        };
      }

      return next;
    })
    .filter((candidate) => candidate.score >= MIN_LOGO_SCORE - 0.01)
    .sort((a, b) => b.score - a.score);
}

export function prepareLogoCandidates(candidates: Candidate<LogoValue>[]): Candidate<LogoValue>[] {
  const filtered = candidates.filter((candidate) => candidate.score >= MIN_LOGO_SCORE);
  if (!filtered.length) return [];

  const consolidated = consolidateLogoCandidates(filtered);
  return consolidated
    .map(({ candidate, repetition }) => {
      if (repetition <= 1) return candidate;
      return {
        ...candidate,
        score: Math.min(0.99, candidate.score + Math.min(0.1, (repetition - 1) * 0.03)),
        rankSignals: [
          ...(candidate.rankSignals ?? []),
          `repetido ${repetition}×`,
        ],
      };
    })
    .sort((a, b) => b.score - a.score);
}

function attachVariant(
  principal: Candidate<LogoValue>,
  variant: Candidate<LogoValue>,
  kind: LogoVariantKind,
): Candidate<LogoValue> {
  const assetId = variant.value.assetId;
  const previewUrl = variant.value.previewUrl ?? variant.value.assetId;
  const existing = principal.value.variants ?? [];
  if (existing.some((row) => row.assetId === assetId)) return principal;

  return {
    ...principal,
    value: {
      ...principal.value,
      variants: [...existing, { kind, assetId, previewUrl }],
    },
  };
}

export function groupLogoCandidatesForDisplay(candidates: Candidate<LogoValue>[]): Candidate<LogoValue>[] {
  const prepared = prepareLogoCandidates(candidates);
  if (!prepared.length) return [];

  const principals: Candidate<LogoValue>[] = [];
  const variants: { candidate: Candidate<LogoValue>; kind: LogoVariantKind }[] = [];

  for (const candidate of prepared) {
    const kind = logoKindFromCandidate(candidate) ?? "principal";
    if (kind === "icono" && candidate.score < 0.72) {
      variants.push({ candidate, kind });
      continue;
    }
    if (kind !== "principal" && kind !== "mono" && kind !== "negativo") {
      variants.push({ candidate, kind });
      continue;
    }
    principals.push(withLogoKindSignal(candidate, kind));
  }

  if (!principals.length && variants.length) {
    const [first, ...rest] = variants;
    let principal = withLogoKindSignal(first.candidate, first.kind);
    for (const row of rest) {
      principal = attachVariant(principal, row.candidate, row.kind);
    }
    return [principal];
  }

  let primary = principals[0];
  if (!primary) return prepared.slice(0, MAX_LOGO_DISPLAY);

  for (const row of variants) {
    primary = attachVariant(primary, row.candidate, row.kind);
  }

  const display = [primary, ...principals.slice(1)];
  return display.slice(0, MAX_LOGO_DISPLAY);
}

export function hasClearLogoLead(candidates: Candidate<LogoValue>[]): boolean {
  if (!candidates.length) return false;
  const [top, second] = candidates;
  if (!second) return true;
  return top.score - second.score >= CLEAR_LEAD_DELTA;
}

export function shouldAutoResolveLogo(candidates: Candidate<LogoValue>[]): {
  auto: boolean;
  top?: Candidate<LogoValue>;
} {
  const display = groupLogoCandidatesForDisplay(candidates);
  if (!display.length) return { auto: false };
  const top = display[0];
  if (isStrongLogoProvenance(top.provenance) && hasClearLogoLead(display)) {
    return { auto: true, top };
  }
  return { auto: false, top };
}

export function decideFirstSourceLogoPatch(
  candidates: Candidate<LogoValue>[],
): Partial<SlotState<LogoValue>> {
  const display = groupLogoCandidatesForDisplay(candidates);
  if (!display.length) {
    return { status: "needs_user", confidence: 0, candidates: [] };
  }

  const [top] = display;
  const alternates = display.slice(1, MAX_LOGO_PICKER);

  if (isStrongLogoProvenance(top.provenance) && hasClearLogoLead(display)) {
    return {
      status: "resolved",
      value: top.value,
      provenance: top.provenance,
      confidence: top.score,
      candidates: alternates,
    };
  }

  if (hasClearLogoLead(display) && top.score >= 0.75) {
    return {
      status: "resolved",
      value: top.value,
      provenance: top.provenance,
      confidence: top.score,
      candidates: alternates,
      needsReviewReason: genomaLocaleEs.logoReviewSuggested,
    };
  }

  if (display.length >= 2 && !hasClearLogoLead(display)) {
    return {
      status: "candidates",
      candidates: display.slice(0, MAX_LOGO_PICKER),
      confidence: top.score,
    };
  }

  if (display.length === 1) {
    return {
      status: "resolved",
      value: top.value,
      provenance: top.provenance,
      confidence: top.score,
      candidates: [],
      needsReviewReason: genomaLocaleEs.logoReviewSuggested,
    };
  }

  return {
    status: "candidates",
    candidates: display.slice(0, MAX_LOGO_PICKER),
    confidence: top.score,
  };
}

export function buildLogoSlotPatch(candidates: Candidate<LogoValue>[]): Partial<SlotState<LogoValue>> {
  return decideFirstSourceLogoPatch(candidates);
}

export function finalizeLogoCandidateSlot(
  slot: SlotState<unknown>,
  sources: SourceRef[] = [],
): SlotState<unknown> {
  const multiSource = sources.length > 1;
  let candidates = rankLogoCandidatesMultiSource(
    (slot.candidates ?? []) as Candidate<LogoValue>[],
    sources,
  );
  candidates = groupLogoCandidatesForDisplay(candidates);

  if (slot.status === "candidates" || (multiSource && candidates.length >= 2 && !hasClearLogoLead(candidates))) {
    return {
      ...slot,
      status: "candidates",
      value: undefined,
      candidates: candidates.slice(0, MAX_LOGO_DISPLAY),
      confidence: Math.max(slot.confidence, candidates[0]?.score ?? 0),
    };
  }

  if (slot.status === "resolved" && slot.value) {
    const resolved = slot.value as LogoValue;
    const alternates = candidates.filter((candidate) => candidate.value.assetId !== resolved.assetId).slice(0, 2);
    return {
      ...slot,
      candidates: alternates,
      confidence: Math.max(slot.confidence, candidates[0]?.score ?? 0),
    };
  }

  return {
    ...slot,
    candidates: candidates.slice(0, MAX_LOGO_DISPLAY),
    confidence: Math.max(slot.confidence, candidates[0]?.score ?? 0),
  };
}

export function resolvedLogoPreviewUrl(patch: Partial<SlotState<LogoValue>>): string | undefined {
  const value = patch.value;
  if (!value) return undefined;
  return value.previewUrl ?? value.assetId;
}
