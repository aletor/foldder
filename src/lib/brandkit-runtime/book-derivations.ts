/**
 * B2 — Derivaciones locales para el libro de estilo (coste 0, no persistidas en assets).
 * Paleta extendida, WCAG, 60/30/10, logo safe area/min size/misuses, escala tipográfica.
 */

import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import type { BrandKitBoardMeta } from "./types";

export type DerivedColorRole = "primary" | "secondary" | "accent";

export type DerivedColorSpec = {
  role: DerivedColorRole;
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  cmykApprox: { c: number; m: number; y: number; k: number };
};

export type WcagContrastPair = {
  foregroundHex: string;
  backgroundHex: string;
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
};

export type ColorUsage603010 = {
  primaryPercent: number;
  secondaryPercent: number;
  accentPercent: number;
  guidance: string;
};

export type LogoSafeAreaDerivation = {
  clearSpaceRatio: number;
  rule: string;
  diagramSvg: string;
};

export type LogoMinSizeDerivation = {
  digitalMinHeightPx: number;
  printMinWidthMm: number;
  rule: string;
};

export type LogoMisuseDerivation = {
  id: string;
  title: string;
  description: string;
  previewSvg: string;
};

export type TypographicScaleStep = {
  token: string;
  sizePx: number;
  lineHeightPx: number;
  sample: string;
};

export type BrandBookDerivations = {
  kind: "derived";
  palette: DerivedColorSpec[];
  wcagMatrix: WcagContrastPair[];
  colorUsage603010: ColorUsage603010;
  logoSafeArea: LogoSafeAreaDerivation | null;
  logoMinSize: LogoMinSizeDerivation | null;
  logoMisuses: LogoMisuseDerivation[];
  typographicScale: TypographicScaleStep[];
};

const LOGO_MISUSE_DEFS: Array<{ id: string; title: string; description: string; variant: string }> = [
  { id: "stretch", title: "No estirar", description: "Mantén la proporción original del logo.", variant: "stretch" },
  { id: "rotate", title: "No rotar", description: "No inclines ni rotes el isotipo.", variant: "rotate" },
  { id: "recolor", title: "No recolorear", description: "Usa solo las versiones aprobadas de color.", variant: "recolor" },
  { id: "effects", title: "Sin efectos", description: "Evita sombras, brillos o contornos no aprobados.", variant: "effects" },
  { id: "busy-bg", title: "Fondos limpios", description: "No coloques el logo sobre fondos recargados o sin contraste.", variant: "busy-bg" },
  { id: "too-small", title: "Tamaño mínimo", description: "Respeta el tamaño mínimo para legibilidad.", variant: "too-small" },
];

function normalizeHex(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const match = v.match(/^#([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toUpperCase()}` : null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h /= 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** CMYK aproximado para impresión (no sustituye perfil ICC). */
export function hexToCmykApprox(hex: string): { c: number; m: number; y: number; k: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

export function wcagContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function buildWcagMatrix(colors: DerivedColorSpec[]): WcagContrastPair[] {
  const pairs: WcagContrastPair[] = [];
  const hexes = colors.map((c) => c.hex);
  const backgrounds = ["#FFFFFF", "#111827", ...hexes];
  const foregrounds = ["#FFFFFF", "#111827", ...hexes];

  for (const bg of backgrounds) {
    for (const fg of foregrounds) {
      if (fg === bg) continue;
      const ratio = wcagContrastRatio(fg, bg);
      pairs.push({
        foregroundHex: fg,
        backgroundHex: bg,
        ratio,
        aaNormal: ratio >= 4.5,
        aaLarge: ratio >= 3,
        aaaNormal: ratio >= 7,
      });
    }
  }

  return pairs
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 12);
}

export function buildColorUsage603010(colors: DerivedColorSpec[]): ColorUsage603010 {
  const hasPrimary = colors.some((c) => c.role === "primary");
  const hasSecondary = colors.some((c) => c.role === "secondary");
  const hasAccent = colors.some((c) => c.role === "accent");
  const guidance = hasPrimary
    ? `Usa el primario (~60%) como base visual, secundario (~30%) para apoyo y acento (~10%) para énfasis.${
        !hasSecondary || !hasAccent ? " Completa la paleta para aplicar la regla con precisión." : ""
      }`
    : "Define al menos un color primario para activar la regla 60/30/10.";
  return {
    primaryPercent: hasPrimary ? 60 : 0,
    secondaryPercent: hasSecondary ? 30 : 0,
    accentPercent: hasAccent ? 10 : 0,
    guidance,
  };
}

function buildLogoSafeArea(hasLogo: boolean): LogoSafeAreaDerivation | null {
  if (!hasLogo) return null;
  const ratio = 0.25;
  return {
    clearSpaceRatio: ratio,
    rule: `Deja un área libre equivalente al ${Math.round(ratio * 100)}% de la altura del logo en todos los lados.`,
    diagramSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" width="160" height="100">
      <rect x="8" y="8" width="144" height="84" fill="none" stroke="#9CA3AF" stroke-dasharray="4 3"/>
      <rect x="40" y="30" width="80" height="40" rx="4" fill="#E5E7EB"/>
      <text x="80" y="55" text-anchor="middle" font-size="10" fill="#374151">LOGO</text>
    </svg>`,
  };
}

function buildLogoMinSize(hasLogo: boolean): LogoMinSizeDerivation | null {
  if (!hasLogo) return null;
  return {
    digitalMinHeightPx: 24,
    printMinWidthMm: 15,
    rule: "No uses el logo por debajo de 24 px de alto en pantalla ni 15 mm de ancho en impresión.",
  };
}

function buildMisusePreviewSvg(variant: string, accentHex: string): string {
  const accent = accentHex || "#5E8E70";
  if (variant === "stretch") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72"><rect x="10" y="24" width="100" height="24" rx="3" fill="${accent}" opacity="0.85"/><line x1="10" y1="12" x2="110" y2="60" stroke="#DC2626" stroke-width="2"/></svg>`;
  }
  if (variant === "rotate") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72"><g transform="rotate(18 60 36)"><rect x="35" y="22" width="50" height="28" rx="3" fill="${accent}"/></g><line x1="12" y1="60" x2="108" y2="12" stroke="#DC2626" stroke-width="2"/></svg>`;
  }
  if (variant === "recolor") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72"><rect x="35" y="22" width="50" height="28" rx="3" fill="#EC4899"/><line x1="12" y1="60" x2="108" y2="12" stroke="#DC2626" stroke-width="2"/></svg>`;
  }
  if (variant === "effects") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72"><defs><filter id="glow"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#F59E0B"/></filter></defs><rect x="35" y="22" width="50" height="28" rx="3" fill="${accent}" filter="url(#glow)"/><line x1="12" y1="60" x2="108" y2="12" stroke="#DC2626" stroke-width="2"/></svg>`;
  }
  if (variant === "busy-bg") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72"><rect width="120" height="72" fill="#6366F1"/><circle cx="20" cy="18" r="10" fill="#F97316" opacity="0.8"/><circle cx="95" cy="50" r="14" fill="#22D3EE" opacity="0.7"/><rect x="40" y="26" width="40" height="20" rx="2" fill="#fff" opacity="0.35"/><line x1="12" y1="60" x2="108" y2="12" stroke="#DC2626" stroke-width="2"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72"><rect x="52" y="30" width="16" height="12" rx="2" fill="${accent}"/><line x1="12" y1="60" x2="108" y2="12" stroke="#DC2626" stroke-width="2"/></svg>`;
}

export function buildLogoMisuses(accentHex: string | null): LogoMisuseDerivation[] {
  const accent = normalizeHex(accentHex) ?? "#5E8E70";
  return LOGO_MISUSE_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    previewSvg: buildMisusePreviewSvg(def.variant, accent),
  }));
}

function readTypographyBaseSize(assets: ProjectAssetsMetadata): number {
  const strategy = assets.strategy as Record<string, unknown>;
  const typography = strategy.typography;
  if (!typography || typeof typography !== "object") return 16;
  const primary = (typography as Record<string, unknown>).primary;
  if (!primary || typeof primary !== "object") return 16;
  const base = (primary as Record<string, unknown>).baseSizePx;
  return typeof base === "number" && base >= 10 && base <= 32 ? base : 16;
}

export function buildTypographicScale(assets: ProjectAssetsMetadata): TypographicScaleStep[] {
  const base = readTypographyBaseSize(assets);
  const ratio = 1.25;
  const tokens = [
    { token: "caption", pow: -1, sample: "Nota al pie" },
    { token: "body", pow: 0, sample: "Texto de cuerpo" },
    { token: "lead", pow: 1, sample: "Entradilla" },
    { token: "h3", pow: 2, sample: "Subtítulo" },
    { token: "h2", pow: 3, sample: "Título sección" },
    { token: "h1", pow: 4, sample: "Titular" },
  ];
  return tokens.map(({ token, pow, sample }) => {
    const sizePx = Math.round(base * Math.pow(ratio, pow));
    return { token, sizePx, lineHeightPx: Math.round(sizePx * 1.35), sample };
  });
}

function buildPaletteSpecs(assets: ProjectAssetsMetadata): DerivedColorSpec[] {
  const entries: Array<{ role: DerivedColorRole; hex: string | null }> = [
    { role: "primary", hex: assets.brand.colorPrimary },
    { role: "secondary", hex: assets.brand.colorSecondary },
    { role: "accent", hex: assets.brand.colorAccent },
  ];
  return entries
    .map(({ role, hex }) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return null;
      return {
        role,
        hex: normalized,
        rgb: hexToRgb(normalized),
        hsl: hexToHsl(normalized),
        cmykApprox: hexToCmykApprox(normalized),
      };
    })
    .filter((x): x is DerivedColorSpec => x != null);
}

export function buildBookDerivations(
  rawAssets: unknown,
  _boardMetaInput?: BrandKitBoardMeta,
): BrandBookDerivations {
  const assets = normalizeProjectAssets(rawAssets);

  const palette = buildPaletteSpecs(assets);
  const hasLogo = Boolean(assets.brand.logoPositive?.trim());
  const accent = palette.find((c) => c.role === "accent")?.hex ?? palette[0]?.hex ?? null;

  return {
    kind: "derived",
    palette,
    wcagMatrix: buildWcagMatrix(palette),
    colorUsage603010: buildColorUsage603010(palette),
    logoSafeArea: buildLogoSafeArea(hasLogo),
    logoMinSize: buildLogoMinSize(hasLogo),
    logoMisuses: hasLogo ? buildLogoMisuses(accent) : [],
    typographicScale: buildTypographicScale(assets),
  };
}
