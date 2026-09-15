import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  chooseTopazFactor,
  coerceExport6kFormat,
  estimateTopazUpscaleUsd,
  finalizeExport6k,
  planExport6k,
  EXPORT_6K_LONG_SIDE,
} from "./export-6k";

describe("chooseTopazFactor", () => {
  it("elige 4x en 1K y 2x en 2K; 4K y 6K sin API", () => {
    expect(chooseTopazFactor(1024, EXPORT_6K_LONG_SIDE)).toBe("4x");
    expect(chooseTopazFactor(1280, EXPORT_6K_LONG_SIDE)).toBe("4x");
    expect(chooseTopazFactor(1920, EXPORT_6K_LONG_SIDE)).toBe("2x");
    expect(chooseTopazFactor(2560, EXPORT_6K_LONG_SIDE)).toBe("2x");
    expect(chooseTopazFactor(2752, EXPORT_6K_LONG_SIDE)).toBe("2x");
    expect(chooseTopazFactor(4096, EXPORT_6K_LONG_SIDE)).toBeNull();
    expect(chooseTopazFactor(6144, EXPORT_6K_LONG_SIDE)).toBeNull();
  });
});

describe("planExport6k", () => {
  it("ChatGPT 2K 3:4 usa Topaz 2x y cierra 6K con Lanczos", () => {
    const plan = planExport6k(1920, 2560);
    expect(plan.topazFactor).toBe("2x");
    expect(plan.topazOutputWidth).toBe(3840);
    expect(plan.topazOutputHeight).toBe(5120);
    expect(plan.targetHeight).toBe(EXPORT_6K_LONG_SIDE);
    expect(plan.targetWidth).toBe(Math.round((1920 / 2560) * EXPORT_6K_LONG_SIDE));
    expect(plan.needsFinalResize).toBe(true);
  });

  it("1K 16:9 usa Topaz 4x", () => {
    const plan = planExport6k(1280, 720);
    expect(plan.topazFactor).toBe("4x");
    expect(plan.targetWidth).toBe(EXPORT_6K_LONG_SIDE);
  });

  it("marca alreadyAtLeast6k cuando la fuente ya es ≥ 6K", () => {
    const plan = planExport6k(7000, 4000);
    expect(plan.alreadyAtLeast6k).toBe(true);
    expect(plan.topazFactor).toBeNull();
    expect(plan.needsFinalResize).toBe(false);
  });
});

describe("estimateTopazUpscaleUsd", () => {
  it("cobra 0.05 hasta 24 MP y 0.10 hasta 48 MP", () => {
    expect(estimateTopazUpscaleUsd(3840 * 5120)).toBe(0.05);
    expect(estimateTopazUpscaleUsd(5120 * 2880)).toBe(0.05);
    expect(estimateTopazUpscaleUsd(8192 * 4608)).toBe(0.1);
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
});
