/** Mapeo peso/estilo PDF → Designer (sin I/O). */

const WEIGHT_FROM_LABEL: Record<string, number> = {
  thin: 100,
  hairline: 100,
  ultralight: 200,
  extralight: 200,
  light: 300,
  book: 400,
  regular: 400,
  roman: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

const STYLE_FROM_WEIGHT: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

function weightFromLabel(label: string): number {
  const compact = label.replace(/\s+/g, "").toLowerCase();
  for (const [key, weight] of Object.entries(WEIGHT_FROM_LABEL)) {
    if (compact.includes(key)) return weight;
  }
  return 400;
}

function styleLabelForWeight(weight: number, italic: boolean): string {
  const base = STYLE_FROM_WEIGHT[weight] ?? `${weight}`;
  if (!italic) return base;
  if (base === "Regular") return "Italic";
  return `${base} Italic`;
}

export function designerStyleFromPdfWeightLabel(
  weightLabel: string,
  italicHint = false,
): {
  weight: number;
  style: string;
  italic: boolean;
} {
  const italic = italicHint || /italic|oblique/i.test(weightLabel);
  const weight = weightFromLabel(weightLabel);
  return { weight, style: styleLabelForWeight(weight, italic), italic };
}

/** Familias missing que aún no tienen al menos un binario extraído. */
export function remainingMissingPdfFonts(
  fontsMissing: string[],
  extracted: Array<{ family: string }>,
): string[] {
  const covered = new Set(extracted.map((f) => f.family.trim().toLowerCase()));
  return fontsMissing.filter((name) => !covered.has(name.trim().toLowerCase()));
}
