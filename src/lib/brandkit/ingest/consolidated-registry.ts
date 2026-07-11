/**
 * Registro acumulativo «tu brandKit · consolidado» — proyección estable del brandKit
 * actual para el panel izquierdo. No se reinicia entre subidas: refleja lo que ya
 * vive en el brandKit (propuesto o coronado).
 */

import type { Genome } from "../model/trait";
import { buildBookView } from "../projection/book-view";
import { resolveLogoDisplayUrl } from "../projection/logo-display-url";
import type { BrandKitIngestSectionId, BrandKitSectionPreview } from "./types";
import { BRAND_KIT_INGEST_SECTION_ORDER } from "./types";

export type ConsolidatedRowState = {
  status: "empty" | "proposed" | "crowned";
  preview?: BrandKitSectionPreview;
};

const EMPTY_ROW: ConsolidatedRowState = { status: "empty" };

/** Metadatos de proceso que no deben mostrarse como rasgos de voz en la cara. */
export function isVoiceProcessNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^\d+\s*d[ií]as?\b/i.test(t)) return true;
  if (/^\d+\s*(p[aá]ginas?|fuentes?|archivos?)\b/i.test(t)) return true;
  if (/^p\.\s*\d+/i.test(t)) return true;
  return false;
}

export function voiceTraitsForFace(traits: string[]): string[] {
  return traits.filter((t) => !isVoiceProcessNoise(t));
}

function slotStatus(state: "ghost" | "proposed" | "crowned"): ConsolidatedRowState["status"] {
  if (state === "ghost") return "empty";
  return state;
}

export function buildConsolidatedFromGenome(genome: Genome): Record<BrandKitIngestSectionId, ConsolidatedRowState> {
  const view = buildBookView(genome);

  const paletteFilled = view.palette.filter((p) => p.slot.state !== "ghost");
  const paletteStatus: ConsolidatedRowState["status"] =
    paletteFilled.length === 0
      ? "empty"
      : paletteFilled.every((p) => p.slot.state === "crowned")
        ? "crowned"
        : paletteFilled.some((p) => p.slot.state === "crowned")
          ? "crowned"
          : "proposed";

  const logo = view.logo.primary;
  const typo = view.typography.primary;

  const visualItems = view.visualUniverse.reduce((n, v) => n + v.slot.items.length, 0);
  const visualCrowned = view.visualUniverse.some((v) => v.slot.state === "crowned");
  const visualStatus: ConsolidatedRowState["status"] =
    visualItems === 0 ? "empty" : visualCrowned ? "crowned" : "proposed";

  const toneTraits = voiceTraitsForFace(view.voice.tone.items.map((i) => i.value.text));
  const voiceHas =
    view.voice.tagline.state !== "ghost" ||
    toneTraits.length > 0 ||
    view.voice.claimsAbsolute.items.length > 0 ||
    view.voice.claimsForbidden.items.length > 0;
  const voiceCrowned =
    view.voice.tagline.state === "crowned" ||
    view.voice.tone.items.some((i) => i.crowned) ||
    view.voice.claimsAbsolute.items.some((i) => i.crowned) ||
    view.voice.claimsForbidden.items.some((i) => i.crowned);
  const voiceStatus: ConsolidatedRowState["status"] = !voiceHas
    ? "empty"
    : voiceCrowned
      ? "crowned"
      : "proposed";

  const rows: Record<BrandKitIngestSectionId, ConsolidatedRowState> = {
    palette: {
      status: paletteStatus,
      preview:
        paletteFilled.length > 0
          ? { kind: "palette", swatches: paletteFilled.map((p) => p.slot.value!.hex) }
          : undefined,
    },
    logo: {
      status: slotStatus(logo.state),
      preview: logo.value
        ? {
            kind: "logo",
            imageUrl: resolveLogoDisplayUrl(logo.value, logo.derived) ?? logo.value.imageUrl,
          }
        : undefined,
    },
    typography: {
      status: slotStatus(typo.state),
      preview: typo.value
        ? { kind: "typography", family: typo.value.family, weights: typo.value.weights }
        : undefined,
    },
    visual: {
      status: visualStatus,
      preview: visualItems > 0 ? { kind: "visual", count: visualItems } : undefined,
    },
    voice: {
      status: voiceStatus,
      preview:
        toneTraits.length > 0 || (view.voice.tagline.value && !isVoiceProcessNoise(view.voice.tagline.value.text))
          ? {
              kind: "voice",
              traits: [
                ...(view.voice.tagline.value && !isVoiceProcessNoise(view.voice.tagline.value.text)
                  ? [view.voice.tagline.value.text]
                  : []),
                ...toneTraits,
              ].slice(0, 3),
            }
          : undefined,
    },
  };

  for (const id of BRAND_KIT_INGEST_SECTION_ORDER) {
    if (!rows[id]) rows[id] = EMPTY_ROW;
  }
  return rows;
}
