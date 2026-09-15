import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { blendInPlace, featherPxForSize, preserveComposeImages } from "./compose";

const W = 640;
const H = 480;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const c8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function baseRaw(): Buffer {
  const rnd = lcg(3);
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 3;
      const n = (rnd() - 0.5) * 30;
      out[j] = c8(130 + 60 * Math.sin(x / 23) + n);
      out[j + 1] = c8(120 + 50 * Math.cos(y / 19) + n);
      out[j + 2] = c8(90 + 40 * Math.sin((x - y) / 31) + n);
    }
  }
  return out;
}

const PATCH = { x: 260, y: 180, w: 140, h: 120 };
const PRIOR = { x: 290, y: 200, w: 80, h: 70 };

/** "Re-render" del modelo: mitad de resolución, deriva tonal, y parche rojo nuevo. */
async function generatedPng(base: Buffer): Promise<Buffer> {
  const low = await sharp(base, { raw: { width: W, height: H, channels: 3 } })
    .resize(Math.round(W / 2), Math.round(H / 2), { kernel: sharp.kernel.lanczos3 })
    .resize(W, H, { kernel: sharp.kernel.lanczos3 })
    .linear([1.04, 1.04, 1.04], [5, 5, 5])
    .raw()
    .toBuffer();
  for (let y = PATCH.y; y < PATCH.y + PATCH.h; y++) {
    for (let x = PATCH.x; x < PATCH.x + PATCH.w; x++) {
      const j = (y * W + x) * 3;
      low[j] = 200;
      low[j + 1] = 30;
      low[j + 2] = 40;
    }
  }
  return sharp(low, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

async function priorPng(): Promise<Buffer> {
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = PRIOR.y; y < PRIOR.y + PRIOR.h; y++) {
    for (let x = PRIOR.x; x < PRIOR.x + PRIOR.w; x++) {
      const j = (y * W + x) * 4;
      rgba[j] = 255;
      rgba[j + 1] = 255;
      rgba[j + 2] = 255;
      rgba[j + 3] = 255;
    }
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

describe("preserveComposeImages", () => {
  it("compone: parche nuevo de la generada, resto byte a byte de la base", async () => {
    const raw = baseRaw();
    const basePng = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    const gen = await generatedPng(raw);
    const result = await preserveComposeImages({ base: basePng, generated: gen, priorMask: await priorPng(), wantMaskPreview: true });
    expect(result.composed).toBe(true);
    if (!result.composed) return;
    expect(result.width).toBe(W);
    expect(result.height).toBe(H);
    expect(result.stats.decision).toBe("compose");
    expect(result.maskPreviewPng).toBeInstanceOf(Buffer);

    const out = await sharp(result.png).raw().toBuffer();
    // Esquinas y zonas alejadas: idénticas a la base (la base no pierde calidad).
    for (const [x, y] of [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6], [100, 400], [500, 60]]) {
      const j = (y * W + x) * 3;
      expect(out[j]).toBe(raw[j]);
      expect(out[j + 1]).toBe(raw[j + 1]);
      expect(out[j + 2]).toBe(raw[j + 2]);
    }
    // Centro del parche: color de la generada (rojo), no el de la base.
    const cj = ((PATCH.y + PATCH.h / 2) * W + (PATCH.x + PATCH.w / 2)) * 3;
    expect(out[cj]).toBeGreaterThan(160);
    expect(out[cj + 1]).toBeLessThan(90);
    expect(out[cj + 2]).toBeLessThan(100);
    // El área compuesta es del orden del parche (140×120 ≈ 5.5 %), no de todo el fotograma.
    expect(result.stats.changedFraction).toBeGreaterThan(0.04);
    expect(result.stats.changedFraction).toBeLessThan(0.12);
  }, 30_000);

  it("salta cuando la relación de aspecto no coincide", async () => {
    const raw = baseRaw();
    const basePng = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    const square = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).resize(400, 400, { fit: "fill" }).png().toBuffer();
    const result = await preserveComposeImages({ base: basePng, generated: square, priorMask: null });
    expect(result.composed).toBe(false);
    if (result.composed) return;
    expect(result.decision).toBe("aspect-mismatch");
  });

  it("salta cuando la base excede el máximo de píxeles configurado", async () => {
    const raw = baseRaw();
    const basePng = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    const result = await preserveComposeImages({ base: basePng, generated: basePng, priorMask: null, maxPixels: 1000 });
    expect(result.composed).toBe(false);
    if (result.composed) return;
    expect(result.decision).toBe("too-large");
  });

  it("blendInPlace respeta α=0 y aplica la corrección con α=1", () => {
    const w = 4;
    const h = 2;
    const base = Buffer.from([10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30]);
    const gen = Buffer.alloc(w * h * 3, 100);
    const mask = Buffer.from([0, 0, 255, 255, 0, 0, 255, 255]);
    const corr = new Float32Array(w * h * 3).fill(5);
    blendInPlace({ base, generated: gen, maskSoft: mask, width: w, height: h, correction: corr, correctionWidth: w, correctionHeight: h });
    expect([base[0], base[1], base[2]]).toEqual([10, 20, 30]);
    expect([base[6], base[7], base[8]]).toEqual([105, 105, 105]);
  });

  it("featherPxForSize escala con el lado largo y queda acotado", () => {
    expect(featherPxForSize(1024, 768)).toBe(12);
    expect(featherPxForSize(4096, 4096)).toBe(40);
    expect(featherPxForSize(200, 200)).toBe(6);
  });
});
