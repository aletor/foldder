import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyVoiceExtraction } from "./apply-extract";
import {
  arbitrateBrandIdentity,
  degradeProductLineWordmarks,
  pickEmitterWordmark,
  refineVoiceWithIdentityArbitration,
} from "./page-vision-identity-arbitration";
import { emptyGenome } from "../model/trait";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";

const AUDIT = path.join(
  process.cwd(),
  "fixtures/page-vision-pass/runs/f9e683edde0a-2026-07-06T21-22-39-790Z.audit.json",
);
const FICHA_GOLDEN = path.join(
  process.cwd(),
  "src/lib/brandKit/ingest/fixtures/page-vision-pass/atresmedia-catalog-ficha.golden.json",
);

const OARO_AUDIT = path.join(
  process.cwd(),
  "fixtures/page-vision-pass/runs/1afbf7f6630a-2026-07-07T06-51-28-568Z.audit.json",
);

describe.skipIf(!fs.existsSync(OARO_AUDIT))("page-vision-identity-arbitration — OARO deck", () => {
  it("wordmark subcadena manda: emisora OARO, no línea de producto", () => {
    const audit = JSON.parse(fs.readFileSync(OARO_AUDIT, "utf8")) as PageVisionPassRunAudit;
    const result = arbitrateBrandIdentity(audit);
    expect(result.emitterBrand).toBe("OARO");
    expect(result.contentNames.some((n) => n.includes("IDENTITY"))).toBe(true);
  });

  it("pickEmitterWordmark prefiere OARO frente a OARO IDENTITY®", () => {
    const audit = JSON.parse(fs.readFileSync(OARO_AUDIT, "utf8")) as PageVisionPassRunAudit;
    const wordmarks = audit.pages
      .flatMap((p) => (p.ok && p.result ? p.result.brandNameEvidence : []))
      .filter((e) => e.kind === "wordmark_logo")
      .map((e, i) => ({ ...e, pageNumber: i + 1, classification: "emitter_wordmark" as const }));
    expect(pickEmitterWordmark(wordmarks)).toBe("OARO");
    expect(degradeProductLineWordmarks(wordmarks, "OARO")).toContain("OARO IDENTITY®");
  });
});

describe.skipIf(!fs.existsSync(AUDIT))("page-vision-identity-arbitration — catalogo26", () => {
  it("propone Atresmedia como emisora", () => {
    const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8")) as PageVisionPassRunAudit;
    const result = arbitrateBrandIdentity(audit);
    expect(result.emitterBrand).toBe("ATRESMEDIA");
  });
});

describe("page-vision-identity-arbitration — ficha contenido", () => {
  it("clasifica Ágata y Lola como contenido, no emisora", () => {
    const page = JSON.parse(fs.readFileSync(FICHA_GOLDEN, "utf8"));
    const audit = {
      pages: [{ pageNumber: 42, ok: true, result: page }],
    } as PageVisionPassRunAudit;
    const result = arbitrateBrandIdentity(audit);
    expect(result.contentNames).toContain("Ágata y Lola");
    expect(result.emitterBrand?.toUpperCase()).toContain("ATRESMEDIA");
  });

  it("filtra taglines de contenido y prioriza emisora", () => {
    const page = JSON.parse(fs.readFileSync(FICHA_GOLDEN, "utf8"));
    const audit = {
      pages: [{ pageNumber: 42, ok: true, result: page }],
    } as PageVisionPassRunAudit;
    const arbitration = arbitrateBrandIdentity(audit);
    const refined = refineVoiceWithIdentityArbitration(
      {
        tagline: [
          {
            value: { text: "Ágata y Lola" },
            signals: [],
            signature: "agata",
            sourceRefs: ["src"],
          },
        ],
        tone: [],
        absolute: [],
        forbidden: [],
      },
      arbitration,
      "src_test",
    );
    expect(refined.tagline.some((t) => t.value.text === "Ágata y Lola")).toBe(false);
    expect(refined.tagline.some((t) => t.value.text.toUpperCase().includes("ATRESMEDIA"))).toBe(true);
  });

  it("persiste tagline emisora tras apply (score ≥ promptThreshold)", () => {
    const page = JSON.parse(fs.readFileSync(FICHA_GOLDEN, "utf8"));
    const audit = {
      pages: [{ pageNumber: 42, ok: true, result: page }],
    } as PageVisionPassRunAudit;
    const arbitration = arbitrateBrandIdentity(audit);
    const refined = refineVoiceWithIdentityArbitration(
      { tagline: [], tone: [], absolute: [], forbidden: [] },
      arbitration,
      "src_test",
    );
    const applied = applyVoiceExtraction(
      emptyGenome(),
      refined,
      { id: "src_test", kind: "pdf", label: "test", addedAt: new Date().toISOString() },
      { allowMaterialPrompts: false },
    );
    const taglines = applied.genome.traits["message.tagline"]?.candidates.map((c) => c.value.text) ?? [];
    expect(taglines.some((t) => t.toUpperCase().includes("ATRESMEDIA"))).toBe(true);
  });
});
