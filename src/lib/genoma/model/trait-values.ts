/**
 * Formas de `value` (la INTERPRETACIÓN coronable) por familia de rasgo.
 *
 * Viven en el núcleo (no en los extractores) para que la cara y la proyección
 * consuman tipos puros sin arrastrar dependencias de servidor (pdf.js, sharp…).
 * Cada extractor produce `Candidate<XValue>`; la cara solo lee estos shapes.
 */

import type { ColorRole } from "./trait-ids";

/** Origen del fichero de espécimen cuando hay render real. */
export type TypographySpecimenSource = "embedded" | "google-fonts" | "upload";

/** Estado honesto del binario tipográfico recuperado del PDF fuente. */
export type TypographyEmbedStatus =
  | "embedded_extracted"
  | "identified_only"
  | "substituted";

/** Tipografía: la identidad es la FAMILIA; los pesos son un atributo del valor. */
export interface TypographyValue {
  family: string;
  weights: string[];
  /** true solo si hay webfont cargable (Google Fonts, woff2 subido o binario extraído). */
  specimenAvailable: boolean;
  embedStatus?: TypographyEmbedStatus;
  /** Pesos con binario recuperado (subset de `weights`). */
  extractedWeights?: string[];
  /** Familia genérica de respaldo para render honesto cuando no hay especimen. */
  fallback: "sans-serif" | "serif" | "monospace";
  specimenSource?: TypographySpecimenSource;
  /** Licencia legible para el libro de estilo. */
  specimenLicense?: string;
  /** Hoja CSS de Google Fonts. */
  specimenCssUrl?: string;
  /** Data URL o URL pública del woff2/ttf (inline en HTML del libro). */
  specimenFontUrl?: string;
  /** @font-face inline por peso — clave peso, valor data URL CSS. */
  specimenFontFaces?: Record<string, string>;
}

/** Color de marca. La fuente de verdad es el HEX; RGB/CMYK/HSL se derivan en la cara. */
export interface ColorValue {
  hex: string; // "#RRGGBB"
  role: ColorRole;
  /** Nombre humano opcional ("amarillo Atresmedia"). */
  name?: string;
}

/** Logo: máster renderizado/recortado; Fase B puede aportar SVG nativo o XObject full-res. */
export type LogoAssetOrigin = "render_crop" | "vector_native" | "xobject_native" | "vectorized_raster";

export type LogoVariantAsset = {
  variant: "positive" | "negative";
  imageUrl: string;
  assetOrigin?: LogoAssetOrigin;
  sourcePageNumber?: number;
  sourceBbox?: { x: number; y: number; width: number; height: number };
};

export interface LogoValue {
  imageUrl: string;
  variant: "positive" | "negative";
  /** Instancias nativas por polaridad (claro/oscuro) extraídas en Fase B. */
  variants?: LogoVariantAsset[];
  /** Etiqueta corta ("isotipo", "logo horizontal"). */
  label?: string;
  /** Origen del asset — gate vectorize solo si es raster (xobject_native | render_crop). */
  assetOrigin?: LogoAssetOrigin;
  /** Trazabilidad hacia el PDF/página fuente (para vectorización hi-res). */
  sourcePageNumber?: number;
  sourceBbox?: { x: number; y: number; width: number; height: number };
}

export interface TaglineValue {
  text: string;
}

/** Un chip de tono de voz ("cercano", "riguroso"). */
export interface ToneValue {
  text: string;
}

export interface ClaimValue {
  text: string;
  kind: "absolute" | "forbidden";
  /** Para prohibidos: por qué no se puede decir (legal, de marca…). */
  why?: string;
}

/** Ejes del ADN visual de una imagen (§3.4). El render generado va en `derived`. */
export interface ImageAxes {
  sujeto?: string;
  edad?: string;
  entorno?: string;
  accion?: string;
  encuadre?: string;
  paleta?: string;
  tratamiento?: string;
}

/** 10 campos de visualDna de Fase A — fuente de verdad en la UI cuando existen. */
export interface VisualDnaFields {
  sujeto: string;
  ropa: string;
  lugar: string;
  animo: string;
  estiloArtistico: string;
  encuadre: string;
  luzTratamiento: string;
  paletaAprox: string;
  texturas: string;
  vozVisual: string;
}

export interface ImageDnaValue {
  axes: ImageAxes;
  /** Fase A — 10 campos editables; sustituyen los 7 ejes legacy en la UI. */
  visualDna?: VisualDnaFields;
  /** Miniatura de referencia del documento (evidencia, no imagen generada). */
  referenceImageUrl?: string;
}

export type { ColorRole };
