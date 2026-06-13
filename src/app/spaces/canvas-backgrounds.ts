/** Fondos del lienzo: local + URLs directas (CDN). Persistencia: `localStorage` bajo esta clave. */
export const CANVAS_BG_STORAGE_KEY = "foldder-canvas-bg-id";
export const CANVAS_BG_COLOR_STORAGE_KEY = "foldder-canvas-bg-color";
export const CANVAS_SOLID_COLOR_BG_ID = "solid-color";
export const DEFAULT_CANVAS_SOLID_COLOR = "#f8fafc";

export type CanvasBackgroundOption = { id: string; label: string; url: string };

export type CanvasBackgroundSelection =
  | { kind: "image"; url: string }
  | { kind: "color"; color: string };

export function isCanvasSolidColorBg(id: string): boolean {
  return id === CANVAS_SOLID_COLOR_BG_ID;
}

export function normalizeCanvasSolidColor(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_CANVAS_SOLID_COLOR;
}

export function resolveCanvasBackgroundSelection(
  id: string,
  solidColor: string,
  options: CanvasBackgroundOption[],
): CanvasBackgroundSelection {
  if (isCanvasSolidColorBg(id)) {
    return { kind: "color", color: normalizeCanvasSolidColor(solidColor) };
  }
  return { kind: "image", url: (options.find((option) => option.id === id) ?? options[0]).url };
}

export function isValidCanvasBackgroundId(id: string, options: CanvasBackgroundOption[]): boolean {
  return isCanvasSolidColorBg(id) || options.some((option) => option.id === id);
}

/** Solo orígenes que suelen permitir CORS para texturas WebGL (evita hotlinks rotos o sin ACAO). */
export const CANVAS_BACKGROUNDS: CanvasBackgroundOption[] = [
  { id: "studio", label: "Estudio (actual)", url: "/wallpapers/studio_back.jpg" },
  { id: "local-pastel-gradient", label: "Pastel suave", url: "/wallpapers/pastel-gradient.webp" },
  { id: "local-dark-gradient", label: "Gradiente oscuro", url: "/wallpapers/dark-gradient.jpg" },
  { id: "local-mountain-range", label: "Cordillera", url: "/wallpapers/mountain-range.webp" },
  { id: "local-google-desktop", label: "Cielo púrpura", url: "/wallpapers/google-desktop.jpg" },
  { id: "local-purple-gradient", label: "Gradiente violeta", url: "/wallpapers/purple-gradient.jpg" },
  { id: "local-night-hills", label: "Colinas nocturnas", url: "/wallpapers/night-hills.jpg" },
  {
    id: "unsplash-city-night",
    label: "Ciudad nocturna",
    url: "/wallpapers/unsplash-city-night.jpg",
  },
  {
    id: "unsplash-abstract-gradient",
    label: "Gradiente suave",
    url: "/wallpapers/unsplash-abstract-gradient.jpg",
  },
  {
    id: "pixabay-sea-3652697",
    label: "Mar",
    url: "/wallpapers/pixabay-sea-3652697.jpg",
  },
  {
    id: "geometric-mid-century",
    label: "Formas geométricas",
    url: "/wallpapers/geometric-mid-century.jpg",
  },
];
