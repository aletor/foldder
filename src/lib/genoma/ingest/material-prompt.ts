/**
 * Modal de material nuevo (§4): acciones y copy cuando classifyIncoming → prompt.
 */

import type { Candidate } from "../model/evidence";
import { classifyIncoming, type IncomingVerdict } from "../model/new-material";
import { addCandidate, archiveCandidate, createTrait, getTrait, upsertTrait, type Genome } from "../model/trait";
import { COLOR_ROLES, colorTraitId, type ColorRole, type TraitId } from "../model/trait-ids";
import type { ColorValue, TypographyValue } from "../model/trait-values";
import { topPromptDetail } from "../projection/depth-view";

export type MaterialPromptPayload = {
  id: string;
  traitId: TraitId;
  candidate: Candidate<unknown>;
  headline: string;
  detail?: string;
  options: MaterialPromptOption[];
};

export type MaterialPromptOption = {
  id: string;
  label: string;
  action: MaterialPromptResolution;
};

export type MaterialPromptResolution =
  | { kind: "add"; traitId: TraitId }
  | { kind: "ignore" };

export function traitHasActiveCandidates(genome: Genome, traitId: TraitId): boolean {
  const trait = getTrait(genome, traitId);
  return Boolean(trait?.candidates.some((c) => c.status !== "archived"));
}

export function genomeHasPriorMaterial(genome: Genome): boolean {
  if (genome.sources.length > 1) return true;
  return Object.values(genome.traits).some((t) => t?.candidates.some((c) => c.status !== "archived"));
}

export function shouldDeferToPrompt(
  genome: Genome,
  traitId: TraitId,
  verdict: IncomingVerdict,
): verdict is Extract<IncomingVerdict, { kind: "prompt" }> {
  if (verdict.kind !== "prompt") return false;
  if (traitId.startsWith("typography.")) {
    return (
      traitHasActiveCandidates(genome, "typography.primary") ||
      traitHasActiveCandidates(genome, "typography.secondary")
    );
  }
  if (traitId.startsWith("logo.")) {
    return (
      traitHasActiveCandidates(genome, "logo.primary") ||
      traitHasActiveCandidates(genome, "logo.secondary")
    );
  }
  if (traitId.startsWith("color.")) {
    return COLOR_ROLES.some((role) => traitHasActiveCandidates(genome, colorTraitId(role)));
  }
  if (traitId === "message.tagline") {
    return traitHasActiveCandidates(genome, "message.tagline");
  }
  return traitHasActiveCandidates(genome, traitId);
}

function typographyLabel(v: TypographyValue): string {
  return `${v.family}${v.weights.length ? ` (${v.weights.slice(0, 2).join(", ")})` : ""}`;
}

function promptHeadline(traitId: TraitId, candidate: Candidate<unknown>): string {
  const v = candidate.value;
  if (traitId.startsWith("typography.") && v && typeof v === "object" && "family" in v) {
    return `Nueva tipografía · ${typographyLabel(v as TypographyValue)}`;
  }
  if (traitId.startsWith("color.") && v && typeof v === "object" && "hex" in v) {
    return "Color nuevo, no está en tu paleta";
  }
  if (traitId.startsWith("logo.") && v && typeof v === "object" && "imageUrl" in v) {
    return "Nuevo logo detectado";
  }
  if (traitId === "message.tagline" && v && typeof v === "object" && "text" in v) {
    return `Nuevo mensaje: «${String((v as { text: string }).text).slice(0, 60)}»`;
  }
  return "Material nuevo detectado";
}

function colorRoleOption(role: ColorRole): MaterialPromptOption {
  const labels: Record<ColorRole, string> = {
    primary: "Como color primario",
    secondary: "Como color secundario",
    accent: "Como color de acento",
    background: "Como color de fondo",
    text: "Como color de texto",
  };
  return { id: role, label: labels[role], action: { kind: "add", traitId: colorTraitId(role) } };
}

function promptOptions(traitId: TraitId): MaterialPromptOption[] {
  if (traitId === "typography.primary" || traitId === "typography.secondary") {
    return [
      { id: "primary", label: "Como tipografía principal", action: { kind: "add", traitId: "typography.primary" } },
      { id: "secondary", label: "Como tipografía secundaria", action: { kind: "add", traitId: "typography.secondary" } },
      { id: "ignore", label: "Ignorar", action: { kind: "ignore" } },
    ];
  }
  if (traitId === "logo.primary" || traitId === "logo.secondary") {
    return [
      { id: "primary", label: "Como logo principal", action: { kind: "add", traitId: "logo.primary" } },
      { id: "secondary", label: "Como logo secundario", action: { kind: "add", traitId: "logo.secondary" } },
      { id: "ignore", label: "Ignorar", action: { kind: "ignore" } },
    ];
  }
  if (traitId.startsWith("color.")) {
    return [
      colorRoleOption("primary"),
      colorRoleOption("secondary"),
      colorRoleOption("accent"),
      { id: "ignore", label: "Ignorar", action: { kind: "ignore" } },
    ];
  }
  if (traitId === "message.tagline") {
    return [
      { id: "tagline", label: "Como mensaje principal", action: { kind: "add", traitId: "message.tagline" } },
      { id: "ignore", label: "Ignorar", action: { kind: "ignore" } },
    ];
  }
  return [
    { id: "add", label: "Añadir al libro", action: { kind: "add", traitId } },
    { id: "ignore", label: "Ignorar", action: { kind: "ignore" } },
  ];
}

export function buildMaterialPrompt(
  traitId: TraitId,
  candidate: Candidate<unknown>,
  genome?: Genome,
): MaterialPromptPayload {
  return {
    id: `mp_${candidate.id}`,
    traitId,
    candidate,
    headline: promptHeadline(traitId, candidate),
    detail: genome ? topPromptDetail(candidate, genome) : undefined,
    options: promptOptions(traitId),
  };
}

export type CandidateApplyResult = {
  genome: Genome;
  prompts: MaterialPromptPayload[];
};

export type ApplyMaterialPromptOptions = {
  /** false durante el primer lote de consolidación — colores entran sin modal. */
  allowMaterialPrompts?: boolean;
};

export function applyCandidateToGenome<T>(
  genome: Genome,
  traitId: TraitId,
  candidate: Candidate<T>,
  opts: ApplyMaterialPromptOptions = {},
): CandidateApplyResult {
  const verdict = classifyIncoming(genome, traitId, candidate as Candidate<unknown>);
  if (verdict.kind === "known" || verdict.kind === "noise") {
    return { genome, prompts: [] };
  }
  if (opts.allowMaterialPrompts !== false && shouldDeferToPrompt(genome, traitId, verdict)) {
    return { genome, prompts: [buildMaterialPrompt(traitId, verdict.candidate, genome)] };
  }
  const trait = (getTrait<T>(genome, traitId) ?? createTrait<T>(traitId)) as ReturnType<typeof getTrait<T>>;
  return {
    genome: upsertTrait(genome, addCandidate(trait!, candidate)),
    prompts: [],
  };
}

export function resolveMaterialPrompt(
  genome: Genome,
  prompt: MaterialPromptPayload,
  optionId: string,
): Genome {
  const option = prompt.options.find((o) => o.id === optionId) ?? prompt.options[prompt.options.length - 1];
  if (option.action.kind === "ignore") {
    return genome;
  }
  const traitId = option.action.traitId;
  const trait = (getTrait(genome, traitId) ?? createTrait(traitId)) as NonNullable<ReturnType<typeof getTrait>>;
  return upsertTrait(genome, addCandidate(trait, prompt.candidate));
}

export function archiveMaterialPromptCandidate(genome: Genome, prompt: MaterialPromptPayload): Genome {
  const trait = getTrait(genome, prompt.traitId);
  if (!trait?.candidates.some((c) => c.id === prompt.candidate.id)) return genome;
  return upsertTrait(genome, archiveCandidate(trait, prompt.candidate.id));
}
