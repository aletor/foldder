/**
 * Rasgo y genoma: la estructura que SUSTITUYE al merge de Brain.
 *
 * Un rasgo es una lista de candidatos ordenada por evidencia + (como mucho) una
 * corona en modo `single` o varias en modo `multi`. No hay estado `conflict` y no
 * hay fusión: coronar es el único momento de decisión, y coronar en `single`
 * archiva el resto ATÓMICAMENTE.
 */

import type { Candidate, CandidateStatus, EvidenceSignal, SourceRef } from "./evidence";
import { GENOMA_SCHEMA_VERSION } from "../genoma-version";
import { traitCardinality, type TraitCardinality, type TraitId } from "./trait-ids";
import type { LogoValue } from "./trait-values";
import { isNativeVectorLogoUrl } from "../projection/logo-display-url";

export interface Trait<T> {
  id: TraitId;
  cardinality: TraitCardinality;
  /** INVARIANTE: ordenados por `evidenceScore` desc (empate → más reciente antes). */
  candidates: Candidate<T>[];
  /** `single` ⇒ 0..1 · `multi` ⇒ 0..N. Siempre subconjunto de `candidates[].id`. */
  crownedIds: string[];
  updatedAt: string;
}

export interface Genome {
  version: string; // GENOMA_SCHEMA_VERSION
  traits: Partial<Record<TraitId, Trait<unknown>>>;
  sources: SourceRef[];
  /** El único % de la cara: completitud del libro. Lo calcula la proyección. */
  completenessPercent: number;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Orden canónico: score desc; a igual score, el más reciente primero. */
function byEvidence<T>(a: Candidate<T>, b: Candidate<T>): number {
  if (b.evidenceScore !== a.evidenceScore) return b.evidenceScore - a.evidenceScore;
  return b.createdAt.localeCompare(a.createdAt);
}

function sortCandidates<T>(candidates: Candidate<T>[]): Candidate<T>[] {
  return [...candidates].sort(byEvidence);
}

export function createTrait<T>(id: TraitId, candidates: Candidate<T>[] = []): Trait<T> {
  return {
    id,
    cardinality: traitCardinality(id),
    candidates: sortCandidates(candidates),
    crownedIds: [],
    updatedAt: nowIso(),
  };
}

/** El candidato mejor rankeado (top de la lista), o null. */
export function topCandidate<T>(trait: Trait<T>): Candidate<T> | null {
  return trait.candidates[0] ?? null;
}

/** Los candidatos coronados, en el orden en que se coronaron. */
export function crownedCandidates<T>(trait: Trait<T>): Candidate<T>[] {
  return trait.crownedIds
    .map((id) => trait.candidates.find((c) => c.id === id))
    .filter((c): c is Candidate<T> => Boolean(c));
}

/**
 * Inserta (o reemplaza por id) un candidato y RE-RANKEA. No corona nada: añadir
 * evidencia solo reordena la lista. Aquí no puede fallar ningún merge.
 */
export function addCandidate<T>(trait: Trait<T>, candidate: Candidate<T>): Trait<T> {
  const rest = trait.candidates.filter((c) => c.id !== candidate.id);
  return {
    ...trait,
    candidates: sortCandidates([...rest, candidate]),
    updatedAt: nowIso(),
  };
}

/**
 * Corona un candidato (el tap del usuario).
 * - `single`: ese candidato pasa a `crowned` y el RESTO a `archived`, atómicamente.
 * - `multi`: ese candidato pasa a `crowned`; los hermanos no se tocan.
 * Idempotente y sin merge. Devuelve el mismo trait si el id no existe.
 */
export function crown<T>(trait: Trait<T>, candidateId: string): Trait<T> {
  if (!trait.candidates.some((c) => c.id === candidateId)) return trait;

  if (trait.cardinality === "single") {
    const candidates = trait.candidates.map((c) =>
      c.id === candidateId
        ? { ...c, status: "crowned" as const }
        : c.status === "archived"
          ? c
          : { ...c, status: "archived" as const },
    );
    return { ...trait, candidates: sortCandidates(candidates), crownedIds: [candidateId], updatedAt: nowIso() };
  }

  const candidates = trait.candidates.map((c) =>
    c.id === candidateId ? { ...c, status: "crowned" as const } : c,
  );
  const crownedIds = trait.crownedIds.includes(candidateId)
    ? trait.crownedIds
    : [...trait.crownedIds, candidateId];
  return { ...trait, candidates: sortCandidates(candidates), crownedIds, updatedAt: nowIso() };
}

/** Deshace una coronación: el candidato vuelve a `proposed` y sale de `crownedIds`. */
export function uncrown<T>(trait: Trait<T>, candidateId: string): Trait<T> {
  if (!trait.crownedIds.includes(candidateId)) return trait;
  const candidates = trait.candidates.map((c) =>
    c.id === candidateId ? { ...c, status: "proposed" as const } : c,
  );
  return {
    ...trait,
    candidates: sortCandidates(candidates),
    crownedIds: trait.crownedIds.filter((id) => id !== candidateId),
    updatedAt: nowIso(),
  };
}

/** Archiva un candidato concreto (p. ej. ruido descartado) sin tocar la corona. */
export function archiveCandidate<T>(trait: Trait<T>, candidateId: string): Trait<T> {
  if (!trait.candidates.some((c) => c.id === candidateId)) return trait;
  const candidates = trait.candidates.map((c) =>
    c.id === candidateId ? { ...c, status: "archived" as const } : c,
  );
  return {
    ...trait,
    candidates: sortCandidates(candidates),
    crownedIds: trait.crownedIds.filter((id) => id !== candidateId),
    updatedAt: nowIso(),
  };
}

// ── Genoma (documento) ────────────────────────────────────────────────────

export function emptyGenome(): Genome {
  const now = nowIso();
  return {
    version: GENOMA_SCHEMA_VERSION,
    traits: {},
    sources: [],
    completenessPercent: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function getTrait<T = unknown>(genome: Genome, id: TraitId): Trait<T> | undefined {
  return genome.traits[id] as Trait<T> | undefined;
}

/** Inserta/reemplaza un rasgo y sella `updatedAt`. Puro. */
export function upsertTrait<T>(genome: Genome, trait: Trait<T>): Genome {
  return {
    ...genome,
    traits: { ...genome.traits, [trait.id]: trait as Trait<unknown> },
    updatedAt: nowIso(),
  };
}

/**
 * Normaliza un `Genome` leído de `node.data` (persistencia), tolerando datos
 * viejos o corruptos. Nunca lanza; devuelve un genoma coherente.
 */
export function normalizeGenome(raw: unknown): Genome {
  const base = emptyGenome();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const traits: Genome["traits"] = {};
  if (r.traits && typeof r.traits === "object" && !Array.isArray(r.traits)) {
    for (const [key, value] of Object.entries(r.traits as Record<string, unknown>)) {
      const t = normalizeTrait(key as TraitId, value);
      if (t) traits[key as TraitId] = t;
    }
  }

  return {
    version: typeof r.version === "string" ? r.version : base.version,
    traits,
    sources: Array.isArray(r.sources) ? (r.sources as Genome["sources"]) : [],
    completenessPercent: typeof r.completenessPercent === "number" ? r.completenessPercent : 0,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : base.createdAt,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : base.updatedAt,
  };
}

const CANDIDATE_STATUSES: readonly CandidateStatus[] = ["proposed", "crowned", "archived", "user_supplied"];

function repairLogoCandidate<T>(candidate: Candidate<T>): Candidate<T> {
  const value = candidate.value;
  if (!value || typeof value !== "object" || !("imageUrl" in value)) return candidate;
  const logo = value as unknown as LogoValue;
  const imageUrl = logo.imageUrl?.trim();
  if (!imageUrl) return candidate;

  const vectorUrl = candidate.derived?.vectorUrl?.trim();
  const rasterImageUrl = candidate.derived?.rasterImageUrl?.trim();

  if (rasterImageUrl && vectorUrl && imageUrl === vectorUrl) {
    return {
      ...candidate,
      value: { ...logo, imageUrl: rasterImageUrl } as T,
      derived: { ...candidate.derived, rasterImageUrl },
    };
  }

  if (!rasterImageUrl && vectorUrl && imageUrl === vectorUrl) {
    return candidate;
  }

  return candidate;
}

/** Coacciona un candidato leído de disco a una forma bien tipada; null si no es viable. */
function normalizeCandidate(raw: unknown): Candidate<unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const status = CANDIDATE_STATUSES.includes(r.status as CandidateStatus)
    ? (r.status as CandidateStatus)
    : "proposed";
  return repairLogoCandidate({
    id: r.id,
    value: r.value,
    evidenceScore: typeof r.evidenceScore === "number" ? r.evidenceScore : 0,
    signals: Array.isArray(r.signals) ? (r.signals as EvidenceSignal[]) : [],
    status,
    signature: typeof r.signature === "string" ? r.signature : "",
    sourceRefs: Array.isArray(r.sourceRefs) ? (r.sourceRefs as string[]) : [],
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
    derived:
      r.derived && typeof r.derived === "object" ? (r.derived as Candidate<unknown>["derived"]) : undefined,
  });
}

function normalizeTrait(id: TraitId, raw: unknown): Trait<unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const candidates = (Array.isArray(r.candidates) ? r.candidates : [])
    .map(normalizeCandidate)
    .filter((c): c is Candidate<unknown> => c !== null);
  const ids = new Set(candidates.map((c) => c.id));
  const crownedIds = Array.isArray(r.crownedIds)
    ? (r.crownedIds as string[]).filter((cid) => ids.has(cid))
    : [];
  const cardinality = traitCardinality(id);
  return {
    id,
    cardinality,
    candidates: sortCandidates(candidates),
    // `single` no puede tener más de una corona aunque el dato venga sucio.
    crownedIds: cardinality === "single" ? crownedIds.slice(0, 1) : crownedIds,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : nowIso(),
  };
}
