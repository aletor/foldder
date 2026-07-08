import type { Genome, Trait } from "@/lib/genoma/model/trait";
import {
  addCandidate,
  createTrait,
  crown,
  getTrait,
  normalizeGenome,
  upsertTrait,
} from "@/lib/genoma/model/trait";
import { createCandidate, signal } from "@/lib/genoma/model/evidence";
import type { ColorValue, LogoValue } from "@/lib/genoma/model/trait-values";
import { colorTraitId, type ColorRole } from "@/lib/genoma/model/trait-ids";
import { computeCompleteness } from "@/lib/genoma/projection/completeness";
import type { BrandLogoState } from "@/lib/genoma/logo-intake/types";
import type { BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import type { SemanticPaletteResult } from "@/lib/genoma/logo-intake/palette-sample";

export const INTAKE_CANDIDATE_PREFIX = "intake:";

export function intakeGenomeCandidateId(candidateId: string): string {
  return `${INTAKE_CANDIDATE_PREFIX}${candidateId}`;
}

export function isIntakeGenomeCandidateId(id: string): boolean {
  return id.startsWith(INTAKE_CANDIDATE_PREFIX);
}

export function formatLogoIntakeProvenance(
  origin: BrandLogoState["origin"],
  docName?: string,
  page?: number,
): string {
  if (!origin) return "origen desconocido";
  if (origin.kind === "manual") return `manual · ${origin.fileName}`;
  const label = docName ?? origin.docId.slice(0, 8);
  const pageLabel = page ?? (origin.kind !== "manual" ? undefined : undefined);
  const pageSuffix = pageLabel ? ` pág. ${pageLabel}` : "";
  if (origin.kind === "adjusted") return `ajustado · ${label}${pageSuffix}`;
  return `${label}${pageSuffix}`;
}

function bboxPageToSourceBbox(bboxPage: BBoxPage): LogoValue["sourceBbox"] {
  return {
    x: bboxPage[0],
    y: bboxPage[1],
    width: bboxPage[2] - bboxPage[0],
    height: bboxPage[3] - bboxPage[1],
  };
}

export function applyLogoIntakeValidateToGenome(
  genomeInput: Genome,
  input: {
    candidateId: string;
    imageUrl: string;
    pHash: string;
    docName: string;
    page: number;
    bboxPage: BBoxPage;
    origin: BrandLogoState["origin"];
  },
): Genome {
  const genome = normalizeGenome(genomeInput);
  const id = intakeGenomeCandidateId(input.candidateId);
  const provenance = formatLogoIntakeProvenance(input.origin, input.docName, input.page);

  const logoValue: LogoValue = {
    imageUrl: input.imageUrl,
    variant: "positive",
    assetOrigin: "render_crop",
    label: "logo validado",
    sourcePageNumber: input.page,
    sourceBbox: bboxPageToSourceBbox(input.bboxPage),
  };

  const candidate = createCandidate<LogoValue>({
    id,
    value: logoValue,
    signature: input.pHash,
    signals: [
      signal("user-supplied", "validado en logo-intake"),
      signal("recurrence", provenance),
    ],
  });

  const withDerived = {
    ...candidate,
    derived: {
      rasterImageUrl: input.imageUrl,
      generatedAt: new Date().toISOString(),
    },
  };

  let trait: Trait<LogoValue> = (getTrait<LogoValue>(genome, "logo.primary") ??
    createTrait<LogoValue>("logo.primary")) as Trait<LogoValue>;
  trait = addCandidate(trait, withDerived) as Trait<LogoValue>;
  trait = crown(trait, id) as Trait<LogoValue>;

  const next = upsertTrait(genome, trait as Trait<unknown>);
  return { ...next, completenessPercent: computeCompleteness(next) };
}

export function uncrownIntakeLogoFromGenome(genomeInput: Genome): Genome {
  const genome = normalizeGenome(genomeInput);
  const trait = getTrait<LogoValue>(genome, "logo.primary");
  if (!trait) return genome;
  const intakeCrowned = trait.crownedIds.find(isIntakeGenomeCandidateId);
  if (!intakeCrowned) return genome;
  const candidates = trait.candidates.map((c) =>
    c.id === intakeCrowned ? { ...c, status: "proposed" as const } : c,
  );
  const nextTrait = {
    ...trait,
    candidates,
    crownedIds: trait.crownedIds.filter((id) => id !== intakeCrowned),
    updatedAt: new Date().toISOString(),
  };
  const next = upsertTrait(genome, nextTrait as Trait<unknown>);
  return { ...next, completenessPercent: computeCompleteness(next) };
}

const QUANTIZED_SIGNAL_KINDS = new Set(["render-quantized", "operator-color"]);

function traitHasQuantizedCrown(trait: Trait<ColorValue> | undefined): boolean {
  if (!trait) return false;
  const crowned = trait.crownedIds[0];
  if (!crowned) return false;
  const candidate = trait.candidates.find((c) => c.id === crowned);
  return Boolean(candidate?.signals.some((s) => QUANTIZED_SIGNAL_KINDS.has(s.kind)));
}

function demoteQuantizedCrowns(genome: Genome, roles: ColorRole[]): Genome {
  let next = genome;
  for (const role of roles) {
    const traitId = colorTraitId(role);
    const trait = getTrait<ColorValue>(next, traitId);
    if (!trait || !traitHasQuantizedCrown(trait)) continue;
    const crownedId = trait.crownedIds[0]!;
    const candidates = trait.candidates.map((c) =>
      c.id === crownedId ? { ...c, status: "proposed" as const } : c,
    );
    next = upsertTrait(next, {
      ...trait,
      candidates,
      crownedIds: [],
      updatedAt: new Date().toISOString(),
    } as Trait<unknown>);
  }
  return next;
}

function shouldAutoCrownSemantic(entry: SemanticPaletteResult["entries"][number]): boolean {
  if (entry.role === "background" || entry.role === "accent") return false;
  return entry.recurrence >= 2 || entry.regionKind === "palette_swatch" || Boolean(entry.textVerified);
}

export function applySemanticColorEntryToGenome(
  genomeInput: Genome,
  entry: SemanticPaletteResult["entries"][number],
  opts?: { sourceId?: string },
): Genome {
  return applySemanticPaletteToGenome(
    genomeInput,
    { entries: [entry], samplingMs: 0, semanticChromaticCount: entry.role === "accent" ? 0 : 1 },
    opts,
  );
}

export function applySemanticPaletteToGenome(
  genomeInput: Genome,
  palette: SemanticPaletteResult,
  opts?: { sourceId?: string },
): Genome {
  if (palette.entries.length === 0) return normalizeGenome(genomeInput);

  let genome = normalizeGenome(genomeInput);
  const sourceId = opts?.sourceId ?? "logo-intake";

  if (palette.semanticChromaticCount >= 2) {
    genome = demoteQuantizedCrowns(genome, ["primary", "secondary", "accent"]);
  }

  for (const entry of palette.entries) {
    const traitId = colorTraitId(entry.role);
    const name = entry.name?.trim() || entry.role;
    const candidate = createCandidate<ColorValue>({
      value: { hex: entry.hex, role: entry.role, name },
      signature: entry.hex.toLowerCase(),
      sourceRefs: [sourceId],
      signals: [
        signal("visual-brand", {
          detail: `${entry.regionKind} · pág. ${entry.pages.join(",")}${entry.textVerified ? " · texto verificado" : ""}`,
          sourceRef: sourceId,
          scale: Math.min(1.2, 0.75 + entry.score / 4),
        }),
      ],
    });

    let trait: Trait<ColorValue> = (getTrait<ColorValue>(genome, traitId) ??
      createTrait<ColorValue>(traitId)) as Trait<ColorValue>;
    trait = addCandidate(trait, candidate) as Trait<ColorValue>;

    if (shouldAutoCrownSemantic(entry) && (entry.role === "primary" || entry.role === "secondary")) {
      trait = crown(trait, candidate.id) as Trait<ColorValue>;
    }

    genome = upsertTrait(genome, trait as Trait<unknown>);
  }

  return { ...genome, completenessPercent: computeCompleteness(genome) };
}
