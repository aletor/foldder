/**
 * Preserve-compose · corrección de costura de baja frecuencia ("Poisson lite").
 *
 * Extrapola la diferencia (base − generada) desde las zonas sin cambio hacia el interior de la
 * máscara con una convolución normalizada push-pull, y la suaviza. Sumada a la generada dentro
 * de la máscara, elimina saltos de brillo/color en la frontera sin resolver una EDP.
 *
 * Puro (typed arrays), a escala de análisis.
 */

import { gaussianBlurFloat } from "./analyze-change-mask";

type PyramidLevel = { w: number; h: number; sum: Float32Array; wt: Float32Array };

/**
 * Rellena `values` (3 canales) donde `weights` ≈ 0 con una extrapolación suave de los píxeles
 * conocidos (push-pull de Gortler et al.). `weights` en [0,1].
 */
export function pullPushFill(values: Float32Array, weights: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const level0: PyramidLevel = { w, h, sum: new Float32Array(n * 3), wt: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const wt = weights[i]! < 0 ? 0 : weights[i]! > 1 ? 1 : weights[i]!;
    level0.wt[i] = wt;
    level0.sum[i * 3] = values[i * 3]! * wt;
    level0.sum[i * 3 + 1] = values[i * 3 + 1]! * wt;
    level0.sum[i * 3 + 2] = values[i * 3 + 2]! * wt;
  }
  const levels: PyramidLevel[] = [level0];
  while (levels[levels.length - 1]!.w > 1 || levels[levels.length - 1]!.h > 1) {
    const fine = levels[levels.length - 1]!;
    const cw = Math.ceil(fine.w / 2);
    const ch = Math.ceil(fine.h / 2);
    const coarse: PyramidLevel = { w: cw, h: ch, sum: new Float32Array(cw * ch * 3), wt: new Float32Array(cw * ch) };
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        let wt = 0;
        for (let dy = 0; dy < 2; dy++) {
          const fy = y * 2 + dy;
          if (fy >= fine.h) continue;
          for (let dx = 0; dx < 2; dx++) {
            const fx = x * 2 + dx;
            if (fx >= fine.w) continue;
            const fi = fy * fine.w + fx;
            s0 += fine.sum[fi * 3]!;
            s1 += fine.sum[fi * 3 + 1]!;
            s2 += fine.sum[fi * 3 + 2]!;
            wt += fine.wt[fi]!;
          }
        }
        const ci = y * cw + x;
        if (wt > 0) {
          const clamped = wt > 1 ? 1 : wt;
          const scale = clamped / wt;
          coarse.sum[ci * 3] = s0 * scale;
          coarse.sum[ci * 3 + 1] = s1 * scale;
          coarse.sum[ci * 3 + 2] = s2 * scale;
          coarse.wt[ci] = clamped;
        }
      }
    }
    levels.push(coarse);
  }

  // Pull: del nivel más grueso al fino.
  const top = levels[levels.length - 1]!;
  let coarseResult = new Float32Array(top.w * top.h * 3);
  for (let i = 0; i < top.w * top.h; i++) {
    const wt = top.wt[i]!;
    if (wt > 0) {
      coarseResult[i * 3] = top.sum[i * 3]! / wt;
      coarseResult[i * 3 + 1] = top.sum[i * 3 + 1]! / wt;
      coarseResult[i * 3 + 2] = top.sum[i * 3 + 2]! / wt;
    }
  }
  for (let L = levels.length - 2; L >= 0; L--) {
    const fine = levels[L]!;
    const coarse = levels[L + 1]!;
    const result = new Float32Array(fine.w * fine.h * 3);
    for (let y = 0; y < fine.h; y++) {
      const cy = y >> 1;
      for (let x = 0; x < fine.w; x++) {
        const cx = x >> 1;
        const ci = (cy * coarse.w + cx) * 3;
        const fi = y * fine.w + x;
        const known = fine.wt[fi]!;
        for (let c = 0; c < 3; c++) {
          const own = known > 0 ? fine.sum[fi * 3 + c]! / known : 0;
          result[fi * 3 + c] = known * own + (1 - known) * coarseResult[ci + c]!;
        }
      }
    }
    coarseResult = result;
  }
  return coarseResult;
}

export type LowFrequencyCorrectionArgs = {
  /** RGB intercalado a escala de análisis. */
  base: Uint8Array;
  /** RGB intercalado, ya alineada y con tono igualado. */
  generated: Uint8Array;
  /** Máscara suave 0..255 (255 = usar generada). */
  maskSoft: Uint8Array;
  width: number;
  height: number;
  /** σ del suavizado final (px a escala de análisis). */
  sigmaPx: number;
  /** Diferencias por encima de esto (por canal) se consideran "cambio real" y pesan menos. */
  robustThreshold?: number;
  /** Valor absoluto máximo de la corrección resultante. */
  maxCorrection?: number;
};

/**
 * Devuelve C (3 canales, Float32) tal que generada + C se funde con la base en la frontera.
 * Fuera de la máscara C ≈ base − generada suavizado; dentro, extrapolación suave.
 */
export function computeLowFrequencyCorrection(args: LowFrequencyCorrectionArgs): Float32Array {
  const { width: w, height: h } = args;
  const n = w * h;
  const robustT = args.robustThreshold ?? 24;
  const maxC = args.maxCorrection ?? 32;
  const diff = new Float32Array(n * 3);
  const weights = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    const d0 = args.base[j]! - args.generated[j]!;
    const d1 = args.base[j + 1]! - args.generated[j + 1]!;
    const d2 = args.base[j + 2]! - args.generated[j + 2]!;
    diff[j] = d0;
    diff[j + 1] = d1;
    diff[j + 2] = d2;
    const maxAbs = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
    const unchanged = 1 - args.maskSoft[i]! / 255;
    const robust = maxAbs > robustT ? robustT / maxAbs : 1;
    weights[i] = unchanged * robust;
  }
  const filled = pullPushFill(diff, weights, w, h);
  const out = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = filled[i * 3 + c]!;
    const smooth = gaussianBlurFloat(ch, w, h, args.sigmaPx);
    for (let i = 0; i < n; i++) {
      const v = smooth[i]!;
      out[i * 3 + c] = v > maxC ? maxC : v < -maxC ? -maxC : v;
    }
  }
  return out;
}
