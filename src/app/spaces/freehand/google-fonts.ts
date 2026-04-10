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

export function googleFontStylesheetHref(family: string): string {
  const name = family.trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,100..900;1,100..900&display=swap`;
}
