import type {
  EssenceValue,
  SlotId,
  SlotState,
  TypographyValue,
  VisualWorldValue,
  VoiceValue,
} from "../brand-kit-types";
import { brandKitLocaleEs } from "../brand-kit-locale.es";
import { resolveBrandImageStyle } from "../brand-kit-visual-style";

export type BrandKitSlotTextEditField = {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
};

export type BrandKitSlotTextEditConfig = {
  fields: BrandKitSlotTextEditField[];
  applyValues: (values: Record<string, string>) => unknown;
};

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function beliefsToText(beliefs: EssenceValue["beliefs"]): string {
  return (beliefs ?? [])
    .map((belief) => (belief.explanation ? `${belief.label} — ${belief.explanation}` : belief.label))
    .join("\n");
}

function textToBeliefs(text: string): EssenceValue["beliefs"] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split("—");
      const trimmedLabel = (label ?? "").trim();
      const explanation = rest.join("—").trim();
      return explanation ? { label: trimmedLabel, explanation } : { label: trimmedLabel };
    });
}

function pickPrimarySecondary(families: TypographyValue["families"]) {
  const primary =
    families.find((family) => family.role === "heading" || family.role === "display") ?? families[0];
  const secondary =
    families.find((family) => family.role === "body" && family.family !== primary?.family) ??
    families.find((family) => family.family !== primary?.family) ??
    families[1];
  return { primary, secondary };
}

/** Slots cuyo contenido textual se edita con BrandKitTextEditPanel. */
export function isTextEditableSlotId(slotId: SlotId): boolean {
  return slotId === "essence" || slotId === "voice" || slotId === "visualWorld" || slotId === "typography";
}

export function canEditSlotText(slot: SlotState<unknown> | undefined, slotId: SlotId): boolean {
  if (!slot || slot.locked || slot.status !== "resolved" || !isTextEditableSlotId(slotId)) return false;
  if (slotId === "essence") return Boolean((slot.value as EssenceValue | undefined)?.summary);
  if (slotId === "voice") return Boolean((slot.value as VoiceValue | undefined)?.summary);
  if (slotId === "visualWorld") return Boolean((slot.value as VisualWorldValue | undefined)?.summary);
  if (slotId === "typography") {
    return Boolean((slot.value as TypographyValue | undefined)?.families?.length);
  }
  return false;
}

function hasTextEditContent(slot: SlotState<unknown>, slotId: SlotId): boolean {
  if (!isTextEditableSlotId(slotId) || slot.status === "empty") return false;
  if (slotId === "essence") return Boolean((slot.value as EssenceValue | undefined)?.summary);
  if (slotId === "voice") return Boolean((slot.value as VoiceValue | undefined)?.summary);
  if (slotId === "visualWorld") return Boolean((slot.value as VisualWorldValue | undefined)?.summary);
  if (slotId === "typography") {
    return Boolean((slot.value as TypographyValue | undefined)?.families?.length);
  }
  return false;
}

export function buildSlotTextEditConfig(
  slotId: SlotId,
  slot: SlotState<unknown>,
): BrandKitSlotTextEditConfig | null {
  if (!hasTextEditContent(slot, slotId)) return null;

  if (slotId === "essence") {
    const essence = slot.value as EssenceValue;
    return {
      fields: [
        { id: "summary", label: "Resumen", value: essence.summary, multiline: true },
        { id: "headline", label: brandKitLocaleEs.headlineDetected, value: essence.headline ?? "" },
        { id: "promise", label: brandKitLocaleEs.promise, value: essence.promise ?? "", multiline: true },
        { id: "purpose", label: brandKitLocaleEs.purpose, value: essence.purpose ?? "", multiline: true },
        { id: "pov", label: brandKitLocaleEs.pov, value: essence.pov ?? "", multiline: true },
        {
          id: "beliefs",
          label: brandKitLocaleEs.beliefs,
          value: beliefsToText(essence.beliefs ?? []),
          multiline: true,
        },
      ],
      applyValues: (values) =>
        ({
          ...essence,
          summary: values.summary.trim(),
          headline: values.headline.trim() || undefined,
          promise: values.promise.trim() || undefined,
          purpose: values.purpose.trim() || undefined,
          pov: values.pov.trim() || undefined,
          beliefs: textToBeliefs(values.beliefs),
        }) satisfies EssenceValue,
    };
  }

  if (slotId === "voice") {
    const voice = slot.value as VoiceValue;
    return {
      fields: [
        { id: "summary", label: "Resumen", value: voice.summary, multiline: true },
        {
          id: "descriptors",
          label: "Descriptores",
          value: voice.descriptors.join(", "),
          multiline: true,
        },
        { id: "rules", label: brandKitLocaleEs.writingRules, value: voice.rules.join("\n"), multiline: true },
        { id: "avoid", label: "Evitar", value: (voice.avoid ?? []).join("\n"), multiline: true },
      ],
      applyValues: (values) =>
        ({
          ...voice,
          summary: values.summary.trim(),
          descriptors: values.descriptors
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean),
          rules: linesToList(values.rules),
          avoid: linesToList(values.avoid),
        }) satisfies VoiceValue,
    };
  }

  if (slotId === "visualWorld") {
    const visualWorld = slot.value as VisualWorldValue;
    return {
      fields: [
        { id: "summary", label: "Resumen", value: visualWorld.summary, multiline: true },
        {
          id: "moodTags",
          label: "Mood",
          value: (visualWorld.moodTags ?? []).join(", "),
          multiline: true,
        },
        {
          id: "imageMedium",
          label: brandKitLocaleEs.imageMedium,
          value: visualWorld.imageMedium ?? resolveBrandImageStyle(visualWorld).medium,
        },
        {
          id: "imageStyleTags",
          label: brandKitLocaleEs.imageStyleTags,
          value: (visualWorld.imageStyleTags ?? []).join(", "),
          multiline: true,
        },
        {
          id: "visualTraits",
          label: brandKitLocaleEs.visualTerritory,
          value: (visualWorld.visualTraits ?? []).join("\n"),
          multiline: true,
        },
        {
          id: "limits",
          label: brandKitLocaleEs.limits,
          value: (visualWorld.limits ?? []).join("\n"),
          multiline: true,
        },
      ],
      applyValues: (values) =>
        ({
          ...visualWorld,
          summary: values.summary.trim(),
          moodTags: values.moodTags
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean),
          imageMedium: values.imageMedium.trim() || undefined,
          imageStyleTags: values.imageStyleTags
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean),
          visualTraits: linesToList(values.visualTraits),
          limits: linesToList(values.limits),
        }) satisfies VisualWorldValue,
    };
  }

  if (slotId === "typography") {
    const typography = slot.value as TypographyValue;
    const { primary, secondary } = pickPrimarySecondary(typography.families ?? []);
    return {
      fields: [
        { id: "primary", label: brandKitLocaleEs.typePrimary, value: primary?.family ?? "" },
        { id: "secondary", label: brandKitLocaleEs.typeSecondary, value: secondary?.family ?? "" },
      ],
      applyValues: (values) => {
        const nextFamilies = typography.families.map((family) => {
          if (family.family === primary?.family) {
            return { ...family, family: values.primary.trim() || family.family };
          }
          if (family.family === secondary?.family) {
            return { ...family, family: values.secondary.trim() || family.family };
          }
          return family;
        });
        return { families: nextFamilies } satisfies TypographyValue;
      },
    };
  }

  return null;
}
