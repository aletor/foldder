/**
 * Proyección de profundidad (···): etiquetas legibles y filas de candidatos.
 */

import type { Candidate, EvidenceSignal, SourceRef } from "../model/evidence";
import type { Genome, Trait } from "../model/trait";
import type { TraitId } from "../model/trait-ids";
import type {
  ClaimValue,
  ColorValue,
  ImageDnaValue,
  LogoValue,
  TaglineValue,
  ToneValue,
  TypographyValue,
} from "../model/trait-values";
import { resolveLogoDisplayUrl } from "./logo-display-url";

export type DepthCandidateRow = {
  id: string;
  label: string;
  sublabel?: string;
  crowned: boolean;
  score: number;
  signals: EvidenceSignal[];
  sourceRefs: string[];
  preview?: { kind: "color"; hex: string } | { kind: "logo"; imageUrl: string };
};

const TRAIT_TITLES: Partial<Record<TraitId, string>> = {
  "logo.primary": "Logo principal",
  "logo.secondary": "Logo secundario",
  "typography.primary": "Tipografía principal",
  "typography.secondary": "Tipografía secundaria",
  "message.tagline": "Mensaje",
  "message.tone": "Tono",
  "claim.absolute": "Claims permitidos",
  "claim.forbidden": "Claims prohibidos",
};

const SIGNAL_LABELS: Partial<Record<EvidenceSignal["kind"], string>> = {
  "user-supplied": "aportado por ti",
  "brand-manual": "manual de marca",
  "repeated-independent": "repetido en el documento",
  "single-appearance": "aparición única",
  "llm-vision": "inferido por visión",
  "near-logo": "cerca del logo",
  headline: "en titulares",
  "body-text": "en cuerpo de texto",
  "body-annex": "solo en anexos",
  footer: "en pie de página",
  "embedded-file": "fuente embebida",
  "shape-dominant": "forma dominante",
  recurrence: "recurrente",
  "flat-background": "fondo plano",
  "render-quantized": "cuantizado del render",
  "operator-color": "color de marca",
  neutral: "neutral (descartado)",
};

const COLOR_ROLE_NAMES: Record<string, string> = {
  primary: "primario",
  secondary: "secundario",
  accent: "acento",
  background: "fondo",
  text: "soporte",
};

export function traitDepthTitle(traitId: TraitId): string {
  if (TRAIT_TITLES[traitId]) return TRAIT_TITLES[traitId]!;
  if (traitId.startsWith("color.")) {
    const role = traitId.replace("color.", "");
    return `Color ${COLOR_ROLE_NAMES[role] ?? role}`;
  }
  if (traitId.startsWith("image.")) return `Imagen · ${traitId.replace("image.", "")}`;
  return traitId;
}

export function candidateValueLabel(value: unknown): { label: string; sublabel?: string; preview?: DepthCandidateRow["preview"] } {
  if (!value || typeof value !== "object") return { label: String(value ?? "candidato") };

  if ("family" in value) {
    const v = value as TypographyValue;
    return {
      label: v.family,
      sublabel: v.weights.join(" · "),
    };
  }
  if ("hex" in value) {
    const v = value as ColorValue;
    return {
      label: v.name ?? v.role,
      sublabel: v.hex.toUpperCase(),
      preview: { kind: "color", hex: v.hex },
    };
  }
  if ("imageUrl" in value) {
    const v = value as LogoValue;
    return {
      label: v.label ?? "logo",
      sublabel: v.variant,
      preview: { kind: "logo", imageUrl: v.imageUrl },
    };
  }
  if ("text" in value && "kind" in value) {
    const v = value as ClaimValue;
    return { label: v.text, sublabel: v.why };
  }
  if ("text" in value) {
    const v = value as TaglineValue | ToneValue;
    return { label: v.text };
  }
  if ("axes" in value) {
    const v = value as ImageDnaValue;
    const parts = Object.values(v.axes).filter(Boolean).slice(0, 3);
    return { label: parts.join(" · ") || "territorio visual" };
  }

  return { label: "candidato" };
}

export function signalDisplayLabel(signal: EvidenceSignal, sources: SourceRef[]): string {
  const base = SIGNAL_LABELS[signal.kind] ?? signal.kind;
  const detail = signal.detail ? ` · ${signal.detail}` : "";
  const src = signal.sourceRef ? sources.find((s) => s.id === signal.sourceRef)?.label : undefined;
  const srcPart = src ? ` (${src})` : "";
  return `${base}${detail}${srcPart}`;
}

export function resolveSourceLabels(genome: Genome, sourceRefIds: string[]): string[] {
  const labels = sourceRefIds
    .map((id) => genome.sources.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => {
      const kind = s!.kind === "url" ? "web" : s!.kind;
      return `${s!.label} · ${kind}`;
    });
  return [...new Set(labels)];
}

export function buildDepthRows(genome: Genome, traitId: TraitId): DepthCandidateRow[] {
  const trait = genome.traits[traitId] as Trait<unknown> | undefined;
  if (!trait) return [];

  return trait.candidates
    .filter((c) => c.status !== "archived")
    .map((c) => rowFromCandidate(c, trait))
    .sort((a, b) => b.score - a.score || Number(b.crowned) - Number(a.crowned));
}

function rowFromCandidate<T>(c: Candidate<T>, trait: Trait<T>): DepthCandidateRow {
  const { label, sublabel, preview } = candidateValueLabel(c.value);
  let resolvedPreview = preview;
  if (preview?.kind === "logo") {
    const url = resolveLogoDisplayUrl(c.value as LogoValue, c.derived);
    if (url) resolvedPreview = { kind: "logo", imageUrl: url };
  }
  return {
    id: c.id,
    label,
    sublabel,
    crowned: trait.crownedIds.includes(c.id),
    score: c.evidenceScore,
    signals: c.signals,
    sourceRefs: c.sourceRefs ?? [],
    preview: resolvedPreview,
  };
}

export function topPromptDetail(candidate: Candidate<unknown>, genome: Genome): string | undefined {
  const sourceId =
    candidate.sourceRefs?.[0] ?? candidate.signals.find((s) => s.sourceRef)?.sourceRef;
  const src = sourceId ? genome.sources.find((s) => s.id === sourceId) : undefined;
  return src ? `aparece en ${src.label}` : undefined;
}
