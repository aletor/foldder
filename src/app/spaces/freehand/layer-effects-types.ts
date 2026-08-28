/**
 * Estilos de capa no destructivos (PhotoRoom / Freehand).
 * UI: "Layer Styles"; propiedad persistida: `layerEffects` en el objeto.
 */

/** Mismos valores que CSS `mix-blend-mode` en SVG (ver `LayerBlendMode` en FreehandStudio). */
export type LayerEffectBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "plus-lighter"
  | "plus-darker";

export type LayerGradientStop = { offset: number; color: string };

export type LayerGradientConfig = {
  type: "linear" | "radial";
  angle: number;
  scale: number;
  reverse: boolean;
  stops: LayerGradientStop[];
};

export type ColorOverlayEffect = {
  enabled: boolean;
  color: string;
  opacity: number;
  blendMode: LayerEffectBlendMode;
};

export type GradientOverlayEffect = {
  enabled: boolean;
  opacity: number;
  blendMode: LayerEffectBlendMode;
  gradient: LayerGradientConfig;
};

/** Igual que en Photoshop: Softer = halo más suave; Precise = borde más definido. */
export type OuterGlowTechnique = "softer" | "precise";

export type OuterGlowEffect = {
  enabled: boolean;
  blendMode: LayerEffectBlendMode;
  /** 0–1 */
  opacity: number;
  /** 0–100 */
  noise: number;
  fill: "color" | "gradient";
  color: string;
  gradient: LayerGradientConfig;
  technique: OuterGlowTechnique;
  /** 0–100 (expande el borde antes del desenfoque) */
  spread: number;
  /** px, tamaño del desenfoque */
  size: number;
  /** 0–100 (caída del halo; ~50 ≈ neutro) */
  range: number;
};

/**
 * Filtro fotográfico (look de color) tipo Instagram/Photoshop, no destructivo.
 * Se aplica como `filter` CSS sobre el objeto renderizado (funciona en imagen, formas,
 * boolean y texto) + overlays opcionales de grano (ruido) y viñeta.
 */
export type PhotoFilterPreset =
  | "none"
  | "sepia"
  | "vintage"
  | "bw"
  | "noir"
  | "warm"
  | "cool"
  | "fade"
  | "vivid"
  | "cyberpunk"
  | "hdr"
  | "duotone"
  | "teal-orange"
  | "split-tone";

export type PhotoFilterEffect = {
  enabled: boolean;
  preset: PhotoFilterPreset;
  /** 0–1: mezcla del look con el original (0 = sin efecto, 1 = pleno). */
  intensity: number;
  /** 0–1: cantidad de grano/ruido analógico. */
  grain: number;
  /** 0–1: oscurecimiento de bordes (viñeta). */
  vignette: number;
  /** 0–1: tamaño del grano (0 = fino, 1 = grueso). Opcional para compatibilidad. */
  grainSize?: number;
};

export const PHOTO_FILTER_PRESETS: { id: PhotoFilterPreset; label: string }[] = [
  { id: "none", label: "Ninguno" },
  { id: "sepia", label: "Sepia" },
  { id: "vintage", label: "Vintage" },
  { id: "bw", label: "Blanco y negro" },
  { id: "noir", label: "Noir" },
  { id: "warm", label: "Cálido" },
  { id: "cool", label: "Frío" },
  { id: "fade", label: "Desvaído" },
  { id: "vivid", label: "Vívido" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "hdr", label: "HDR / Clarity" },
  { id: "duotone", label: "Duotono" },
  { id: "teal-orange", label: "Teal & Orange" },
  { id: "split-tone", label: "Split tone" },
];

/** Presets que requieren mapeo tonal real (SVG feColorMatrix/feComponentTransfer), no `filter` CSS. */
export function isSvgPhotoFilterPreset(preset: PhotoFilterPreset): boolean {
  return preset === "duotone" || preset === "teal-orange" || preset === "split-tone";
}

/** baseFrequency del grano según `grainSize` (0 fino → 1 grueso). */
export function photoFilterGrainBaseFrequency(grainSize: number | undefined): number {
  const s = Math.max(0, Math.min(1, grainSize ?? 0.5));
  return lerp(1.1, 0.32, s);
}

export type LayerEffects = {
  colorOverlay?: ColorOverlayEffect;
  gradientOverlay?: GradientOverlayEffect;
  outerGlow?: OuterGlowEffect;
  photoFilter?: PhotoFilterEffect;
};

export function defaultPhotoFilter(): PhotoFilterEffect {
  return { enabled: false, preset: "none", intensity: 0.85, grain: 0.18, vignette: 0.25, grainSize: 0.5 };
}

export function isPhotoFilterPresetActive(pf: PhotoFilterEffect, presetId: PhotoFilterPreset): boolean {
  if (presetId === "none") return !pf.enabled;
  return pf.enabled && pf.preset === presetId;
}

export function applyPhotoFilterPresetChoice(
  pf: PhotoFilterEffect,
  presetId: PhotoFilterPreset,
): PhotoFilterEffect {
  if (presetId === "none") return { ...pf, enabled: false, preset: "none" };
  return { ...pf, enabled: true, preset: presetId };
}

export function setPhotoFilterEnabled(pf: PhotoFilterEffect, enabled: boolean): PhotoFilterEffect {
  if (!enabled) return { ...pf, enabled: false, preset: "none" };
  const preset = pf.preset === "none" ? "vintage" : pf.preset;
  return { ...pf, enabled: true, preset };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function roundN(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Especificación de cada preset: [funcCSS, valorIdentidad, valorObjetivo, unidad?]. */
const PHOTO_FILTER_SPECS: Record<PhotoFilterPreset, [string, number, number, string?][]> = {
  none: [],
  sepia: [["sepia", 0, 1], ["contrast", 1, 1.05], ["saturate", 1, 1.1], ["brightness", 1, 1.02]],
  vintage: [["sepia", 0, 0.45], ["contrast", 1, 0.95], ["saturate", 1, 1.25], ["brightness", 1, 1.06], ["hue-rotate", 0, -12, "deg"]],
  bw: [["grayscale", 0, 1], ["contrast", 1, 1.05]],
  noir: [["grayscale", 0, 1], ["contrast", 1, 1.45], ["brightness", 1, 0.92]],
  warm: [["sepia", 0, 0.28], ["saturate", 1, 1.35], ["brightness", 1, 1.04], ["hue-rotate", 0, -10, "deg"]],
  cool: [["saturate", 1, 1.15], ["brightness", 1, 1.04], ["hue-rotate", 0, 18, "deg"], ["contrast", 1, 1.03]],
  fade: [["contrast", 1, 0.82], ["brightness", 1, 1.12], ["saturate", 1, 0.8], ["sepia", 0, 0.15]],
  vivid: [["saturate", 1, 1.7], ["contrast", 1, 1.12]],
  cyberpunk: [["contrast", 1, 1.25], ["saturate", 1, 1.6], ["hue-rotate", 0, -25, "deg"], ["brightness", 1, 1.02]],
  hdr: [["contrast", 1, 1.32], ["saturate", 1, 1.3], ["brightness", 1, 1.03]],
  // Presets SVG: sin funciones CSS (se renderizan con feColorMatrix/feComponentTransfer).
  duotone: [],
  "teal-orange": [],
  "split-tone": [],
};

/** Cadena `filter` CSS para un preset, interpolada hacia identidad según `intensity` (0–1). */
export function photoFilterCssString(preset: PhotoFilterPreset, intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  const specs = PHOTO_FILTER_SPECS[preset] ?? [];
  const parts = specs.map(([fn, id, target, unit]) => `${fn}(${roundN(lerp(id, target, t))}${unit ?? ""})`);
  return parts.join(" ");
}

export function defaultLayerEffects(): LayerEffects {
  return {
    colorOverlay: {
      enabled: false,
      color: "#ff0000",
      opacity: 1,
      blendMode: "normal",
    },
    gradientOverlay: {
      enabled: false,
      opacity: 1,
      blendMode: "normal",
      gradient: {
        type: "linear",
        angle: 90,
        scale: 1,
        reverse: false,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" },
        ],
      },
    },
    outerGlow: {
      enabled: false,
      blendMode: "normal",
      opacity: 0.85,
      noise: 0,
      fill: "color",
      color: "#ffcc00",
      gradient: {
        type: "linear",
        angle: 90,
        scale: 1,
        reverse: false,
        stops: [
          { offset: 0, color: "#ffff00" },
          { offset: 1, color: "#ff6600" },
        ],
      },
      technique: "softer",
      spread: 0,
      size: 12,
      range: 50,
    },
    photoFilter: defaultPhotoFilter(),
  };
}

export function cloneLayerEffectsForEdit(src: LayerEffects | undefined): LayerEffects {
  const d = defaultLayerEffects();
  const base: LayerEffects = {
    colorOverlay: d.colorOverlay ? { ...d.colorOverlay } : undefined,
    gradientOverlay: d.gradientOverlay
      ? {
          ...d.gradientOverlay,
          gradient: {
            ...d.gradientOverlay.gradient,
            stops: d.gradientOverlay.gradient.stops.map((s) => ({ ...s })),
          },
        }
      : undefined,
    outerGlow: d.outerGlow
      ? {
          ...d.outerGlow,
          gradient: {
            ...d.outerGlow.gradient,
            stops: d.outerGlow.gradient.stops.map((s) => ({ ...s })),
          },
        }
      : undefined,
    photoFilter: d.photoFilter ? { ...d.photoFilter } : undefined,
  };
  if (!src) return base;
  if (src.colorOverlay) base.colorOverlay = { ...src.colorOverlay };
  if (src.gradientOverlay) {
    base.gradientOverlay = {
      ...src.gradientOverlay,
      gradient: {
        ...src.gradientOverlay.gradient,
        stops: src.gradientOverlay.gradient.stops.map((s) => ({ ...s })),
      },
    };
  }
  if (src.outerGlow) {
    base.outerGlow = {
      ...src.outerGlow,
      gradient: {
        ...src.outerGlow.gradient,
        stops: src.outerGlow.gradient.stops.map((s) => ({ ...s })),
      },
    };
  }
  if (src.photoFilter) base.photoFilter = { ...src.photoFilter };
  return base;
}

export function hasActiveLayerEffects(le: LayerEffects | undefined): boolean {
  if (!le) return false;
  return !!(
    le.colorOverlay?.enabled ||
    le.gradientOverlay?.enabled ||
    le.outerGlow?.enabled ||
    le.photoFilter?.enabled
  );
}

/** True si hay un filtro fotográfico activo (look de color, grano o viñeta). */
export function hasActivePhotoFilter(le: LayerEffects | undefined): boolean {
  return !!le?.photoFilter?.enabled;
}

/**
 * Capas elegibles para Layer Styles: raster, boolean con caché, formas, texto,
 * carpetas, clips «pegar dentro» y campos de imagen (`rect` + `isImageFrame`).
 */
export function isLayerStylesEligible(o: {
  type: string;
  cachedResult?: string | null;
  isImageFrame?: boolean;
}): boolean {
  if (o.type === "image") return true;
  if (o.type === "booleanGroup") {
    const s = o.cachedResult;
    return typeof s === "string" && s.trim().length > 0;
  }
  if (o.type === "rect") return true;
  if (o.type === "ellipse" || o.type === "path") return true;
  if (o.type === "text") return true;
  // Carpeta: el filtro fotográfico se propaga por CSS a todo su contenido.
  if (o.type === "groupContainer") return true;
  // Contenedor «pegar dentro» (clip): efectos sobre el composite recortado, no sobre hijos sueltos.
  if (o.type === "clippingContainer") return true;
  return false;
}

/**
 * Overlays (color, degradado, outer glow) requieren silueta raster propia.
 * Texto y carpetas solo admiten el filtro fotográfico (Look).
 */
export function isLayerOverlaysSupported(targetType?: string): boolean {
  return !!targetType && targetType !== "text" && targetType !== "groupContainer";
}
