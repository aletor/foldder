export function hexNormalize(raw: string): string | null {
  const value = raw.trim();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const h = value.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Convierte hex, rgb() y rgba() a #RRGGBB. */
export function parseColorToHex(raw: string): string | null {
  const value = raw.trim();
  const hex = hexNormalize(value);
  if (hex) return hex;

  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value);
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }

  return null;
}

export function isBoilerplateCssVarName(varName: string): boolean {
  const name = varName.toLowerCase();
  if (name.startsWith("tw-") || name.startsWith("--tw-")) return true;
  if (/ring-offset|ring-color|shadow|outline|border-color|foreground|background|muted|popover|card|destructive|sidebar|input|chart/i.test(name)) {
    return true;
  }
  if (/^color$/i.test(name) || name.endsWith("-foreground") || name.endsWith("-background")) return true;
  return false;
}

export function scoreBrandCssVarName(varName: string): number {
  const name = varName.toLowerCase();
  if (isBoilerplateCssVarName(name)) return -100;
  if (/primary|brand-main|brand-primary|main-color/.test(name)) return 100;
  if (/brand|accent|secondary|highlight|cta/.test(name)) return 80;
  if (/color/.test(name)) return 20;
  return 0;
}

export function isNearNeutralHex(hex: string): boolean {
  const norm = hexNormalize(hex);
  if (!norm) return true;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 18 && (max > 230 || max < 30)) return true;
  return false;
}

export function sanitizeFontFamily(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let family = raw.trim().replace(/^["']|["']$/g, "");
  if (!family) return null;
  if (/^var\s*\(/i.test(family)) return null;
  if (/^--/.test(family)) return null;
  if (/^(inherit|initial|unset|revert|system-ui|ui-sans-serif|ui-serif|ui-monospace)$/i.test(family)) return null;
  if (/^(sans-serif|serif|monospace|cursive|fantasy)$/i.test(family)) return null;
  if (family.length < 2 || family.length > 60) return null;
  if (/[{}();]/.test(family)) return null;
  return family;
}

export function mergeFontFamilies(...groups: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const raw of group) {
      const family = sanitizeFontFamily(raw);
      if (!family) continue;
      const key = family.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(family);
    }
  }
  return out;
}

export type RankedPaletteColor = {
  hex: string;
  provenance: import("../genoma-types").Provenance;
  weight: number;
};

export function rankPaletteColors(
  entries: { hex: string; provenance: import("../genoma-types").Provenance; varName?: string; weight?: number }[],
): RankedPaletteColor[] {
  const byHex = new Map<string, RankedPaletteColor>();

  for (const entry of entries) {
    const hex = parseColorToHex(entry.hex) ?? hexNormalize(entry.hex);
    if (!hex) continue;

    const varScore = entry.varName ? scoreBrandCssVarName(entry.varName) : 0;
    const neutralPenalty = isNearNeutralHex(hex) && varScore < 50 ? -40 : 0;
    const weight = (entry.weight ?? 0) + varScore + neutralPenalty;
    if (weight < -50) continue;

    const prev = byHex.get(hex);
    if (!prev || weight > prev.weight) {
      byHex.set(hex, { hex, provenance: entry.provenance, weight });
    }
  }

  return [...byHex.values()]
    .sort((a, b) => b.weight - a.weight)
    .filter((entry, index) => !(isNearNeutralHex(entry.hex) && index === 0))
    .slice(0, 6);
}
