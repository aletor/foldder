import type {
  EssenceValue,
  BrandKitDocument,
  BrandKitEvidence,
  Provenance,
  SlotId,
  SlotState,
  SourceRef,
  SupplementalEvidence,
  VisualWorldValue,
  VoiceValue,
} from "./brand-kit-types";
import { formatReconcileSourceLabel } from "./brand-kit-reconcile";
import { isSemanticTextSlot } from "./brand-kit-reconcile";

const MAX_SUPPLEMENTAL = 24;
const MAX_ARCHIVED_CANDIDATES = 12;

export function getAuthoritativeSourceRefs(sources: SourceRef[]): Set<string> {
  return new Set(sources.filter((source) => source.authoritative).map((source) => source.ref));
}

export function setSourceAuthoritative(
  doc: BrandKitDocument,
  sourceRef: string,
  authoritative: boolean,
): BrandKitDocument {
  const sources = doc.sources.map((source) => {
    if (source.ref === sourceRef) {
      return { ...source, authoritative };
    }
    if (authoritative) {
      return { ...source, authoritative: false };
    }
    return source;
  });
  return { ...doc, sources, updatedAt: new Date().toISOString() };
}

export function authoritativeSourceLabel(sources: SourceRef[]): string | undefined {
  const source = sources.find((item) => item.authoritative);
  if (!source) return undefined;
  if (source.kind === "file") return source.ref.split("/").pop() ?? source.ref;
  try {
    return new URL(source.ref).hostname.replace(/^www\./, "");
  } catch {
    return source.ref;
  }
}

export function provenanceMatchesSource(provenance: Provenance | undefined, sourceRef: string): boolean {
  if (!provenance) return false;
  if (provenance.sourceUrl && provenance.sourceUrl === sourceRef) return true;
  if (provenance.fileId && sourceRef.includes(provenance.fileId)) return true;
  return false;
}

export function isAuthoritativeProvenance(sources: SourceRef[], provenance?: Provenance): boolean {
  if (!provenance) return false;
  return sources.some((source) => source.authoritative && provenanceMatchesSource(provenance, source.ref));
}

export function authoritativeScoreBonus(sources: SourceRef[], provenance?: Provenance): number {
  return isAuthoritativeProvenance(sources, provenance) ? 0.12 : 0;
}

export function resolveSourceRefFromProvenance(sources: SourceRef[], provenance?: Provenance): string {
  if (provenance) {
    for (const source of sources) {
      if (provenanceMatchesSource(provenance, source.ref)) return source.ref;
    }
  }
  return sources.at(-1)?.ref ?? "fuente-desconocida";
}

function normalizeQuote(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function mergeSupplementalEvidence(
  current: SupplementalEvidence[] | undefined,
  incoming: SupplementalEvidence[],
): SupplementalEvidence[] {
  const seen = new Set((current ?? []).map((item) => normalizeQuote(item.quote)));
  const merged = [...(current ?? [])];
  for (const item of incoming) {
    const key = normalizeQuote(item.quote);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(-MAX_SUPPLEMENTAL);
}

export function extractSemanticEvidence(slotId: SlotId, value: unknown): BrandKitEvidence[] {
  if (!value || typeof value !== "object") return [];
  if (slotId === "voice") {
    return (value as VoiceValue).evidence ?? [];
  }
  if (slotId === "essence") {
    const essence = value as EssenceValue;
    const quotes = [...(essence.evidence ?? [])];
    for (const belief of essence.beliefs ?? []) {
      if (belief.evidence) quotes.push({ quote: belief.evidence });
    }
    return quotes;
  }
  if (slotId === "visualWorld") {
    return (value as VisualWorldValue).evidence ?? [];
  }
  return [];
}

export function countSupplementalObservations(slots: BrandKitDocument["slots"]): number {
  return Object.values(slots).reduce((total, slot) => {
    const evidenceCount = slot.supplementalEvidence?.length ?? 0;
    const archivedCount = slot.archivedCandidates?.length ?? 0;
    const galleryArchived =
      slot.id === "gallery"
        ? ((slot.value as { archivedHarvest?: unknown[] } | undefined)?.archivedHarvest?.length ?? 0)
        : 0;
    return total + evidenceCount + archivedCount + galleryArchived;
  }, 0);
}

export function applyLockedSlotPolicy(
  slotId: SlotId,
  current: SlotState<unknown>,
  patch: Partial<SlotState<unknown>>,
  sources: SourceRef[],
): SlotState<unknown> {
  const ts = patch.updatedAt ?? new Date().toISOString();
  const provenance = patch.provenance as Provenance | undefined;
  const sourceRef = resolveSourceRefFromProvenance(sources, provenance);
  const sourceLabel = formatReconcileSourceLabel(provenance) ?? authoritativeSourceLabel(sources);

  let supplementalEvidence = current.supplementalEvidence;
  let archivedCandidates = current.archivedCandidates;
  let value = current.value;

  if (isSemanticTextSlot(slotId) && patch.value) {
    const existingQuotes = new Set(
      extractSemanticEvidence(slotId, current.value).map((item) => normalizeQuote(item.quote)),
    );
    const incoming = extractSemanticEvidence(slotId, patch.value)
      .filter((item) => item.quote.trim() && !existingQuotes.has(normalizeQuote(item.quote)))
      .map((item) => ({
        quote: item.quote,
        sourceRef,
        sourceLabel,
        ts,
      }));
    supplementalEvidence = mergeSupplementalEvidence(supplementalEvidence, incoming);
  }

  const candidatePatch = [...(patch.candidates ?? [])];
  if (patch.value && (slotId === "logo" || slotId === "palette" || slotId === "typography")) {
    candidatePatch.push({
      value: patch.value,
      score: typeof patch.confidence === "number" ? patch.confidence : 0.7,
      provenance: provenance ?? { type: "llm_synthesis", detail: "nueva fuente" },
    });
  }

  if (candidatePatch.length) {
    const seen = new Set((archivedCandidates ?? []).map((item) => JSON.stringify(item.value)));
    archivedCandidates = [...(archivedCandidates ?? [])];
    for (const candidate of candidatePatch) {
      const key = JSON.stringify(candidate.value);
      if (seen.has(key)) continue;
      seen.add(key);
      archivedCandidates.push(candidate);
    }
    archivedCandidates = archivedCandidates.slice(-MAX_ARCHIVED_CANDIDATES);
  }

  if (slotId === "gallery" && patch.value && value) {
    const currentGallery = value as import("./brand-kit-types").GalleryValue;
    const incomingGallery = patch.value as import("./brand-kit-types").GalleryValue;
    const archivedHarvest = [...(currentGallery.archivedHarvest ?? [])];
    const seen = new Set(archivedHarvest.map((item) => item.assetId));
    for (const item of incomingGallery.harvested ?? []) {
      if (seen.has(item.assetId)) continue;
      seen.add(item.assetId);
      archivedHarvest.push(item);
    }
    value = {
      ...currentGallery,
      archivedHarvest: archivedHarvest.slice(-MAX_SUPPLEMENTAL),
    };
  }

  return {
    ...current,
    value,
    supplementalEvidence,
    archivedCandidates,
    updatedAt: ts,
  };
}
