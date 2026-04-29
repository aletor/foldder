export interface GoogleFontCatalogEntry {
  family: string;
  category: string;
}

/** Catálogo de Google Fonts soportado por el selector/modal de Designer. */
export const GOOGLE_FONTS_LIBRARY: GoogleFontCatalogEntry[] = [
  { family: "Alegreya", category: "Serif" },
  { family: "Alfa Slab One", category: "Display" },
  { family: "Amatic SC", category: "Handwriting" },
  { family: "Anton", category: "Display" },
  { family: "Archivo", category: "Sans" },
  { family: "Archivo Black", category: "Display" },
  { family: "Arvo", category: "Serif" },
  { family: "Asap", category: "Sans" },
  { family: "Assistant", category: "Sans" },
  { family: "Barlow", category: "Sans" },
  { family: "Bebas Neue", category: "Display" },
  { family: "Bitter", category: "Serif" },
  { family: "Bungee", category: "Display" },
  { family: "Cabin", category: "Sans" },
  { family: "Caveat", category: "Handwriting" },
  { family: "Cinzel", category: "Display" },
  { family: "Cormorant Garamond", category: "Serif" },
  { family: "Crimson Pro", category: "Serif" },
  { family: "Dancing Script", category: "Handwriting" },
  { family: "DM Sans", category: "Sans" },
  { family: "DM Serif Display", category: "Serif" },
  { family: "EB Garamond", category: "Serif" },
  { family: "Figtree", category: "Sans" },
  { family: "Fira Code", category: "Mono" },
  { family: "Fjalla One", category: "Display" },
  { family: "Great Vibes", category: "Handwriting" },
  { family: "Hind", category: "Sans" },
  { family: "IBM Plex Mono", category: "Mono" },
  { family: "IBM Plex Sans", category: "Sans" },
  { family: "Inconsolata", category: "Mono" },
  { family: "Inter", category: "Sans" },
  { family: "JetBrains Mono", category: "Mono" },
  { family: "Josefin Sans", category: "Sans" },
  { family: "Karla", category: "Sans" },
  { family: "Lato", category: "Sans" },
  { family: "Libre Baskerville", category: "Serif" },
  { family: "Lobster", category: "Display" },
  { family: "Lora", category: "Serif" },
  { family: "Manrope", category: "Sans" },
  { family: "Merriweather", category: "Serif" },
  { family: "Montserrat", category: "Sans" },
  { family: "Mukta", category: "Sans" },
  { family: "Noto Sans", category: "Sans" },
  { family: "Noto Serif", category: "Serif" },
  { family: "Nunito", category: "Sans" },
  { family: "Open Sans", category: "Sans" },
  { family: "Oswald", category: "Display" },
  { family: "Outfit", category: "Sans" },
  { family: "Pacifico", category: "Display" },
  { family: "Patrick Hand", category: "Handwriting" },
  { family: "Permanent Marker", category: "Handwriting" },
  { family: "Playfair Display", category: "Serif" },
  { family: "Plus Jakarta Sans", category: "Sans" },
  { family: "Poppins", category: "Sans" },
  { family: "Prata", category: "Serif" },
  { family: "PT Serif", category: "Serif" },
  { family: "Quicksand", category: "Sans" },
  { family: "Raleway", category: "Sans" },
  { family: "Righteous", category: "Display" },
  { family: "Roboto", category: "Sans" },
  { family: "Roboto Mono", category: "Mono" },
  { family: "Rubik", category: "Sans" },
  { family: "Satisfy", category: "Handwriting" },
  { family: "Sora", category: "Sans" },
  { family: "Source Code Pro", category: "Mono" },
  { family: "Source Sans 3", category: "Sans" },
  { family: "Source Serif 4", category: "Serif" },
  { family: "Space Grotesk", category: "Sans" },
  { family: "Space Mono", category: "Mono" },
  { family: "Spectral", category: "Serif" },
  { family: "Urbanist", category: "Sans" },
  { family: "Work Sans", category: "Sans" },
];

/**
 * Recomendaciones curadas para cubrir estilos distintos (no solo sans parecidas).
 * Objetivo: variedad visual rápida en el picker.
 */
const GOOGLE_FONTS_POPULAR_IDS = new Set<string>([
  // Sans
  "Inter",
  "Manrope",
  "Space Grotesk",
  // Serif
  "Playfair Display",
  "Merriweather",
  "Cormorant Garamond",
  // Display
  "Bebas Neue",
  "Oswald",
  "DM Serif Display",
  // Handwriting
  "Caveat",
  "Dancing Script",
  "Amatic SC",
  // Mono
  "JetBrains Mono",
  "IBM Plex Mono",
  "Fira Code",
]);

/** Curated Google Fonts for quick access in the dropdown (subset of `GOOGLE_FONTS_LIBRARY`). */
export const GOOGLE_FONTS_POPULAR: GoogleFontCatalogEntry[] = GOOGLE_FONTS_LIBRARY.filter((g) =>
  GOOGLE_FONTS_POPULAR_IDS.has(g.family),
);

/** Familia y peso por defecto (Helvetica Book); debe coincidir con el preset `h-book` para el `<select>`. */
export const DEFAULT_DOCUMENT_FONT_FAMILY = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
/** Peso numérico (Book) alineado con CSS `font-weight: 450`. */
export const DEFAULT_DOCUMENT_FONT_WEIGHT = 450;

/**
 * Helvetica / Helvetica Neue vía fuentes del sistema (no se embeben .woff: licencia).
 * En macOS/iOS suelen resolverse bien; en Windows/Linux puede hacerse fallback a Arial.
 * Cada opción fija `font-weight` al elegirla (Light 300, Book 450, Regular 400, Black 900).
 * Orden: **Helvetica** primero (Book por defecto del documento), luego Helvetica Neue.
 */
export const DESIGNER_SYSTEM_FONT_PRESETS: { id: string; label: string; family: string; weight: number }[] = [
  { id: "h-book", label: "Helvetica · Book", family: DEFAULT_DOCUMENT_FONT_FAMILY, weight: 450 },
  { id: "h-light", label: "Helvetica · Light", family: DEFAULT_DOCUMENT_FONT_FAMILY, weight: 300 },
  { id: "h-regular", label: "Helvetica · Regular", family: DEFAULT_DOCUMENT_FONT_FAMILY, weight: 400 },
  { id: "h-black", label: "Helvetica · Black", family: DEFAULT_DOCUMENT_FONT_FAMILY, weight: 900 },
  { id: "hn-light", label: "Helvetica Neue · Light", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 300 },
  { id: "hn-book", label: "Helvetica Neue · Book", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 450 },
  { id: "hn-regular", label: "Helvetica Neue · Regular", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 400 },
  { id: "hn-black", label: "Helvetica Neue · Black", family: '"Helvetica Neue", "Helvetica Neue LT Pro", Helvetica, Arial, sans-serif', weight: 900 },
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
  if (GOOGLE_FONTS_LIBRARY.some((g) => g.family === primary)) return primary;
  return "";
}

export function googleFontStylesheetHref(family: string): string {
  const name = family.trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,100..900;1,100..900&display=swap`;
}
