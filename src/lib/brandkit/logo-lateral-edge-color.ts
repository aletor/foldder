export type RgbTriplet = [number, number, number];

function medianChannel(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function rgbTripletToHex([r, g, b]: RgbTriplet): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** Mediana RGB de muestras laterales — estable ante un píxel atípico. */
export function medianRgbFromSamples(samples: RgbTriplet[]): string | null {
  if (!samples.length) return null;
  return rgbTripletToHex([
    medianChannel(samples.map((sample) => sample[0])),
    medianChannel(samples.map((sample) => sample[1])),
    medianChannel(samples.map((sample) => sample[2])),
  ]);
}

/**
 * Muestrea franjas izquierda y derecha de un buffer RGBA (4 canales).
 * Omite píxeles casi transparentes.
 */
export function sampleLateralEdgeRgbFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { stripRatio?: number; rowStride?: number; minAlpha?: number },
): RgbTriplet[] {
  const stripRatio = options?.stripRatio ?? 0.03;
  const rowStride = Math.max(1, options?.rowStride ?? Math.floor(height / 40));
  const minAlpha = options?.minAlpha ?? 128;
  const strip = Math.max(1, Math.round(width * stripRatio));
  const samples: RgbTriplet[] = [];

  for (let y = 0; y < height; y += rowStride) {
    for (let x = 0; x < strip; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] ?? 0;
      if (alpha < minAlpha) continue;
      samples.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    }
    for (let x = width - strip; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] ?? 0;
      if (alpha < minAlpha) continue;
      samples.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    }
  }

  return samples;
}

export function lateralEdgeHexFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const samples = sampleLateralEdgeRgbFromRgba(data, width, height);
  return medianRgbFromSamples(samples);
}
