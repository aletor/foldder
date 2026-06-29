/** Utilidades 3×3 para el pipeline de perfil DCP (row-major, compatible con el shader). */

export const XYZ_TO_LINEAR_SRGB = new Float32Array([
  3.2404542, -1.5371385, -0.4985314,
  -0.969266, 1.8760108, 0.041556,
  0.0556434, -0.2040259, 1.0572252,
]);

export function lerpMatrix3(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(9);
  const w = Math.max(0, Math.min(1, t));
  for (let i = 0; i < 9; i += 1) out[i] = (a[i] ?? 0) * (1 - w) + (b[i] ?? 0) * w;
  return out;
}

export function multiplyMatrix3(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        (a[row * 3] ?? 0) * (b[col] ?? 0) +
        (a[row * 3 + 1] ?? 0) * (b[3 + col] ?? 0) +
        (a[row * 3 + 2] ?? 0) * (b[6 + col] ?? 0);
    }
  }
  return out;
}

/** Invierte una matriz 3×3 row-major; devuelve identidad si es singular. */
export function invertMatrix3(m: Float32Array): Float32Array {
  const a = m[0] ?? 0;
  const b = m[1] ?? 0;
  const c = m[2] ?? 0;
  const d = m[3] ?? 0;
  const e = m[4] ?? 0;
  const f = m[5] ?? 0;
  const g = m[6] ?? 0;
  const h = m[7] ?? 0;
  const i = m[8] ?? 0;

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-8) {
    return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  const invDet = 1 / det;
  return new Float32Array([
    A * invDet, D * invDet, G * invDet,
    B * invDet, E * invDet, H * invDet,
    C * invDet, F * invDet, I * invDet,
  ]);
}

export function transformColor3(m: Float32Array, r: number, g: number, b: number): [number, number, number] {
  return [
    (m[0] ?? 0) * r + (m[1] ?? 0) * g + (m[2] ?? 0) * b,
    (m[3] ?? 0) * r + (m[4] ?? 0) * g + (m[5] ?? 0) * b,
    (m[6] ?? 0) * r + (m[7] ?? 0) * g + (m[8] ?? 0) * b,
  ];
}
