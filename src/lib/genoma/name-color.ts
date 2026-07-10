import { hexToRgb } from "./brand-theme-color";
import { NAME_COLOR_TABLE } from "./name-color-table";

function normalizeHex(hex: string): string | null {
  const trimmed = hex.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash.toUpperCase() : null;
}

function colorDistanceSq(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Nombre humano más cercano por distancia euclídea RGB. Siempre devuelve string. */
export function nameColor(hex: string): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return "Color";

  const exact = NAME_COLOR_TABLE.find(([entryHex]) => entryHex.toUpperCase() === normalized);
  if (exact) return exact[1];

  const rgb = hexToRgb(normalized);
  if (!rgb) return "Color";

  let bestName = NAME_COLOR_TABLE[0][1];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [entryHex, entryName] of NAME_COLOR_TABLE) {
    const entryRgb = hexToRgb(entryHex);
    if (!entryRgb) continue;
    const distance = colorDistanceSq(rgb, entryRgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = entryName;
    }
  }

  return bestName;
}
