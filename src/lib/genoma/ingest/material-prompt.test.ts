import { describe, expect, it } from "vitest";
import { createCandidate, signal } from "../model/evidence";
import { classifyIncoming } from "../model/new-material";
import { addCandidate, createTrait, emptyGenome, upsertTrait } from "../model/trait";
import type { TypographyValue } from "../model/trait-values";
import type { ColorValue } from "../model/trait-values";
import {
  applyCandidateToGenome,
  buildMaterialPrompt,
  resolveMaterialPrompt,
  shouldDeferToPrompt,
} from "./material-prompt";

describe("material-prompt §4", () => {
  it("no difiere en genoma vacío", () => {
    const candidate = createCandidate<TypographyValue>({
      value: { family: "Georgia", weights: ["Regular"], specimenAvailable: false, fallback: "serif" },
      signals: [signal("headline")],
      signature: "georgia",
    });
    const verdict = classifyIncoming(emptyGenome(), "typography.primary", candidate);
    expect(verdict.kind).toBe("prompt");
    expect(shouldDeferToPrompt(emptyGenome(), "typography.primary", verdict)).toBe(false);
  });

  it("difere tipografía nueva cuando ya hay primaria", () => {
    const montserrat = createCandidate<TypographyValue>({
      value: { family: "Montserrat", weights: ["Bold"], specimenAvailable: true, fallback: "sans-serif" },
      signals: [signal("embedded-file")],
      signature: "montserrat",
    });
    let g = upsertTrait(emptyGenome(), addCandidate(createTrait("typography.primary"), montserrat));
    g = { ...g, sources: [{ id: "s1", kind: "pdf", label: "a.pdf", addedAt: new Date().toISOString() }] };

    const georgia = createCandidate<TypographyValue>({
      value: { family: "Georgia", weights: ["Regular"], specimenAvailable: false, fallback: "serif" },
      signals: [signal("headline")],
      signature: "georgia",
    });
    const result = applyCandidateToGenome(g, "typography.primary", georgia);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0].options.map((o) => o.id)).toContain("secondary");
  });

  it("resuelve promoción a secundaria", () => {
    const prompt = buildMaterialPrompt(
      "typography.primary",
      createCandidate<TypographyValue>({
        value: { family: "Georgia", weights: ["Regular"], specimenAvailable: false, fallback: "serif" },
        signals: [signal("headline")],
        signature: "georgia",
      }),
      emptyGenome(),
    );
    const next = resolveMaterialPrompt(emptyGenome(), prompt, "secondary");
    expect(next.traits["typography.secondary"]?.candidates).toHaveLength(1);
  });

  it("difere color nuevo cuando ya hay paleta", () => {
    const primary = createCandidate<ColorValue>({
      value: { hex: "#111111", role: "primary", name: "primario" },
      signals: [signal("operator-color")],
      signature: "#111111",
    });
    let g = upsertTrait(emptyGenome(), addCandidate(createTrait("color.primary"), primary));
    const accent = createCandidate<ColorValue>({
      value: { hex: "#FFBD1B", role: "accent", name: "acento" },
      signals: [signal("operator-color")],
      signature: "#ffbd1b",
    });
    const result = applyCandidateToGenome(g, "color.accent", accent);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0].options.map((o) => o.id)).toEqual(expect.arrayContaining(["primary", "accent", "ignore"]));
  });
});
