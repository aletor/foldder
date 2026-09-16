import { describe, expect, it } from "vitest";
import { gaussianBlurFloat } from "./analyze-change-mask";
import {
  adaptiveToneLimits,
  edgeWidthIndex,
  grainStd,
  measureOpticalMatch,
  measureOpticalMatchPerComponent,
  opticalRegions,
} from "./optical-match";

const W = 256;
const H = 192;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Textura con bordes (tablero) en gris flotante. */
function checkerGray(period: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const on = (Math.floor(x / period) + Math.floor(y / period)) % 2 === 0;
      out[y * W + x] = on ? 200 : 60;
    }
  }
  return out;
}

function grayToRgb(gray: Float32Array, noise = 0, seed = 1): Uint8Array {
  const rnd = lcg(seed);
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const n = noise > 0 ? (rnd() - 0.5) * noise * 3.46 : 0;
    const v = Math.max(0, Math.min(255, Math.round(gray[i]! + n)));
    out[i * 3] = v;
    out[i * 3 + 1] = v;
    out[i * 3 + 2] = v;
  }
  return out;
}

function rectMask(x: number, y: number, w: number, h: number): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) m[yy * W + xx] = 255;
  return m;
}

const all = new Uint8Array(W * H).fill(255);

describe("optical-match", () => {
  it("edgeWidthIndex: crece con el desenfoque (≈2.35·σ) y el grano no se lee como nitidez", () => {
    const sharp = checkerGray(24);
    const wSharp = edgeWidthIndex(sharp, W, H, all);
    const wBlur3 = edgeWidthIndex(gaussianBlurFloat(sharp, W, H, 3), W, H, all);
    const wBlur6 = edgeWidthIndex(gaussianBlurFloat(sharp, W, H, 6), W, H, all);
    expect(wSharp).not.toBeNull();
    expect(wBlur3).not.toBeNull();
    expect(wBlur6).not.toBeNull();
    expect(wSharp!).toBeLessThan(wBlur3!);
    expect(wBlur3!).toBeLessThan(wBlur6!);
    // Con σ=6 (más el pre-suavizado 1.2) la FWHM esperada es ≈ 2.35·√(36+1.44) ≈ 14 px.
    expect(wBlur6!).toBeGreaterThan(10);
    expect(wBlur6!).toBeLessThan(19);

    // Fondo desenfocado con grano fuerte: sigue midiéndose como desenfocado.
    const rnd = lcg(7);
    const noisyBlur = Float32Array.from(gaussianBlurFloat(sharp, W, H, 6), (v) => v + (rnd() - 0.5) * 24);
    const wNoisy = edgeWidthIndex(noisyBlur, W, H, all);
    expect(wNoisy).not.toBeNull();
    expect(wNoisy!).toBeGreaterThan(wSharp! + 4);

    // Región plana sin bordes: no se puede estimar.
    const flat = new Float32Array(W * H).fill(120);
    expect(edgeWidthIndex(flat, W, H, all)).toBeNull();
  });

  it("opticalRegions separa anillo exterior e interior sin solaparse", () => {
    const mask = rectMask(100, 70, 60, 50);
    const r = opticalRegions(mask, W, H, 6);
    expect(r.ringPixels).toBeGreaterThan(500);
    expect(r.innerPixels).toBeGreaterThan(500);
    for (let i = 0; i < W * H; i++) {
      if (r.ring[i]) expect(mask[i]).toBe(0);
      if (r.inner[i]) expect(mask[i]).toBe(255);
    }
  });

  it("measureOpticalMatch: fondo borroso + parche nítido ⇒ σ≈desenfoque del fondo; parche ya borroso ⇒ σ=0", () => {
    const sharp = checkerGray(24);
    const blurredBase = gaussianBlurFloat(sharp, W, H, 4);
    const base = grayToRgb(blurredBase);
    const mask = rectMask(96, 64, 64, 64);

    // Generada: igual que la base fuera, nítida dentro de la máscara.
    const genGray = Float32Array.from(blurredBase);
    for (let i = 0; i < W * H; i++) if (mask[i]) genGray[i] = sharp[i]!;
    const gen = grayToRgb(genGray);
    const stats = measureOpticalMatch({ base, generated: gen, mask, w: W, h: H, ringPx: 8, maxSigma: 8 });
    expect(stats.baseEdgeWidthPx).not.toBeNull();
    expect(stats.generatedEdgeWidthPx).not.toBeNull();
    expect(stats.generatedEdgeWidthPx!).toBeLessThan(stats.baseEdgeWidthPx!);
    expect(stats.blurSigmaPx).toBeGreaterThan(2);
    expect(stats.blurSigmaPx).toBeLessThan(6.5);

    // Generada ya tan borrosa como la base: no se desenfoca más.
    const same = measureOpticalMatch({ base, generated: base, mask, w: W, h: H, ringPx: 8, maxSigma: 8 });
    expect(same.blurSigmaPx).toBe(0);

    // Base nítida y generada borrosa: nunca se "enfoca" (σ=0).
    const reverse = measureOpticalMatch({ base: grayToRgb(sharp), generated: base, mask, w: W, h: H, ringPx: 8, maxSigma: 8 });
    expect(reverse.blurSigmaPx).toBe(0);
  });

  it("por componente: zona sobre fondo borroso recibe σ>0 y zona sobre área nítida σ=0, aunque compartan máscara", () => {
    const crisp = checkerGray(24);
    // Base: mitad izquierda desenfocada (fondo), mitad derecha nítida (sujeto).
    const blurred = gaussianBlurFloat(crisp, W, H, 4);
    const baseGray = Float32Array.from(crisp);
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) baseGray[y * W + x] = blurred[y * W + x]!;
    const base = grayToRgb(baseGray);

    const maskLeft = rectMask(30, 60, 60, 60);
    const maskRight = rectMask(170, 60, 60, 60);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = maskLeft[i]! | maskRight[i]!;

    // Generada: nítida dentro de ambas zonas (el modelo "enfoca" todo lo que pinta).
    const genGray = Float32Array.from(baseGray);
    for (let i = 0; i < W * H; i++) if (mask[i]) genGray[i] = crisp[i]!;
    const gen = grayToRgb(genGray);

    const result = measureOpticalMatchPerComponent({ base, generated: gen, mask, w: W, h: H, ringPx: 8, maxSigma: 8 });
    expect(result.components).toHaveLength(2);
    const left = result.components.find((c) => c.bbox.x1 < W / 2)!;
    const right = result.components.find((c) => c.bbox.x1 > W / 2)!;
    expect(left.stats.blurSigmaPx).toBeGreaterThan(2);
    expect(right.stats.blurSigmaPx).toBe(0);
    expect(result.summary.blurSigmaPx).toBe(left.stats.blurSigmaPx);
    // Las etiquetas cubren exactamente la máscara.
    for (let i = 0; i < W * H; i++) expect(result.labels[i]! > 0).toBe(mask[i] === 255);

    // Con una única medición global el fondo borroso quedaría enmascarado por los bordes nítidos.
    const global = measureOpticalMatch({ base, generated: gen, mask, w: W, h: H, ringPx: 8, maxSigma: 8 });
    expect(global.blurSigmaPx).toBeLessThan(left.stats.blurSigmaPx);
  });

  it("measureOpticalMatch: base con grano y generada limpia ⇒ grano a añadir > 0 (y nunca al revés)", () => {
    const flat = new Float32Array(W * H).fill(120);
    const base = grayToRgb(flat, 8, 3);
    const gen = grayToRgb(flat, 0);
    const mask = rectMask(96, 64, 64, 64);
    const stats = measureOpticalMatch({ base, generated: gen, mask, w: W, h: H, ringPx: 8 });
    expect(stats.baseGrain).toBeGreaterThan(stats.generatedGrain + 3);
    expect(stats.grainAdded).toBeGreaterThan(2);
    const reverse = measureOpticalMatch({ base: gen, generated: base, mask, w: W, h: H, ringPx: 8 });
    expect(reverse.grainAdded).toBe(0);
  });

  it("grainStd crece con el ruido", () => {
    const flat = new Float32Array(W * H).fill(100);
    const rnd = lcg(11);
    const noisy = Float32Array.from(flat, (v) => v + (rnd() - 0.5) * 20);
    expect(grainStd(noisy, W, H, all)).toBeGreaterThan(grainStd(flat, W, H, all) + 2);
  });

  it("adaptiveToneLimits amplía el tope cuando la zona sin cambio difiere mucho y lo mantiene si no", () => {
    const flat = new Float32Array(W * H).fill(100);
    const base = grayToRgb(flat);
    const mask = rectMask(96, 64, 64, 64);
    const close = grayToRgb(Float32Array.from(flat, (v) => v + 4));
    const far = grayToRgb(Float32Array.from(flat, (v) => v + 50));
    const a = adaptiveToneLimits({ base, generated: close, maskSoft: mask, n: W * H });
    const b = adaptiveToneLimits({ base, generated: far, maskSoft: mask, n: W * H });
    expect(a.maxCorrection).toBe(32);
    expect(b.maxCorrection).toBeGreaterThan(60);
    expect(b.maxCorrection).toBeLessThanOrEqual(96);
  });
});
