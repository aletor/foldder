/**
 * Fixtures de genoma para la cara estática (§ punto 3): ghost → proposed → crowned.
 *
 * Se construyen con los reductores reales (`createCandidate`/`createTrait`/`crown`)
 * para que sean genomas VÁLIDOS, no maquetas. Las imágenes son data-URIs SVG
 * autocontenidos: la cara se puede previsualizar sin ningún asset en disco.
 */

import { createCandidate, signal, type Candidate, type EvidenceSignal, type SourceRef } from "./model/evidence";
import { createTrait, crown, emptyGenome, upsertTrait, type Genome, type Trait } from "./model/trait";
import { COLOR_ROLES, IMAGE_CATEGORIES, colorTraitId, imageTraitId, type TraitId } from "./model/trait-ids";
import type {
  ClaimValue,
  ColorValue,
  ImageDnaValue,
  LogoValue,
  TaglineValue,
  ToneValue,
  TypographyValue,
} from "./model/trait-values";
import { textSignature } from "./model/signature";
import { enrichTypographySpecimen } from "./specimen/typography-specimen";

const MONTSERRAT_SPECIMEN = enrichTypographySpecimen({
  family: "Montserrat",
  weights: ["Regular", "Bold", "Italic"],
  specimenAvailable: false,
  fallback: "sans-serif",
});
const LORA_SPECIMEN = enrichTypographySpecimen({
  family: "Lora",
  weights: ["Regular", "Italic"],
  specimenAvailable: false,
  fallback: "serif",
});

const SRC: SourceRef = {
  id: "fx-src-atresmedia",
  kind: "pdf",
  label: "manual-marca.pdf",
  addedAt: "2026-01-01T00:00:00.000Z",
};

function svgUri(body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${body}`)}`;
}
function logoUri(label: string, bg: string, fg: string): string {
  return svgUri(
    `viewBox='0 0 360 120'><rect width='360' height='120' fill='${bg}'/><text x='180' y='74' font-family='Montserrat, Arial, sans-serif' font-size='36' font-weight='700' letter-spacing='1' fill='${fg}' text-anchor='middle'>${label}</text></svg>`,
  );
}
function gradientUri(a: string, b: string): string {
  return svgUri(
    `viewBox='0 0 400 300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='400' height='300' fill='url(#g)'/></svg>`,
  );
}

let seq = 0;
function cand<T>(value: T, signals: EvidenceSignal[], signature: string): Candidate<T> {
  seq += 1;
  return createCandidate<T>({
    value,
    signals,
    signature,
    id: `fx_${seq}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
    sourceRefs: [SRC.id],
  });
}

function withTrait<T>(g: Genome, id: TraitId, candidates: Candidate<T>[]): Genome {
  return upsertTrait(g, createTrait(id, candidates));
}

const COLOR_VALUES: Record<(typeof COLOR_ROLES)[number], ColorValue> = {
  primary: { hex: "#FFBD1B", role: "primary", name: "amarillo marca" },
  secondary: { hex: "#1A1B1E", role: "secondary", name: "carbón" },
  accent: { hex: "#FF5A5F", role: "accent", name: "rosa" },
  background: { hex: "#EBE4DC", role: "background", name: "arena" },
  text: { hex: "#1A1B1E", role: "text", name: "tinta" },
};

const TONE_CHIPS = ["cercano", "optimista", "con criterio"];
const PEOPLE_AXES: ImageDnaValue = {
  axes: { sujeto: "personas reales", edad: "25-45", entorno: "urbano", encuadre: "medio", tratamiento: "luz natural, cálido" },
};
const ENV_AXES: ImageDnaValue = {
  axes: { sujeto: "espacios de trabajo", entorno: "interior luminoso", encuadre: "amplio", tratamiento: "contraste suave" },
};

/** Genoma vacío: todo ghost. */
export function ghostGenome(): Genome {
  return emptyGenome();
}

/** Genoma con propuestas SIN coronar (estado proposed). */
export function proposedGenome(): Genome {
  let g: Genome = { ...emptyGenome(), sources: [SRC] };

  g = withTrait<LogoValue>(g, "logo.primary", [
    cand<LogoValue>(
      { imageUrl: logoUri("marca", "#1A1B1E", "#FFBD1B"), variant: "positive", label: "logo principal" },
      [signal("shape-dominant", { detail: "forma dominante en portada" }), signal("recurrence")],
      "logo-primary",
    ),
  ]);
  g = withTrait<LogoValue>(g, "logo.secondary", [
    cand<LogoValue>(
      { imageUrl: logoUri("m", "#FFBD1B", "#1A1B1E"), variant: "positive", label: "isotipo" },
      [signal("recurrence")],
      "logo-iso",
    ),
  ]);

  g = withTrait<TypographyValue>(g, "typography.primary", [
    cand<TypographyValue>(
      MONTSERRAT_SPECIMEN,
      [signal("embedded-file"), signal("headline", { detail: "en titulares" }), signal("repeated-independent")],
      "montserrat",
    ),
  ]);
  g = withTrait<TypographyValue>(g, "typography.secondary", [
    cand<TypographyValue>(
      LORA_SPECIMEN,
      [signal("embedded-file"), signal("body-text", { detail: "en cuerpo de texto" })],
      "lora",
    ),
  ]);

  for (const role of COLOR_ROLES) {
    const v = COLOR_VALUES[role];
    g = withTrait<ColorValue>(g, colorTraitId(role), [
      cand<ColorValue>(v, [signal("operator-color")], v.hex.toLowerCase()),
    ]);
  }

  g = withTrait<TaglineValue>(g, "message.tagline", [
    cand<TaglineValue>({ text: "Hacemos que pase." }, [signal("brand-manual")], textSignature("Hacemos que pase.")),
  ]);
  g = withTrait<ToneValue>(
    g,
    "message.tone",
    TONE_CHIPS.map((t) => cand<ToneValue>({ text: t }, [signal("brand-manual")], textSignature(t))),
  );
  g = withTrait<ClaimValue>(g, "claim.forbidden", [
    cand<ClaimValue>(
      { text: "No prometemos audiencias.", kind: "forbidden", why: "compromiso legal" },
      [signal("brand-manual")],
      textSignature("No prometemos audiencias."),
    ),
  ]);
  g = withTrait<ClaimValue>(g, "claim.absolute", [
    cand<ClaimValue>(
      { text: "Referentes en televisión en abierto.", kind: "absolute" },
      [signal("brand-manual")],
      textSignature("Referentes en television en abierto."),
    ),
  ]);

  g = withTrait<ImageDnaValue>(g, imageTraitId("people"), [
    cand<ImageDnaValue>(PEOPLE_AXES, [signal("recurrence"), signal("brand-manual")], "img-people"),
  ]);
  g = withTrait<ImageDnaValue>(g, imageTraitId("environments"), [
    cand<ImageDnaValue>(ENV_AXES, [signal("recurrence")], "img-env"),
  ]);

  return g;
}

function crownTop(g: Genome, id: TraitId): Genome {
  const t = g.traits[id] as Trait<unknown> | undefined;
  const first = t?.candidates[0];
  if (!t || !first) return g;
  return upsertTrait(g, crown(t, first.id));
}

function crownAll(g: Genome, id: TraitId): Genome {
  const t = g.traits[id] as Trait<unknown> | undefined;
  if (!t) return g;
  let next = t;
  for (const c of t.candidates) next = crown(next, c.id);
  return upsertTrait(g, next);
}

function attachDerived(g: Genome, id: TraitId, generatedImageUrl: string): Genome {
  const t = g.traits[id] as Trait<ImageDnaValue> | undefined;
  const first = t?.candidates[0];
  if (!t || !first) return g;
  const candidates = t.candidates.map((c) =>
    c.id === first.id ? { ...c, derived: { ...c.derived, generatedImageUrl, generatedAt: SRC.addedAt } } : c,
  );
  return upsertTrait(g, { ...t, candidates });
}

/** Genoma resuelto: rasgos principales coronados (estado crowned). */
export function crownedGenome(): Genome {
  let g = proposedGenome();
  const singles: TraitId[] = [
    "logo.primary",
    "typography.primary",
    "typography.secondary",
    ...COLOR_ROLES.map((r) => colorTraitId(r)),
    "message.tagline",
  ];
  for (const id of singles) g = crownTop(g, id);
  g = crownAll(g, "message.tone");
  g = crownAll(g, "claim.forbidden");
  g = crownAll(g, "claim.absolute");

  // Una tarjeta de imagen confirmada trae su render generado (post-Confirmar).
  g = attachDerived(g, imageTraitId("people"), gradientUri("#FFBD1B", "#FF5A5F"));
  g = crownTop(g, imageTraitId("people"));
  g = attachDerived(g, imageTraitId("environments"), gradientUri("#1A1B1E", "#8E8B88"));
  g = crownTop(g, imageTraitId("environments"));

  return g;
}

export const GENOMA_FIXTURES = {
  ghost: ghostGenome,
  proposed: proposedGenome,
  crowned: crownedGenome,
} as const;

export type GenomaFixtureName = keyof typeof GENOMA_FIXTURES;
