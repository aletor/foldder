import { describe, expect, it } from "vitest";
import { createCandidate, signal } from "../model/evidence";
import { createTrait, crown, emptyGenome, upsertTrait } from "../model/trait";
import type { LogoValue } from "../model/trait-values";
import { isNativeVectorLogoUrl } from "./logo-display-url";
import {
  applyCrownWithOptionalVectorizePending,
  applyVectorizeResultToGenome,
  buildLogoVectorizeJob,
  findCrownedLogoVectorizeJob,
  logoCandidateNeedsVectorize,
} from "./logo-vectorize-action";

function genomeWithRasterLogo(crowned = false) {
  const candidate = createCandidate<LogoValue>({
    value: { imageUrl: "data:image/png;base64,abc", variant: "positive", label: "logo" },
    signals: [signal("recurrence")],
    signature: "sig-raster",
  });
  let genome = upsertTrait(emptyGenome(), createTrait("logo.primary", [candidate]));
  if (crowned) {
    genome = upsertTrait(genome, crown(genome.traits["logo.primary"]!, candidate.id));
  }
  return { genome, candidateId: candidate.id };
}

describe("logo-vectorize-action", () => {
  it("detecta logo raster que necesita vectorizar", () => {
    const { genome, candidateId } = genomeWithRasterLogo(true);
    expect(buildLogoVectorizeJob(genome, candidateId)).not.toBeNull();
    expect(findCrownedLogoVectorizeJob(genome)).not.toBeNull();
    expect(logoCandidateNeedsVectorize(genome, "logo.primary", candidateId)).toBe(true);
  });

  it("bloquea vectorize cuando assetOrigin es vector_native (fail-closed Fase B)", () => {
    const candidate = createCandidate<LogoValue>({
      value: {
        imageUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        variant: "positive",
        label: "logo",
        assetOrigin: "vector_native",
      },
      signals: [signal("recurrence")],
      signature: "sig-vector-native",
    });
    let genome = upsertTrait(emptyGenome(), createTrait("logo.primary", [candidate]));
    genome = upsertTrait(genome, crown(genome.traits["logo.primary"]!, candidate.id));
    expect(buildLogoVectorizeJob(genome, candidate.id)).toBeNull();
    expect(findCrownedLogoVectorizeJob(genome)).toBeNull();
  });

  it("ignora SVG nativo y logos ya vectorizados", () => {
    expect(isNativeVectorLogoUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBe(true);
    const { genome, candidateId } = genomeWithRasterLogo(true);
    const trait = genome.traits["logo.primary"]!;
    const withVector = upsertTrait(genome, {
      ...trait,
      candidates: trait.candidates.map((c) =>
        c.id === candidateId
          ? { ...c, derived: { vectorUrl: "data:image/svg+xml;base64,PHN2Zy8+" } }
          : c,
      ),
    });
    expect(buildLogoVectorizeJob(withVector, candidateId)).toBeNull();
  });

  it("coronar logo raster deja job y traza pending", () => {
    const { genome, candidateId } = genomeWithRasterLogo(false);
    const out = applyCrownWithOptionalVectorizePending(genome, "logo.primary", candidateId);
    expect(out.job).not.toBeNull();
    const crowned = out.genome.traits["logo.primary"]!.candidates.find((c) => c.id === candidateId);
    expect(crowned?.derived?.vectorize?.skippedReason).toBe("vectorize_pending");
  });

  it("vectorizar sustituye imageUrl por el SVG y conserva el raster", () => {
    const { genome, candidateId } = genomeWithRasterLogo(true);
    const job = buildLogoVectorizeJob(genome, candidateId);
    expect(job).not.toBeNull();
      const vectorUrl = "/api/spaces/s3-file?key=knowledge-files/user-assets/demo/primary.svg";
      const next = applyVectorizeResultToGenome(genome, job!, { vectorUrl, walletReservationId: "res-1" });
      const crowned = next.traits["logo.primary"]!.candidates.find((c) => c.id === candidateId)!;
      expect(crowned.value.imageUrl).toContain("data:image/png");
      expect(crowned.derived?.vectorUrl).toBe(vectorUrl);
      expect(crowned.derived?.rasterImageUrl).toContain("data:image/png");
    expect(buildLogoVectorizeJob(next, candidateId)).toBeNull();
  });
});
