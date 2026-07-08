import { describe, expect, it } from "vitest";
import { crown, createTrait, emptyGenome, upsertTrait } from "../model/trait";
import { createCandidate, signal } from "../model/evidence";
import type { ColorValue } from "../model/trait-values";
import {
  allowPaidExtractOps,
  allowPaidIngestAnalysis,
  allowPaidPostCoronaOps,
  genomeHasCrownedTrait,
  resolveVisionIngestGate,
} from "./paid-extract-gate";

describe("paid-extract-gate", () => {
  it("ingest: visión/voz en primer análisis — no requiere corona previa", () => {
    expect(allowPaidIngestAnalysis(false)).toBe(true);
    expect(allowPaidIngestAnalysis(true)).toBe(false);
    expect(genomeHasCrownedTrait(emptyGenome())).toBe(false);
    expect(resolveVisionIngestGate({ duplicateContent: false, hasSources: true })).toEqual({
      willRunVision: true,
      reason: "ingest_drop_authorizes_vision",
    });
    expect(resolveVisionIngestGate({ duplicateContent: true, hasSources: true }).willRunVision).toBe(false);
    expect(allowPaidPostCoronaOps(emptyGenome())).toBe(false);
  });

  it("post-corona: bloquea vectorización/matting en genoma vacío o solo propuesto", () => {
    expect(allowPaidPostCoronaOps(emptyGenome())).toBe(false);

    const proposed = upsertTrait(emptyGenome(), createTrait<ColorValue>("color.primary"));
    expect(allowPaidPostCoronaOps(proposed)).toBe(false);
    expect(allowPaidExtractOps(proposed)).toBe(false);
  });

  it("post-corona: permite tras coronación previa", () => {
    let genome = emptyGenome();
    const trait = createTrait<ColorValue>("color.primary");
    const candidate = createCandidate<ColorValue>({
      value: { hex: "#112233", role: "primary", name: "Primario" },
      signals: [signal("operator-color")],
      signature: "#112233",
      sourceRefs: ["src1"],
    });
    genome = upsertTrait(genome, { ...trait, candidates: [candidate] });
    genome = upsertTrait(genome, crown({ ...trait, candidates: [candidate] }, candidate.id));

    expect(genomeHasCrownedTrait(genome)).toBe(true);
    expect(allowPaidPostCoronaOps(genome)).toBe(true);
    expect(allowPaidExtractOps(genome)).toBe(true);
  });
});
