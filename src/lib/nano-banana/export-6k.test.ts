import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { chooseEsrganScale, finalizeExport6kPng, planExport6k, EXPORT_6K_LONG_SIDE } from "./export-6k";

describe("planExport6k", () => {
  it("elige ×2 desde ~2K (×4 tumba CUDA) y ×4 solo desde ~1K", () => {
    expect(chooseEsrganScale(2752, EXPORT_6K_LONG_SIDE)).toBe(2);
    expect(chooseEsrganScale(2048, EXPORT_6K_LONG_SIDE)).toBe(2);
    expect(chooseEsrganScale(1280, EXPORT_6K_LONG_SIDE)).toBe(4);
    expect(chooseEsrganScale(1024, EXPORT_6K_LONG_SIDE)).toBe(4);
    expect(chooseEsrganScale(6144, EXPORT_6K_LONG_SIDE)).toBeNull();
  });

  it("usa solo Lanczos cuando la fuente ya está cerca de 6K (p. ej. 4K)", () => {
    expect(chooseEsrganScale(4096, EXPORT_6K_LONG_SIDE)).toBeNull();
    expect(chooseEsrganScale(5504, EXPORT_6K_LONG_SIDE)).toBeNull();
  });

  it("calcula el tamaño 6K manteniendo el aspecto 16:9", () => {
    const plan = planExport6k(1280, 720);
    expect(plan.esrganScale).toBe(4);
    expect(plan.targetWidth).toBe(EXPORT_6K_LONG_SIDE);
    expect(plan.targetHeight).toBe(Math.round((720 / 1280) * EXPORT_6K_LONG_SIDE));
    expect(plan.alreadyAtLeast6k).toBe(false);
  });

  it("desde Gemini 2K planifica ×2 + Lanczos, no ×4", () => {
    const plan = planExport6k(2752, 1536);
    expect(plan.esrganScale).toBe(2);
    expect(plan.targetWidth).toBe(EXPORT_6K_LONG_SIDE);
  });

  it("marca alreadyAtLeast6k cuando la fuente ya es ≥ 6K", () => {
    const plan = planExport6k(7000, 4000);
    expect(plan.alreadyAtLeast6k).toBe(true);
    expect(plan.esrganScale).toBeNull();
  });
});

describe("finalizeExport6kPng", () => {
  it("reescala un buffer pequeño al target 6K", async () => {
    const src = await sharp({
      create: { width: 64, height: 36, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .png()
      .toBuffer();
    // Simula salida ESRGAN ×4 → 256×144, luego finalize a 6K.
    const mid = await sharp(src).resize(256, 144).png().toBuffer();
    const plan = planExport6k(64, 36);
    const out = await finalizeExport6kPng(mid, plan);
    expect(out.width).toBe(plan.targetWidth);
    expect(out.height).toBe(plan.targetHeight);
    expect(out.png[0]).toBe(0x89); // PNG magic
  });
});
