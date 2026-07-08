import { describe, expect, it } from "vitest";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  buildBookDerivations,
  buildColorUsage603010,
  buildLogoMisuses,
  buildTypographicScale,
  buildWcagMatrix,
  hexToCmykApprox,
  hexToHsl,
  hexToRgb,
  wcagContrastRatio,
} from "./book-derivations";

describe("T-B — book-derivations", () => {
  it("convierte hex a RGB/HSL/CMYK aprox", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToHsl("#000000").l).toBe(0);
    expect(hexToCmykApprox("#000000")).toEqual({ c: 0, m: 0, y: 0, k: 100 });
  });

  it("calcula contraste WCAG blanco sobre negro", () => {
    expect(wcagContrastRatio("#FFFFFF", "#000000")).toBeGreaterThanOrEqual(21);
  });

  it("buildBookDerivations incluye paleta extendida y escala tipográfica", () => {
    const assets = defaultProjectAssets();
    assets.brand.colorPrimary = "#112233";
    assets.brand.colorSecondary = "#AABBCC";
    assets.brand.colorAccent = "#FF5500";
    assets.brand.logoPositive = "https://example.com/logo.png";

    const derived = buildBookDerivations(assets);
    expect(derived.kind).toBe("derived");
    expect(derived.palette).toHaveLength(3);
    expect(derived.palette[0]?.cmykApprox.k).toBeGreaterThanOrEqual(0);
    expect(derived.wcagMatrix.length).toBeGreaterThan(0);
    expect(derived.colorUsage603010.primaryPercent).toBe(60);
    expect(derived.logoSafeArea?.clearSpaceRatio).toBe(0.25);
    expect(derived.logoMinSize?.digitalMinHeightPx).toBe(24);
    expect(derived.logoMisuses).toHaveLength(6);
    expect(derived.typographicScale.length).toBeGreaterThanOrEqual(5);
  });

  it("603010 refleja paleta incompleta", () => {
    const partial = buildColorUsage603010([
      {
        role: "primary",
        hex: "#112233",
        rgb: hexToRgb("#112233"),
        hsl: hexToHsl("#112233"),
        cmykApprox: hexToCmykApprox("#112233"),
      },
    ]);
    expect(partial.primaryPercent).toBe(60);
    expect(partial.secondaryPercent).toBe(0);
    expect(partial.guidance).toContain("Completa");
  });

  it("buildLogoMisuses genera 6 previews SVG", () => {
    const misuses = buildLogoMisuses("#5E8E70");
    expect(misuses).toHaveLength(6);
    expect(misuses[0]?.previewSvg).toContain("<svg");
  });

  it("buildTypographicScale escala desde base 16px", () => {
    const assets = defaultProjectAssets();
    const scale = buildTypographicScale(assets);
    const body = scale.find((s) => s.token === "body");
    expect(body?.sizePx).toBe(16);
  });
});
