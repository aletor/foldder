import { describe, expect, it, vi } from "vitest";
import { estimateLogoCropContext, refineCrownedRasterLogo } from "./logo-crown-refine";

vi.mock("@/lib/brain/pdf-logo-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brain/pdf-logo-pipeline")>();
  return {
    ...actual,
    isolateLogoCropForCrownedMark: vi.fn(async (buffer: Buffer) => ({
      buffer,
      method: "keying" as const,
    })),
  };
});

import { isolateLogoCropForCrownedMark } from "@/lib/brain/pdf-logo-pipeline";

describe("logo-crown-refine", () => {
  it("estima polaridad en PNG con marca oscura sobre fondo claro", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 80, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([
        {
          input: {
            create: { width: 50, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
          },
          left: 10,
          top: 10,
        },
      ])
      .png()
      .toBuffer();

    const ctx = await estimateLogoCropContext(png);
    expect(ctx.polarity).toBe("dark_mark");
  });

  it("refina vía isolateLogoCropForCrownedMark", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();
    const result = await refineCrownedRasterLogo(png);
    expect(isolateLogoCropForCrownedMark).toHaveBeenCalled();
    expect(result.method).toBe("keying");
  });
});
