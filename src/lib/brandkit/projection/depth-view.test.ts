import { describe, expect, it } from "vitest";
import { createCandidate, signal } from "../model/evidence";
import { addCandidate, createTrait, emptyGenome, upsertTrait } from "../model/trait";
import type { ColorValue, TypographyValue } from "../model/trait-values";
import {
  buildDepthRows,
  candidateValueLabel,
  signalDisplayLabel,
  traitDepthTitle,
} from "./depth-view";

describe("depth-view", () => {
  it("etiqueta candidatos por tipo de valor", () => {
    expect(candidateValueLabel({ family: "Montserrat", weights: ["Bold"], specimenAvailable: true, fallback: "sans-serif" as const }).label).toBe(
      "Montserrat",
    );
    expect(candidateValueLabel({ hex: "#FFBD1B", role: "primary", name: "primario" } as ColorValue).preview?.kind).toBe("color");
  });

  it("lista candidatos ordenados por evidencia", () => {
    const low = createCandidate<TypographyValue>({
      value: { family: "Georgia", weights: ["Regular"], specimenAvailable: false, fallback: "serif" },
      signals: [signal("body-text", { scale: 0.3 })],
      signature: "georgia",
    });
    const high = createCandidate<TypographyValue>({
      value: { family: "Montserrat", weights: ["Bold"], specimenAvailable: true, fallback: "sans-serif" },
      signals: [signal("headline"), signal("embedded-file")],
      signature: "montserrat",
    });
    let trait = createTrait("typography.primary", [low, high]);
    const genome = upsertTrait(emptyGenome(), trait);
    const rows = buildDepthRows(genome, "typography.primary");
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("Montserrat");
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
  });

  it("traduce señales al español con fuente", () => {
    const label = signalDisplayLabel(
      signal("headline", { detail: "en titulares", sourceRef: "s1" }),
      [{ id: "s1", kind: "pdf", label: "manual.pdf", addedAt: "2026-01-01T00:00:00.000Z" }],
    );
    expect(label).toContain("titulares");
    expect(label).toContain("manual.pdf");
  });

  it("expone título legible del rasgo", () => {
    expect(traitDepthTitle("typography.primary")).toBe("Tipografía principal");
    expect(traitDepthTitle("color.accent")).toBe("Color acento");
  });
});
