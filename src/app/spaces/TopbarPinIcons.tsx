"use client";

import React from "react";

type GlyphProps = {
  size?: number;
  className?: string;
};

const sw = 1.45;

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

/** Image Generator — marco de imagen + paisaje + destellos (generación creativa). */
export function TopbarGlyphImageGenerator({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="2.75" y="4.5" width="18.5" height="14" rx="2.75" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M5.5 16.5L9 11.5l2.8 3.2L14.5 9l5 7.5"
        stroke="currentColor"
        strokeWidth={1.35}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.25" cy="8.75" r="1.35" fill="currentColor" />
      {/* Destellos (cruces +) */}
      <path
        d="M16.75 4.5v2.2M15.65 5.6h2.2M19.5 6.75v1.6M18.7 7.55h1.6"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.95}
      />
      <circle cx="18.85" cy="11.85" r="0.65" fill="currentColor" opacity={0.5} />
    </svg>
  );
}

/** Video Generator — celuloide (perforaciones) + play en marco 16:9. */
export function TopbarGlyphVideoGenerator({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="3.25" y="5.75" width="17.5" height="12.5" rx="2.35" stroke="currentColor" strokeWidth={sw} />
      <path d="M5.25 5.75v2.35M8.6 5.75v2.35M12 5.75v2.35M15.4 5.75v2.35M18.75 5.75v2.35" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" opacity={0.42} />
      <path d="M10.35 12.35L10.35 17.5L15 14.925L10.35 12.35z" fill="currentColor" />
      <path d="M5.25 18.5v2.35M8.6 18.5v2.35M12 18.5v2.35M15.4 18.5v2.35M18.75 18.5v2.35" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" opacity={0.42} />
    </svg>
  );
}

/** Presenter — pantalla de proyección + reproducción (modo presentación). */
export function TopbarGlyphPresenter({ size = 26, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="3.75" y="5.25" width="16.5" height="11" rx="1.65" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M8.25 19.5h7.5M12 16.75v2.75"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
      />
      <path
        d="M10.4 10.85l4.2 2.65-4.2 2.65v-5.3z"
        fill="currentColor"
        fillOpacity={0.92}
      />
      <rect x="5.25" y="7.15" width="5.5" height="0.9" rx="0.35" fill="currentColor" fillOpacity={0.22} />
      <rect x="5.25" y="9.05" width="8.25" height="0.85" rx="0.35" fill="currentColor" fillOpacity={0.18} />
    </svg>
  );
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
  "designer" | "presenter" | "nanoBanana" | "geminiVideo" | "vfxGenerator",
  React.FC<GlyphProps>
> = {
  designer: TopbarGlyphIndesign,
  presenter: TopbarGlyphPresenter,
  nanoBanana: TopbarGlyphImageGenerator,
  geminiVideo: TopbarGlyphVideoGenerator,
  vfxGenerator: TopbarGlyphVfxGenerator,
};
