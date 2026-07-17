import { parsePdfFontResourceName } from "@/lib/brain/pdf-font-extract";
import {
  DEFAULT_DOCUMENT_FONT_FAMILY,
  DEFAULT_DOCUMENT_FONT_WEIGHT,
  GOOGLE_FONTS_LIBRARY,
} from "@/app/spaces/freehand/google-fonts";

export type MappedPdfFont = {
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  /** Nombre de familia resuelto (sin stack CSS). */
  familyLabel: string;
  matched: boolean;
  sourceName: string;
};

const SYSTEM_FAMILY_STACKS: Record<string, string> = {
  helvetica: DEFAULT_DOCUMENT_FONT_FAMILY,
  arial: 'Arial, Helvetica, "Helvetica Neue", sans-serif',
  "helvetica neue": '"Helvetica Neue", Helvetica, Arial, sans-serif',
  times: 'Times, "Times New Roman", serif',
  "times new roman": '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
  "courier new": '"Courier New", Courier, monospace',
  georgia: "Georgia, serif",
  verdana: "Verdana, Geneva, sans-serif",
  garamond: 'Garamond, "EB Garamond", serif',
  trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
};

const WEIGHT_FROM_LABEL: Record<string, number> = {
  thin: 100,
  hairline: 100,
  ultralight: 200,
  extralight: 200,
  light: 300,
  book: 450,
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

function normalizeKey(name: string): string {
  return name
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/^g_d\d+_f\d+$/i, "")
    .replace(/[,_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function weightFromLabel(label: string): number {
  const compact = label.replace(/\s+/g, "").toLowerCase();
  for (const [key, weight] of Object.entries(WEIGHT_FROM_LABEL)) {
    if (compact.includes(key)) return weight;
  }
  return DEFAULT_DOCUMENT_FONT_WEIGHT;
}

function findGoogleFamily(familyHint: string): string | null {
  const key = normalizeKey(familyHint).replace(/\s+/g, "");
  if (!key) return null;
  const exact = GOOGLE_FONTS_LIBRARY.find((g) => normalizeKey(g.family).replace(/\s+/g, "") === key);
  if (exact) return exact.family;
  const starts = GOOGLE_FONTS_LIBRARY.find((g) =>
    normalizeKey(g.family).replace(/\s+/g, "").startsWith(key),
  );
  if (starts && key.length >= 4) return starts.family;
  const includes = GOOGLE_FONTS_LIBRARY.find((g) =>
    normalizeKey(g.family).replace(/\s+/g, "").includes(key),
  );
  if (includes && key.length >= 5) return includes.family;
  return null;
}

/**
 * Mapea un nombre de fuente PDF (resource / TextStyle.fontFamily) a tipografía Designer.
 * Determinista, sin LLM.
 */
export function mapPdfFontToDesigner(rawName: string | undefined | null): MappedPdfFont {
  const sourceName = (rawName ?? "").trim();
  if (!sourceName) {
    return {
      fontFamily: DEFAULT_DOCUMENT_FONT_FAMILY,
      fontWeight: DEFAULT_DOCUMENT_FONT_WEIGHT,
      italic: false,
      familyLabel: "Helvetica",
      matched: false,
      sourceName: "",
    };
  }

  const parsed = parsePdfFontResourceName(sourceName);
  const familyHint = parsed?.family ?? sourceName.replace(/^[A-Z]{6}\+/, "").split("-")[0] ?? sourceName;
  const weightLabel = parsed?.weight ?? "";
  const italic = /italic|oblique/i.test(sourceName) || /italic|oblique/i.test(weightLabel);
  const fontWeight = weightFromLabel(weightLabel || sourceName);

  const systemKey = normalizeKey(familyHint);
  const systemStack = SYSTEM_FAMILY_STACKS[systemKey];
  if (systemStack) {
    return {
      fontFamily: systemStack,
      fontWeight,
      italic,
      familyLabel: familyHint,
      matched: true,
      sourceName,
    };
  }

  const google = findGoogleFamily(familyHint);
  if (google) {
    return {
      fontFamily: google,
      fontWeight,
      italic,
      familyLabel: google,
      matched: true,
      sourceName,
    };
  }

  // Fallback: usar el nombre limpio como familia CSS (puede no estar instalada).
  return {
    fontFamily: `"${familyHint.replace(/"/g, "")}", ${DEFAULT_DOCUMENT_FONT_FAMILY}`,
    fontWeight,
    italic,
    familyLabel: familyHint,
    matched: false,
    sourceName,
  };
}

export function collectMissingPdfFonts(fontNames: Array<string | undefined>): string[] {
  const missing = new Set<string>();
  for (const name of fontNames) {
    if (!name) continue;
    const mapped = mapPdfFontToDesigner(name);
    if (!mapped.matched && mapped.familyLabel) missing.add(mapped.familyLabel);
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}
