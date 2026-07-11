import type { MotionDna } from "./site-types";

export type MotionDnaInference = {
  motionDNA: MotionDna;
  source: string;
};

const MOTION_DNA_RULES: Array<{ motionDNA: MotionDna; label: string; pattern: RegExp }> = [
  {
    motionDNA: "soft",
    label: "Editorial sobrio",
    pattern: /sobri|elegant|premium|editorial|serio|corporat|clásic|classic/i,
  },
  {
    motionDNA: "expo",
    label: "Energía dinámica",
    pattern: /enérgic|energic|joven|dinámic|dinamic|atrevid|bold|vibrante|urban/i,
  },
  {
    motionDNA: "bounce",
    label: "Tono cercano",
    pattern: /divertid|juguet|playful|fresc|cercan/i,
  },
  {
    motionDNA: "linear",
    label: "Precisión funcional",
    pattern: /técnic|tecnic|preciso|minimal|funcional/i,
  },
];

/** Inferencia determinista Motion DNA (spec §5.1). */
export function inferMotionDnaFromText(text: string): MotionDnaInference {
  const haystack = text.trim();
  if (!haystack) {
    return { motionDNA: "soft", source: "Predeterminado (sin voz)" };
  }

  for (const rule of MOTION_DNA_RULES) {
    if (rule.pattern.test(haystack)) {
      return { motionDNA: rule.motionDNA, source: `Inferido de la voz: ${rule.label}` };
    }
  }

  return { motionDNA: "soft", source: "Inferido de la voz: Editorial sobrio" };
}
