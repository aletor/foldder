import { describe, expect, it } from "vitest";
import type { LogoValue } from "@/lib/brandkit/brand-kit-types";
import {
  brandKitLogoPlinthTone,
  brandKitNodeLogoWrapClass,
  brandKitV2LogoPlinthClass,
} from "./brand-kit-logo-plinth";

function logo(overrides: Partial<LogoValue> = {}): LogoValue {
  return {
    previewUrl: "/api/spaces/brandKit/media/x.png",
    ...overrides,
  } as LogoValue;
}

describe("brand-kit-logo-plinth", () => {
  it("neutral sin preview", () => {
    expect(brandKitLogoPlinthTone(undefined)).toBe("neutral");
    expect(brandKitV2LogoPlinthClass(undefined)).toBe("brand-kit-v2-logo-plinth--neutral");
    expect(brandKitNodeLogoWrapClass(undefined)).toBe("");
  });

  it("light para fondo sólido o recorte vision/adjusted", () => {
    expect(brandKitLogoPlinthTone(logo({ background: "solid" }))).toBe("light");
    expect(brandKitLogoPlinthTone(logo({ detectionMethod: "vision_bbox" }))).toBe("light");
    expect(brandKitLogoPlinthTone(logo({ detectionMethod: "adjusted" }))).toBe("light");
    expect(brandKitV2LogoPlinthClass(logo({ background: "solid" }))).toBe("brand-kit-v2-logo-plinth--light");
    expect(brandKitNodeLogoWrapClass(logo({ detectionMethod: "adjusted" }))).toBe(
      "brandKit-node-face__logo--light",
    );
  });

  it("adaptive por defecto con preview", () => {
    expect(brandKitLogoPlinthTone(logo())).toBe("adaptive");
    expect(brandKitV2LogoPlinthClass(logo())).toBe("brand-kit-v2-logo-plinth--adaptive");
    expect(brandKitNodeLogoWrapClass(logo())).toBe("brandKit-node-face__logo--adaptive");
  });
});
