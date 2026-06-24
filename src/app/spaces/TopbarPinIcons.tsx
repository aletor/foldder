"use client";

import React from "react";

type GlyphProps = {
  size?: number;
  className?: string;
};

const sw = 1.45;

function TopbarRasterGlyph({
  src,
  size = 26,
  className,
  maxWidthScale = 1.25,
}: GlyphProps & { src: string; maxWidthScale?: number }) {
  const scaled = Math.round(size * 0.9);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={[className, "mx-auto block select-none object-contain pointer-events-none"].filter(Boolean).join(" ")}
      style={{ height: scaled, width: "auto", maxWidth: scaled * maxWidthScale }}
      aria-hidden
      draggable={false}
    />
  );
}

/**
 * Iconos solo para la barra inferior de accesos: trazo fino, viewBox 24×24, alta legibilidad.
 * No reutilizar como icono de nodo en el grafo (ver `foldder-icons`).
 */

/** Vector Studio — curva Bézier con anclas + punta de pluma (edición vectorial). */
export function TopbarGlyphVectorStudio({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4 17.25C6.75 9.25 12 7.25 19.25 6"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle cx={4} cy={17.25} r={2.15} stroke="currentColor" strokeWidth={sw} />
      <circle cx={19.25} cy={6} r={2.15} stroke="currentColor" strokeWidth={sw} />
      <path
        d="M15.2 3.2L20.2 8.2L18.4 10L13.3 4.9L15.2 3.2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0.85}
        strokeLinejoin="round"
      />
      <path d="M13.8 5.4L17.6 9.2" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" opacity={0.45} />
    </svg>
  );
}

/** Image Generator — generation studio mark. */
export function TopbarGlyphImageGenerator({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/image_icon.svg" size={size} className={className} />;
}

/** Video Generator — generation studio mark. */
export function TopbarGlyphVideoGenerator({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/video_icon.svg" size={size} className={className} />;
}

/** Video Editor — timeline edition studio mark. */
export function TopbarGlyphVideoEdition({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/video_edition_icon.svg" size={size} className={className} />;
}

/** Presenter — presentation studio mark. */
export function TopbarGlyphPresenter({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/presenter_icon.svg" size={size} className={className} />;
}

/** Indesign — páginas apiladas + líneas de texto (maquetación editorial). */
export function TopbarGlyphIndesign({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="5.25"
        y="6.25"
        width="12.5"
        height="14.5"
        rx="1.35"
        stroke="currentColor"
        strokeWidth={1.2}
        opacity={0.38}
      />
      <rect x="3.75" y="4.25" width="14.5" height="16.5" rx="1.65" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M7.25 9.25h7.5M7.25 12.25h7.5M7.25 15.25h4.75"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        opacity={0.88}
      />
      <rect x="8.25" y="17.35" width="6.5" height="2.15" rx="0.4" fill="currentColor" fillOpacity={0.22} />
    </svg>
  );
}

/**
 * Designer Studio (nuevo):
 * contenedor tipo mesa de trabajo + curva Bézier viva + anclas + chispa creativa.
 * Pensado para que se reconozca “diseño + precisión” incluso en tamaño pequeño del dock.
 */
export function TopbarGlyphDesignerStudio({ size = 26, className }: GlyphProps) {
  const scaled = Math.round(size * 0.9);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/designer_icon.svg"
      alt=""
      width={scaled}
      height={scaled}
      className={[className, "object-contain mx-auto block"].filter(Boolean).join(" ")}
      aria-hidden
      draggable={false}
    />
  );
}

/**
 * Brain — misma geometría legible que el icono «brain» de Lucide (hemisferios + surco + circunvoluciones).
 * Trazo alineado al resto de glifos de la barra. No es nodo del grafo.
 */
export function TopbarGlyphBrain({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M12 18V5"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <path
        d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.997 5.125a4 4 0 0 1 2.526 5.77"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 18a4 4 0 0 0 2-7.464"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 18a4 4 0 0 1-2-7.464"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.003 5.125a4 4 0 0 0-2.526 5.77"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Assets — carpeta + hoja (biblioteca multimedia del lienzo; no es nodo del grafo). */
export function TopbarGlyphFiles({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4.25 7.75h4.35l1.35 2.15h9.8v8.35a1.35 1.35 0 01-1.35 1.35H4.25a1.35 1.35 0 01-1.35-1.35V9.1a1.35 1.35 0 011.35-1.35z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M4.25 7.75V6.6a1.35 1.35 0 011.35-1.35h4.2l1.35 2.15"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
      <rect
        x="8.85"
        y="12.15"
        width="6.3"
        height="4.85"
        rx="0.65"
        stroke="currentColor"
        strokeWidth={1.15}
        opacity={0.55}
      />
      <path
        d="M10.35 14.1h3.3M10.35 15.65h2.1"
        stroke="currentColor"
        strokeWidth={1.05}
        strokeLinecap="round"
        opacity={0.45}
      />
    </svg>
  );
}

/** Foldder app mark (color corporativo). */
export function TopbarGlyphFoldderApp({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/logo_topbar.svg" size={size} className={className} />;
}

/** Guionista — editorial writing studio mark. */
export function TopbarGlyphGuionista({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/guionista_icon.svg" size={size} className={className} />;
}

/** Cine — audiovisual preproduction studio mark. */
export function TopbarGlyphCine({ size = 26, className }: GlyphProps) {
  return <TopbarRasterGlyph src="/cine_icon.svg" size={size} className={className} />;
}

/** VFX Generator — capas apiladas + onda / impacto (efectos sobre vídeo). */
export function TopbarGlyphVfxGenerator({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="4.5"
        y="5.5"
        width="14"
        height="9.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth={1.25}
        opacity={0.35}
      />
      <rect x="5.5" y="7.5" width="14" height="9.5" rx="1.75" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M3.75 12.25c2.5-2.8 4.8 2.9 7.25 0s4.75 2.85 7.25 0"
        stroke="currentColor"
        strokeWidth={1.35}
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d="M17.5 4.25l1.35 2.85 2.85 1.35-2.85 1.35L17.5 12.65l-1.35-2.85-2.85-1.35 2.85-1.35z"
        stroke="currentColor"
        strokeWidth={1.05}
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity={0.18}
      />
    </svg>
  );
}

export const TOPBAR_GLYPH_BY_NODE_TYPE: Record<
  | "brain"
  | "guionista"
  | "cine"
  | "designer"
  | "nanoBanana"
  | "geminiVideo"
  | "video_editor"
  | "videoEditor"
  | "presenter"
  | "vfxGenerator"
  | "files",
  React.FC<GlyphProps>
> = {
  brain: TopbarGlyphBrain,
  guionista: TopbarGlyphGuionista,
  cine: TopbarGlyphCine,
  designer: TopbarGlyphDesignerStudio,
  nanoBanana: TopbarGlyphImageGenerator,
  geminiVideo: TopbarGlyphVideoGenerator,
  video_editor: TopbarGlyphVideoEdition,
  videoEditor: TopbarGlyphVideoEdition,
  presenter: TopbarGlyphPresenter,
  vfxGenerator: TopbarGlyphVfxGenerator,
  files: TopbarGlyphFoldderApp,
};
