/** Parser LUT 3D .cube (Adobe/IRIDAS) para acabado creativo post-sRGB. */

export type CubeLut3D = {
  id: string;
  name: string;
  size: number;
  /** RGB interleaved, size³×3, dominio 0…1 */
  rgb: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
};

export function parseCubeLut(text: string, name?: string): CubeLut3D {
  const lines = text.split(/\r?\n/);
  let size = 0;
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith("TITLE")) continue;
    if (upper.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1] ?? "0", 10);
      continue;
    }
    if (upper.startsWith("LUT_1D_SIZE")) {
      throw new Error("LUT 1D no soportada; usa LUT_3D_SIZE");
    }
    if (upper.startsWith("DOMAIN_MIN")) {
      const p = line.split(/\s+/).slice(1).map(Number);
      domainMin[0] = p[0] ?? 0;
      domainMin[1] = p[1] ?? 0;
      domainMin[2] = p[2] ?? 0;
      continue;
    }
    if (upper.startsWith("DOMAIN_MAX")) {
      const p = line.split(/\s+/).slice(1).map(Number);
      domainMax[0] = p[0] ?? 1;
      domainMax[1] = p[1] ?? 1;
      domainMax[2] = p[2] ?? 1;
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0]!, parts[1]!, parts[2]!);
    }
  }

  if (size < 2) throw new Error("LUT_3D_SIZE inválido o ausente");
  const expected = size * size * size * 3;
  if (values.length < expected) {
    throw new Error(`LUT incompleta: esperados ${expected} valores, hay ${values.length}`);
  }

  const rgb = new Float32Array(expected);
  for (let i = 0; i < expected; i += 1) rgb[i] = values[i] ?? 0;

  return {
    id: crypto.randomUUID(),
    name: name?.replace(/\.cube$/i, "") || "LUT creativa",
    size,
    rgb,
    domainMin,
    domainMax,
  };
}

/** Muestrea LUT 3D con trilineal (CPU, tests). */
export function sampleCubeLut3d(lut: CubeLut3D, r: number, g: number, b: number): [number, number, number] {
  const { size, rgb, domainMin, domainMax } = lut;
  const nr = mapDomain(r, domainMin[0], domainMax[0]);
  const ng = mapDomain(g, domainMin[1], domainMax[1]);
  const nb = mapDomain(b, domainMin[2], domainMax[2]);
  const max = size - 1;
  const fr = nr * max;
  const fg = ng * max;
  const fb = nb * max;
  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(max, r0 + 1);
  const g1 = Math.min(max, g0 + 1);
  const b1 = Math.min(max, b0 + 1);
  const tr = fr - r0;
  const tg = fg - g0;
  const tb = fb - b0;

  const c000 = readRgb(rgb, size, r0, g0, b0);
  const c100 = readRgb(rgb, size, r1, g0, b0);
  const c010 = readRgb(rgb, size, r0, g1, b0);
  const c110 = readRgb(rgb, size, r1, g1, b0);
  const c001 = readRgb(rgb, size, r0, g0, b1);
  const c101 = readRgb(rgb, size, r1, g0, b1);
  const c011 = readRgb(rgb, size, r0, g1, b1);
  const c111 = readRgb(rgb, size, r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const c00 = c000[ch]! * (1 - tr) + c100[ch]! * tr;
    const c01 = c001[ch]! * (1 - tr) + c101[ch]! * tr;
    const c10 = c010[ch]! * (1 - tr) + c110[ch]! * tr;
    const c11 = c011[ch]! * (1 - tr) + c111[ch]! * tr;
    const c0 = c00 * (1 - tg) + c10 * tg;
    const c1 = c01 * (1 - tg) + c11 * tg;
    out[ch] = c0 * (1 - tb) + c1 * tb;
  }
  return out;
}

function mapDomain(v: number, min: number, max: number): number {
  if (max <= min) return Math.max(0, Math.min(1, v));
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

function readRgb(data: Float32Array, size: number, r: number, g: number, b: number): [number, number, number] {
  const idx = (b * size * size + g * size + r) * 3;
  return [data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0];
}

/** Empaqueta RGB para textura 3D WebGL2 (R,G,B por texel). */
export function packCubeLutForTexture3D(lut: CubeLut3D): Uint8Array {
  const n = lut.size ** 3;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const si = i * 3;
    out[i * 4] = Math.round(Math.max(0, Math.min(1, lut.rgb[si] ?? 0)) * 255);
    out[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, lut.rgb[si + 1] ?? 0)) * 255);
    out[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, lut.rgb[si + 2] ?? 0)) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
