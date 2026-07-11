import { describe, expect, it } from "vitest";
import { createCandidate, signal, type VectorizeTrace } from "../model/evidence";
import { createTrait, crown, emptyGenome, upsertTrait, type Genome } from "../model/trait";
import type { LogoValue } from "../model/trait-values";
import { evaluateStyleGuideVectorizeGate } from "./style-guide-vectorize-gate";
import { buildVectorizeAttemptTrace } from "./vectorize-trace";

function rasterCrownedGenome(vectorize?: VectorizeTrace, vectorUrl?: string): Genome {
  const rasterUrl = "data:image/png;base64,iVBORw0KGgo=";
  const candidate = {
    ...createCandidate<LogoValue>({
      value: { imageUrl: rasterUrl, variant: "positive", label: "logo", sourcePageNumber: 1 },
      signals: [signal("recurrence")],
      signature: "phash_raster_test",
    }),
    derived: vectorize || vectorUrl ? { vectorUrl, vectorize } : undefined,
  };
  let genome = upsertTrait(emptyGenome(), createTrait("logo.primary", [candidate]));
  genome = upsertTrait(genome, crown(genome.traits["logo.primary"]!, candidate.id));
  return genome;
}

describe("evaluateStyleGuideVectorizeGate", () => {
  it("bloquea export con logo raster sin vectorUrl", () => {
    const gate = evaluateStyleGuideVectorizeGate(rasterCrownedGenome());
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("VECTORIZE_REQUIRED");
    }
  });

  it("permite export con vectorUrl resuelto", () => {
    const genome = rasterCrownedGenome(
      { attempted: true, status: "ok", walletReservationId: "res-1" },
      "data:image/svg+xml;base64,PHN2Zy8+",
    );
    const gate = evaluateStyleGuideVectorizeGate(genome);
    expect(gate.allowed).toBe(true);
  });

  it("wallet insuficiente → VECTORIZE_REQUIRED", () => {
    const gate = evaluateStyleGuideVectorizeGate(
      rasterCrownedGenome({
        attempted: true,
        status: "failed_reason",
        failedReason: "insufficient_balance",
      }),
    );
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("VECTORIZE_REQUIRED");
      expect(gate.cta).toBe("pay_wallet");
    }
  });

  it("fallo de servicio → VECTORIZE_FAILED", () => {
    const gate = evaluateStyleGuideVectorizeGate(
      rasterCrownedGenome({
        attempted: true,
        status: "failed_reason",
        failedReason: "vectorize_timeout",
        walletReservationId: "res-released",
      }),
    );
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("VECTORIZE_FAILED");
      expect(gate.cta).toBe("retry_vectorize");
    }
  });

  it("bypass opt-in allowRasterLogoBypass", () => {
    const gate = evaluateStyleGuideVectorizeGate(rasterCrownedGenome(), {
      allowRasterLogoBypass: true,
    });
    expect(gate.allowed).toBe(true);
    if (gate.allowed) expect(gate.usedRasterBypass).toBe(true);
  });

  it("logo SVG nativo no requiere vectorización", () => {
    const svg = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27/%3E";
    const candidate = createCandidate<LogoValue>({
      value: { imageUrl: svg, variant: "positive" },
      signals: [signal("recurrence")],
      signature: "svg_native",
    });
    let genome = upsertTrait(emptyGenome(), createTrait("logo.primary", [candidate]));
    genome = upsertTrait(genome, crown(genome.traits["logo.primary"]!, candidate.id));
    expect(evaluateStyleGuideVectorizeGate(genome).allowed).toBe(true);
  });
});

describe("buildVectorizeAttemptTrace", () => {
  it("marca ok cuando hay vectorUrl", () => {
    const trace = buildVectorizeAttemptTrace({
      vectorUrl: "data:image/svg+xml;base64,abc",
      walletReservationId: "res-99",
    });
    expect(trace.status).toBe("ok");
    expect(trace.walletReservationId).toBe("res-99");
  });
});
