/** Curated Google Fonts for Freehand typography (CSS family names). */
export const GOOGLE_FONTS_POPULAR: { family: string; category: string }[] = [
  { family: "Inter", category: "Sans" },
  { family: "Roboto", category: "Sans" },
  { family: "Open Sans", category: "Sans" },
  { family: "Lato", category: "Sans" },
  { family: "Montserrat", category: "Sans" },
  { family: "Source Sans 3", category: "Sans" },
  { family: "Work Sans", category: "Sans" },
  { family: "IBM Plex Sans", category: "Sans" },
  { family: "Playfair Display", category: "Serif" },
  { family: "Merriweather", category: "Serif" },
  { family: "Libre Baskerville", category: "Serif" },
  { family: "DM Serif Display", category: "Serif" },
  { family: "Oswald", category: "Display" },
  { family: "Raleway", category: "Sans" },
  { family: "Nunito", category: "Sans" },
];

/**
 * Helvetica / Helvetica Neue vía fuentes del sistema (no se embeben .woff: licencia).
 * En macOS/iOS suelen resolverse bien; en Windows/Linux puede hacerse fallback a Arial.
 * Cada opción fija `font-weight` al elegirla (Light 300, Book 450, Regular 400, Black 900).
 */
export const DESIGNER_SYSTEM_FONT_PRESETS: { id: string; label: string; family: string; weight: number }[] = [
  { id: "hn-light", label: "Helvetica Neue · Light", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 300 },
  { id: "hn-book", label: "Helvetica Neue · Book", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 450 },
  { id: "hn-regular", label: "Helvetica Neue · Regular", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 400 },
  { id: "hn-black", label: "Helvetica Neue · Black", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 900 },
  { id: "h-light", label: "Helvetica · Light", family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', weight: 300 },
  { id: "h-book", label: "Helvetica · Book", family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', weight: 450 },
  { id: "h-regular", label: "Helvetica · Regular", family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', weight: 400 },
  { id: "h-black", label: "Helvetica · Black", family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', weight: 900 },
];

export const DESIGNER_FONT_PRESET_VALUE_PREFIX = "__preset:";

export function findDesignerSystemFontPreset(
  fontFamily: string,
  fontWeight: number,
): (typeof DESIGNER_SYSTEM_FONT_PRESETS)[number] | undefined {
  const norm = fontFamily.replace(/\s+/g, " ").trim();
  return DESIGNER_SYSTEM_FONT_PRESETS.find(
    (p) => p.family.replace(/\s+/g, " ").trim() === norm && p.weight === fontWeight,
  );
}

/** Valor controlado del `<select>` de fuentes (Google por nombre, preset con prefijo). */
export function designerFontSelectControlValue(fontFamily: string, fontWeight: number): string {
  const preset = findDesignerSystemFontPreset(fontFamily, fontWeight);
  if (preset) return `${DESIGNER_FONT_PRESET_VALUE_PREFIX}${preset.id}`;
  const primary = fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  if (GOOGLE_FONTS_POPULAR.some((g) => g.family === primary)) return primary;
  return "";
}

export function googleFontStylesheetHref(family: string): string {
  const name = family.trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,100..900;1,100..900&display=swap`;
}
