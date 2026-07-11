/**
 * Utilidades puras de la cara de BrandKit (conversión de color y contraste).
 * Sin dependencias de React para poder testearlas aisladas.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rr - k) / (1 - k);
  const m = (1 - gg - k) / (1 - k);
  const y = (1 - bb - k) / (1 - k);
  return { c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: Math.round(k * 100) };
}

export function formatRgb(rgb: Rgb): string {
  return `${rgb.r} ${rgb.g} ${rgb.b}`;
}
export function formatCmyk(cmyk: Cmyk): string {
  return `${cmyk.c} ${cmyk.m} ${cmyk.y} ${cmyk.k}`;
}

/** Texto legible (#000 o #fff) sobre un fondo hex, por luminancia relativa. */
export function readableTextOn(hex: string): "#0a0a0a" | "#ffffff" {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#0a0a0a";
  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.5 ? "#0a0a0a" : "#ffffff";
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** BrandKit · minimalismo cuadrado — tipografía + hairlines, sin marcos decorativos. */
export const G = {
  section: "px-12 py-28 md:px-20",
  panel: "px-10 py-12 md:px-12",
  label: "text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]",
  hairline: "border-[var(--border)]",
  listRow: "border-b border-[var(--border)] py-4 last:border-b-0",
  btn: "border border-[var(--border)] bg-transparent px-5 py-2.5 text-sm lowercase tracking-wide text-[var(--text-main)] transition hover:border-[var(--text-main)]",
  btnFill: "border border-[var(--text-main)] bg-[var(--text-main)] px-5 py-2.5 text-sm lowercase tracking-wide text-[var(--surface)] transition hover:opacity-90 disabled:opacity-40",
  btnGhost: "border-0 bg-transparent px-0 py-1 text-sm lowercase text-[var(--text-muted)] underline-offset-4 transition hover:text-[var(--text-main)] hover:underline",
  input: "min-w-0 flex-1 border-0 border-b border-[var(--border)] bg-transparent py-2.5 text-sm outline-none transition focus:border-[var(--text-main)]",
  proposedMark: "absolute right-0 top-0 h-2 w-2 bg-[var(--secondary)]",
} as const;
