import { describe, expect, it } from "vitest";
import { emptyGenome, getTrait, crownedCandidates } from "@/lib/brandkit/model/trait";
import {
  applyLogoIntakeValidateToGenome,
  formatLogoIntakeProvenance,
  intakeGenomeCandidateId,
  isIntakeGenomeCandidateId,
} from "@/lib/brandkit/logo-intake/genome-bridge";

describe("genome-bridge", () => {
  it("corona logo.primary con URL canónica y pHash", () => {
    const genome = applyLogoIntakeValidateToGenome(emptyGenome(), {
      candidateId: "doc:1:0",
      imageUrl: "/api/spaces/s3-file?key=abc&v=deadbeef",
      pHash: "deadbeefcafebabe",
      docName: "deck.pdf",
      page: 2,
      bboxPage: [0.1, 0.2, 0.5, 0.6],
      origin: { kind: "auto", candidateId: "doc:1:0", docId: "doc" },
    });

    const trait = getTrait(genome, "logo.primary");
    expect(trait?.crownedIds).toEqual([intakeGenomeCandidateId("doc:1:0")]);
    const crowned = crownedCandidates(trait!)[0];
    expect(crowned?.signature).toBe("deadbeefcafebabe");
    expect(crowned?.value).toMatchObject({
      imageUrl: "/api/spaces/s3-file?key=abc&v=deadbeef",
      variant: "positive",
      assetOrigin: "render_crop",
    });
    expect(crowned?.derived?.rasterImageUrl).toContain("s3-file");
    expect(genome.completenessPercent).toBeGreaterThan(0);
  });

  it("formatea procedencia para origen ajustado", () => {
    expect(
      formatLogoIntakeProvenance(
        {
          kind: "adjusted",
          candidateId: "x",
          docId: "d",
          originalBboxPage: [0, 0, 0.5, 0.5],
          adjustedBboxPage: [0.1, 0.1, 0.4, 0.4],
        },
        "manual.pdf",
        3,
      ),
    ).toBe("ajustado · manual.pdf pág. 3");
  });

  it("identifica candidatos de intake", () => {
    expect(isIntakeGenomeCandidateId(intakeGenomeCandidateId("abc"))).toBe(true);
    expect(isIntakeGenomeCandidateId("cand_xyz")).toBe(false);
  });
});
