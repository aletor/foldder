import React from "react";
import type { PhotoFilterPreset } from "./layer-effects-types";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Primitivas SVG de un filtro fotográfico de mapeo tonal (duotono, teal&orange, split-tone).
 * `SourceGraphic` se gradúa y luego se mezcla con el original según `intensity` (alpha del resultado × t).
 */
export function photoFilterSvgPrimitives(
  preset: PhotoFilterPreset,
  intensity: number,
): React.ReactNode {
  const t = clamp01(intensity);
  const blend = (result: string) => (
    <>
      <feComponentTransfer in={result} result="fhpfGradedA">
        <feFuncA type="linear" slope={t} intercept={0} />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="fhpfGradedA" />
      </feMerge>
    </>
  );

  if (preset === "duotone") {
    // Sombras → índigo profundo; luces → crema cálida (duotono de luminancia).
    const a = [0.09, 0.08, 0.28];
    const b = [1.0, 0.86, 0.62];
    return (
      <>
        <feColorMatrix
          type="matrix"
          values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
          result="fhpfLum"
        />
        <feComponentTransfer in="fhpfLum" result="fhpfGraded">
          <feFuncR type="table" tableValues={`${a[0]} ${b[0]}`} />
          <feFuncG type="table" tableValues={`${a[1]} ${b[1]}`} />
          <feFuncB type="table" tableValues={`${a[2]} ${b[2]}`} />
        </feComponentTransfer>
        {blend("fhpfGraded")}
      </>
    );
  }

  if (preset === "teal-orange") {
    // Cinematográfico: sombras teal, luces naranja (curvas por canal).
    return (
      <>
        <feComponentTransfer in="SourceGraphic" result="fhpfGraded">
          <feFuncR type="table" tableValues="0.10 0.55 1.0" />
          <feFuncG type="table" tableValues="0.18 0.50 0.86" />
          <feFuncB type="table" tableValues="0.30 0.44 0.52" />
        </feComponentTransfer>
        {blend("fhpfGraded")}
      </>
    );
  }

  // split-tone: sombras azul frío, luces dorado cálido.
  return (
    <>
      <feComponentTransfer in="SourceGraphic" result="fhpfGraded">
        <feFuncR type="table" tableValues="0.04 0.50 1.0" />
        <feFuncG type="table" tableValues="0.10 0.50 0.92" />
        <feFuncB type="table" tableValues="0.32 0.50 0.42" />
      </feComponentTransfer>
      {blend("fhpfGraded")}
    </>
  );
}

/** `<filter>` SVG listo para referenciar con `filter: url(#id)`. */
export function PhotoFilterSvgFilter({
  id,
  preset,
  intensity,
}: {
  id: string;
  preset: PhotoFilterPreset;
  intensity: number;
}): React.ReactElement {
  return (
    <filter
      id={id}
      colorInterpolationFilters="sRGB"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
    >
      {photoFilterSvgPrimitives(preset, intensity)}
    </filter>
  );
}
