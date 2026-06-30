import type { BrainVisualImageAnalysis, BrainVisualStyle, BrainVisualStyleSlotKey } from "@/app/spaces/project-assets-metadata";
import { defaultBrainVisualStyle } from "@/app/spaces/project-assets-metadata";
import { isTrustedRemoteVisionAnalysis } from "./brain-brand-summary";
import { aggregateVisualPatterns, isExcludedFromVisualDna } from "./brain-visual-analysis";

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Construye textos de los cuatro slots de `visualStyle` a partir de análisis con visión remota fiable.
 * No toca imágenes generadas ni URLs; solo `description` / `prompt` y `source: "auto"`.
 */
export function buildVisualStyleFromVisionAnalyses(
  analyses: readonly BrainVisualImageAnalysis[] | undefined,
): BrainVisualStyle | null {
  const list = analyses ?? [];
  const trusted = list.filter(isTrustedRemoteVisionAnalysis);
  if (!trusted.length) return null;

  const active = list.filter((a) => !isExcludedFromVisualDna(a));
  const basis = active.length ? active : trusted;
  const agg = aggregateVisualPatterns(basis);
  const n = trusted.length;

  const subj = agg.frequentSubjects.slice(0, 8).join(", ");
  const mood = agg.dominantMoods.slice(0, 5).join(", ");
  const sty = agg.recurringStyles.slice(0, 6).join(", ");
  const comp = agg.compositionNotes.slice(0, 5).join(", ");
  const pal = [...agg.dominantPalette.slice(0, 6), ...agg.dominantSecondaryPalette.slice(0, 4)].filter(Boolean).join(", ");
  const pc = agg.peopleClothingNotes.slice(0, 5).join(", ");
  const gfx = agg.graphicStyleNotes.slice(0, 5).join(", ");
  const imb = agg.implicitBrandMessages.slice(0, 3).join(" · ");

  const base = defaultBrainVisualStyle();

  const protagonist = clip(
    [
      `A partir de ${n} referencia(s) analizadas con visión remota (sin fallback).`,
      subj ? `Sujetos y objetos recurrentes: ${subj}.` : "",
      imb ? `Lecturas visuales frecuentes: ${imb}.` : "",
      gfx ? `Materiales y acabados: ${gfx}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    520,
  );

  const environment = clip(
    [
      `Entornos alineados con el lote de referencias.`,
      comp ? `Composición y espacio: ${comp}.` : "",
      mood ? `Atmósfera: ${mood}.` : "",
      sty ? `Estética dominante: ${sty}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    520,
  );

  const textures = clip(
    [
      `Texturas y materiales deducidos de referencias reales.`,
      pal ? `Paleta recurrente: ${pal}.` : "",
      gfx ? `Detalle gráfico: ${gfx}.` : "",
      sty ? `Línea estética: ${sty}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    480,
  );

  const people = clip(
    [
      `Personas y vestuario coherentes con referencias analizadas.`,
      pc ? `Notas de figura / ropa: ${pc}.` : "",
      subj ? `Props o contexto humano: ${subj}.` : "",
      mood ? `Sensación: ${mood}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    520,
  );

  const slot = (description: string, fallback: string) =>
    clip(description || fallback, 520) || fallback;

  return {
    protagonist: {
      ...base.protagonist,
      description: slot(protagonist, base.protagonist.description),
      prompt: "",
      source: "auto",
    },
    environment: {
      ...base.environment,
      description: slot(environment, base.environment.description),
      prompt: "",
      source: "auto",
    },
    textures: {
      ...base.textures,
      description: slot(textures, base.textures.description),
      prompt: "",
      source: "auto",
    },
    people: {
      ...base.people,
      description: slot(people, base.people.description),
      prompt: "",
      source: "auto",
    },
    objects: {
      ...base.objects,
      description: slot("", base.objects.description),
      prompt: "",
      source: "auto",
    },
  };
}

/** Conserva slots editados a mano (`source: "manual"`) e imágenes existentes. */
export function mergeVisualStyleWithVisionDerivedDescriptions(
  prev: BrainVisualStyle,
  derived: BrainVisualStyle,
): BrainVisualStyle {
  const keys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people", "objects"];
  const out = { ...prev };
  for (const k of keys) {
    const p = prev[k];
    const d = derived[k];
    if (p.source === "manual") {
      out[k] = { ...p };
      continue;
    }
    out[k] = {
      ...d,
      imageUrl: p.imageUrl,
      imageS3Key: p.imageS3Key,
      title: p.title,
      source: p.source ?? "auto",
    };
  }
  return out;
}
