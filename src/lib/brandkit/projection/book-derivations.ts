/**
 * Derivados del libro de estilo BrandKit: especificaciones de color, contraste y tipografía.
 */

import type { BrandKitBookView } from "./book-view";
import { formatCmyk, formatRgb, hexToRgb, rgbToCmyk } from "@/app/spaces/brandKit/face-utils";

function slotIncluded(state: "ghost" | "proposed" | "crowned", soloValidado: boolean): boolean {
  if (state === "ghost") return false;
  if (soloValidado) return state === "crowned";
  return true;
}

export type BrandKitBookDerivationsOptions = {
  soloValidado?: boolean;
  logoImageUrl?: string | null;
};

export type BrandKitColorSpec = {
  role: string;
  hex: string;
  name?: string;
  rgb: { r: number; g: number; b: number };
  cmykApprox: { c: number; m: number; y: number; k: number };
};

export type BrandKitWcagPair = {
  foregroundHex: string;
  backgroundHex: string;
  ratio: number;
  aaNormal: boolean;
  aaaNormal: boolean;
};

export type BrandKitTypographicStep = {
  token: string;
  sizePx: number;
  lineHeightPx: number;
  sample: string;
};

export type BrandKitBookDerivations = {
  palette: BrandKitColorSpec[];
  wcagMatrix: BrandKitWcagPair[];
  typographicScale: BrandKitTypographicStep[];
  logoSafeAreaSvg: string | null;
};

function contrastRatio(fg: string, bg: string): number | null {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return null;
  const lum = (rgb: { r: number; g: number; b: number }) => {
    const srgb = [rgb.r, rgb.g, rgb.b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  };
  const l1 = lum(f);
  const l2 = lum(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const ROLE_LABEL: Record<string, string> = {
  primary: "primario",
  secondary: "secundario",
  accent: "acento",
  background: "fondo",
  text: "soporte",
};

export function buildBrandKitBookDerivations(
  view: BrandKitBookView,
  options: BrandKitBookDerivationsOptions = {},
): BrandKitBookDerivations {
  const soloValidado = options.soloValidado ?? false;
  const palette: BrandKitColorSpec[] = view.palette
    .filter(({ slot }) => slotIncluded(slot.state, soloValidado))
    .map(({ role, slot }) => {
      const hex = slot.value?.hex;
      if (!hex) return null;
      const rgb = hexToRgb(hex);
      if (!rgb) return null;
      return {
        role: ROLE_LABEL[role] ?? role,
        hex,
        name: slot.value?.name,
        rgb,
        cmykApprox: rgbToCmyk(rgb),
      };
    })
    .filter(Boolean) as BrandKitColorSpec[];

  const hexes = palette.map((p) => p.hex);
  const wcagMatrix: BrandKitWcagPair[] = [];
  for (let i = 0; i < hexes.length; i += 1) {
    for (let j = 0; j < hexes.length; j += 1) {
      if (i === j) continue;
      const ratio = contrastRatio(hexes[i], hexes[j]);
      if (!ratio) continue;
      wcagMatrix.push({
        foregroundHex: hexes[i],
        backgroundHex: hexes[j],
        ratio,
        aaNormal: ratio >= 4.5,
        aaaNormal: ratio >= 7,
      });
    }
  }

  const primaryFamily = view.typography.primary.value?.family ?? "sans-serif";
  const typographicScale: BrandKitTypographicStep[] = [
    { token: "Display", sizePx: 48, lineHeightPx: 52, sample: primaryFamily },
    { token: "Titular", sizePx: 32, lineHeightPx: 38, sample: primaryFamily },
    { token: "Cuerpo", sizePx: 16, lineHeightPx: 24, sample: view.typography.secondary.value?.family ?? primaryFamily },
    { token: "Pie", sizePx: 12, lineHeightPx: 16, sample: primaryFamily },
  ];

  const logoUrl = options.logoImageUrl ?? null;
  const logoSafeAreaSvg =
    logoUrl && (logoUrl.startsWith("data:") || logoUrl.startsWith("blob:"))
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200" width="360" height="200">
        <rect x="16" y="16" width="328" height="168" fill="none" stroke="#999" stroke-dasharray="6 4"/>
        <rect x="48" y="48" width="264" height="104" fill="#f8f8f8"/>
        <image href="${logoUrl.replace(/"/g, "&quot;")}" x="72" y="56" width="216" height="88" preserveAspectRatio="xMidYMid meet"/>
        <text x="180" y="188" text-anchor="middle" font-size="11" fill="#666">área de respeto · 1× altura del logo</text>
      </svg>`
      : null;

  return { palette, wcagMatrix: wcagMatrix.slice(0, 12), typographicScale, logoSafeAreaSvg };
}

export function formatColorSpecRow(spec: BrandKitColorSpec): string {
  return `${spec.hex.toUpperCase()} · rgb(${formatRgb(spec.rgb)}) · cmyk(${formatCmyk(spec.cmykApprox)})`;
}
