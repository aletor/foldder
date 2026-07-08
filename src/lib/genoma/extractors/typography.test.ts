import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import type { SourceRef } from "../model/evidence";
import {
  buildTypographyCandidates,
  buildVisionTypographyCandidates,
  extractTypographyFromPdf,
  type FontUsage,
} from "./typography";

const source: SourceRef = {
  id: "src-1",
  kind: "pdf",
  label: "documento.pdf",
  addedAt: "2026-07-05T00:00:00.000Z",
};

function usage(over: Partial<FontUsage> & { family: string }): FontUsage {
  const headlineGlyphs = over.headlineGlyphs ?? 0;
  const bodyGlyphs = over.bodyGlyphs ?? 0;
  return {
    family: over.family,
    weights: over.weights ?? ["Regular"],
    headlineGlyphs,
    bodyGlyphs,
    footerGlyphs: over.footerGlyphs ?? 0,
    pageCount: over.pageCount ?? 1,
    embedded: over.embedded ?? false,
    totalGlyphs: over.totalGlyphs ?? headlineGlyphs + bodyGlyphs,
  };
}

function familiesIn(cands: { value: { family: string } }[]): string[] {
  return cands.map((c) => c.value.family);
}

describe("buildTypographyCandidates — ranking por contexto", () => {
  it("familia embebida en titulares gana primaria; el body gana secundaria; stopwords fuera", () => {
    const result = buildTypographyCandidates(
      [
        usage({ family: "Montserrat", weights: ["Regular", "Bold", "Italic"], headlineGlyphs: 800, bodyGlyphs: 4000, pageCount: 12, embedded: true }),
        usage({ family: "Arial", bodyGlyphs: 6000, pageCount: 12 }), // sistema → descartada
        usage({ family: "Georgia", weights: ["Regular", "Italic"], bodyGlyphs: 1500, pageCount: 6, embedded: true }),
      ],
      { sources: [source] },
    );

    expect(result.primary[0].value.family).toBe("Montserrat");
    expect(result.secondary[0].value.family).toBe("Georgia");

    // Arial no aparece en NINGUNA lista.
    const all = [...result.primary, ...result.secondary, ...result.doubtful];
    expect(familiesIn(all)).not.toContain("Arial");

    // Montserrat puntúa más que Georgia como primaria.
    expect(result.primary[0].evidenceScore).toBeGreaterThan(
      result.primary.find((c) => c.value.family === "Georgia")!.evidenceScore,
    );

    // La primaria lleva señales de titular + embebido (auditable).
    const kinds = result.primary[0].signals.map((s) => s.kind);
    expect(kinds).toContain("headline");
    expect(kinds).toContain("embedded-file");
  });

  it("con >3 familias, las de contexto ambiguo caen a 'dudosas' (no ensucian primaria)", () => {
    const result = buildTypographyCandidates(
      [
        usage({ family: "Montserrat", weights: ["Regular", "Bold"], headlineGlyphs: 800, bodyGlyphs: 4000, pageCount: 12, embedded: true }),
        usage({ family: "Weirdone", bodyGlyphs: 20, pageCount: 1 }),
        usage({ family: "Weirdtwo", bodyGlyphs: 15, pageCount: 1 }),
        usage({ family: "Weirdthree", bodyGlyphs: 25, pageCount: 1 }),
      ],
      { sources: [source] },
    );

    expect(result.primary[0].value.family).toBe("Montserrat");
    // Las tres ambiguas están en dudosas, no en primaria.
    expect(familiesIn(result.doubtful).sort()).toEqual(["Weirdone", "Weirdthree", "Weirdtwo"]);
    expect(familiesIn(result.primary)).toEqual(["Montserrat"]);
    // Y su evidencia es baja (peso pequeño).
    for (const c of result.doubtful) expect(c.evidenceScore).toBeLessThan(0.5);
  });

  it("Montserrat embebida → espécimen vía Google Fonts con metadatos", () => {
    const result = buildTypographyCandidates(
      [usage({ family: "Montserrat", weights: ["Regular", "Bold"], headlineGlyphs: 500, bodyGlyphs: 2000, pageCount: 8, embedded: true })],
      { sources: [source] },
    );
    const value = result.primary[0].value;
    expect(value.specimenAvailable).toBe(true);
    expect(value.specimenSource).toBe("google-fonts");
    expect(value.specimenCssUrl).toContain("Montserrat");
    expect(value.specimenLicense).toContain("Google Fonts");
    expect(value.fallback).toBe("sans-serif");
    expect(value.weights).toEqual(expect.arrayContaining(["Bold"]));
  });

  it("una sola familia rellena secundaria con pesos de cuerpo (misma familia)", () => {
    const result = buildTypographyCandidates(
      [
        usage({
          family: "Montserrat",
          weights: ["Light", "Regular", "Medium", "Bold"],
          headlineGlyphs: 800,
          bodyGlyphs: 4000,
          pageCount: 12,
          embedded: true,
        }),
      ],
      { sources: [source] },
    );

    expect(result.primary[0].value.family).toBe("Montserrat");
    expect(result.primary[0].value.weights).toEqual(expect.arrayContaining(["Bold", "Medium"]));
    expect(result.secondary[0].value.family).toBe("Montserrat");
    expect(result.secondary[0].value.weights).toEqual(expect.arrayContaining(["Light", "Regular"]));
    expect(result.secondary[0].signals.some((s) => s.kind === "body-text")).toBe(true);
  });

  it("sin familias de marca → listas vacías (no inventa)", () => {
    const result = buildTypographyCandidates([usage({ family: "Calibri", bodyGlyphs: 3000, pageCount: 5 })]);
    expect(result).toEqual({ primary: [], secondary: [], doubtful: [] });
  });
});

describe("fallback de visión — proposed, confianza baja, honesto", () => {
  it("convierte un guess en candidato proposed con señal llm-vision y score bajo", () => {
    const result = buildVisionTypographyCandidates(
      { primary: { family: "Fraktul", weights: ["Regular", "Bold"] }, confidence: 0.42 },
      [source],
    );
    const top = result.primary[0];
    expect(top.status).toBe("proposed");
    expect(top.signals.map((s) => s.kind)).toEqual(["llm-vision"]);
    expect(top.evidenceScore).toBeLessThan(0.6); // confianza baja explícita
    expect(top.value.specimenAvailable).toBe(false);
    expect(top.signature).toBe("fraktul");
  });
});

const ATRES_PDF = path.join(process.cwd(), "fixtures/brandkit/einf_2023_atresmedia.pdf");
const hasAtresFixture = fs.existsSync(ATRES_PDF);

describe.skipIf(!hasAtresFixture)("fixture Atresmedia — debe dar Montserrat", () => {
  const buffer = fs.readFileSync(ATRES_PDF);

  it("extrae Montserrat como primaria (top) con ≥3 pesos y evidencia de embebido", async () => {
    const result = await extractTypographyFromPdf(buffer, { sources: [source], maxPages: 20 });

    expect(result.primary.length).toBeGreaterThan(0);
    const top = result.primary[0];
    expect(top.value.family).toBe("Montserrat");
    expect(top.signals.some((s) => s.kind === "embedded-file")).toBe(true);
    expect(top.value.specimenAvailable).toBe(true);
    expect(top.value.specimenSource).toBe("google-fonts");
    expect(top.evidenceScore).toBeGreaterThan(0.6);
    expect(top.signature).toBe("montserrat");

    expect(result.secondary.length).toBeGreaterThan(0);
    expect(result.secondary[0].value.family).toBe("Montserrat");
    const allWeights = [...top.value.weights, ...result.secondary[0].value.weights];
    expect(allWeights).toEqual(expect.arrayContaining(["Regular", "Bold", "Italic"]));
  }, 30_000);
});
