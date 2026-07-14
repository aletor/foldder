import type { BrandKitDocument, PaletteValue, TypographyValue } from "./brand-kit-types";
import {
  buildFontStack,
  cssFontFamilyName,
  normalizeFontDisplayName,
} from "./normalize-font-display-name";

export type BrandThemePolarity = "light" | "dark";

export type BrandThemeResult = {
  ready: boolean;
  polarity: BrandThemePolarity;
  vars: Record<string, string>;
  fingerprint: string;
};

type Hsl = { h: number; s: number; l: number };

const MIN_BODY_CONTRAST = 4.5;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lum = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lum - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function mixHex(hexA: string, hexB: string, amountB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const t = Math.max(0, Math.min(1, amountB));
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

function normalizeHex(hex: string | undefined): string | null {
  if (!hex?.trim()) return null;
  const trimmed = hex.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash.toUpperCase() : null;
}

function roleHex(palette: PaletteValue, role: PaletteValue["colors"][number]["role"]): string | null {
  return normalizeHex(palette.colors.find((color) => color.role === role)?.hex);
}

function clampSaturationPercent(value: number): number {
  return Math.max(20, Math.min(35, value));
}

function editorialSurface(primaryHex: string, polarity: BrandThemePolarity): string {
  const hsl = hexToHsl(primaryHex);
  if (!hsl) return polarity === "dark" ? "#1E1E22" : "#F5F4F1";
  const saturation = clampSaturationPercent(hsl.s <= 8 ? 12 : hsl.s * 0.45);
  const lightness = polarity === "dark" ? 13 : 96;
  return hslToHex(hsl.h, saturation, lightness);
}

function raisedSurface(pageHex: string, polarity: BrandThemePolarity): string {
  const hsl = hexToHsl(pageHex);
  if (!hsl) return pageHex;
  const delta = polarity === "dark" ? 4 : -4;
  return hslToHex(hsl.h, hsl.s, Math.max(4, Math.min(98, hsl.l + delta)));
}

function pickInk(pageHex: string, palette: PaletteValue, primaryHex: string, polarity: BrandThemePolarity): string | null {
  const candidates = [
    roleHex(palette, "text"),
    roleHex(palette, "neutral"),
    mixHex(primaryHex, polarity === "dark" ? "#FFFFFF" : "#000000", polarity === "dark" ? 0.82 : 0.78),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (contrastRatio(candidate, pageHex) >= MIN_BODY_CONTRAST) return candidate;
  }
  return null;
}

function pickCtaColors(accentHex: string, inkHex: string, pageHex: string): { bg: string; ink: string } {
  if (contrastRatio(accentHex, "#FFFFFF") >= MIN_BODY_CONTRAST) {
    return { bg: accentHex, ink: "#FFFFFF" };
  }
  if (contrastRatio(accentHex, "#0A0A0A") >= MIN_BODY_CONTRAST) {
    return { bg: accentHex, ink: "#0A0A0A" };
  }
  return { bg: inkHex, ink: pageHex };
}

function pickTypographyStacks(typography?: TypographyValue): { display: string; text: string } {
  const families = typography?.families ?? [];
  const displayFamily =
    families.find((family) => family.role === "display" || family.role === "heading") ?? families[0];
  const textFamily =
    families.find((family) => family.role === "body" && family.family !== displayFamily?.family) ??
    families.find((family) => family.family !== displayFamily?.family) ??
    displayFamily;

  const displayName =
    normalizeFontDisplayName(displayFamily?.family) ?? displayFamily?.family ?? "Helvetica Neue";
  const textName = normalizeFontDisplayName(textFamily?.family) ?? textFamily?.family ?? displayName;

  return {
    display: buildFontStack(displayName, displayFamily?.fallbacks ?? ["Helvetica", "Arial", "sans-serif"]),
    text: buildFontStack(textName, textFamily?.fallbacks ?? ["Helvetica", "Arial", "sans-serif"]),
  };
}

export function isPaletteThemeSource(doc: BrandKitDocument): boolean {
  const slot = doc.slots.palette;
  return Boolean(slot.locked || slot.status === "resolved");
}

export function deriveBrandThemeFromDoc(doc: BrandKitDocument): BrandThemeResult {
  const empty: BrandThemeResult = { ready: false, polarity: "light", vars: {}, fingerprint: "" };
  if (!isPaletteThemeSource(doc)) return empty;

  const palette = doc.slots.palette.value as PaletteValue | undefined;
  if (!palette?.colors?.length) return empty;

  const primary = roleHex(palette, "primary");
  if (!primary) return empty;

  const accent = roleHex(palette, "accent") ?? roleHex(palette, "secondary") ?? primary;
  const secondary = roleHex(palette, "secondary") ?? accent;
  const neutral = roleHex(palette, "neutral") ?? roleHex(palette, "background") ?? secondary;

  const background = roleHex(palette, "background");
  const polarity: BrandThemePolarity =
    (background && relativeLuminance(background) < 0.35) ||
    (neutral && relativeLuminance(neutral) < 0.35)
      ? "dark"
      : "light";

  const surfacePage = editorialSurface(primary, polarity);
  const surfaceRaised = raisedSurface(surfacePage, polarity);
  const ink = pickInk(surfacePage, palette, primary, polarity);
  if (!ink) return empty;

  const inkSoft = mixHex(ink, surfacePage, 0.35);
  const rule = mixHex(ink, surfacePage, 0.85);
  const cta = pickCtaColors(accent, ink, surfacePage);
  const plinthAuto = mixHex(surfaceRaised, "#FFFFFF", polarity === "dark" ? 0.72 : 0.08);
  const onPrimary = relativeLuminance(primary) > 0.45 ? "#1A1A1A" : "#FFFFFF";
  const fonts = pickTypographyStacks(doc.slots.typography.value as TypographyValue | undefined);

  const vars: Record<string, string> = {
    "--brand-primary": primary,
    "--brand-accent": accent,
    "--brand-secondary": secondary,
    "--brand-neutral": neutral,
    "--brand-surface-page": surfacePage,
    "--brand-surface-raised": surfaceRaised,
    "--brand-ink": ink,
    "--brand-ink-soft": inkSoft,
    "--brand-rule": rule,
    "--brand-on-primary": onPrimary,
    "--brand-font-display": fonts.display,
    "--brand-font-text": fonts.text,
    "--brand-cta-bg": cta.bg,
    "--brand-cta-ink": cta.ink,
    "--brand-plinth-auto-surface": plinthAuto,
  };

  const fingerprint = [
    primary,
    accent,
    surfacePage,
    ink,
    fonts.display,
    fonts.text,
    polarity,
  ].join("|");

  return { ready: true, polarity, vars, fingerprint };
}

export function googleFontFamiliesFromTypography(
  typography?: TypographyValue,
): Array<{ name: string; weights: number[] }> {
  if (!typography?.families?.length) return [];
  const out: Array<{ name: string; weights: number[] }> = [];
  const seen = new Set<string>();

  for (const family of typography.families) {
    if (family.source !== "google") continue;
    const name = normalizeFontDisplayName(family.family);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      weights: family.weights.length ? family.weights : [400, 600],
    });
  }

  return out;
}

export { cssFontFamilyName, normalizeFontDisplayName } from "./normalize-font-display-name";
