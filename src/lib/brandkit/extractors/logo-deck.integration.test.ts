/**
 * Integración con fixtures genéricos de brandkit (deck multipágina + marca SVG).
 * Valida criterio de aceptación: marca por comportamiento, no fotos de contenido.
 */

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRAND_LOGO_MARK_FILENAME,
  BRAND_LOGO_MARK_SVG,
  hasBrandLogoMarkSvg,
  hasSampleBrandDeckPdf,
  SAMPLE_BRAND_DECK_FILENAME,
  SAMPLE_BRAND_DECK_PDF,
} from "../fixtures/brandkit-paths";
import { extractLogoFromPdf } from "./logo";
import { measureLogoNess, LOGONESS_MAX_DISTINCT_COLORS, LOGONESS_MAX_TONAL_ENTROPY } from "./logo-ness";
import { BRAND_BEHAVIOR_PRIMARY, buildBrandCorpusFromGenome } from "./brand-behavior";
import { emptyGenome, crownedCandidates, getTrait } from "../model/trait";
import { ingestPdfIntoGenome, ingestSvgIntoGenome } from "../ingest/pdf-ingest-server";
import { hasCrownedLogoPrimary, hasVectorCrownedLogo } from "../ingest/vector-logo-ingest";

describe.skipIf(!hasSampleBrandDeckPdf())("sample brand deck — detección raster", () => {
  it("corona logo plano recurrente con brandBehaviorScore alto, no foto de stock", async () => {
    const buffer = fs.readFileSync(SAMPLE_BRAND_DECK_PDF);
    const { logos, primaryLogos, secondaryLogos } = await extractLogoFromPdf(buffer, {
      maxPages: 20,
      documentId: "sample_deck",
    });

    expect(primaryLogos).toHaveLength(1);
    expect(logos.length).toBeGreaterThanOrEqual(1);

    const primary = primaryLogos[0]!;
    expect(primary.brandBehavior?.total).toBeGreaterThanOrEqual(BRAND_BEHAVIOR_PRIMARY);
    expect(primary.brandBehavior?.invariance).toBeGreaterThan(0.45);
    expect(primary.brandBehavior?.scaleSubordination).toBeGreaterThan(0.5);

    const metrics = await measureLogoNess(primary.buffer);
    expect(metrics.distinctColors).toBeLessThan(LOGONESS_MAX_DISTINCT_COLORS);
    expect(metrics.tonalEntropy).toBeLessThan(LOGONESS_MAX_TONAL_ENTROPY);
    expect(metrics.containsFace).toBe(false);

    for (const logo of logos) {
      const m = await measureLogoNess(logo.buffer);
      expect(m.tonalEntropy).toBeLessThan(4);
      if (m.distinctColors > 80) {
        expect(logo.slot).not.toBe("primary");
      }
    }

    expect(secondaryLogos.every((l) => l.slot === "secondary")).toBe(true);
  }, 90_000);

  it("ingesta PDF completa corona logo.primary en primer lote sin modal", async () => {
    const buffer = fs.readFileSync(SAMPLE_BRAND_DECK_PDF);
    let genome = emptyGenome();
    const events: Array<{ type: string }> = [];
    for await (const event of ingestPdfIntoGenome(buffer, SAMPLE_BRAND_DECK_FILENAME, genome, {
      allowMaterialPrompts: false,
    })) {
      events.push(event);
      if (event.type === "genome_update") genome = event.genome;
    }

    expect(events.some((e) => e.type === "material_prompt")).toBe(false);
    expect(hasCrownedLogoPrimary(genome)).toBe(true);

    const crowned = crownedCandidates(getTrait(genome, "logo.primary")!);
    expect(crowned).toHaveLength(1);
    expect(crowned[0]?.status).toBe("crowned");
  }, 120_000);

  it("persistencia inter-documento sube cuando el corpus ya conoce la firma", async () => {
    const buffer = fs.readFileSync(SAMPLE_BRAND_DECK_PDF);
    let genome = emptyGenome();
    for await (const event of ingestPdfIntoGenome(buffer, SAMPLE_BRAND_DECK_FILENAME, genome, {
      allowMaterialPrompts: false,
    })) {
      if (event.type === "genome_update") genome = event.genome;
    }

    const corpusMatch = buildBrandCorpusFromGenome(genome);
    const corpusMismatch = {
      documentIds: new Set(["doc_other"]),
      signaturesByDocument: new Map([["doc_other", ["0".repeat(1024)]]]),
    };

    const withMatch = await extractLogoFromPdf(buffer, {
      maxPages: 20,
      documentId: "informe_anual",
      corpus: corpusMatch,
    });
    const withoutMatch = await extractLogoFromPdf(buffer, {
      maxPages: 20,
      documentId: "informe_anual",
      corpus: corpusMismatch,
    });

    const interMatch = withMatch.primaryLogos[0]?.brandBehavior?.interDocument ?? 0;
    const interMismatch = withoutMatch.primaryLogos[0]?.brandBehavior?.interDocument ?? 0;
    expect(interMatch).toBeGreaterThan(interMismatch);
    expect(interMatch).toBeCloseTo(1, 1);
    expect(interMismatch).toBeCloseTo(0.5, 1);
  }, 120_000);
});

describe.skipIf(!hasBrandLogoMarkSvg())("brand logo mark SVG — atajo vectorial", () => {
  it("corona logo.primary con vectorUrl sin modal", async () => {
    const svg = fs.readFileSync(BRAND_LOGO_MARK_SVG);
    const { genome, events } = await ingestSvgIntoGenome(svg, BRAND_LOGO_MARK_FILENAME, emptyGenome());

    expect(hasCrownedLogoPrimary(genome)).toBe(true);
    expect(hasVectorCrownedLogo(genome)).toBe(true);
    expect(events.some((e) => e.type === "material_prompt")).toBe(false);

    const crowned = crownedCandidates(getTrait(genome, "logo.primary")!);
    expect(crowned[0]?.derived?.vectorUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe.skipIf(!hasSampleBrandDeckPdf() || !hasBrandLogoMarkSvg())("deck + SVG — batch", () => {
  it("SVG subido gana: PDF no reemplaza el vector coronado", async () => {
    const svg = fs.readFileSync(BRAND_LOGO_MARK_SVG);
    const pdf = fs.readFileSync(SAMPLE_BRAND_DECK_PDF);

    let genome = emptyGenome();
    const svgResult = await ingestSvgIntoGenome(svg, BRAND_LOGO_MARK_FILENAME, genome);
    genome = svgResult.genome;
    const svgSignature = crownedCandidates(getTrait(genome, "logo.primary")!)[0]?.signature;
    expect(svgSignature).toBeTruthy();

    for await (const event of ingestPdfIntoGenome(pdf, SAMPLE_BRAND_DECK_FILENAME, genome, {
      allowMaterialPrompts: false,
    })) {
      if (event.type === "genome_update") genome = event.genome;
    }

    const crowned = crownedCandidates(getTrait(genome, "logo.primary")!);
    expect(crowned).toHaveLength(1);
    expect(crowned[0]?.signature).toBe(svgSignature);
    expect(crowned[0]?.derived?.vectorUrl).toMatch(/^data:image\/svg\+xml/);
  }, 120_000);
});
