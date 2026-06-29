/** Calcula histograma RGB 256 bins desde píxeles RGBA 8-bit. */
export function computeRgbHistogram(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array } {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const n = width * height;
  for (let i = 0; i < n; i += 1) {
    const si = i * 4;
    const rv = pixels[si] ?? 0;
    const gv = pixels[si + 1] ?? 0;
    const bv = pixels[si + 2] ?? 0;
    r[rv] = (r[rv] ?? 0) + 1;
    g[gv] = (g[gv] ?? 0) + 1;
    b[bv] = (b[bv] ?? 0) + 1;
    const y = Math.round(0.2126 * rv + 0.7152 * gv + 0.0722 * bv);
    luma[y] = (luma[y] ?? 0) + 1;
  }
  return { r, g, b, luma };
}

export function histogramToPath(hist: Uint32Array, w: number, h: number): string {
  let max = 1;
  for (let i = 0; i < 256; i += 1) {
    if ((hist[i] ?? 0) > max) max = hist[i] ?? 1;
  }
  const step = w / 255;
  let d = `M 0 ${h}`;
  for (let i = 0; i < 256; i += 1) {
    const x = i * step;
    const barH = ((hist[i] ?? 0) / max) * h;
    d += ` L ${x} ${h - barH}`;
  }
  d += ` L ${w} ${h} Z`;
  return d;
}

export function histogramToPolyline(hist: Uint32Array, w: number, h: number): string {
  let max = 1;
  for (let i = 0; i < 256; i += 1) {
    if ((hist[i] ?? 0) > max) max = hist[i] ?? 1;
  }
  const step = w / 255;
  const parts: string[] = [];
  for (let i = 0; i < 256; i += 1) {
    const x = i * step;
    const y = h - ((hist[i] ?? 0) / max) * h;
    parts.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
  }
  return parts.join(" ");
}
