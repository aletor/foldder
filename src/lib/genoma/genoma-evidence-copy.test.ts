import { describe, expect, it } from "vitest";
import {
  buildGenomaEvidenceCopy,
  translateConfidenceLabel,
  translateProvenanceStep,
} from "./genoma-evidence-copy";

describe("genoma-evidence-copy", () => {
  it("traduce provenance CSS", () => {
    expect(
      translateProvenanceStep({ type: "css_var", detail: "--brand-primary" }),
    ).toBe("Declarado en el código de tu web");
  });

  it("traduce confianza sin número", () => {
    expect(translateConfidenceLabel(0.8)).toBe("evidencia fuerte");
    expect(translateConfidenceLabel(0.5)).toBe("evidencia media");
    expect(translateConfidenceLabel(0.2)).toBe("evidencia débil");
  });

  it("incluye señales de refuerzo legibles", () => {
    const copy = buildGenomaEvidenceCopy({
      provenance: { type: "manifest", detail: "theme-color" },
      confidence: 0.82,
      rankSignals: ["schema oficial", "repetido 3×"],
    });
    expect(copy.signals.some((line) => line.includes("manifest"))).toBe(true);
    expect(copy.step).not.toMatch(/css_var|llm_synthesis/);
  });
});
