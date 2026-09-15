import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  coerceExport6kFormat,
  finalizeExport6k,
  planExport6k,
  EXPORT_6K_LONG_SIDE,
} from "./export-6k";

describe("planExport6k", () => {
  it("ChatGPT 2K 3:4 escala local al lado largo 6144", () => {
    const plan = planExport6k(1920, 2560);
    expect(plan.targetHeight).toBe(EXPORT_6K_LONG_SIDE);
    expect(plan.targetWidth).toBe(Math.round((1920 / 2560) * EXPORT_6K_LONG_SIDE));
    expect(plan.scale).toBeCloseTo(2.4, 5);
    expect(plan.needsResize).toBe(true);
    expect(plan.alreadyAtLeast6k).toBe(false);
  });

  it("4K nativo hace un bump pequeño (~1.5x)", () => {
    const plan = planExport6k(3072, 4096);
    expect(plan.scale).toBeCloseTo(1.5, 5);
    expect(plan.targetWidth).toBe(4608);
    expect(plan.targetHeight).toBe(EXPORT_6K_LONG_SIDE);
  });

  it("marca alreadyAtLeast6k y no reescala cuando la fuente ya es ≥ 6K", () => {
    const plan = planExport6k(7000, 4000);
    expect(plan.alreadyAtLeast6k).toBe(true);
    expect(plan.scale).toBe(1);
    expect(plan.needsResize).toBe(false);
    expect(plan.targetWidth).toBe(7000);
    expect(plan.targetHeight).toBe(4000);
  });
});

describe("coerceExport6kFormat", () => {
  it("acepta jpg como jpeg y el resto como png", () => {
    expect(coerceExport6kFormat("jpeg")).toBe("jpeg");
    expect(coerceExport6kFormat("jpg")).toBe("jpeg");
    expect(coerceExport6kFormat("png")).toBe("png");
    expect(coerceExport6kFormat("webp")).toBe("png");
  });
});

describe("finalizeExport6k", () => {
  it("reescala un buffer pequeño al target 6K en PNG", async () => {
    const src = await sharp({
      create: { width: 64, height: 36, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .png()
      .toBuffer();
    const plan = planExport6k(64, 36);
    const out = await finalizeExport6k(src, plan, "png");
    expect(out.width).toBe(plan.targetWidth);
    expect(out.height).toBe(plan.targetHeight);
    expect(out.mime).toBe("image/png");
    expect(out.bytes[0]).toBe(0x89);
  });

  it("entrega JPEG q96 cuando se pide jpeg", async () => {
    const src = await sharp({
      create: { width: 48, height: 64, channels: 3, background: { r: 12, g: 24, b: 48 } },
    })
      .png()
      .toBuffer();
    const plan = planExport6k(48, 64);
    const out = await finalizeExport6k(src, plan, "jpeg");
    expect(out.mime).toBe("image/jpeg");
    expect(out.bytes[0]).toBe(0xff);
    expect(out.bytes[1]).toBe(0xd8);
  });

  it("no altera píxeles planos al reescalar (sin sharpen ni halos)", async () => {
    const src = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer();
    const out = await finalizeExport6k(src, planExport6k(32, 32), "png");
    const { data } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    const center = (out.height / 2) * out.width * 3 + (out.width / 2) * 3;
    expect(Math.abs(data[center] - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(data[center + 1] - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(data[center + 2] - 50)).toBeLessThanOrEqual(1);
  });
});
