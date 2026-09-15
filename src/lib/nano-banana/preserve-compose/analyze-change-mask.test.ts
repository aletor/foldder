import { describe, expect, it } from "vitest";
import {
  analyzeChangeMask,
  chamferDistance,
  estimateGlobalShift,
  fillHoles,
  resolveChangeMaskOptions,
  rgbToGray,
  translateRgb,
} from "./analyze-change-mask";
import { computeLowFrequencyCorrection, pullPushFill } from "./seam-correction";

const W = 256;
const H = 192;
const N = W * H;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Base texturizada determinista: gradientes + ruido ±20. */
function makeBase(): Uint8Array {
  const rnd = lcg(7);
  const out = new Uint8Array(N * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 3;
      const noise = (rnd() - 0.5) * 40;
      out[j] = clamp8(120 + 50 * Math.sin(x / 9) + noise);
      out[j + 1] = clamp8(110 + 40 * Math.cos(y / 13) + noise);
      out[j + 2] = clamp8(100 + 30 * Math.sin((x + y) / 17) + noise);
    }
  }
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
const PATCH: Rect = { x: 100, y: 70, w: 60, h: 50 };
const PRIOR: Rect = { x: 110, y: 80, w: 40, h: 30 };
const EXTENSION: Rect = { x: 160, y: 70, w: 30, h: 50 };
/** Mota lejana (~2 % del ancho): a 1024 px equivale a ~24 px, por debajo del área mínima lejana. */
const FAR_BLOB: Rect = { x: 220, y: 20, w: 6, h: 6 };

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function rectMask(r: Rect): Uint8Array {
  const m = new Uint8Array(N);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) m[y * W + x] = 255;
  return m;
}

/**
 * Generada sintética: base re-renderizada (tono ×1.05 +6, ruido ±3), parche sustituido,
 * extensión conectada moderada, alucinación lejana pequeña y desplazamiento opcional.
 */
function makeGenerated(base: Uint8Array, opts: { shiftX?: number; patch?: boolean; extension?: boolean; farBlob?: boolean; invert?: boolean }): Uint8Array {
  const rnd = lcg(99);
  const src = opts.shiftX ? translateRgb(base, W, H, opts.shiftX, 0) : base;
  const out = new Uint8Array(N * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        let v = src[j + c]! * 1.05 + 6 + (rnd() - 0.5) * 6;
        if (opts.invert) v = 255 - src[j + c]!;
        if (opts.patch && inRect(x, y, PATCH)) v = c === 0 ? 210 + (rnd() - 0.5) * 20 : 40 + (rnd() - 0.5) * 20;
        if (opts.extension && inRect(x, y, EXTENSION)) v = src[j + c]! * 1.05 + 6 + 34;
        if (opts.farBlob && inRect(x, y, FAR_BLOB)) v = 255 - src[j + c]!;
        out[j + c] = clamp8(v);
      }
    }
  }
  return out;
}

function coverage(mask: Uint8Array, r: Rect): number {
  let hit = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (mask[y * W + x]) hit++;
  return hit / (r.w * r.h);
}

describe("analyzeChangeMask · pareja sintética", () => {
  const base = makeBase();

  it("acepta el parche real aunque sea mayor que el lazo, y conserva el resto", () => {
    const gen = makeGenerated(base, { patch: true });
    const res = analyzeChangeMask({ width: W, height: H, base, generated: gen, prior: rectMask(PRIOR) });
    expect(res.stats.decision).toBe("compose");
    expect(coverage(res.mask, PATCH)).toBeGreaterThan(0.95);
    // Esquinas lejanas intactas.
    expect(res.mask[0]).toBe(0);
    expect(res.mask[(H - 1) * W + (W - 1)]).toBe(0);
    expect(res.mask[(H - 5) * W + 5]).toBe(0);
    // Igualado tonal deshace la deriva ×1.05 +6.
    expect(res.stats.toneGain[0]).toBeGreaterThan(0.9);
    expect(res.stats.toneGain[0]).toBeLessThan(1);
    expect(res.stats.toneOffset[0]).toBeLessThan(0);
    // Área aceptada acotada al entorno del parche (3000/49152 ≈ 6 %, con dilatación < 12 %).
    expect(res.stats.changedFraction).toBeGreaterThan(0.05);
    expect(res.stats.changedFraction).toBeLessThan(0.12);
  });

  it("incluye una extensión débil conectada (humo/sombra) y descarta una alucinación lejana", () => {
    const gen = makeGenerated(base, { patch: true, extension: true, farBlob: true });
    const res = analyzeChangeMask({ width: W, height: H, base, generated: gen, prior: rectMask(PRIOR) });
    expect(res.stats.decision).toBe("compose");
    expect(coverage(res.mask, EXTENSION)).toBeGreaterThan(0.85);
    expect(coverage(res.mask, FAR_BLOB)).toBe(0);
    expect(res.stats.componentsDropped).toBeGreaterThanOrEqual(1);
  });

  it("detecta y corrige un desplazamiento global pequeño sin marcar todo como cambio", () => {
    const gen = makeGenerated(base, { shiftX: 2, patch: true });
    const res = analyzeChangeMask({ width: W, height: H, base, generated: gen, prior: rectMask(PRIOR) });
    expect(res.stats.decision).toBe("compose");
    // La generada está desplazada +2 px; la corrección a aplicar es −2.
    expect(res.stats.shift).toEqual({ dx: -2, dy: 0 });
    expect(coverage(res.mask, PATCH)).toBeGreaterThan(0.9);
    expect(res.stats.changedFraction).toBeLessThan(0.15);
  });

  it("marca como global una regeneración completa", () => {
    const gen = makeGenerated(base, { invert: true });
    const res = analyzeChangeMask({ width: W, height: H, base, generated: gen, prior: rectMask(PRIOR) });
    expect(res.stats.decision).toBe("skip-global");
  });

  it("marca sin cambios un re-render que solo aporta ruido y deriva tonal", () => {
    const gen = makeGenerated(base, {});
    const res = analyzeChangeMask({ width: W, height: H, base, generated: gen, prior: rectMask(PRIOR) });
    expect(res.stats.decision).toBe("skip-no-change");
  });

  it("funciona sin prior (umbral de anillo uniforme)", () => {
    const gen = makeGenerated(base, { patch: true, farBlob: true });
    const res = analyzeChangeMask({ width: W, height: H, base, generated: gen, prior: null });
    expect(res.stats.decision).toBe("compose");
    expect(coverage(res.mask, PATCH)).toBeGreaterThan(0.9);
  });

  it("presets de sensibilidad derivan del base", () => {
    const auto = resolveChangeMaskOptions("auto");
    const strict = resolveChangeMaskOptions("strict");
    const wide = resolveChangeMaskOptions("wide");
    expect(strict.farMinArea).toBeGreaterThan(auto.farMinArea);
    expect(wide.ringBboxMul).toBeGreaterThan(auto.ringBboxMul);
    expect(resolveChangeMaskOptions("auto", { maxChangedFraction: 0.5 }).maxChangedFraction).toBe(0.5);
  });
});

describe("primitivas", () => {
  it("chamferDistance ≈ euclídea", () => {
    const m = new Uint8Array(N);
    m[50 * W + 50] = 255;
    const d = chamferDistance(m, W, H);
    expect(d[50 * W + 50]).toBe(0);
    expect(d[50 * W + 60]).toBeCloseTo(10, 0);
    expect(Math.abs(d[60 * W + 60]! - Math.SQRT2 * 10)).toBeLessThan(1.5);
  });

  it("estimateGlobalShift recupera la traslación en gris", () => {
    const base = makeBase();
    const shifted = translateRgb(base, W, H, 3, -2);
    const est = estimateGlobalShift(rgbToGray(base, N), rgbToGray(shifted, N), W, H, null, 8);
    // Devuelve la corrección (inversa del desplazamiento aplicado).
    expect(est.dx).toBe(-3);
    expect(est.dy).toBe(2);
    expect(est.confident).toBe(true);
  });

  it("fillHoles rellena huecos cerrados y respeta el fondo que toca el borde", () => {
    const m = rectMask({ x: 20, y: 20, w: 40, h: 40 });
    m[40 * W + 40] = 0;
    m[40 * W + 41] = 0;
    const filled = fillHoles(m, W, H, 100);
    expect(filled[40 * W + 40]).toBe(255);
    expect(filled[0]).toBe(0);
  });

  it("pullPushFill extrapola un campo constante dentro del hueco", () => {
    const w = 32;
    const h = 32;
    const vals = new Float32Array(w * h * 3);
    const wts = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = (i - x) / w;
      const hole = x >= 10 && x < 22 && y >= 10 && y < 22;
      wts[i] = hole ? 0 : 1;
      vals[i * 3] = 10;
      vals[i * 3 + 1] = -4;
      vals[i * 3 + 2] = 0;
    }
    const filled = pullPushFill(vals, wts, w, h);
    const center = (16 * w + 16) * 3;
    expect(filled[center]).toBeCloseTo(10, 3);
    expect(filled[center + 1]).toBeCloseTo(-4, 3);
  });

  it("computeLowFrequencyCorrection recupera un desfase uniforme dentro de la máscara", () => {
    const w = 64;
    const h = 64;
    const base = new Uint8Array(w * h * 3).fill(120);
    const gen = new Uint8Array(w * h * 3).fill(110);
    const mask = new Uint8Array(w * h);
    for (let y = 20; y < 44; y++) for (let x = 20; x < 44; x++) mask[y * w + x] = 255;
    const c = computeLowFrequencyCorrection({ base, generated: gen, maskSoft: mask, width: w, height: h, sigmaPx: 2 });
    expect(c[(32 * w + 32) * 3]).toBeCloseTo(10, 1);
    expect(c[(2 * w + 2) * 3]).toBeCloseTo(10, 1);
  });
});
