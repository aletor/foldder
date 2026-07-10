import { describe, expect, it } from "vitest";
import type { LogoValue } from "@/lib/genoma/genoma-types";
import {
  genomaLogoPlinthTone,
  genomaNodeLogoWrapClass,
  genomaV2LogoPlinthClass,
} from "./genoma-logo-plinth";

function logo(overrides: Partial<LogoValue> = {}): LogoValue {
  return {
    previewUrl: "/api/spaces/genoma/media/x.png",
    ...overrides,
  } as LogoValue;
}

describe("genoma-logo-plinth", () => {
  it("neutral sin preview", () => {
    expect(genomaLogoPlinthTone(undefined)).toBe("neutral");
    expect(genomaV2LogoPlinthClass(undefined)).toBe("genoma-v2-logo-plinth--neutral");
    expect(genomaNodeLogoWrapClass(undefined)).toBe("");
  });

  it("light para fondo sólido o recorte vision/adjusted", () => {
    expect(genomaLogoPlinthTone(logo({ background: "solid" }))).toBe("light");
    expect(genomaLogoPlinthTone(logo({ detectionMethod: "vision_bbox" }))).toBe("light");
    expect(genomaLogoPlinthTone(logo({ detectionMethod: "adjusted" }))).toBe("light");
    expect(genomaV2LogoPlinthClass(logo({ background: "solid" }))).toBe("genoma-v2-logo-plinth--light");
    expect(genomaNodeLogoWrapClass(logo({ detectionMethod: "adjusted" }))).toBe(
      "genoma-node-card-preview__logo-wrap--light",
    );
  });

  it("adaptive por defecto con preview", () => {
    expect(genomaLogoPlinthTone(logo())).toBe("adaptive");
    expect(genomaV2LogoPlinthClass(logo())).toBe("genoma-v2-logo-plinth--adaptive");
    expect(genomaNodeLogoWrapClass(logo())).toBe("genoma-node-card-preview__logo-wrap--adaptive");
  });
});
