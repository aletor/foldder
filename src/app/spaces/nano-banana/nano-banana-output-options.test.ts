import { describe, expect, it } from "vitest";
import {
  coerceNanoBananaAspect,
  coerceNanoBananaResolution,
  isNanoBananaResolutionEnabled,
  nanoBananaResolutionSelectOptions,
} from "./nano-banana-output-options";

describe("nano-banana-output-options", () => {
  it("acepta los cinco formatos del nodo y cae a 16:9 si no es compatible", () => {
    expect(coerceNanoBananaAspect("9:16")).toBe("9:16");
    expect(coerceNanoBananaAspect("3:4")).toBe("3:4");
    expect(coerceNanoBananaAspect("1:1")).toBe("1:1");
    expect(coerceNanoBananaAspect("21:9")).toBe("16:9");
    expect(coerceNanoBananaAspect("4/3")).toBe("4:3");
  });

  it("bloquea 2K/4K en Gemini Flash 2.5 y los deja en ChatGPT", () => {
    expect(isNanoBananaResolutionEnabled("gemini", "flash25", "2k")).toBe(false);
    expect(isNanoBananaResolutionEnabled("gemini", "flash31", "4k")).toBe(true);
    expect(isNanoBananaResolutionEnabled("openai", "flash25", "4k")).toBe(true);
    expect(coerceNanoBananaResolution("gemini", "flash25", "4k")).toBe("1k");
    expect(coerceNanoBananaResolution("gemini", "flash31", "2k")).toBe("2k");
  });

  it("deshabilita 2K y 4K en el desplegable de Flash 2.5", () => {
    const options = nanoBananaResolutionSelectOptions("gemini", "flash25");
    expect(options).toEqual([
      { value: "1k", label: "1K", disabled: false },
      { value: "2k", label: "2K", disabled: true },
      { value: "4k", label: "4K", disabled: true },
    ]);
  });
});
