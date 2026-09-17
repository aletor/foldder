import { describe, expect, it } from "vitest";
import {
  LETTERBOX_OUTPUT_BLOCK,
  aspectDelta,
  containInnerRect,
  outerLetterboxSize,
  parseRatioToken,
  planStudioLetterbox,
} from "./studio-letterbox";
import { pickGeminiContainingRatio } from "./studio-frame-adjust";

describe("studio-letterbox", () => {
  it("parseRatioToken y containInnerRect centran el recorte", () => {
    expect(parseRatioToken("16:9")).toEqual({ w: 16, h: 9 });
    expect(parseRatioToken("nope")).toBeNull();
    const inner = containInnerRect(2560, 2421, 2560, 2560);
    expect(inner.width).toBe(2560);
    expect(inner.height).toBe(2421);
    expect(inner.x).toBe(0);
    expect(inner.y).toBe(Math.round((2560 - 2421) / 2));
  });

  it("2560×2421 ⇒ Gemini 1:1 con inner; ChatGPT envía los píxeles", () => {
    expect(pickGeminiContainingRatio(2560, 2421).ratio).toBe("1:1");
    const gemini = planStudioLetterbox({ width: 2560, height: 2421, provider: "gemini" });
    expect(gemini.aspect).toBe("1:1");
    expect(gemini.inner).toEqual({ width: 2560, height: 2421 });
    const outer = outerLetterboxSize(2560, 2421, 1, 1);
    expect(outer).toEqual({ width: 2560, height: 2560 });
    const openai = planStudioLetterbox({ width: 2560, height: 2421, provider: "openai" });
    expect(openai.aspect).toBe("2560:2421");
    expect(openai.inner).toBeNull();
  });

  it("4:3 Gemini no letterboxea", () => {
    const plan = planStudioLetterbox({ width: 1920, height: 1440, provider: "gemini" });
    expect(plan.aspect).toBe("4:3");
    expect(plan.inner).toBeNull();
    expect(aspectDelta(1920 / 1440, 4 / 3)).toBeLessThan(0.001);
  });

  it("el bloque de letterbox es texto, no una llamada de pago extra", () => {
    expect(LETTERBOX_OUTPUT_BLOCK).toContain("[LETTERBOX — obligatorio]");
  });
});
