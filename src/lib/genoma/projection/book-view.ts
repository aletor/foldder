/**
 * Proyección: `Genome` → vista del libro que consume la cara (§5).
 *
 * La cara no habla de candidatos ni de scores: habla de RASGOS con un estado
 * visual (ghost · proposed · crowned) y un valor a pintar (el coronado, o el
 * top propuesto). Toda la lógica de "qué se ve" vive aquí, pura y testeable;
 * los componentes solo pintan lo que esta proyección decide.
 */

import type { CandidateDerived } from "../model/evidence";
import type { SourceKind } from "../model/evidence";
import type { Genome, Trait } from "../model/trait";
import {
  COLOR_ROLES,
  IMAGE_CATEGORIES,
  colorTraitId,
  imageTraitId,
  type ColorRole,
  type ImageCategory,
  type TraitId,
} from "../model/trait-ids";
import type {
  ClaimValue,
  ColorValue,
  ImageDnaValue,
  LogoValue,
  TaglineValue,
  ToneValue,
  TypographyValue,
} from "../model/trait-values";
import { computeCompleteness } from "./completeness";
import type { PageVisionPassSourceMeta } from "../ingest/page-vision-pass-meta";

export type GenomaSourceView = {
  id: string;
  label: string;
  kind: SourceKind;
  pageVisionPass?: PageVisionPassSourceMeta;
};

export type FaceState = "ghost" | "proposed" | "crowned";

/** Rasgo de corona única proyectado: qué pintar y en qué estado. */
export interface TraitSlot<T> {
  traitId: TraitId;
  state: FaceState;
  /** Valor coronado, o el top propuesto, o null (ghost). */
  value: T | null;
  candidateId: string | null;
  evidenceScore: number;
  /** Candidatos no archivados (para el contador tras "···"). */
  candidateCount: number;
  /** Hay profundidad detrás del "···": alternativas o señales de evidencia. */
  hasDepth: boolean;
  derived?: CandidateDerived;
}

export interface MultiItem<T> {
  candidateId: string;
  value: T;
  crowned: boolean;
  evidenceScore: number;
  derived?: CandidateDerived;
}

/** Rasgo multi proyectado: colección de tarjetas, cada una confirmable aparte. */
export interface MultiTraitSlot<T> {
  traitId: TraitId;
  state: FaceState;
  /** No archivados, orden por evidencia. */
  items: MultiItem<T>[];
}

export interface GenomaBookView {
  logo: { primary: TraitSlot<LogoValue>; secondary: MultiTraitSlot<LogoValue> };
  typography: { primary: TraitSlot<TypographyValue>; secondary: TraitSlot<TypographyValue> };
  palette: Array<{ role: ColorRole; slot: TraitSlot<ColorValue> }>;
  voice: {
    tagline: TraitSlot<TaglineValue>;
    tone: MultiTraitSlot<ToneValue>;
    claimsAbsolute: MultiTraitSlot<ClaimValue>;
    claimsForbidden: MultiTraitSlot<ClaimValue>;
  };
  visualUniverse: Array<{ category: ImageCategory; slot: MultiTraitSlot<ImageDnaValue> }>;
  sources: GenomaSourceView[];
  sourcesCount: number;
  /** El único % de la cara. */
  completenessPercent: number;
}

const GHOST_SLOT = <T>(traitId: TraitId): TraitSlot<T> => ({
  traitId,
  state: "ghost",
  value: null,
  candidateId: null,
  evidenceScore: 0,
  candidateCount: 0,
  hasDepth: false,
});

function singleSlot<T>(genome: Genome, traitId: TraitId): TraitSlot<T> {
  const trait = genome.traits[traitId] as Trait<T> | undefined;
  if (!trait || trait.candidates.length === 0) return GHOST_SLOT<T>(traitId);

  const crownedId = trait.crownedIds[0];
  const crowned = crownedId ? trait.candidates.find((c) => c.id === crownedId) : undefined;
  const nonArchived = trait.candidates
    .filter((c) => c.status !== "archived")
    .sort((a, b) => b.evidenceScore - a.evidenceScore);
  const chosen = crowned ?? nonArchived[0] ?? null;

  if (!chosen) return GHOST_SLOT<T>(traitId);

  return {
    traitId,
    state: crowned ? "crowned" : "proposed",
    value: chosen.value,
    candidateId: chosen.id,
    evidenceScore: chosen.evidenceScore,
    candidateCount: nonArchived.length,
    hasDepth:
      traitId === "logo.primary"
        ? nonArchived.length > 0
        : nonArchived.length > 1 || chosen.signals.length > 0,
    derived: chosen.derived,
  };
}

function multiSlot<T>(genome: Genome, traitId: TraitId): MultiTraitSlot<T> {
  const trait = genome.traits[traitId] as Trait<T> | undefined;
  if (!trait) return { traitId, state: "ghost", items: [] };

  const items: MultiItem<T>[] = trait.candidates
    .filter((c) => c.status !== "archived")
    .map((c) => ({
      candidateId: c.id,
      value: c.value,
      crowned: trait.crownedIds.includes(c.id),
      evidenceScore: c.evidenceScore,
      derived: c.derived,
    }));

  const state: FaceState = trait.crownedIds.length > 0 ? "crowned" : items.length > 0 ? "proposed" : "ghost";
  return { traitId, state, items };
}

/** Proyecta un genoma a la vista del libro. Puro. */
export function buildBookView(genome: Genome): GenomaBookView {
  return {
    logo: {
      primary: singleSlot<LogoValue>(genome, "logo.primary"),
      secondary: multiSlot<LogoValue>(genome, "logo.secondary"),
    },
    typography: {
      primary: singleSlot<TypographyValue>(genome, "typography.primary"),
      secondary: singleSlot<TypographyValue>(genome, "typography.secondary"),
    },
    palette: COLOR_ROLES.map((role) => ({ role, slot: singleSlot<ColorValue>(genome, colorTraitId(role)) })),
    voice: {
      tagline: singleSlot<TaglineValue>(genome, "message.tagline"),
      tone: multiSlot<ToneValue>(genome, "message.tone"),
      claimsAbsolute: multiSlot<ClaimValue>(genome, "claim.absolute"),
      claimsForbidden: multiSlot<ClaimValue>(genome, "claim.forbidden"),
    },
    visualUniverse: IMAGE_CATEGORIES.map((category) => ({
      category,
      slot: multiSlot<ImageDnaValue>(genome, imageTraitId(category)),
    })),
    sources: genome.sources.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      pageVisionPass: s.pageVisionPass,
    })),
    sourcesCount: genome.sources.length,
    completenessPercent: computeCompleteness(genome),
  };
}
